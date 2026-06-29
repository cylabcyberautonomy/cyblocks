# This handles the control flow during runtime 
from collections import deque#we will keep control of teh current blcok being run on the queue 
class PTT:                                 #this class hold the current PTT we are running or the blcok we are running 
    def __init__(self):
        self.entries = []
    def write(self, who, text):            # only the block holding control writes
        self.entries.append((who, text))
    def render(self):
        return " ".join(text for _, text in self.entries)

class Runtime:
    def __init__(self, blocks, control_connections, start):
        self.by_name = {b.name: b for b in blocks}  # name -> block (routing table)
        self.edges   = control_connections          # [{from, to, label}]
        self.start   = start
        self.ptt  = PTT()
        self.control_q  = deque()                   # control flow = queue
        self.data_stack = []                        # data flow = stack (not used now as we do not have data yet )
    def resolve(self, block, label):                # which blcok gets run next derived from the control edges 
        for e in self.edges:
            if e["from"] == block.name and e["label"] == label:
                return self.by_name.get(e["to"]) #our next block to run 
        return None                                 # no matching edge = at the end so stop
    def run(self):
        self.control_q.append(self.by_name[self.start])   # we give control to each block by appending it to the control queue
        while self.control_q:                             #while there is some blcok on the queue we keep looping but in the future we can just check if we reached the stop blcok 
            block = self.control_q.popleft()              # take who holds control
            print(f"[run] {block.name}")                  # debug to see which blcok is being run right now 
            block.run(self.ptt)                           # the start block will run 
            nxt = self.resolve(block, block.control(self.ptt))  # find the next control blcok 
            if nxt:
                self.control_q.append(nxt)                # enqueue successor
        return self.ptt#result of attack and status will be saved in ptt so we return it at the end to know what happedn in the attack 