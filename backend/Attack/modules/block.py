#modules/block.py — the shape every block must have.
#the base class 
from runtime import *
class Block:
    def __init__(self, id, name, properties=None):
        self.id = id                       #each blcok will have an ID assigned from the json (because we could have the same block names but tehy will have differnt ids)
        self.name = name                   # routes: edges point at names(easier to read than using id for edges)
        self.properties = properties or {} # the inspector fields, untouched

    def run(self, data_stack):                    # each block will have diffenrt specifiaction for running in their modules 
        # Data_stack must be passed onto run because the data_stack holds data needed by block
        raise NotImplementedError          

    def control(self, control_queue, edges):                # each block should be able to determin its next block to run 
        by_id = {b.id: b for b in control_queue.all_blocks}
        nxt = resolve(self, "next", by_id, edges)
        if nxt:
            control_queue.add(nxt)

    def debug(self, *args):                       # introspection for logs
        return {"id": self.id, "name": self.name,
                "type": type(self).__name__, "props": self.properties}

    def __repr__(self):#so we dont just print the memory address of the stack
        return f"{type(self).__name__}({self.id!r}, {self.name!r}, {self.properties!r})"  
          
#the contract between "what the agent decided" and "where control goes next"
#gets called by agents (LLM/Human )in text mode after they parse the reply
#it sets self._label, which the block's control() then routes on
    def dispatch_choice(self, data_stack, tool, args, task_id=None):
        # Shared by LLM and Human where we take the chosen tool+args, run it through the
        # attached Choice (self.choice, wired by the mapper), and send the command or error.
        # task_id is ptt-mode only (which PTT leaf this command is for) -- text mode leaves it None.
        df = data_stack.peek()

        if (tool or "").strip().lower() == "done":#check our transcript and if done was flagged
            self._label = "done"                      #
            df.append("note", f"{type(self).__name__} signalled DONE")
            return

        choice = getattr(self, "choice", None)
        if choice is None:
            df.append("note", "no Choice block attached to this agent")
            self._label = "next"
            return

        result = choice.select(tool, args)
        if result.get("ok"):
            df.set_command(result["command"], task_id=task_id)   # Executor will pop and run it
        else:
            df.append("note", f"rejected: {result.get('error')}")  # visible next turn, no command shipped
        self._label = "next"                          # defualt control edge