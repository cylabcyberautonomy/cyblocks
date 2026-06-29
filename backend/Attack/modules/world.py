# modules/world.py
from modules.block import Block

class World(Block):
    def run(self, ptt):
        ptt.write(self.name, "World")