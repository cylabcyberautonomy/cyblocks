# Backend Deploy

Deployment turns an intermediate DSL into local Docker containers and networks.
This is a prototype deployment target for validating canvas semantics before handing the same model to MHBench/OpenStack generation.

## Entry Points

- CLI deploy: `backend/scripts/deploy_docker.py`
- CLI teardown: `backend/scripts/teardown_docker.py`
- CLI status: `backend/scripts/status_docker.py`
- API deploy: `POST /api/deploy`
- API teardown: `POST /api/teardown`
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
```

## Docker Notes

- Host `osImagePath` values beginning with `docker://` become Docker images.
- Router `imagePath` values beginning with `docker://` become Docker images.
- Router containers run privileged in this prototype so they can enable forwarding.
- Docker deployment validates network shape and reachability, not the full vulnerability install path.
