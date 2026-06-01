# Intermediate DSL

The intermediate DSL is the contract between the canvas and backend targets.
It keeps Docker-specific, Incalmo-specific, and MHBench-specific details out of the frontend.

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
- `playbooks[]`: optional setup/action hooks for targets that use them.
- `controlBlocks[]`: runtime/control-plane metadata such as Incalmo C2 and agents.
- `mhbench`: compatibility projection into the MHBench network/playbook shape.

## Explicit Host Interfaces

Hosts may include `host.networkInterfaces[]` in the IDE JSON. This is used when the target environment needs multi-homed hosts instead of router-mediated subnets, such as Incalmo's packaged Equifax Docker environment:

```json
{
  "networkId": "web_network",
  "networkName": "web_network",
  "cidr": "192.168.200.0/24",
  "ipAddress": "192.168.200.20"
}
```

When any host uses explicit interfaces, every host in that board must declare its interfaces. The compiler turns those into `networks[]`, `members[].ipAddress`, `hosts[].subnetIds`, and `hosts[].ipAddresses`.

Hosts may also include `host.incalmo` metadata for the Compose exporter:

```json
{
  "role": "webserver",
  "buildContext": "docker/equifax/webserver",
  "containerName": "webserver_container",
  "publishedPorts": ["127.0.0.1:8080:8080"]
}
```

`buildContext` and `dockerfile` are explicit per-host exporter metadata. The compiler/exporter does not infer Equifax Docker paths from role names; Equifax is just one checked-in example. For non-Incalmo Docker images, use a normal `docker://image:tag` `osImagePath` instead of an `incalmo://...` path.

Boards may also include top-level `incalmo` metadata:

```json
{
  "project": "incalmo-equifax",
  "strategy": "claude-4.5-sonnet",
  "environment": "EquifaxLarge",
  "c2Server": "http://attacker:8888",
  "debug": true
}
```

## Runtime Blocks

IDE JSON may include top-level `runtimeBlocks[]`. These are intentionally separate from `blocks[]` so command-and-control, agents, runner settings, and API-key/monitor controls do not become hosts or network topology.

```json
{
  "id": "incalmo-c2",
  "kind": "control",
  "type": "incalmo-c2",
  "label": "c2.server",
  "control": {
    "name": "Incalmo C2",
    "role": "c2-server",
    "product": "Incalmo command and control",
    "protocol": "http",
    "ports": ["8888", "6379", "5678"],
    "hostId": "attacker",
    "summary": "C2 endpoints published by the attacker container."
  }
}
```

The compiler normalizes these into intermediate `controlBlocks[]`. The Incalmo exporter reads the `c2-server` control block to decide which attacker ports to publish.

## Connector Kinds

- `topology`
  - Host/router network links.
  - Used to build Docker bridge networks and target subnet projections.
  - Normally undirected. A link may set `"directed": true` when the canvas should show traversal direction without changing explicit `host.networkInterfaces[]` membership.
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

For the Incalmo Equifax webserver SSH key path into the database:

```text
db -> ssh-service -> web.db.ssh.key
webserver -> web.db.ssh.key
```

The compiler uses the access link so the source host is `webserver` while the service host is still `db`.
