# Cyblocks Backend Prototype

This folder holds the first local backend path for turning IDE graph exports into deployable environments.

Current flow:

```text
IDE graph JSON -> intermediate DSL JSON -> Docker networked containers
```

The Incalmo POC adds a parallel export target:

```text
IDE graph JSON + runtimeBlocks -> intermediate DSL + controlBlocks -> Incalmo Docker Compose
```

Runtime/control-plane items such as C2 and agents are metadata. They are not compiled as host topology and do not affect the normal Docker deploy target.
Incalmo project/strategy/environment values and per-host build contexts are carried as JSON metadata, so the Equifax sample is not hardcoded into the compiler/exporter.

The active POC is the smaller Incalmo Equifax Docker environment from the local `../Incalmo/docker/equifax` checkout. The legacy vulnerable-hosts/MHBench-style example remains as a reference, but it is not the default path.

## Incalmo Equifax Shape

The Incalmo Equifax Docker Compose file uses:

- `attacker_network`, `web_network`, and `db_network`.
- multi-homed `attacker` and `webserver` containers.
- a `db` container on the database network.
- Apache Struts on the webserver.
- SSH key trust from the webserver's Tomcat user to the database user.
- Incalmo C2/agent runtime metadata.

Cyblocks keeps an intermediate DSL between the IDE and any target backend so the canvas does not become Docker-specific, Incalmo-specific, or MHBench-specific.

## Detailed Backend Docs

- [Compilation](docs/compilation/README.md)
- [Intermediate DSL](docs/dsl/README.md)
- [Deploy](docs/deploy/README.md)
- [Incalmo Compose export](docs/incalmo/README.md)

## Local Server Startup

Start Docker Engine first and verify the Docker CLI works.

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

Start the backend API from the repo root:

```bash
python3 backend/scripts/api_server.py
```

Start the React frontend in another terminal:

```bash
cd frontend
npm install
npm run dev
```

Then open `http://127.0.0.1:5173/`. The `Quit` button stops both local dev servers and stops the macOS Colima VM when Cyblocks is using that Docker context.

## Examples

The flat example starts from [examples/three-host-http.ide.json](examples/three-host-http.ide.json), compiles it to [generated/three-host-http.intermediate.json](generated/three-host-http.intermediate.json), then deploys three `nginx:alpine` containers on one Docker bridge network and checks the HTTP connections declared by the graph.

The routed example starts from [examples/routed-three-host.ide.json](examples/routed-three-host.ide.json). It creates three host blocks and one router block. Each host-to-router topology connector becomes its own Docker bridge subnet, the router container attaches to all three subnets, and the deployer installs routes so hosts can communicate across the graph.

The active POC example starts from [examples/incalmo-equifax.ide.json](examples/incalmo-equifax.ide.json). It models Incalmo's packaged Equifax mini environment with attacker, webserver, database, Apache Struts `CVE-2017-5638`, database SSH, and the one-way webserver-to-database SSH key trust misconfiguration.

The vulnerable-hosts example in [examples/vulnerable-hosts.ide.json](examples/vulnerable-hosts.ide.json) is now only a legacy/reference graph for the older MHBench-style vulnerability set.

Run:

```bash
backend/scripts/run_three_host_example.sh
```

Run the routed subnet example:

```bash
backend/scripts/run_three_host_example.sh backend/examples/routed-three-host.ide.json
```

Compile the Incalmo Equifax DSL:

```bash
python3 backend/scripts/compile_ide_to_intermediate.py \
  backend/examples/incalmo-equifax.ide.json \
  --out backend/generated/incalmo-equifax.intermediate.json
```

Export the packaged Incalmo Equifax mini environment as Docker Compose:

```bash
python3 backend/scripts/export_incalmo_compose.py \
  backend/examples/incalmo-equifax.ide.json \
  --out-dir backend/generated/incalmo-equifax-compose \
  --incalmo-root ../Incalmo \
  --project incalmo-equifax \
  --debug
```

For frontend-driven compile/deploy buttons, start the API server from the repo root:

```bash
python3 backend/scripts/api_server.py
```

The frontend posts the visible board to:

- `POST /api/compile`
- `POST /api/export/incalmo`
- `POST /api/incalmo/api-key`
- `POST /api/deploy`
- `POST /api/teardown`
- `POST /api/quit`
- `GET /api/status?name=three-host-http`
- `GET /api/incalmo/status?name=incalmo-equifax`

`/api/quit` is intentionally broader than `/api/teardown`: teardown removes resources for the current compiled project, while quit removes every Docker container/network owned by Cyblocks before it stops the local dev servers. That global cleanup frees fixed address spaces left by previous boards. On macOS Colima deployments, quit also runs `colima stop` so the backing `com.apple.Virtualization.VirtualMachine` process exits.
The equivalent Docker resource cleanup is `python3 backend/scripts/teardown_docker.py --all`; that command does not stop the dev servers or Colima.

To start from the React frontend instead, load the three-host board, download the `.ide.json` file, then pass that export to the same runner:

```bash
backend/scripts/run_three_host_example.sh ~/Downloads/three-host-http.ide.json
```

The example runner uses the Docker CLI exactly like a normal Linux shell when neither `DOCKER_HOST` nor `DOCKER_CONTEXT` is set. On Linux, that means Docker Engine's default socket such as `/var/run/docker.sock` is used. For rootless Docker, it will use `$XDG_RUNTIME_DIR/docker.sock` when that socket exists and the default rootful socket does not.

On Linux, start Docker Engine and verify that your user can talk to it before running deploys:

```bash
sudo systemctl start docker
docker info
```

The runner also uses an isolated Docker config under `backend/runs/docker-config` for public image pulls, which avoids depending on desktop credential helpers. On macOS, if neither `DOCKER_HOST` nor `DOCKER_CONTEXT` is set and Colima's socket exists at `~/.colima/default/docker.sock`, the scripts use that socket as a fallback. If `docker` is not on `PATH`, the Python scripts also check common macOS locations such as `/opt/homebrew/bin/docker` and `/usr/local/bin/docker`.

Useful individual commands:

```bash
python3 backend/scripts/compile_ide_to_intermediate.py \
  backend/examples/three-host-http.ide.json \
  --out backend/generated/three-host-http.intermediate.json

python3 backend/scripts/deploy_docker.py \
  backend/generated/three-host-http.intermediate.json \
  --replace

python3 backend/scripts/status_docker.py \
  backend/generated/three-host-http.intermediate.json

python3 backend/scripts/teardown_docker.py \
  backend/generated/three-host-http.intermediate.json
```

## Notes

- Host `osImagePath` values beginning with `docker://` become Docker image names.
- Router `imagePath` values beginning with `docker://` become router container image names.
- The example uses `docker://nginx:alpine` so each host serves HTTP on port `80`.
- Router blocks compile to first-class `routers[]` entries, topology links compile to Docker bridge subnets, and router interfaces compile to `subnetConnections[]` plus route entries.
- Hosts can also declare explicit `networkInterfaces[]` with `networkId`, `cidr`, and `ipAddress`. The Incalmo exporter uses these to model multi-homed attacker/webserver/database containers without requiring router blocks.
- Router containers run with Docker's local `--privileged` flag in this prototype so Linux Docker Engine can enable forwarding inside the router network namespace. The deployer verifies `ip_forward=1` before running cross-subnet checks.
- The compiler still emits an `mhbench` compatibility projection with `networks[].subnets[].hosts[]`, `subnet_connections[]`, and `playbooks[]`, but the active POC uses Incalmo Compose export.
- Service, CVE, misconfiguration, and access links compile into `services[]`, `vulnerabilities[]`, `serviceFindings[]`, optional `playbooks[]`, and target-specific projections.
- RAM is passed to Docker as a memory limit.
- Storage GB and external drive paths are preserved in the intermediate DSL; storage quotas are not enforced yet because Docker storage quota support depends on the local storage driver.
- Connector ports are validated and used for HTTP reachability checks.
