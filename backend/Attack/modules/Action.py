
# A data block(should be its own blcok type in te future) right now it represents one tool (choosen by user from the dropdown property)
# this block never takes control
# Choice invokes construct(args) to build+validate this tool's command and if its exceptable 
# The LLM writes the arguments (it discovers the exploit) tehn we validate if we can run it 
from modules.block import Block

ALLOWED_TOOLS = {"nmap", "curl", "nc", "hydra", "ssh", "sshpass", "mysql"}

class Action(Block):
    def tool(self):
        return (self.properties.get("tool") or "").strip().lower()

    def construct(self, args):
        # args: the argument string the LLM produced for this tool.
        # returns {"ok": True, "command": "<tool> <args>"} on success, or {"ok": False, "error": "<why>"} on rejection
        t = self.tool()
        if t not in ALLOWED_TOOLS:
            return {"ok": False, "error": f"tool {t!r} is not an available tool"}
        if not args or not args.strip():
            return {"ok": False, "error": f"no arguments given for {t}"}
        return {"ok": True, "command": f"{t} {args.strip()}"}

    # never run by the control queue
    def run(self, data_stack):
        return None
    def control(self, control_queue, edges):
        return None