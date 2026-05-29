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

If router NAT cannot be configured, deploy fails during router setup with a `router NAT setup failed` message instead of timing out later during the HTTP reachability checks. Router setup configures every available `iptables`, `iptables-legacy`, and `iptables-nft` backend because some Linux/WSL Docker installs keep active forwarding rules in legacy tables.
If a `wget` reachability check still times out, the deploy log includes `Cyblocks connection diagnostics` sections with the source route table, source interfaces, target local HTTP check, target routes/interfaces, and router forwarding/NAT state.

Multi-subnet Docker deploys also create deterministic Cyblocks bridge interface names and add scoped Docker-host `DOCKER-USER` accept rules between those bridges. This handles Linux/WSL Docker installs where Docker bridge isolation can drop routed packets even when the router container has valid routes, NAT, and IP forwarding. Deployment state includes:

- `bridgeInterfaces`: the Docker bridge devices used by the project.
- `hostFirewall`: whether the Docker-host `DOCKER-USER` helper ran and the rules it observed after setup.

`--replace`, `teardown_docker.py`, `teardown_docker.py --all`, and `POST /api/quit` remove the Cyblocks bridge forwarding rules recorded in deployment state before deleting networks. The helper only adds/removes rules for Cyblocks-created bridge interface names.

## Files Updated By Routed Linux/WSL Support

- `backend/scripts/backend_common.py`: shared network and deterministic bridge-name helpers.
- `backend/scripts/deploy_docker.py`: bridge creation, Docker-host `DOCKER-USER` setup, routed checks, and deployment-state fields.
- `backend/scripts/teardown_docker.py`: teardown/quit cleanup for containers, networks, deployment state, and Cyblocks bridge forwarding rules.
- `backend/docs/deploy/README.md`, `backend/README.md`, `README.md`, and `frontend/README.md`: operator notes for deploy, cleanup, and frontend controls.

## Docker Notes

- Host `osImagePath` values beginning with `docker://` become Docker images.
- Router `imagePath` values beginning with `docker://` become Docker images.
- Router containers run privileged in this prototype so they can enable forwarding.
- Router containers configure IP forwarding and best-effort `iptables` masquerading. The NAT rule keeps routed checks working on Linux/WSL Docker bridges that otherwise drop or time out forwarded packets between user-defined bridge networks.
- Multi-subnet deployments also add Docker-host `DOCKER-USER` accept rules between deterministic Cyblocks bridge interfaces and remove those rules during teardown/quit.
- Docker deployment validates network shape and reachability, not the full vulnerability install path.
