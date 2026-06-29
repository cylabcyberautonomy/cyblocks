# modules/block.py — the shape every block must have.
#the base class 
class Block:
    def __init__(self, id, name, properties=None):
        self.id = id                       #each blcok will have an ID assigned from the json (because we could have the same block names but tehy will have differnt ids)
        self.name = name                   # routes: edges point at names(easier to read than using id for edges)
        self.properties = properties or {} # the inspector fields, untouched

    def run(self, ptt):                    # each block will have diffenrt specifiaction for running in their modules 
        raise NotImplementedError          

    def control(self, ptt):                # each block should be able to determin its next block to run 
        return "next"                      # linear default

    def debug(self):                       # introspection for logs
        return {"id": self.id, "name": self.name,
                "type": type(self).__name__, "props": self.properties}