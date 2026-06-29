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
# def resolve(block, label, by_name, edges):                # which blcok gets run next derived from the control edges 
#     for e in edges:
#         if e["from"] == block.name and e["label"] == label:
#             return self.by_name.get(e["to"]) #our next block to run 
#     return None                                     # no matching edge = at the end so stop
# resolve functionality moved into block in modules

def run(queue, blocks, edges, ptt):
   by_name = {b.name: b for b in blocks}   # we give control to each block by appending it to the control queue
   while not queue.empty():                           #while there is some blcok on the queue we keep looping but in the future we can just check if we reached the stop blcok 
        block = queue.pop()              # take who holds control
        print(f"[run] {block.name}")                  # debug to see which blcok is being run right now 
        block.run(ptt)                           # the start block will run 
        nxt = self.resolve(block, block.control(ptt), by_name, edges)  # find the next control blcok 
        if nxt:
            queue.add(nxt)                # enqueue successor
    return ptt #result of attack and status will be saved in ptt so we return it at the end to know what happedn in the attack 