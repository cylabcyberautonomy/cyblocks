# Backend Deploy

Deployment turns an intermediate DSL into local Docker containers and networks.
This is a prototype deployment target for validating canvas semantics before handing the same model to MHBench/OpenStack generation.

## Entry Points

- CLI deploy: `backend/scripts/deploy_docker.py`
- CLI teardown: `backend/scripts/teardown_docker.py`
- CLI status: `backend/scripts/status_docker.py`
- API deploy: `POST /api/deploy`
- API teardown: `POST /api/teardown`
- API quit and cleanup: `POST /api/quit`
- API status: `GET /api/status?name=<environment>`

## What Deploy Uses

Docker deploy currently consumes:

- `hosts[]`
- `routers[]`
- `networks[]`
- `routes[]`
- `serviceChecks[]`

Service, CVE, and misconfiguration blocks are preserved in the DSL and MHBench projection, but local Docker does not yet install the corresponding vulnerable software or apply the corresponding weak configurations. That work belongs in the MHBench/OpenStack target path.

## Local Run

```bash
python3 backend/scripts/compile_ide_to_intermediate.py \
  backend/examples/vulnerable-hosts.ide.json \
  --out backend/generated/vulnerable-hosts.intermediate.json

python3 backend/scripts/deploy_docker.py \
  backend/generated/vulnerable-hosts.intermediate.json \
  --replace

python3 backend/scripts/status_docker.py \
  backend/generated/vulnerable-hosts.intermediate.json

python3 backend/scripts/teardown_docker.py \
  backend/generated/vulnerable-hosts.intermediate.json

python3 backend/scripts/teardown_docker.py --all
```

## Cleanup Semantics

- `POST /api/deploy` uses replace mode for the compiled board project before creating new containers and networks.
- `POST /api/teardown` removes the containers and networks for the compiled board project.
- `POST /api/quit` removes all Cyblocks-owned Docker resources before stopping the frontend and backend dev servers. It deletes containers and networks with the `cyblocks.project` Docker label and also clears leftovers referenced by `backend/runs/*/deployment.json`, which prevents fixed Docker subnets from staying reserved after Quit.
- `backend/scripts/teardown_docker.py --all` performs the same Docker cleanup without stopping the dev servers.

## Linux/WSL Routed Checks

A successful routed deploy records router forwarding state in `backend/runs/<project>/deployment.json`.
For multi-subnet router examples, expect:

```text
ip_forward=1 nat=masquerade
```

If router NAT cannot be configured, deploy fails during router setup with a `router NAT setup failed` message instead of timing out later during the HTTP reachability checks.

## Docker Notes

- Host `osImagePath` values beginning with `docker://` become Docker images.
- Router `imagePath` values beginning with `docker://` become Docker images.
- Router containers run privileged in this prototype so they can enable forwarding.
- Router containers configure IP forwarding and best-effort `iptables` masquerading. The NAT rule keeps routed checks working on Linux/WSL Docker bridges that otherwise drop or time out forwarded packets between user-defined bridge networks.
- Docker deployment validates network shape and reachability, not the full vulnerability install path.
