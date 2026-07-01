# datafile.py — the DataFile's task-tree format (PentestGPT's PTT).
# Reasoning grows the tree; Generation reads tasks; Execute runs them;
# Parsing writes results back. `goal` rides alongside so Condition can test "reached?".

class TaskNode:
    def __init__(self, id, title, parent=None):
        self.id = id                 # stable handle; blocks reference a task by id
        self.title = title           # the task, e.g. "scan 10.0.0.5 for open ports"
        self.parent = parent         # upward link to root, for hierarchy
        self.children = []           # subtasks Reasoning breaks this into
        self.status = "todo"         # todo | doing | done | skipped  -> drives "what's next"
        self.result = None           # Parsing writes the condensed finding here

class PTT:
    def __init__(self, objective, goal=None):
        self.objective = objective                       # the mission, written by whoever seeds
        self.goal = goal                                 # human's target; Condition tests against it
        self._counter = 0
        self.root = TaskNode(self._new_id(), objective)  # root task = the objective
        self.index = {self.root.id: self.root}           # id -> node, O(1) lookup for any block

    # --- ids ---
    def _new_id(self):
        self._counter += 1
        return f"t{self._counter}"

    # --- the parts Reasoning uses to GROW the tree ---
    def add_task(self, parent_id, title):
        parent = self.index[parent_id]
        node = TaskNode(self._new_id(), title, parent)
        parent.children.append(node)
        self.index[node.id] = node
        return node.id

    def set_status(self, task_id, status):
        self.index[task_id].status = status

    # --- the part Parsing uses to RECORD findings ---
    def set_result(self, task_id, text):
        self.index[task_id].result = text

    # --- the parts every block uses to READ ---
    def get(self, task_id):
        return self.index[task_id]

    def next_todo(self):                                 # first actionable (leaf) task
        for node in self._walk(self.root):
            if node.status == "todo" and not node.children:
                return node
        return None

    def _walk(self, node):
        yield node
        for child in node.children:
            yield from self._walk(child)

    # --- goal tracking: one small thing on top of the tree, for Condition ---
    def goal_reached(self):
        if not self.goal:
            return False
        return any(n.result and self.goal in n.result for n in self._walk(self.root))

    # --- readable dump for debug + Stop's report ---
    def render(self):
        lines = [f"OBJECTIVE: {self.objective}", f"GOAL: {self.goal}"]
        marks = {"todo": "[ ]", "doing": "[~]", "done": "[x]", "skipped": "[-]"}
        def show(node, depth):
            line = "  " * depth + f"{marks[node.status]} {node.id}: {node.title}"
            if node.result:
                line += f"  -> {node.result}"
            lines.append(line)
            for c in node.children:
                show(c, depth + 1)
        show(self.root, 0)
        return "\n".join(lines)