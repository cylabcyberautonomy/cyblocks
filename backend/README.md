# Cyblocks Backend Prototype

This folder holds the first local backend path for turning IDE graph exports into deployable environments.

Current flow:

```text
IDE graph JSON -> intermediate DSL JSON -> Docker networked containers
```

This is not the final Docker or MHBench compiler. It is a runnable bridge for validating that host blocks and connectors can become a small environment.

## MHBench Shape

MHBench environment specs such as `../MHBench/environments/non-generated/equifax_small.json` use:

- `networks[].subnets[].hosts[]`
- host fields like `name`, `vm_type`, `flavor`, and `ip_address`
- `subnet_connections[]`
- `playbooks[]`

Cyblocks keeps an intermediate DSL between the IDE and any target backend so the canvas does not become Docker-specific or MHBench-specific.

## Three-Host HTTP Example

The example starts from [examples/three-host-http.ide.json](examples/three-host-http.ide.json), compiles it to [generated/three-host-http.intermediate.json](generated/three-host-http.intermediate.json), then deploys three `nginx:alpine` containers on one Docker bridge network and checks the HTTP connections declared by the graph.

Run:

```bash
backend/scripts/run_three_host_example.sh
```

The example runner defaults to Colima's Docker Engine socket at `~/.colima/default/docker.sock` when neither `DOCKER_HOST` nor `DOCKER_CONTEXT` is set. It also uses an isolated Docker config under `backend/runs/docker-config` for the public `nginx:alpine` pull, which avoids depending on a desktop credential helper.

If Colima is not running, start the CLI engine first:

```bash
PATH="/opt/homebrew/bin:$PATH" colima start --cpu 2 --memory 4 --disk 20
```

If `docker` is not on `PATH`, the scripts also check common macOS locations such as `/opt/homebrew/bin/docker` and `/usr/local/bin/docker`.

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
- The example uses `docker://nginx:alpine` so each host serves HTTP on port `80`.
- RAM is passed to Docker as a memory limit.
- Storage GB and external drive paths are preserved in the intermediate DSL; storage quotas are not enforced yet because Docker storage quota support depends on the local storage driver.
- Connector ports are validated and used for HTTP reachability checks.
