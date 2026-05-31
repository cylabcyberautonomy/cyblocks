# Backend Deploy

Deployment turns an intermediate DSL into local Docker containers and networks.
This is a prototype deployment target for validating canvas semantics. The active environment POC is the Incalmo Compose exporter, which reproduces the smaller Equifax Docker environment from `../Incalmo/docker/equifax`.

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

Service, CVE, and misconfiguration blocks are preserved in the DSL, but local Docker deploy does not install vulnerable software or apply weak configurations. For the Equifax POC, use `POST /api/export/incalmo` or `backend/scripts/export_incalmo_compose.py` so the generated Compose file reuses Incalmo's Dockerfiles.
In the frontend, Incalmo boards relabel the topbar deploy action to `Export Compose` to avoid sending `incalmo://` hosts to the local Docker deploy target.

## Local Run

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

python3 backend/scripts/teardown_docker.py --all
```

## Cleanup Semantics

- `POST /api/deploy` uses replace mode for the compiled board project before creating new containers and networks.
- `POST /api/teardown` removes the containers and networks for the compiled board project.
- `POST /api/quit` removes all Cyblocks-owned Docker resources before stopping the frontend and backend dev servers. It deletes containers and networks with the `cyblocks.project` Docker label and also clears leftovers referenced by `backend/runs/*/deployment.json`, which prevents fixed Docker subnets from staying reserved after Quit.
- `backend/scripts/teardown_docker.py --all` performs the same Docker cleanup without stopping the dev servers.

## Docker Notes

- Host `osImagePath` values beginning with `docker://` become Docker images.
- Router `imagePath` values beginning with `docker://` become Docker images.
- Router containers run privileged in this prototype so they can enable forwarding.
- Docker deployment validates network shape and reachability, not the full vulnerability install path.
