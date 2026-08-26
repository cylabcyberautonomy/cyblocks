#human-in-the-loop block(Reviwer/ Executor/ Editor)
#This block pauses the automated control flow and gives the control to user via the terminal 

# This module only has One class with three MODES chosen by the `mode` in the frontend 
# -Editor (sets/edits the PTT goal (the objective the agents plan toward))(future this should be expanded to edit any part of the PTT not just the goal)
# -Reviewer (reads the PTT and record a decision which is then given to the downstream Choice block)
# -Executor (runs the Generation agent's command against the envionmnet we have built, write output back to PTT)

# All modes can reach the shared PTT via peek method 
import subprocess
from modules.block import Block
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
    def _edit_goal(self, ptt):
        print("\n[human:editor] current task tree:")
        print(ptt.render())
        prompt = self.properties.get("prompt") or "Enter the attack goal (the objective we want to reach): "
        goal = input(f"\n{prompt}").strip()
        if not goal:
            print("[human:editor] no goal entered, tree unchanged")
            return
        ptt.add_task(goal, parent_id="0", task_id="g1", is_goal=True)
        print(f"[human:editor] goal set: {goal}")

#When we are in the Reviewer mood human reads the PTT and records a decision to hand to the Choice block(which will route the control to the right path or block)(need to update this)
    def _review(self, ptt):
            print("\n[human:reviewer] current task tree:")
            print(ptt.render())
            prompt = self.properties.get("prompt") or "Your decision (continue / override / suggest): "
            decision = input(f"\n{prompt}").strip().lower()
            # Route directly: set the label our control() will resolve. Choice is out of the control path.
            self._label = decision if decision in ("continue", "override", "suggest") else "next"
            print(f"[human:reviewer] routing on: {self._label}")

#When we are in the Executor mood The LLM will run the Generation agent's command against the target, over the envionmnet network from our attacker container
    def _execute(self, ptt):
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

        # reach the goal from the attacker container: docker exec into it, then sh -lc the
        # command so pipes/quotes survive intact (arg list, no shell=True on the host side)

        # our container name is computed from the project (matches deploy_attacker's convention)

        project = self.properties.get("project", "env-1")#if there was no project specified, use the default
        container = f"cyblocks_{project}_attacker" #so it can match the naming convention
        full = ["docker", "exec", container, "bash", "-lc", command] # we add sh because it preserves pipes and quotes intact inside the continer 
        

        #After finding the command to execute the human in the loop gets asked if teh command should be executed or skiped 
        if self.properties.get("confirm", False):#disabled for now if we want human approval we change it to true
            if input(f"run this command? [{' '.join(full)}] (y/n): ").strip().lower() != "y":
                print("[human:executor] skipped by human")
                return
        #capture the output of the command
        try:
            out = subprocess.run(full, capture_output=True, text=True, timeout=300)
            output = (out.stdout + out.stderr).strip()
        except Exception as exc:
            output = f"ERROR: {exc}"
        print(f"[human:executor] output:\n{output}")

        # write the result back so the Parsing agent can analyze  it, and mark the task as done
        ptt.set_result(task.id, output[:4000])     # it was 500 but some times the most important results were ignored so i made it bigger but it should be caped so the PTT doesn't overflow
        ptt.set_status(task.id, "done")

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
        from runtime import resolve
        by_id = {b.id: b for b in control_queue.all_blocks}
        label = getattr(self, "_label", "next")
        nxt = resolve(self, label, by_id, edges) or resolve(self, "next", by_id, edges)
        if nxt: 
            control_queue.add(nxt)
