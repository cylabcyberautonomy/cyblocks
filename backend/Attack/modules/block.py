# modules/block.py — the shape every block must have.
#the base class 
from runtime import *
class Block:
    def __init__(self, id, name, properties=None):
        self.id = id                       #each blcok will have an ID assigned from the json (because we could have the same block names but tehy will have differnt ids)
        self.name = name                   # routes: edges point at names(easier to read than using id for edges)
        self.properties = properties or {} # the inspector fields, untouched

    def run(self, data_stack):                    # each block will have diffenrt specifiaction for running in their modules 
        # Data_stack must be passed onto run because the data_stack holds data needed by block
        raise NotImplementedError          

    def control(self, control_queue, edges):                # each block should be able to determin its next block to run 
        by_name = {b.name: b for b in control_queue.all_blocks}
        nxt = resolve(self, "next", by_name, edges)
        if nxt:
            control_queue.add(nxt)

    def debug(self, *args):                       # introspection for logs
        return {"id": self.id, "name": self.name,
                "type": type(self).__name__, "props": self.properties}