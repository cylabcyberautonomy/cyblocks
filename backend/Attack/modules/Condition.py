# The condition block is also a control block that routes control on a computed check against the PTT (goal_reached). 
# If the goal is reached, follow the "goal_reached" edge which leads to the stop block, otherwise we follow the "continue" edge, which
# points BACK to an earlier block to loop. 
# This block has the same routing mechanism as Choice but with differnt sources for routing


from modules.block import Block
class Condition(Block):
    def run(self, data_stack):
        ptt = data_stack.peek()
        check = self.properties.get("check", "goal_reached")
        reached = ptt.goal_reached() if check == "goal_reached" else False#so we can hand it to the control method 
        self._label = "goal_reached" if reached else "continue"# condition block is just an If/then statement 
        print(f"[condition] {check}: {self._label}")

    def control(self, control_queue, edges):
            from runtime import resolve
            by_id = {b.id: b for b in control_queue.all_blocks}
            nxt = resolve(self, self._label, by_id, edges)       # gives control by routing on goal_reached/continue
            if nxt is None:
                nxt = resolve(self, "next", by_id, edges)
            if nxt:
                control_queue.add(nxt)
            print(f"[condition] routing on {self._label!r} -> {nxt.id if nxt else 'STOP'}")#either go back loop(continue) or stop 