# modules/block.py — the shape every block must have.
#the base class 
class Block:
    def __init__(self, id, name, properties=None):
        self.id = id                       # stable uuid — labels, never routes
        self.name = name                   # routes: edges point at names
        self.properties = properties or {} # the inspector fields, untouched

    def run(self, ptt):                    # the work; each type overrides this
        raise NotImplementedError          # forces every block to define it

    def control(self, ptt):                # which labeled exit to take
        return "next"                      # linear default; branches override

    def debug(self):                       # cheap introspection for logs
        return {"id": self.id, "name": self.name,
                "type": type(self).__name__, "props": self.properties}