# This handles the control flow during runtime 
from collections import deque#we will keep control of teh current blcok being run on the queue 
#these clases will be called and run from the main.py it conatin flow and data control using the queue and stack 
# PTT removed, was from earlier
from modules import block
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

class DataStack:                           # data flow = LIFO stack (dormant now)
    def __init__(self):
        self._s = []
    def push(self, item):
        self._s.append(item)
    def pop(self):
        return self._s.pop()
    def empty(self):
        return not self._s

#what actully gets run after the current block 
def resolve(block, label, by_name, edges):                # which blcok gets run next derived from the control edges 
    for e in edges:
        if e["from"] == block.name and e["label"] == label:
            return by_name.get(e["to"]) #our next block to run 
    return None                                     # no matching edge = at the end so stop
# resolve functionality moved into block in modules
# blocks will call the resolve function and pass in the label they want to run next so the decision making is inside the block this is just the function the call to pass control 

# Run uses control queue and data stack to run the blocks until control queue is empty
def run(blocks_list, control_queue, data_stack, edges):
    control_queue.all_blocks = blocks_list
    while not control_queue.empty():                           #while there is some blcok on the queue we keep looping but in the future we can just check if we reached the stop blcok 
        block = control_queue.pop()              # take who holds control
        block.run(data_stack)                           # the start block will run 
        block.control(control_queue,edges)
        # while not control_queue.empty()://why two loops?
        #     nxt = control_queue.pop()
        #     nxt.run(data_stack)
        #     nxt.control(control_queue,edges)
