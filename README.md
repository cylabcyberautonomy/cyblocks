# cyblocks

Visual block canvas experiments for building environment graphs.

The current prototype flow is:

```text
IDE canvas -> intermediate DSL -> local Docker Engine deployment
```

The local Docker deployment is a development bridge. The current POC target is the smaller Incalmo Equifax Docker environment that already lives in the local `../Incalmo` checkout.

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

- `Equifax Sample` loads the Incalmo mini-environment with attacker, webserver, database, service, CVE, and SSH-key misconfiguration blocks.
- `Compile` writes the visible canvas to the intermediate DSL.
- `Deploy` creates local Docker containers/networks for plain `docker://` boards. For Incalmo boards, the same topbar button is labeled `Export Compose` and writes the Incalmo Compose project instead.
- `Status` shows compiled subnets and live Docker network attachments.
- `End Deployment` removes deployed Docker containers and networks.
- `Quit` removes all Cyblocks-owned Docker containers/networks, stops the macOS Colima VM when Cyblocks is using that Docker context, then stops both the frontend dev server and backend API server.
- `Download IDE JSON` saves the visible canvas graph.

The separate `Incalmo` pane is for runtime/control-plane work that should not affect the host/network canvas:

- `Equifax` loads the packaged Incalmo mini-environment model with explicit multi-homed host interfaces plus separate C2/agent runtime metadata.
- `Export Compose` writes a Docker Compose project under `backend/generated/<board>-compose`.
- Project, strategy, environment, C2 server, and per-host build contexts are exported from IDE JSON/DSL metadata instead of being hardcoded for Equifax.
- The Equifax canvas shows directed topology arrows for `attacker -> webserver -> db`; these are visual traversal hints, while Docker network membership still comes from explicit host interfaces.
- `Save Key` writes the selected LLM provider key to the local Incalmo `.env`.
- `Monitor` checks generated Compose services, local C2 reachability, and the latest Incalmo output log tail.

The current sample is based on Incalmo's `docker/equifax` Compose environment, not the larger MHBench examples. It includes three hosts, Apache Struts on the webserver, `CVE-2017-5638`, database SSH, and the one-way webserver-to-database SSH key trust misconfiguration represented as a separate draggable finding block.

## Manual Example

```bash
python3 backend/scripts/compile_ide_to_intermediate.py \
  backend/examples/incalmo-equifax.ide.json \
  --out backend/generated/incalmo-equifax.intermediate.json
```

Run Docker cleanup manually without stopping the dev servers:

```bash
python3 backend/scripts/teardown_docker.py --all
```

The frontend `Quit` button performs a broader cleanup than project teardown: it removes every Docker container/network with the `cyblocks.project` label and clears deployment state under `backend/runs/` so reused fixed subnets are released before the next compile/deploy cycle. On macOS Colima deployments, Quit also runs `colima stop` so the backing `com.apple.Virtualization.VirtualMachine` process exits. Run `python3 backend/scripts/teardown_docker.py --all` for the same Docker resource cleanup without stopping the dev servers or Colima.

## Incalmo Compose Export

The Incalmo POC path exports a Cyblocks IDE graph or intermediate DSL into a Docker Compose project that reuses the local Incalmo checkout's packaged Equifax attacker/webserver/database build contexts:

```bash
python3 backend/scripts/export_incalmo_compose.py \
  backend/examples/incalmo-equifax.ide.json \
  --out-dir backend/generated/incalmo-equifax-compose \
  --incalmo-root ../Incalmo \
  --project incalmo-equifax \
  --debug
```

Run the generated environment from the Incalmo checkout:

```bash
cd ../Incalmo
cp ../cyblocks/backend/generated/incalmo-equifax-compose/incalmo.config.json config/config.json
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose -p incalmo-equifax -f ../cyblocks/backend/generated/incalmo-equifax-compose/compose.yml up --build
```

Then execute Incalmo in another terminal:

```bash
cd ../Incalmo
docker compose -p incalmo-equifax -f ../cyblocks/backend/generated/incalmo-equifax-compose/compose.yml exec attacker uv run main.py
```

Stop the generated Incalmo environment with:

```bash
cd ../Incalmo
docker compose -p incalmo-equifax -f ../cyblocks/backend/generated/incalmo-equifax-compose/compose.yml down -v --remove-orphans
```

The same path is available from the IDE as `IDE JSON/runtimeBlocks -> intermediate DSL/controlBlocks -> Incalmo Docker Compose`. Runtime controls such as C2 and agents stay in the Incalmo pane and compile separately from host, service, vulnerability, and network blocks.

Design notes for the future Docker/container mapping live in [docs/docker-canvas-ide-chat-helper.md](docs/docker-canvas-ide-chat-helper.md).

## More Docs

- [Legacy vulnerable hosts changes](docs/vulnerable-hosts-example/README.md)
- [Frontend canvas](frontend/README.md)
- [Backend compilation](backend/docs/compilation/README.md)
- [Intermediate DSL](backend/docs/dsl/README.md)
- [Backend deploy](backend/docs/deploy/README.md)
- [Incalmo Compose export](backend/docs/incalmo/README.md)
