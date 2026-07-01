from modules import *
from runtime import *
def name_to_block_init(id, name, properties=None):
    match name:
        case "LLM":
            return LLM(id, name, properties)
        case "Human":
            return Human(id, name, properties)
        case "Start":
            return Start(id, name, properties)
        case "Stop":
            return Stop(id, name, properties)
        case "Choice":
            return Choice(id, name, properties)
        case "DataFile":
            return DataFile(id, name, properties)
        case "Algorithm":
            return Algorithm(id, name, properties)
        case "Library":
            return Library(id, name, properties)
        case "Module":
            return Module(id, name, properties)
        case "Condition":
            return Condition(id, name, properties)
        case "Parameter":
            return Parameter(id, name, properties)
        case _:           raise ValueError(f"Unknown block type: {name!r}")


def json_to_blocks(JSON:list):
    blocks = []
    for i in JSON['blocks_on_canvas']:
        blocks.append(name_to_block_init(i['id'], i['name'], i['properties']))
    return blocks
    
def run_mapper(attcker_file : str, pyimport_file : str, toolimport_file : str, JSON:list):
    blocks = json_to_blocks(JSON)
    control_queue = ControlQueue()
    data_stack = DataStack()
    edges = JSON['control_connections']
    # def run(blocks_list, control_queue, data_stack, edges):
    with open(attcker_file, "w") as file:
        file.write(f"from modules import *\n")
        file.write(f"from runtime import *\n")
        file.write(f"edges = {repr(edges)}\n")
        file.write(f"blocks = {repr(blocks)}\n")
        file.write(f"control_queue = {repr(control_queue)}\n")
        file.write(f"data_stack = {repr(data_stack)}\n")
        file.write(f"def main():\n")
        file.write(f"   run(blocks, control_queue, data_stack, edges)\n")
        file.write(f"if __name__ == '__main__':\n")
        file.write(f"   main()\n")


    with open(pyimport_file, "w") as file:
        file.write(f"empty\n")

    with open(toolimport_file, "w") as file:
        file.write(f"empty\n")
