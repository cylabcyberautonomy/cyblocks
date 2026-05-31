# Vulnerable Hosts Example

This is now a legacy/reference note. The active POC sample is `backend/examples/incalmo-equifax.ide.json`, which reproduces the smaller Incalmo Equifax Docker environment from the local `../Incalmo` checkout.

This branch turns the routed three-host canvas into a vulnerability modeling example.
Hosts and routers still define network topology. CVEs, services, and non-CVE misconfigurations are separate draggable blocks.

## What Changed

- `frontend/src/App.jsx`
  - Adds service blocks for Struts, vsftpd, OpenSSH, Netcat, and sudo.
  - Adds vulnerability blocks for CVEs and misconfiguration blocks for non-CVE security conditions.
  - Adds directed service, vulnerability, and access connectors.
  - Originally changed the default sample to `vulnerable-hosts`; the current default is `incalmo-equifax`.
- `frontend/src/styles.css`
  - Gives topology links a network-only visual style.
  - Gives directed service, vulnerability, misconfiguration, and access links distinct styling and arrowheads.
- `backend/scripts/compile_ide_to_intermediate.py`
  - Compiles service, vulnerability, and misconfiguration blocks into the intermediate DSL.
  - Emits `serviceFindings[]` and MHBench-style playbooks from connected services and security findings.
  - Uses `access` links for one-way multi-host relationships such as a web host holding an SSH key for a database host.
- `backend/examples/vulnerable-hosts.ide.json`
  - Checked-in sample graph with three hosts, one router, five services, three CVEs, two misconfigurations, and an explicit SSH-key access path.

## Link Semantics

- `topology`: host/router network membership. Undirected for topology generation.
- `service`: directed host-to-service or host-to-host service relationship.
- `vulnerability`: directed service-to-CVE or service-to-misconfiguration exposure.
- `access`: directed host-to-finding relationship for multi-host attack paths.

The SSH-key path uses both a service-to-misconfiguration link and an access link:

- `db-1 -> ssh-service -> ssh.root.trust` says the database SSH service trusts the weak credential relationship.
- `web-1 -> ssh.root.trust` says the web host has the key material used to reach the database.

## MHBench Mapping

The compiler derives playbooks from CVE and misconfiguration blocks. The vulnerable-hosts example currently emits:

- `setup_struts`
- `netcat_shell`
- `sudobaron`
- `enable_root_ssh`
- `setup_ssh_keys`
- `vsftpd_backdoor`

Run:

```bash
python3 backend/scripts/compile_ide_to_intermediate.py \
  backend/examples/vulnerable-hosts.ide.json \
  --out backend/generated/vulnerable-hosts.intermediate.json
```
