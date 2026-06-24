import queue


class control_queue:
    def __init__(self):
        self.queue = queue.Queue()
        self.initialized_blocks = {}
        return
    def pop(self):
        return self.queue.get()
    def put(self,block):
        block_id = block.block_id
        persistent = block.persistent
        self.queue.put(block)
        if block_id in self.initialized_blocks:
            if persistent:
                block = self.initialized_blocks[block_id]
        self.initialized_blocks[block_id] = block
        self.queue.put(block)
        return

class startBlock:
    # Class attribute (shared by all instances)

    # Constructor method to initialize instance attributes
    def __init__(self):
        self.name = "startBlock"
        self.block_id = 0
        self.persistent = False
        # self.name = name    # Instance attribute
        # self.breed = breed  # Instance attribute
        return f"{self.name} initialized"

    # Instance method (behavior)
    # def bark(self):
    #     return f"{self.name} says Woof!"
    
    def action(self):
        data_stack = []
        return f"{self.name} is running!"
    def control(self):
        control_queue.put(humanAgentA)

class endBlock:
    # Class attribute (shared by all instances)

    # Constructor method to initialize instance attributes
    def __init__(self):
        self.name = "endBlock"
        self.block_id = 1
        self.persistent = False
        # self.name = name    # Instance attribute
        # self.breed = breed  # Instance attribute
        return f"{self.name} initialized"

    # Instance method (behavior)
    # def bark(self):
    #     return f"{self.name} says Woof!"
    
    def action(self):
        return f"{self.name} is running!"
    
    def control(self):
        control_queue = []
    
class humanAgentA:
    def __init__(self):
        self.name = "humanAgentA"
        self.block_id = 2
        self.persistent = False
        return f"{self.name} initialized"
    
    def action(self):
        while data_stack is not []:
            data_stack.pop()
        data_stack.put({"name" : "control_bool", "data" : False})
        return f"{self.name} is running!"
    
    def control(self):
        control_queue.put(boolean_control)

class humanAgentB:
    def __init__(self):
        self.name = "humanAgentB"
        self.block_id = 3
        self.persistent = False
        return f"{self.name} initialized"
    
    def action(self):
        while data_stack is not []:
            data_stack.pop()
        return f"{self.name} is running!"
    
    def control(self):
        control_queue.put(endBlock)

class humanAgentC:
    def __init__(self):
        self.name = "humanAgentC"
        self.block_id = 4
        self.persistent = False
        return f"{self.name} initialized"
    
    def action(self):
        while data_stack is not []:
            data_stack.pop()
        return f"{self.name} is running!"
    
    def control(self):
        control_queue.put(endBlock)

class boolean_control:
    def __init__(self):
        self.name = "boolean_control"
        self.block_id = 5
        self.persistent = False

        self.bool = False
        self.on_true, self.on_false = endBlock, endBlock
        
        return f"{self.name} initialized"
    
    def action(self):
        while data_stack is not []:
            next = data_stack.pop()
            if next["name"] == "control_bool":
                bool = next["data"]
            if next["name"] == "on_true":
                on_true = next["data"]
            if next["name"] == "on_else":
                on_else = next["data"]

        return f"{self.name} is running!"
    
    def control(self):
        if self.bool:
            control_queue.put(self.on_true)
        else:
            control_queue.put(self.on_else)
        control_queue.put(self)


control_queue = control_queue()
control_queue.put(startBlock)
data_stack = []
def control_runner():
    while not control_queue.empty():
        block = control_queue.pop()

        print(block.action())
        block.control()
    return f"control_runner is finished!"

def __main__():
    control_runner()
    return 0