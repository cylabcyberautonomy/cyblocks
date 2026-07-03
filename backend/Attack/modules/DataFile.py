#For now it holds the shared attack state: PentestGPT's Pentesting Task Tree (PTT).
#Pure data. Holds no control. The blocks read/write it via the data stack at runtime.
from modules.block import Block


class TaskNode:
    def __init__(self, id, title, status="todo", result=None, is_goal=False):
        self.id = id              # address for blcoks to find teh task node and update it  
        self.title = title        # human/LLM-readable task description(since LLM in PENTESTGPT raeds natural language and not the id)
        self.status = status      
        self.result = result      # findings once we run the attack 
        self.children = []        # sub-tasks to have the tree structure 
        self.is_goal = is_goal    # objective of the attack 

    def render(self, depth=0): # we need  a way to walk the tree structure of the PTT
        pad = "  " * depth
        star = " *GOAL*" if self.is_goal else ""       # show goal in the text the LLM reads
        line = f"{pad}[{self.status}] {self.id} {self.title}{star}"
        if self.result:
            line += f"  -> {self.result}"
        out = [line]
        for c in self.children:
            out.append(c.render(depth + 1))#this gets fed into the LLM as context so it can understand the current state of the attack and what to do next
        return "\n".join(out)


class DataFile(Block):#this is the shared data structure that holds the PTT and is passed around the blocks via the data stack
    def __init__(self, id, name, properties=None):
        super().__init__(id, name, properties)
        self.root = TaskNode("0", "attack root")#our root that holds the entire tree structure 
        self._auto = 0 # auto-incrementing id for tasks

# we need to be able to find a node by id because the LLM will return a node id and we need to find that node in the PTT to update its status or result
    def find(self, node_id, node=None):#depth-first search for a node by id, starting at the root
        node = node or self.root
        if node.id == node_id:
            return node
        for c in node.children:
            hit = self.find(node_id, c)
            if hit:
                return hit
        return None

#we need to be able to add a task to the PTT and we need to be able to find the parent node to add the task to.
#we  need to be able to generate a unique id for the new task if one is not provided. 
#we  need to be able to mark a task as a goal so that the LLM knows what the objective of the attack is.
    def add_task(self, title, parent_id="0", task_id=None, is_goal=False):
        parent = self.find(parent_id)
        if parent is None:
            raise ValueError(f"no such parent id: {parent_id!r}")
        if task_id is None:
            self._auto += 1
            task_id = f"auto-{self._auto}"
        node = TaskNode(task_id, title, is_goal=is_goal)#objective of the  atatck ?
        parent.children.append(node)
        return task_id
# report the status of the task to the PTT so that the LLM can understand what tasks have been completed and what tasks are still to be done
    def set_status(self, node_id, status):
        node = self.find(node_id)
        if node is None:
            raise ValueError(f"no such node id: {node_id!r}")
        node.status = status
#this is differnt than set_status because it is the result of the overall attack and not the status of individule task
    def set_result(self, node_id, result):
        node = self.find(node_id)
        if node is None:
            raise ValueError(f"no such node id: {node_id!r}")
        node.result = result

    def mark_goal(self, node_id):
# designate an existing node as the objective (goal of the attack)
        node = self.find(node_id)
        if node is None:
            raise ValueError(f"no such node id: {node_id!r}")
        node.is_goal = True

    def _walk(self, node=None):
# yield every node in the tree, depth-first (helper for the checks below)
        node = node or self.root
        yield node
        for c in node.children:
            yield from self._walk(c)

    def next_todo(self):
# first still-unfinished REAL task (skip the root since its not a task )
        for n in self._walk():
            if n is self.root:
                continue
            if n.status == "todo":
                return n
        return None

    def goal_reached(self):
        #reached when goal-flagged node is done not just reached 
        for n in self._walk():
            if n.is_goal and n.status == "done":
                return True
        return False

    def render(self):
        return self.root.render()
        
    def run(self, data_stack):
        return None
    def control(self, control_queue, edges):
        return None#becuse there is no control passed here 