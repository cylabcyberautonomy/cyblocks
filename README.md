# Cyblocks

Cyblocks is a visual IDE for building agentic red-teaming cybersecurity systems. You can build two
kinds of canvases:

- **Attacker** — an agentic attackflow that compiles down to a runnable Python attack script and can be ran on a deployed environment.
- **Environment** — a vulnerable Environment network (hosts, routers, subnets, services, vulnerabilities,
  users, files) that compiles down to a real Docker Composeed continers.

This README covers installing and running the IDE itself. For a guide to build
environments and attacker systems once the IDE is open, see
[`docs/building-attacks-and-environments.md`](docs/building-attacks-and-environments.md).

## Prerequisites

- **Node.js** (LTS)
- **Python** 3.10+ and [**uv**](https://docs.astral.sh/uv/)
- **Docker Desktop** (or another Docker daemon) we only need it once you deploy/run, not to just
  browse the canvas
- An **API key for whichever LLM provider you want to use** (Anthropic, OpenAI, or Google) —
  only needed to run an attacker flow

## 1. Install

```
./install.sh
```

`uv sync` builds a `.venv` with the Python dependencies and an editable install of the
`backend` package (so `import backend.*` works without any `PYTHONPATH` juggling), then
`npm install` sets up the frontend.

## 2. Add your API key

Add whichever provider key(s) you have to a `.env` file at the repo root:

```
printf 'ANTHROPIC_API_KEY=sk-ant-your-key\n' >> .env
printf 'OPENAI_API_KEY=sk-your-key\n'        >> .env
printf 'GOOGLE_API_KEY=your-key\n'           >> .env
```

You don't need all three — only add the ones for the providers your `LLM` blocks are set to
use.

## 3. Start everything

```
./start.sh
```

This runs the backend API and the frontend dev server together; Ctrl-C stops both. To run
them separately instead:

```
uv run python -m backend.api
```

This listens on `http://127.0.0.1:8000`. It's a plain stdlib HTTP server (no framework) that
the frontend talks to for compiling environments/attacks, deploying to Docker, and driving a
running attack. Make sure Docker Desktop is running before you try to deploy or run anything —
the IDE itself works without it, but deploy/run calls will fail.

```
cd src/frontend && npm run dev
```

Open **http://localhost:5173** in your browser. The IDE opens with an empty Environment tab —
use the **File** menu to add more Environment or Attacker tabs, and the **Demos** menu to load
a working example of each.

## Project layout

```
install.sh start.sh   uv sync + npm install / run both servers
pyproject.toml       Python dependencies; editable install of src/backend
src/
  frontend/          React + Vite + React Flow IDE (the app you actually work in)
  backend/
    api.py           HTTP API the IDE talks to
    compiler/        flat env -> nested DSL -> Docker Compose build artifact
    deploy/          Docker lifecycle: environment stack, attacker container, daemon
    library/         service + vulnerability catalogs (JSON recipes + loaders)
    attack/          Attack runtime: block classes, control/data flow engine, mapper
                     that turns the IDE's attacker-canvas JSON into a runnable main.py
docs/                Guide to modeling environments and attacker systems in the IDE
runs/                Generated: build artifacts, deploy logs, the compiled main.py
```

