
# Autonomous executor. In text mode: pops the command Choice shipped onto the
# DataFile, runs it in the attacker container itself (own subprocess), appends
# the combined output to the transcript, then control loops back to the next
# edge we assign it from block.py.
# In ptt mode: walks the PTT for the leaf task the Generation LLM wrote (its
# title/result IS the runnable command, per the Generation role's contract),
# runs it in the attacker container, and writes the output back onto that
# task via set_result/set_status so the Parsing agent sees it next turn.
# Never blocks on input -- this block is meant to make the attack autonomous
# end-to-end after the goal is set.
import subprocess
from .block import Block

EXEC_TIMEOUT = 300   # seconds( we do not want it to be stuck on one command)

class Executor(Block):

    def run(self, data_stack):
        df = data_stack.peek()
        if getattr(df, "format", "ptt") == "text":
            return self._run_text(data_stack, df)
        return self._run_ptt(df)

    #here we pop the command Choice shipped, run it, and write "$ cmd\n<output>" into the transcript for the LLM to read next turn.
    def _run_text(self, data_stack, df):
        command, _task_id = df.take_command()        # pop the shipped command (cleared on read); task_id is ptt-mode only
        if not command:
            df.append("note", "executor: no command to run this turn")
            return
        output = self._run_in_attacker(command)
        df.append("tool-output", f"$ {command}\n{output}")

    #prefer a command Generation dispatched through Choice/Action (validated, reliable); only fall
    #back to scanning the tree for a title that looks like a command if nothing was dispatched.
    def _run_ptt(self, ptt):
        command, task_id = ptt.take_command()
        if command:
            print(f"[executor] dispatched task {task_id}: {command}")
            output = self._run_in_attacker(command)
            print(f"[executor] output:\n{output}")
            if task_id:
                try:
                    ptt.set_result(task_id, output[:4000])
                    ptt.set_status(task_id, "done")
                except ValueError as e:
                    print(f"[executor] warning: {e}")
            return

        task = self._next_runnable(ptt)
        if task is None:
            print("[executor] no leaf task with a command to execute")
            return
        command = (task.result or task.title).replace("Execute:", "").replace("Execute", "").strip()
        command = command.split(" (")[0].strip()          # drop trailing "(explanatory comment)"
        print(f"[executor] task {task.id}: {command}")
        output = self._run_in_attacker(command)
        print(f"[executor] output:\n{output}")
        ptt.set_result(task.id, output[:4000])
        ptt.set_status(task.id, "done")

    #same "does this task's title/result look like a runnable command" check Human's Executor mode used
    def _next_runnable(self, ptt):
        for n in ptt._walk():
            if n is ptt.root or n.is_goal or n.children:
                continue
            if n.status not in ("todo", "doing"):
                continue
            text = (n.result or n.title).strip()
            parts = text.split()
            looks_like_cmd = (
                len(parts) >= 2
                and parts[0] in ("ip", "nmap", "curl", "ssh", "nc", "wget", "scp", "sshpass", "mkfifo", "bash")
                and parts[1] not in ("command", "scan", "result")
                and "result:" not in text.lower()
                and "results" not in parts[0].lower()
            )
            if looks_like_cmd:
                return n
        return None

 # run the command from inside our atatcker continer + capture the output to be written to datafile
    def _run_in_attacker(self, command):
        container = self._attacker_container()
        if not container:
            return "(executor error: attacker container not found)"
        try:
            proc = subprocess.run(
                ["docker", "exec", container, "sh", "-c", command],
                capture_output=True, text=True, timeout=EXEC_TIMEOUT,
            )
            out = (proc.stdout or "") + (proc.stderr or "")
            return out.strip() or "(no output)"
        except subprocess.TimeoutExpired:
            return f"(command timed out after {EXEC_TIMEOUT}s)"
        except Exception as e:
            return f"(executor error: {e})"

#pick the container to exec into ehich is  an explicit container given b property 
#else discover the running attacker container by name
    def _attacker_container(self):
        # 
        if self.properties.get("container"):
            return self.properties["container"]
        try:
            r = subprocess.run(
                ["docker", "ps", "--filter", "name=attacker", "--format", "{{.Names}}"],
                capture_output=True, text=True, timeout=10,
            )
            names = [n for n in r.stdout.split() if n.endswith("attacker")]
            return names[0] if names else None
        except Exception:
            return None