#human-in-the-loop block(Reviwer/ Executor/ Editor)
#This block pauses the automated control flow and gives the control to user via the terminal 

# This module only has One class with three MODES chosen by the `mode` in the frontend 
# -Editor (sets/edits the PTT goal (the objective the agents plan toward))(future this should be expanded to edit any part of the PTT not just the goal)
# -Reviewer (reads the PTT and record a decision which is then given to the downstream Choice block)
# -Executor (runs the Generation agent's command against the envionmnet we have built, write output back to PTT)

# All modes can reach the shared PTT via peek method
import subprocess, sys, threading, queue, json
from .block import Block

# Reviewer mode needs a real live decision from whoever is driving the attack (via the API's
# /attack-input route writing into this process's stdin pipe -- see api_backend.py). A plain
# input() would block forever with no answer; select() on stdin doesn't work on Windows, so we
# read stdin continuously on a background thread into a queue and read that queue with a
# timeout instead, defaulting to "continue" if nobody answers in time.
_stdin_queue = queue.Queue()
_stdin_reader_started = False
_stdin_reader_lock = threading.Lock()

def _ensure_stdin_reader():
    global _stdin_reader_started
    with _stdin_reader_lock:
        if _stdin_reader_started:
            return
        _stdin_reader_started = True
        def _reader():
            for line in sys.stdin:
                _stdin_queue.put(line.strip())
        threading.Thread(target=_reader, daemon=True).start()

class Human(Block):
    def run(self, data_stack):
        df = data_stack.peek()
        if getattr(df, "format", "ptt") == "text":
            return self._run_text(data_stack, df)
        ptt = data_stack.peek()
        mode = self.properties.get("mode", "Editor")
        if mode == "Editor":
            self._edit_goal(ptt)
        elif mode == "Reviewer":
            self._review(ptt)
        elif mode == "Executor":
            self._execute(ptt)
        else:
            print(f"[human] unknown mode {mode!r} (expected Editor/Reviewer/Executor)")
# When we are in the Editor mood the human states the attack goal(at the start) or edit the stated goal previously
#future plans we want to be able to edit the whole PTT not just the goal but for now this will do
# the goal is read from block properties (set before the run starts, e.g. by the frontend) --
# we never block on input() here since this block runs headless inside a spawned subprocess
# with no stdin channel back to whoever is driving the attack.
    def _edit_goal(self, ptt):
        print("\n[human:editor] current task tree:")
        print(ptt.render())
        goal = (self.properties.get("goal") or "").strip()
        if not goal:
            print("[human:editor] no goal set in block properties, tree unchanged")
            return
        ptt.add_task(goal, parent_id="0", task_id="g1", is_goal=True)
        print(f"[human:editor] goal set: {goal}")

#When we are in the Reviewer mood human reads the PTT and picks continue/override/suggest (surfaced
# as buttons in the frontend, alongside a text box for override/suggest) which routes control to
# the matching cf-out edge. Waits up to `timeout` seconds for an answer via the stdin pipe; if
# nobody answers in time it defaults to "continue" so the attack never hangs waiting on a human.
    def _review(self, ptt):
            print("\n[human:reviewer] current task tree:")
            print(ptt.render())
            timeout = float(self.properties.get("timeout", 30))
            print(f"[human:reviewer] AWAITING INPUT: continue / override / suggest "
                  f"(defaults to continue after {timeout:.0f}s)")
            _ensure_stdin_reader()
            text = ""
            try:
                raw = _stdin_queue.get(timeout=timeout).strip()
                # the API sends {"decision": "...", "text": "..."} as one line; a bare word
                # still works if someone answers by hand at a real terminal
                try:
                    parsed = json.loads(raw)
                    decision = str(parsed.get("decision", "")).strip().lower()
                    text = str(parsed.get("text", "")).strip()
                except (json.JSONDecodeError, AttributeError):
                    decision = raw.lower()
                print(f"[human:reviewer] received: {decision!r}")
            except queue.Empty:
                decision = "continue"
                print(f"[human:reviewer] no answer within {timeout:.0f}s, defaulting to continue")
            # Route directly: set the label our control() will resolve. Choice is out of the control path.
            self._label = decision if decision in ("continue", "override", "suggest") else "next"
            if decision in ("override", "suggest"):
                ptt.set_human_note(decision, text)

#When we are in the Executor mood The LLM will run the Generation agent's command against the target, over the envionmnet network from our attacker container
    def _execute(self, ptt):
        # prefer a command Generation dispatched through Choice/Action (validated, reliable);
        # only fall back to scanning the tree for a title that looks like a command if nothing
        # was dispatched -- keeps older graphs (that rely on the title-rewrite convention) working.
        command, task_id = ptt.take_command()
        if command:
            print(f"\n[human:executor] dispatched task {task_id}: {command}")
            output = self._run_command(command)
            if output is None:                # declined via the confirm prompt
                return
            print(f"[human:executor] output:\n{output}")
            if task_id:
                try:
                    ptt.set_result(task_id, output[:4000])
                    ptt.set_status(task_id, "done")
                except ValueError as e:
                    print(f"[human:executor] warning: {e}")
            return

        # We waalk the ptt till we find the next runnable task, skipping the goal marker since its not a command
        task = None
        for n in ptt._walk():
            if n is ptt.root or n.is_goal or n.children:
                continue
            if n.status not in ("todo", "doing"):#we skip done tasks
                continue
            text = (n.result or n.title).strip()#what does this task want us to do --> we need to parse the string to see if our attacker continer can do it (need a better way of doing thsi maybe instruct the LLM to mark them as runable commands and chcek this for us )
            parts = text.split()
            #widen the tool to match our attcaker and reject summary/result nodes so we only pick a real runnable command
            looks_like_cmd = (
                len(parts) >= 2 # tool + at least one arg
                and parts[0] in ("ip","nmap","curl","ssh","nc","wget","scp","sshpass","mkfifo","bash")#right now we can only run commands or tools that exist in our continers image
                and parts[1] not in ("command","scan","result") # reject "nmap command" scaffolding becuse its not a runable command
                and "result:" not in text.lower()          # reject summary nodes
                and "results" not in parts[0].lower()
            )
            if looks_like_cmd and n.status in ("todo","doing"):
                task = n
                break
        if task is None:
            print("[human:executor] no leaf task with a command to execute")
            return
        command = (task.result or task.title).replace("Execute:", "").replace("Execute", "").strip()
        command = command.split(" (")[0].strip()          # drop trailing "(explanatory comment)"
        print(f"\n[human:executor] task {task.id}: {command}")

        output = self._run_command(command)
        if output is None:                # declined via the confirm prompt
            return
        print(f"[human:executor] output:\n{output}")

        # write the result back so the Parsing agent can analyze  it, and mark the task as done
        ptt.set_result(task.id, output[:4000])     # it was 500 but some times the most important results were ignored so i made it bigger but it should be caped so the PTT doesn't overflow
        ptt.set_status(task.id, "done")

    # shared docker-exec runner for both the dispatched-command path and the tree-scan fallback.
    # reach the target from the attacker container: docker exec into it, then bash -lc the
    # command so pipes/quotes survive intact (arg list, no shell=True on the host side). Our
    # container name is computed from the project (matches deploy_attacker's convention).
    # Returns None if a human declined via the confirm prompt (mode="Executor" only asks when
    # confirm=true), otherwise the combined stdout+stderr.
    def _run_command(self, command):
        project = self.properties.get("project", "env-1")#if there was no project specified, use the default
        container = f"cyblocks_{project}_attacker" #so it can match the naming convention
        full = ["docker", "exec", container, "bash", "-lc", command] # we add sh because it preserves pipes and quotes intact inside the continer

        #After finding the command to execute the human in the loop gets asked if teh command should be executed or skiped
        if self.properties.get("confirm", False):#disabled for now if we want human approval we change it to true
            if input(f"run this command? [{' '.join(full)}] (y/n): ").strip().lower() != "y":
                print("[human:executor] skipped by human")
                return None
        #capture the output of the command
        try:
            out = subprocess.run(full, capture_output=True, text=True, timeout=300)
            return (out.stdout + out.stderr).strip()
        except Exception as exc:
            return f"ERROR: {exc}"

# show the transcript, read TOOL/ARGS (or DONE) from the keyboard, and route through dispatch_choice exactly like how our LLM does
    def _run_text(self, data_stack, df):
        print(df.render())
        tool = input("TOOL (or DONE): ").strip()
        if tool.upper() == "DONE":
            return self.dispatch_choice(data_stack, "done", "")
        args = input("ARGS: ").strip()
        self.dispatch_choice(data_stack, tool, args)
#follow the cf-out matching _label (set by dispatch_choice) if nothing is set we fall back to the next edge 
    def control(self, control_queue, edges):   # mirrors LLM
        from ..runtime import resolve
        by_id = {b.id: b for b in control_queue.all_blocks}
        label = getattr(self, "_label", "next")
        nxt = resolve(self, label, by_id, edges) or resolve(self, "next", by_id, edges)
        if nxt: 
            control_queue.add(nxt)
