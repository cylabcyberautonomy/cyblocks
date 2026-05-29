# cyblocks

Visual block canvas experiments for building environment graphs.

The current prototype flow is:

```text
IDE canvas -> intermediate DSL -> local Docker Engine deployment
                             \-> MHBench/OpenStack environment JSON
```

The local Docker deployment is a development bridge. The `Export MHBench` path writes the same topology as an MHBench-compatible environment JSON with `networks[].subnets[]`, `subnet_connections[]`, hosts, and playbook references. MHBench can then validate/deploy that JSON through its own OpenStack workflow.

## Quick Start

Use two terminals from the repo root:

```bash
cd /path/to/cyblocks
```

### 1. Start Docker Engine

The backend uses the Docker CLI. Any setup is fine as long as this works:

```bash
docker info
```

Linux:

```bash
sudo systemctl start docker
unset DOCKER_HOST   # only needed if your shell has an old Colima value
docker info
```

macOS with Colima:

```bash
colima start --cpu 2 --memory 4 --disk 20
docker info
```

If you use a custom Docker context or `DOCKER_HOST`, set that before starting the backend.

### 2. Start The Backend API

Terminal 1:

```bash
cd /path/to/cyblocks
python3 backend/scripts/api_server.py
```

The API listens on:

```text
http://127.0.0.1:8787
```

### 3. Start The Frontend

Terminal 2:

```bash
cd /path/to/cyblocks
cd frontend
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

## Using The Prototype

In the browser:

- `Three Host` loads the routed three-host sample.
- `Compile` writes the visible canvas to the intermediate DSL.
- `Export MHBench` writes `backend/generated/<name>.mhbench.json` for MHBench/OpenStack handoff.
- `Deploy` creates the local Docker containers/networks.
- `Status` shows compiled subnets and live Docker network attachments.
- `End Deployment` removes deployed Docker containers and networks.
- `Quit` stops both the frontend dev server and backend API server.
- `Download IDE JSON` saves the visible canvas graph.

The current sample includes three hosts connected through one router, which compiles into three Docker bridge subnets plus one router container.

## Manual Example

```bash
backend/scripts/run_three_host_example.sh ~/Downloads/routed-three-host.ide.json
```

Or run the checked-in routed example:

```bash
backend/scripts/run_three_host_example.sh backend/examples/routed-three-host.ide.json
```

Export an MHBench environment JSON manually:

```bash
python3 backend/scripts/compile_ide_to_intermediate.py \
  backend/examples/routed-three-host.ide.json \
  --out backend/generated/routed-three-host.intermediate.json

python3 backend/scripts/export_mhbench_spec.py \
  backend/generated/routed-three-host.intermediate.json \
  --out backend/generated/routed-three-host.mhbench.json
```

If MHBench is checked out next to this repo, you can write directly to its generated environments folder:

```bash
python3 backend/scripts/export_mhbench_spec.py \
  backend/generated/routed-three-host.intermediate.json \
  --mhbench-root ../MHBench
```

Stop a deployment manually with:

```bash
python3 backend/scripts/teardown_docker.py backend/generated/routed-three-host.intermediate.json
```

Design notes for the future Docker/container mapping live in [docs/docker-canvas-ide-chat-helper.md](docs/docker-canvas-ide-chat-helper.md).
