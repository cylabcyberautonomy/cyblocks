import ipaddress

from compiler.types import Env

# module helpers for routing
def reserved_router_ip(cidr: str, index: int = 0) -> str:
    # The router's pinned address on a subnet: counts DOWN from the LAST usable host (avoids Docker's
    # .1 bridge). `index` offsets so MULTIPLE routers on the SAME subnet get distinct IPs --
    # index 0 -> .254, index 1 -> .253, ... (two routers sharing a subnet otherwise both grab .254
    # and Docker rejects the duplicate ipv4_address with "Address already in use").
    return str(ipaddress.ip_network(cidr, strict=False)[-2 - index])


def routers_on_subnet(env: Env, subnet_name: str) -> list[str]:
    # Names of the routers bridging this subnet, in env order (deterministic -> stable IP assignment).
    return [r["name"] for r in env.get("routers", []) if subnet_name in r.get("networks", [])]


def router_ip_on_subnet(env: Env, cidr: str, router_name: str, subnet_name: str) -> str:
    # The distinct, deterministic pinned IP for THIS router on THIS subnet. Both build_router_service
    # (pinning) and build_routes (the host's `via`) call this so they never diverge.
    index = routers_on_subnet(env, subnet_name).index(router_name)
    return reserved_router_ip(cidr, index)

def subnet_cidr_map(env: Env) -> dict[str, str]:
    # subnet name -> cidr, for every subnet that has one.
    return {s["name"]: s["cidr"] for net in env["networks"] for s in net["subnets"] if s.get("cidr")}

def subnet_is_routed(env: Env, subnet_name: str) -> bool:
    # True if some router bridges this subnet -> its hosts need routes + NET_ADMIN.
    return any(subnet_name in r.get("networks", []) for r in env.get("routers", []))
