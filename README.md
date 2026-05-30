# cyblocks

Visual block canvas experiments for building environment graphs.

The current prototype flow is:

```text
IDE canvas -> intermediate DSL -> local Docker Engine deployment
```

The local Docker deployment is a development bridge. The longer-term target is for the IDE to emit DSLs that can be handed to MHBench/OpenStack environment generation, including the Ansible playbooks used by MHBench specs.

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

- `Vulnerable Hosts` loads the routed sample with service, CVE, and misconfiguration blocks.
- `Compile` writes the visible canvas to the intermediate DSL.
- `Deploy` creates the local Docker containers/networks.
- `Status` shows compiled subnets and live Docker network attachments.
- `End Deployment` removes deployed Docker containers and networks.
- `Quit` removes all Cyblocks-owned Docker containers/networks and routed bridge firewall rules, then stops both the frontend dev server and backend API server.
- `Download IDE JSON` saves the visible canvas graph.

The current sample includes three hosts connected through one router, five service blocks, three CVE blocks, and two misconfiguration blocks. CVEs attach to services, misconfigurations get their own visual shape, and directed access links model one-way multi-host paths such as a web host holding a database SSH key.

## Manual Example

```bash
backend/scripts/run_three_host_example.sh ~/Downloads/vulnerable-hosts.ide.json
```

Or compile the checked-in vulnerable-hosts example:

```bash
python3 backend/scripts/compile_ide_to_intermediate.py \
  backend/examples/vulnerable-hosts.ide.json \
  --out backend/generated/vulnerable-hosts.intermediate.json
```

Stop a deployment manually with:

```bash
python3 backend/scripts/teardown_docker.py backend/generated/vulnerable-hosts.intermediate.json
```

The frontend `Quit` button performs a broader cleanup than project teardown: it removes every Docker container/network with the `cyblocks.project` label, clears Cyblocks routed bridge firewall rules recorded in deployment state, and deletes deployment state under `backend/runs/` so reused fixed subnets are released before the next compile/deploy cycle. Run `python3 backend/scripts/teardown_docker.py --all` for the same Docker cleanup without stopping the dev servers.

WSL note: if deploy logs show Docker image pulls, `apk add`, or `wget` downloads timing out on a Linux/WSL machine, treat it as a WSL/Docker DNS issue first. Restart WSL/Docker and verify DNS from an Alpine container before debugging Cyblocks routes:

```bash
docker run --rm alpine:latest nslookup dl-cdn.alpinelinux.org
docker run --rm alpine:latest wget -S -O- --timeout=5 http://example.com/
```

Design notes for the future Docker/container mapping live in [docs/docker-canvas-ide-chat-helper.md](docs/docker-canvas-ide-chat-helper.md).

## More Docs

- [Vulnerable hosts changes](docs/vulnerable-hosts-example/README.md)
- [Frontend canvas](frontend/README.md)
- [Backend compilation](backend/docs/compilation/README.md)
- [Intermediate DSL](backend/docs/dsl/README.md)
- [Backend deploy](backend/docs/deploy/README.md)
