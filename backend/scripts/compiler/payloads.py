from collections import defaultdict
from typing import Any

from compiler.types import Connection, Env


def bind_payloads(env: Env) -> dict[str, dict[str, Any]]:
    services_by_name = {s["name"]: s for s in env["services"]}
    vulns_by_name = {v["name"]: v for v in env["vulnerabilities"]}
    misc_by_name = {m["name"]: m for m in env["misconfigurations"]}

    payloads: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"services": [], "vulnerabilities": [], "misconfigurations": []}
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

    return payloads
