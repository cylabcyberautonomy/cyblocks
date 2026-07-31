
# Autonomous executor Pops the command Choice shipped onto the
# DataFile, runs it in the attacker container itself (own subprocess)
#appends the combined output to the transcript, then control loops back to the next edge we assign it from blcok.py
import subprocess
from modules.block import Block

EXEC_TIMEOUT = 300   # seconds( we do not want it to be stuck on one command)

class Executor(Block):

    #here we pop the command Choice, run it, and write "$ cmd\n<output>" into the transcript for the LLM to read next turn. 
    def run(self, data_stack):
        df = data_stack.peek()                      # text-mode DataFile
        command = df.take_command()                 # pop the shipped command (cleared on read)
        if not command:
            df.append("note", "executor: no command to run this turn")
            return
        output = self._run_in_attacker(command)
        df.append("tool-output", f"$ {command}\n{output}")
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