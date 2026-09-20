# Cyblocks

Cyblocks is a visual IDE for building agentic red-teaming cybersecurity systems. You can build two
kinds of canvases:

- **Attacker** — an agentic attackflow that compiles down to a runnable Python attack script and can be ran on a deployed environment.
- **Environment** — a vulnerable Environment network (hosts, routers, subnets, services, vulnerabilities,
  users, files) that compiles down to a real Docker Composeed continers.

This README covers installing and running the IDE itself. For a guide to build
environments and attacker systems once the IDE is open, see
[`documentation/building-attacks-and-environments.md`](documentation/building-attacks-and-environments.md).

## Prerequisites

- **Node.js** (LTS)
- **Python** 3.10+
- **Docker Desktop** (or another Docker daemon) we only need it once you deploy/run, not to just
  browse the canvas
- An **API key for whichever LLM provider you want to use** (Anthropic, OpenAI, or Google) —
  only needed to run an attacker flow

## 1. Install the frontend

```
cd Frontend
npm install
```

## 2. Install the backend

```
pip install python-dotenv certifi --break-system-packages
```

(Drop `--break-system-packages` on Windows/most non-Debian systems — it's only needed on
externally-managed Linux Python installs.)

Add whichever provider key(s) you have to a `.env` file inside `backend/Attack/`:

```
printf 'ANTHROPIC_API_KEY=sk-ant-your-key\n' >> backend/Attack/.env
printf 'OPENAI_API_KEY=sk-your-key\n'        >> backend/Attack/.env
printf 'GOOGLE_API_KEY=your-key\n'           >> backend/Attack/.env
```

You don't need all three — only add the ones for the providers your `LLM` blocks are set to
use.

## 3. Start the backend API

```
cd backend/scripts
python3 api_backend.py
```

This listens on `http://127.0.0.1:8000`. It's a plain stdlib HTTP server (no framework) that
the frontend talks to for compiling environments/attacks, deploying to Docker, and driving a
running attack. Make sure Docker Desktop is running before you try to deploy or run anything —
the IDE itself works without it, but deploy/run calls will fail.

## 4. Start the frontend

```
cd Frontend
npm run dev
```

Open **http://localhost:5173** in your browser. The IDE opens with an empty Environment tab —
use the **File** menu to add more Environment or Attacker tabs, and the **Demos** menu to load
a working example of each.

## Project layout

```
Frontend/            React + Vite + React Flow IDE (the app you actually work in)
backend/
  scripts/           HTTP API, environment compiler (flat env -> Docker Compose), deploy/quit
  Attack/            Attack runtime: block classes, control/data flow engine, mapper
                      that turns the IDE's attacker-canvas JSON into a runnable main.py
documentation/        Guide to modeling environments and attacker systems in the IDE
```

