# Backend Compilation

Compilation converts an IDE canvas graph into the Cyblocks intermediate DSL.

## Entry Points

- CLI: `backend/scripts/compile_ide_to_intermediate.py`
- API: `POST /api/compile` in `backend/scripts/api_server.py`
- Example input: `backend/examples/vulnerable-hosts.ide.json`

## Input Shape

The compiler expects a graph with:

- `blocks[]`: hosts, routers, services, and vulnerabilities.
- `connections[]`: topology, service, vulnerability, misconfiguration, and access links.
- optional `playbooks[]`: extra MHBench-style playbooks to preserve.

## Compilation Steps

1. Normalize block kinds and validate duplicate IDs/names.
2. Compile hosts and routers into deployable nodes.
3. Compile services and vulnerabilities into DSL metadata.
4. Use topology links to build subnets, router interfaces, and routes.
5. Use service-to-finding links to build `serviceFindings[]`.
6. Use access links to resolve one-way multi-host playbook variables such as `$sourceHost`.
7. Emit an MHBench projection with `networks`, `subnet_connections`, and `playbooks`.

## Verification

```bash
python3 -m py_compile backend/scripts/compile_ide_to_intermediate.py

python3 backend/scripts/compile_ide_to_intermediate.py \
  backend/examples/vulnerable-hosts.ide.json \
  --out /tmp/vulnerable-hosts.intermediate.json
```
