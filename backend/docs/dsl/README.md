# Intermediate DSL

The intermediate DSL is the contract between the canvas and backend targets.
It keeps Docker-specific and MHBench-specific details out of the frontend.

## Top-Level Fields

- `networks[]`: compiled subnets and their members.
- `hosts[]`: host nodes with image, resource, VM type, and IP metadata.
- `routers[]`: router nodes and generated interfaces.
- `services[]`: service blocks attached to hosts.
- `vulnerabilities[]`: CVE and misconfiguration finding blocks attached to services.
- `serviceFindings[]`: host/service/finding combinations.
- `connections[]`: normalized canvas links with endpoint kinds and direction metadata.
- `subnetConnections[]`: router-mediated subnet connectivity.
- `routes[]`: generated routes for local Docker deployment.
- `serviceChecks[]`: service reachability checks for Docker deployment.
- `playbooks[]`: generated and user-provided MHBench playbooks.
- `mhbench`: projection into the MHBench network/playbook shape.

## Connector Kinds

- `topology`
  - Host/router network links.
  - Used to build Docker bridge networks and MHBench subnets.
  - Not treated as a directed attack path.
- `service`
  - Host-to-service or host-to-host service relationship.
  - Direction matters for visual modeling and exported connector metadata.
- `vulnerability`
  - Service-to-CVE or service-to-misconfiguration exposure relationship.
  - Direction means the service exposes or depends on the security finding.
- `access`
  - Host-to-finding relationship.
  - Direction means the source host provides access material or trust into the target finding.

## Multi-Host Example

For a root SSH key from web to database:

```text
db-1 -> ssh-service -> ssh.root.trust
web-1 -> ssh.root.trust
```

The compiler uses the access link so `$sourceHost` resolves to `web-1` while `$host` still resolves to `db-1`.
