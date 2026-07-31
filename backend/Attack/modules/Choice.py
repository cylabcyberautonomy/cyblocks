# Choice data selector. NOT a control block the agent (LLM/Human) owns the control now( might trun it to control agian for routing )
# never enters the control queue. Its only job is select() the action we wnat to run 
# given the tool the agent named, find the matching wired Action and construct+validate its command
from modules.block import Block

class Choice(Block):
    def run(self, data_stack):
        return None          #  never run by the control queue

    def control(self, control_queue, edges):
        return None          # routing lives on the agent

    def select(self, tool, args):
        actions = getattr(self, "actions", {})
        action = actions.get((tool or "").strip().lower())
        if action is None:
            return {"ok": False, "error": f"no Action block wired for tool {tool!r}"}
        return action.construct(args)