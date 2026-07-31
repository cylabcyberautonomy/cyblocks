from collections import defaultdict
from typing import Any

from compiler.types import Connection, Env


def bind_payloads(env: Env) -> dict[str, dict[str, Any]]:
    services_by_name = {s["name"]: s for s in env["services"]}
    vulns_by_name = {v["name"]: v for v in env["vulnerabilities"]}
    misc_by_name = {m["name"]: m for m in env["misconfigurations"]}
    # Step A: lookup tables for the direct host binds (users/files milestone).
    users_by_name = {u["name"]: u for u in env["users"]}
    files_by_name = {f["name"]: f for f in env["files"]}
#gurad against empty and duplicate names 
    for kind in ("services", "vulnerabilities", "files", "users", "misconfigurations"):
        names = [x.get("name", "") for x in env.get(kind, [])]
        if "" in names:
            raise ValueError(f"{kind}: a block has an empty name -- every block needs a unique name to bind.")
        dupes = {n for n in names if names.count(n) > 1}
        if dupes:
            raise ValueError(f"{kind}: duplicate names {sorted(dupes)} -- names must be unique to bind.")

    payloads: dict[str, dict[str, Any]] = defaultdict(
        # Step B: users/files get their own buckets, alongside services/vulns/misconfigs.
        lambda: {"services": [], "vulnerabilities": [], "misconfigurations": [], "users": [], "files": []}
    )

    # A connection's endpoints are node names; the user may draw the edge in
    # either direction, so resolve each end by its type rather than from/to.
    def endpoints(c: Connection, payload_type: str, host_type: str):
        if c["fromType"] == payload_type and c["toType"] == host_type:
            return c["from"], c["to"]
        if c["fromType"] == host_type and c["toType"] == payload_type:
            return c["to"], c["from"]
        return None, None

    # Service -> Host (label "service").
    service_host: dict[str, str] = {}
    for c in env["connections"]:
        payload, host = endpoints(c, "Service", "Host")
        if host and payload in services_by_name:
            service_host[payload] = host
            payloads[host]["services"].append(services_by_name[payload])

    # Vulnerability / Misconfiguration -> Service -> owning Host.
    for c in env["connections"]:
        for ptype, bucket, table in (
            ("Vulnerability", "vulnerabilities", vulns_by_name),
            ("Misconfiguration", "misconfigurations", misc_by_name),
        ):
            payload, service = endpoints(c, ptype, "Service")
            if not service:
                continue
            host = service_host.get(service)
            if host and payload in table:
                payloads[host][bucket].append(table[payload])

    # ---------------------------------------------------------------------------
    # User -> Host and File -> Host bind DIRECTLY to the host (one hop, no Service in between,
    # unlike vulns/misconfigs above). render.py Steps 6/7 turn these buckets into useradd /
    # file-write lines, and build_compose emits a Dockerfile for hosts that have ONLY users/files.
    # ---------------------------------------------------------------------------
    # Step C: one loop reusing the existing endpoints() helper for the direct host bind.
    for c in env["connections"]:
        for ptype, bucket, table in (
            ("User", "users", users_by_name),
            ("File", "files", files_by_name),
        ):
            payload, host = endpoints(c, ptype, "Host")
            if host and payload in table:
                payloads[host][bucket].append(table[payload])

    return payloads
