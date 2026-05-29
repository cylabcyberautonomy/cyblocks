# Cyblocks Backend Prototype

This folder holds the first local backend path for turning IDE graph exports into deployable environments.

Current flow:

```text
IDE graph JSON -> intermediate DSL JSON -> Docker networked containers
                                  \-> MHBench/OpenStack environment JSON
```

The Docker Engine path is a runnable local bridge for validating that host blocks, router blocks, subnets, and connectors can become a small environment. The MHBench export path writes the handoff artifact MHBench expects before its own OpenStack provision/configure/deploy commands run.

## MHBench Shape

MHBench environment specs such as `../MHBench/environments/non-generated/equifax_small.json` use:

- `networks[].subnets[].hosts[]`
- host fields like `name`, `vm_type`, `flavor`, and `ip_address`
- `subnet_connections[]`
- `playbooks[]`

Cyblocks keeps an intermediate DSL between the IDE and any target backend so the canvas does not become Docker-specific or MHBench-specific.

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

Then open `http://127.0.0.1:5173/`. The `Quit` button stops both local dev servers.

## Three-Host HTTP Example

The flat example starts from [examples/three-host-http.ide.json](examples/three-host-http.ide.json), compiles it to [generated/three-host-http.intermediate.json](generated/three-host-http.intermediate.json), then deploys three `nginx:alpine` containers on one Docker bridge network and checks the HTTP connections declared by the graph.

The routed example starts from [examples/routed-three-host.ide.json](examples/routed-three-host.ide.json). It creates three host blocks and one router block. Each host-to-router topology connector becomes its own Docker bridge subnet, the router container attaches to all three subnets, and the deployer installs routes so hosts can communicate across the graph.

Run:

```bash
backend/scripts/run_three_host_example.sh
```

Run the routed subnet example:

```bash
backend/scripts/run_three_host_example.sh backend/examples/routed-three-host.ide.json
```

For frontend-driven compile/deploy buttons, start the API server from the repo root:

```bash
python3 backend/scripts/api_server.py
```

The frontend posts the visible board to:

- `POST /api/compile`
- `POST /api/export-mhbench`
- `POST /api/deploy`
- `POST /api/teardown`
- `POST /api/quit`
- `GET /api/status?name=three-host-http`

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

python3 backend/scripts/export_mhbench_spec.py \
  backend/generated/three-host-http.intermediate.json \
  --out backend/generated/three-host-http.mhbench.json

python3 backend/scripts/export_mhbench_spec.py \
  backend/generated/three-host-http.intermediate.json \
  --mhbench-root ../MHBench

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
- The compiler emits an `mhbench` projection with `networks[].subnets[].hosts[]`, `subnet_connections[]`, and `playbooks[]`.
- `export_mhbench_spec.py` writes the projection as a standalone MHBench environment JSON. It defaults hosts to MHBench's `ubuntu_base_running` VM type and `m1.small` OpenStack flavor unless the IDE graph provides overrides.
- RAM is passed to Docker as a memory limit.
- Storage GB and external drive paths are preserved in the intermediate DSL; storage quotas are not enforced yet because Docker storage quota support depends on the local storage driver.
- Connector ports are validated and used for HTTP reachability checks.
