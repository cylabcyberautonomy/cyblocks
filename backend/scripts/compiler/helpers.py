import ipaddress

from compiler.types import Env

# module helpers for routing
def reserved_router_ip(cidr: str) -> str:
    # The router's pinned address on a subnet: LAST usable host (avoids Docker's .1 bridge).
    return str(ipaddress.ip_network(cidr, strict=False)[-2])

def subnet_cidr_map(env: Env) -> dict[str, str]:
    # subnet name -> cidr, for every subnet that has one.
    return {s["name"]: s["cidr"] for net in env["networks"] for s in net["subnets"] if s.get("cidr")}

def subnet_is_routed(env: Env, subnet_name: str) -> bool:
    # True if some router bridges this subnet -> its hosts need routes + NET_ADMIN.
    return any(subnet_name in r.get("networks", []) for r in env.get("routers", []))
