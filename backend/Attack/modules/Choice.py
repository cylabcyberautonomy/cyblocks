# Choice module block handels routing the control depending on the human Reviewer's decision (continue/override/suggest)
# This decision was should have been written to ptt.last_decision
# each edge label matches that decision
from modules.block import Block

class Choice(Block):
    def run(self, data_stack):
        # fetch the decision from the data stack so we can give it to the control method
        self._decision = getattr(data_stack.peek(), "last_decision", "continue")
        print(f"[choice] reviewer decision: {self._decision}")

    def control(self, control_queue, edges):
            from runtime import resolve
            by_id = {b.id: b for b in control_queue.all_blocks}
            nxt = resolve(self, self._decision, by_id, edges)   # route on the reviewer's decision
            if nxt is None:
                nxt = resolve(self, "next", by_id, edges)        # fallback if no matching label exist
            if nxt:
                control_queue.add(nxt) #add the next block to the control queue
            print(f"[choice] routing on {self._decision!r} -> {nxt.id if nxt else 'STOP'}")