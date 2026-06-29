# modules/block.py — the shape every block must have.
#the base class 
import runtime
class Block:
    def __init__(self, id, name, properties=None):
        self.id = id                       #each blcok will have an ID assigned from the json (because we could have the same block names but tehy will have differnt ids)
        self.name = name                   # routes: edges point at names(easier to read than using id for edges)
        self.properties = properties or {} # the inspector fields, untouched

    def run(self, data_stack):                    # each block will have diffenrt specifiaction for running in their modules 
        # Data_stack must be passed onto run because the data_stack holds data needed by block
        raise NotImplementedError          

    def control(self, control_queue, edges):                # each block should be able to determin its next block to run 
        # control_queue must be passed onto run because the control_queue should be modified by control
        # edges are passed onto control because the block should manage control from its own edges
        # 
        # from modules
        # def resolve(block, label, by_name, edges):                # which blcok gets run next derived from the control edges 
        #     for e in edges:
        #         if e["from"] == block.name and e["label"] == label:
        #             return self.by_name.get(e["to"]) #our next block to run 
        #     return None                                     # no matching edge = at the end so stop

        
        return "next"                      # linear default

    def debug(self, *args):                       # introspection for logs
        return {"id": self.id, "name": self.name,
                "type": type(self).__name__, "props": self.properties}