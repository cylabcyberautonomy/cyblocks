# This handles the control flow during runtime 
from collections import deque#we will keep control of teh current blcok being run on the queue 
#these clases will be called and run from the main.py it conatin flow and data control using the queue and stack 
# PTT removed, was from earlier
class ControlQueue:                        # control flow = FIFO queue
    def __init__(self):
        self._q = deque()
    def start(self, block):                # seed with the first block
        self._q.append(block)
    def add(self, block):                  # enqueue a successor
        self._q.append(block)
    def pop(self):                         # take whoever holds control next
        return self._q.popleft()
    def empty(self):
        return not self._q
    def __repr__(self):#so we dont just print the memory address of the stack we want to print the contents of the stack
        return "ControlQueue()"     

class DataStack:                           # data flow = LIFO stack (dormant now)
    def __init__(self):
        self._s = []
    def push(self, item):
        self._s.append(item)
    def pop(self):
        return self._s.pop()
    def empty(self):
        return not self._s
    def peek(self): 
        return self._s[-1]      # read the shared PTT without removing it
    def __repr__(self):#so we dont just print the memory address of the stack we want to print the contents of the stack
        return "DataStack()"

#what actully gets run after the current block 
def resolve(block, label, by_id, edges):                # which blcok gets run next derived from the control edges 
    for e in edges:
        if e["from"] == block.id and e["label"] == label:
            return by_id.get(e["to"]) #our next block to run 
    return None                                     # no matching edge = at the end so stop
# resolve functionality moved into block in modules
# blocks will call the resolve function and pass in the label they want to run next so the decision making is inside the block this is just the function the call to pass control 

# Run uses control queue and data stack to run the blocks until control queue is empty
def run(blocks_list, control_queue, data_stack, edges, data_edges=None):#now also works with data edges becsue we need it between chocie and agenta and choce and actiosn 
    control_queue.all_blocks = blocks_list
    #we need to seed the queue with the start block so we can start the attack
    if data_edges:
        _wire_text_mode(blocks_list, data_edges)#If data edges were passed (text format ) tehnwire up the object references before the loop starts
    ptt = next((b for b in blocks_list if type(b).__name__ == "DataFile"), None)
    if ptt:
        data_stack.push(ptt)            # PTT on the stack before anything runs
    start = next((b for b in blocks_list if type(b).__name__ == "Start"), None)
    if start:
        control_queue.start(start)
    steps = 0
    while not control_queue.empty():                           #while there is some blcok on the queue we keep looping but in the future we can just check if we reached the stop blcok 
        steps += 1
        if steps > 80:
            print("[runtime] step cap reached (80) — stopping to avoid infinite loop")#to avoid infinite loops if the user did not include a stop block or the goal was never reached 
            break
        block = control_queue.pop()              # take who holds control
        block.run(data_stack)                           # the start block will run 
        block.control(control_queue,edges)
        # while not control_queue.empty()://why two loops?
        #     nxt = control_queue.pop()
        #     nxt.run(data_stack)
        #     nxt.control(control_queue,edges)

#the mapper serializes blocks via repr() and it only  only keeps id/name/properties 
#so the live links between blocks are lost
# we need to rebuild them here from the data edges before the loop runs.
#we need data edges between chocie and agents and actions (this is basically searching the data edges and recoreding them )
def _wire_text_mode(blocks, data_edges):
    by_id = {b.id: b for b in blocks}
    for e in data_edges:
        src, dst = by_id.get(e["from"]), by_id.get(e["to"])
        if not src or not dst:
            continue
        s, d = type(src).__name__, type(dst).__name__
        if {s, d} == {"Action", "Choice"}:
            choice = src if s == "Choice" else dst
            action = dst if s == "Choice" else src
            if not hasattr(choice, "actions"):
                choice.actions = {}
            choice.actions[action.tool()] = action
        elif "Choice" in (s, d) and ({"LLM", "Human"} & {s, d}):#lets an LLM/Human actually reach its Choice at runtime
            choice = src if s == "Choice" else dst
            agent  = dst if s == "Choice" else src
            agent.choice = choice
