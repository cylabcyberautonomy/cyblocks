# DATA block holding the agents skills  or instruction 
# that turns a blank LLM into Reasoning / Generation / Parsing 
# there is No control here 

# Role framing is adapted from PentestGPT's prompt_class.py (init + core working prompt)
# OUTPUT FORMAT: we keep PentestGPT's behaviour but require the tree-op grammar our DataFile consumes
from modules.block import Block

# The output contract every agent must follow 
_OP_FORMAT = """

Reply ONLY with tree operations, one per line, using PentestGPT's layered numbers as ids:
ADD <parent_id> | <task_id> | <title>       (e.g. ADD 1 | 1.3 | Identify open ports)
STATUS <node_id> | <to-do|doing|done|failed>
GOAL <node_id>
Use id "0" as the parent for a root task. Output no prose, only these lines."""

_REASONING = """You're an excellent cybersecurity penetration tester assistant.
You record the penetration testing process in a "Penetration Testing Tree (PTT)":
(1) Tasks are layered, i.e. 1, 1.1, 1.1.1 — task 1.1 is a sub-task of task 1.
(2) Each task has a status: to-do, completed, or not applicable.
(3) Initially generate only root reconnaissance tasks; don't invent tasks for unknown ports/services. Expand later.
Revise the PTT with the test results provided, keeping the tree format. Only add to-do tasks when discovered; don't include undiscovered tasks.
List the possible to-do tasks, then select the one sub-task most likely to lead to a successful exploit. Automated scanners such as Nessus and OpenVAS are not allowed.""" + _OP_FORMAT

_GENERATION = """You're an excellent cybersecurity penetration tester assistant.
You are given the PTT status and one specific to-do sub-task. Expand that task into a concrete command to run against the target over the network only (no host-level access). If it's a single command be precise; if multi-step, keep each step clear. Record the command as the task's result.""" + _OP_FORMAT

_PARSING = """You summarize information from websites and testing tools. For the given content, summarize precisely:
1. Web page: key widgets, contents, buttons, comments useful for pentest.
2. Tool output: test results, including vulnerable/non-vulnerable services.
3. Keep both field name and value (e.g. keep the port number AND the service name/version).
4. Only summarize — do not conclude or assume.
Record your summary as the result on the relevant task.""" + _OP_FORMAT

DEFAULT_INSTRUCTIONS = {
    "Reasoning":  _REASONING,
    "Generation": _GENERATION,
    "Parsing":    _PARSING,
}

class Parameter(Block):
    def __init__(self, id, name, properties=None):
        super().__init__(id, name, properties)
        role = self.properties.get("role", "")
        if not self.properties.get("instruction"):
            self.properties["instruction"] = DEFAULT_INSTRUCTIONS.get(role, "")#these role ionstruction are then given to teh agent to turn a blank LLM into a Reasoning / Generation / Parsing agent

    def instruction(self):
        return self.properties.get("instruction", "")

    def run(self, data_stack):#no control here, just a data block
        return None
    def control(self, control_queue, edges):
        return None