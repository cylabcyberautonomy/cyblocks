from typing import Any

# Backend port of Frontend/src/App.jsx compileToDocker(). Turns the FLAT env the IDE exports
# (hosts[], subnets[], routers[] as top-level arrays + connections[]) into the nested DSL
# (networks[].subnets[].hosts[], routers[].networks[], ...) that IDE_compile_to_DockerFiles reads.
#
# Self-contained: no `common` import, so it also runs standalone as
#     python3 backend/scripts/dsl/compile_to_dsl.py <flat-env.json>


def compile_to_dsl(env: dict[str, Any]) -> dict[str, Any]:
    connections = env.get("connections", [])

    # Step 1: which subnet does a host attach to? Resolve from the Host<->Subnet edge
    #   (either direction).
    def subnet_of_host(host_name: str) -> str | None:
        for c in connections:
            if c["fromType"] == "Host" and c["from"] == host_name and c["toType"] == "Subnet":
                return c["to"]
            if c["toType"] == "Host" and c["to"] == host_name and c["fromType"] == "Subnet":
                return c["from"]
        return None

    # Step 2: assign each host into its subnet and give it an IP (.10, .11, ... per subnet).
    subnets_by_name = {s["name"]: s for s in env.get("subnets", [])}
    hosts_by_subnet: dict[str, list[dict[str, Any]]] = {s["name"]: [] for s in env.get("subnets", [])}
    subnet_counts: dict[str, int] = {}
    for h in env.get("hosts", []):
        subnet = subnets_by_name.get(subnet_of_host(h["name"]))
        if not subnet or not subnet.get("cidr"):
            continue
        octets = subnet["cidr"].split("/")[0].split(".")
        n = subnet_counts.get(subnet["name"], 0)
        octets[3] = str(10 + n)                      # .10, .11, .12, ...
        subnet_counts[subnet["name"]] = n + 1
        hosts_by_subnet[subnet["name"]].append({
            "name": h["name"],
            "image": h.get("image"),
            "ip": ".".join(octets),
            "ram": h.get("ram"),
            "disk": h.get("disk"),
        })

    # Step 3: nest the hosts under their subnets.
    subnets = [
        {"name": s["name"], "cidr": s.get("cidr"), "hosts": hosts_by_subnet.get(s["name"], [])}
        for s in env.get("subnets", [])
    ]

    # Step 4: which subnets does a router touch? (Router<->Subnet edges, either direction.)
    def networks_of_router(router_name: str) -> list[str]:
        result = []
        for c in connections:
            if c["fromType"] == "Router" and c["from"] == router_name and c["toType"] == "Subnet":
                result.append(c["to"])
            if c["toType"] == "Router" and c["to"] == router_name and c["fromType"] == "Subnet":
                result.append(c["from"])
        return result

    routers = [
        {"name": r["name"], "image": r.get("image"), "networks": networks_of_router(r["name"])}
        for r in env.get("routers", [])
    ]

    # Step 5: subnet_connections from Router<->Subnet edges.
    subnet_connections = []
    for c in connections:
        rs = c["fromType"] == "Router" and c["toType"] == "Subnet"
        sr = c["fromType"] == "Subnet" and c["toType"] == "Router"
        if rs or sr:
            subnet_connections.append({
                "router": c["from"] if rs else c["to"],
                "from_subnet": c["to"] if rs else c["from"],
                "to_subnet": None,
                "bidirectional": True,
            })

    # Step 6: the remaining connections (drop the topology edges captured above).
    other_connections = []
    for c in connections:
        topo_pair = c["fromType"] in ("Subnet", "Router") and c["toType"] in ("Subnet", "Router")
        host_subnet = (c["fromType"] == "Host" and c["toType"] == "Subnet") or \
                      (c["fromType"] == "Subnet" and c["toType"] == "Host")
        if topo_pair or host_subnet:
            continue
        other_connections.append({
            "from": c["from"], "to": c["to"],
            "fromType": c["fromType"], "toType": c["toType"],
            "label": c.get("kind"),
        })

    # Step 7: assemble the DSL (the nested "<name>-docker.json" shape).
    return {
        "name": env["name"],
        "networks": [{"name": env["name"], "subnets": subnets}],
        "subnet_connections": subnet_connections,
        # a Service block's name IS its package; mirror it into "type" like the frontend did.
        "services": [{**s, "type": s.get("name")} for s in env.get("services", [])],
        "vulnerabilities": env.get("vulnerabilities", []),
        "misconfigurations": env.get("misconfigurations", []),
        "routers": routers,
        "users": env.get("users", []),
        "files": env.get("files", []),
        "connections": other_connections,
    }


def to_dsl(env: dict[str, Any]) -> dict[str, Any]:
    # Convenience entry: pass through if the input is ALREADY the nested DSL (has "networks"),
    # else treat it as the flat IDE export and compile it. Lets the backend accept either shape.
    if "networks" in env:
        return env
    return compile_to_dsl(env)


if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) < 2:
        raise SystemExit("usage: python3 compile_to_dsl.py <flat-env.json>  (prints the DSL)")
    with open(sys.argv[1]) as f:
        flat_env = json.load(f)
    print(json.dumps(to_dsl(flat_env), indent=2))
