from .blocks import *
from .runtime import *
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
        case "Parameter":
            return Parameter(id, name, properties)
        case "Action":   
            return Action(id, name, properties)
        case "Executor": 
            return Executor(id, name, properties)
        case _:           raise ValueError(f"Unknown block type: {name!r}")


def json_to_blocks(JSON:list):
    blocks = []
    for i in JSON['blocks_on_canvas']:
        blocks.append(name_to_block_init(i['id'], i['name'], i['properties']))
    return blocks

def get_parameters(blocks, data_connections):
    # index blocks by id so we can look up both ends of each data edge(to load parameters into agents)
    print("DATA CONNS:", data_connections) 
    by_id = {b.id: b for b in blocks}
    for edge in data_connections:
        src = by_id.get(edge["from"])
        dst = by_id.get(edge["to"])
        if src is None or dst is None:
            continue
        # a Parameter feeding an LLM
        if type(src).__name__ == "Parameter" and type(dst).__name__ == "LLM":
            dst.properties["instruction"] = src.properties.get("instruction", "")
        elif type(dst).__name__ == "Parameter" and type(src).__name__ == "LLM":
            src.properties["instruction"] = dst.properties.get("instruction", "")


def run_mapper(attcker_file : str, pyimport_file : str, toolimport_file : str, JSON:list):
    blocks = json_to_blocks(JSON)
    control_queue = ControlQueue()
    get_parameters(blocks, JSON['data_connections'])
    data_stack = DataStack()
    edges = JSON['control_connections']
    # def run(blocks_list, control_queue, data_stack, edges):
    with open(attcker_file, "w") as file:
        file.write(f"from backend.attack.blocks import *\n")
        file.write(f"from backend.attack.runtime import *\n")
        file.write(f"edges = {repr(edges)}\n")
        file.write(f"data_edges = {repr(JSON['data_connections'])}\n")
        file.write(f"blocks = {repr(blocks)}\n")
        file.write(f"control_queue = {repr(control_queue)}\n")
        file.write(f"data_stack = {repr(data_stack)}\n")
        file.write(f"def main():\n")
        file.write(f"   run(blocks, control_queue, data_stack, edges, data_edges)\n")        
        file.write(f"if __name__ == '__main__':\n")
        file.write(f"   main()\n")


#these two need to be actully inmplmented in the future 
    with open(pyimport_file, "w") as file:
        file.write(f"empty\n")

    with open(toolimport_file, "w") as file:
        file.write(f"empty\n")
