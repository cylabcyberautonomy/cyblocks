from modules.block import Block

class Hello(Block):
    def run(self, ptt):
        ptt.write(self.name, "Hello")