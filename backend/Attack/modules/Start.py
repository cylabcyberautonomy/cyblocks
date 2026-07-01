#main seeds the queue with this, so it runs first
#Start only start the control by being the first on the queue 
from modules.block import Block
class Start(Block):
    def run(self, data_stack):
        print(f"[start] attack '{self.name}' begun")    # trace only; writes nothing
    #goes to defalut edge the next edge 

    
    