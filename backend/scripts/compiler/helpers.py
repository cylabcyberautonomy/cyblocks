import hashlib
import ipaddress

import common
from compiler.types import Env


# ---------------------------------------------------------------------------
# Host identity (slug + container name)
# ---------------------------------------------------------------------------
# The slug is BOTH the compose service key and the dockerfiles/<slug> folder, and the container name
# is what routes.json / `docker exec` target. If two hosts share a name they'd slugify identically
# and silently clobber each other on `up` (only the last survives). Rather than forbid duplicate
# names, we auto-disambiguate: a name that is UNIQUE in the env keeps its friendly slug (app-server),
# but a name REUSED by another host gets a short, stable hash suffix (app-server-3f2a1c). The hash is
# seeded from the host's IP -- unique per host by construction -- so it is deterministic and every
# compile pass (compose key, dockerfile folder, routes) computes the exact same value independently.
def _host_name_counts(env: Env) -> dict[str, int]:
    counts: dict[str, int] = {}
    for net in env["networks"]:
        for subnet in net["subnets"]:
            for host in subnet.get("hosts", []):
                counts[host["name"]] = counts.get(host["name"], 0) + 1
    return counts


def host_slug(env: Env, host: dict) -> str:
    base = common.slugify(host["name"])
    if _host_name_counts(env).get(host["name"], 0) <= 1:
        return base                                   # unique name -> friendly slug, unchanged
    seed = str(host.get("ip") or host.get("name"))    # IP is unique per host -> stable disambiguator
    return f"{base}-{hashlib.sha1(seed.encode()).hexdigest()[:6]}"


def host_container_name(env: Env, host: dict) -> str:
    # The deterministic container name, sharing the same uniquification as host_slug so build_compose
    # (which pins container_name) and build_routes (which targets it) never diverge.
    return f"cyblocks_{common.project_name_from_ide_dict(env)}_{host_slug(env, host)}"


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
