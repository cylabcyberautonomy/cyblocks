# ends this path and gives teh user the DataFile as the run's report
from modules.block import Block
class Stop(Block):
    def run(self, data_stack):
#        print(ptt.render())                 # the DataFile reports itself
#we do not have ptt anymore so we need to render from the data stack 
        if data_stack.empty():
            return
            # Pop the data file object out to print it if it's still there
        state = data_stack.pop()
           # Only print the report if it is genuinely a PTT file object
        if hasattr(state, 'render'):
            print("[stop] final state of the attack:")
            print(state.render())
        data_stack.push(state)
    def control(self, control_queue, edges):
        return None    # does not tear down the envionment thats the job of the frontend button/nothing enqueued, path ends here

        