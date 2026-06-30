# main.py( normally this file will be written by the mapper but since we have not implmented that part yet we will just hardcode it for now )
from modules.hello import Hello #these come from the mapper all the imports we need 
from modules.world import World
from runtime import *

def main():
    # list all the block and modules that will be used in this attcak 
    # Blocks instentation 
    hello1 = Hello(id="h1", name="hello1")
    world1 = World(id="w1", name="world1")
    blocks = [hello1, world1]

    # the JSON's edges we will get from teh IDE 
    control_connections = [
        {"from": "hello1", "to": "world1", "label": "next"},
    ]
    ctrl_q = ControlQueue()      # control queue
    data   = DataStack()         # data stack

    #we give teh start block to the control queue and start ruuning the attack 
    ctrl_q.start(hello1)         
    run(ctrl_q, blocks, control_connections)   

    #runs only when we do `python main.py`and no import main.py
if __name__ == "__main__":
    main()