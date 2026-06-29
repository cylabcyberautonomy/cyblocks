# main.py( normally this file will be written by the mapper but since we have not implmented that part yet we will just hardcode it for now )
from modules.hello import Hello #these come from the mapper all the imports we need 
from modules.world import World
from runtime import Runtime
def main():
    # list all the block and modules that will be used in this attcak 
    blocks = [
        Hello(id="h1", name="hello1"),
        World(id="w1", name="world1"),
    ]
    control_connections = [#we know this is working and following the order from json and the mapper (if we change the edge order it prints world hello )
        {"from": "hello1", "to": "world1", "label": "next"},
    ]
    rt  = Runtime(blocks, control_connections, start="hello1")#we feed it the start block and runtime will handle giving control  to teh block after it 
    ptt = rt.run()
    print(ptt.render())     #ptt as a data file will help us print stuff to the terminal at the end (in the future this will print the status of the attck )
#runs only when we do `python main.py`and no import main.py
if __name__ == "__main__":
    main()