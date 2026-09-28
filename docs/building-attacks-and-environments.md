# Building environments and attacker systems in Cyblocks

The IDE has two independent canvas types, switched per-tab via **File → New Environment** /
**New Attacker**. This guide covers how to build each one, how they connect, and how to run an
attack against a deployed environment.

## Attacker canvas

An attacker system is a graph of agents and control logic that compiles to a runnable Python
script (`runs/attack/main.py`).

**Blocks:**

| Block | Role |
|---|---|
| `Start` / `Stop` | first block in an attcak flow; final block, which prints the run's final state |
| `LLM` | calls an LLM with a `Parameter`'s instruction + the current shared state |
| `Human` | a human-in-the-loop step, with three `mode`s: `Editor` (sets the attack goal), `Reviewer` (pauses for a continue/override/suggest decision from the IDE), `Executor` (runs a command against the deployed environment) |
| `Choice` | Actions wire into it; an agent (LLM/Human) seated inside it picks a tool by name and Choice looks up the matching `Action`, builds the shell command, and validates it |
| `Action` | allowed tools (`nmap`, `curl`, `nc`, `hydra`, `ssh`, `sshpass`, `mysql`) wired into a `Choice` |
| `Executor` | an autonomous version Executor: runs the dispatched command from inside the attacker container |
| `DataFile` | the shared state block. `format: "ptt"` gives a PentestGPT-style layered task tree (multi-agent); `format: "text"` gives a flat transcript (single-agent) |
| `Parameter` | holds an agent's role + instruction text. Connect it to an `LLM`'s param-in handle to give that LLM a specific skills(editable) |

### Control flow vs. data flow

Every block has up to two kinds of ports:
- **Control flow** — triangular handles, top (`cf-in`) and bottom (`cf-out-<label>`). These
  decide *what runs next*. `LLM` and `Human` blocks can have more than one `cf-out`: `next` is
  always on; `done`, `override`, `suggest` are optional extra branches you enable with the `+`
  button on the block and then wire to different targets, so one agent can drive a genuine
  branch in the flow (e.g. "done" going to `Stop` while "next" loops back).
- **Data flow** — circular handles, `data-in`/`data-out` (and `param-in` on agents, fed only by
  a `Parameter`). These move the shared `DataFile` around, or feed an `Action`'s output into a
  `Choice`.


### The two included demos

- **OODA / ReasonAct** (`Demos → Load Ooda Attack`) — a single autonomous `LLM` agent in a text
  transcript loop: scan, read output, act, repeat, until it emits `DONE`. Simple flow to start
  from if you want one agent doing everything.
- **PentestGPT** (`Demos → Load PentestGPT Attack`) — the full multi-agent architecture: a human
  sets the goal via the `Editor` block's `goal` property, a `Parsing` agent cleans up raw tool output, a `Reasoning` agent plans and
  decides goal-completion, a human `Reviewer` checkpoint can continue/override/suggest, a
  `Generation` agent turns the next task into a real command, and a human `Executor` runs it —
  looping until Reasoning declares the goal reached.


## Environment canvas

An environment is a network of deployed Docker containers. 

**Blocks:** `Host`, `Router`, `Subnet`, `Service`, `Vulnerability`, `Misconfiguration`, `User`,
`File`.

**Valid connections** (direction matters — drag from the first type to the second):

| From             | To                          |
|------------------|-----------------------------|
| `Subnet`         | `Router`, `Host`            |
| `Router`         | `Router`, `Subnet`, `Host`  |
| `Service`        | `Host`                      |
| `Vulnerability` / `Misconfiguration` | `Service`     |
| `User`           | `Host`                      |
| `File`           | `Host`                      |
| `User` ⇄ `File`  |                             |



The `Host` node has five color-coded handles (one per connectable type) so you can see at a
glance what's wired to it. `Service` and `Vulnerability` name fields autocomplete from the
backend's service/vulnerability library (`src/backend/library/services.json` /
`vulnerabilities.json`) — picking a known entry auto-fills the rest of its properties.

**Running it:**
- **Environment → Deploy Environment** compiles and `docker compose up`s the network.
- **Environment → End Environment** tears it down.
- **Compile → Docker** just downloads the compiled Docker DSL for inspection, without deploying.
- **Demos** menu has three ready-made environments (3-subnet, single-subnet, 6-host) to see
  working examples.

## Running an attack against an environment

**Run Experiment** (the primary button on the tab bar) connects both canvases together in one go:
pick an Environment tab and an Attacker tab, then **Run** does the environment deployment, compilation of the attacker flow, launch it and stream it to the terminal.

Once an attacker flow has been compiled (either via **Compile → Compile Attack**, or as part of
Run Experiment), the generated script sits at `runs/attack/main.py` and can also be run
directly, without the IDE or the API server, for debugging:

```
PYTHONPATH=src python3 runs/attack/main.py
```
