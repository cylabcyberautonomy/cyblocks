import sys
from pathlib import Path
from typing import Any

from backend import common
from .types import Env
from .networks import build_networks
from .payloads import bind_payloads
from .hosts_routers import build_host_service, build_router_service
from .routes import build_routes
from .helpers import subnet_is_routed
from .write import write_artifact
from .dsl import to_dsl


# Build order: payloads -> routers -> networks -> hosts.
# load env → project name
# bind_payloads()     → connections → {host: services/vulns/misc}  (hosts depend on this)
# build_routers()     → cap_add NET_ADMIN, sysctls, multi-net; reserve a pinned IP per subnet
# build_networks()    → ipam subnet+gateway per subnet (gateway may be the router's address)
# build_hosts()       → image: OR build:, mem_limit, pinned ipv4_address (avoid router IPs)
# emit dockerfiles    → hosts-with-payloads
# emit compose        → yaml.safe_dump
# NOTE: this order is build-time bookkeeping only -- docker compose resolves service/network
#       dependencies on `up` regardless of the order we emit them in. The reason to do routers
#       first is so they can claim a fixed address per subnet before hosts/gateways are chosen.


def build_compose(env: Env) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    # Order: payloads -> routers -> networks -> hosts (see header note for why).
    # Assumes build_networks returns {"key","cidr","gateway"} and build_host_service /
    # build_router_service return (slug, service_dict) per their TODOs.
    #   - top-level "name" namespaces the project (no obsolete "version" key).
    #   - only append a PLAN item for hosts that actually have a payload (stock image: hosts
    #     need no Dockerfile). Plan item shape:
    #       {"slug": slug, "type": "host", "image": host["image"], "payloads": p}
    #   - routers get a plan item too (build context for the NAT entrypoint).
    payloads = bind_payloads(env)
    compose_dict: dict[str, Any] = {
        "name": f"cyblocks_{common.project_name_from_ide_dict(env)}",
        "networks": {},
        "services": {},
    }
    dockerfile_list: list[dict[str, Any]] = []

    # 1) Routers first (reserve their per-subnet addresses; build context for the NAT entrypoint).
    for router in env.get("routers", []):
        slug, router_dict = build_router_service(env, router)
        compose_dict["services"][slug] = router_dict
        dockerfile_list.append({"slug": slug, "type": "router", "image": router["image"]})

    # 2) Networks (gateway may be a router-reserved address).
    for network in build_networks(env):
        compose_dict["networks"][network["key"]] = {
            "driver": "bridge",
            "ipam": {"config": [{"subnet": network["cidr"], "gateway": network["gateway"]}]},
        }

    # 3) Hosts last (nested networks -> subnets -> hosts; must avoid router IPs).
    for network in env["networks"]:
        for subnet in network["subnets"]:
            for host in subnet.get("hosts", []):
                p = payloads[host["name"]]
                slug, service_dict = build_host_service(env, host, subnet, p)
                # Duplicate host names are auto-disambiguated by host_slug (a stable hash suffix), so
                # they no longer clobber -- the bug that quietly dropped the real Tomcat foothold.
                # This backstop only fires if a slug STILL collides, i.e. two hosts share BOTH a name
                # AND an IP (or a host collides with a router slug) -- a genuinely degenerate env.
                if slug in compose_dict["services"]:
                    raise ValueError(
                        f"Service slug '{slug}' (host '{host['name']}') collides even after "
                        f"disambiguation -- two hosts likely share the same name AND IP, or a host "
                        f"and router share a name. Make them distinct."
                    )
                compose_dict["services"][slug] = service_dict
                # iproute2 THREAD: also emit a plan item for ROUTED hosts (they need a Dockerfile
                #   to install iproute2 even with no payload), and TAG every item with "routed" so
                #   render_host_docker knows whether to add the iproute2 install line.
                # users/files milestone: "users" and "files" are in the key tuple so a host that has
                #   ONLY a user or a file (no service/vuln) still gets a Dockerfile -- otherwise
                #   render Steps 6/7 would never run for it.
                if any(p[k] for k in ("services", "vulnerabilities", "misconfigurations", "users", "files")) or subnet_is_routed(env, subnet["name"]):
                    dockerfile_list.append({"slug": slug, "type": "host", "image": host["image"], "payloads": p, "routed": subnet_is_routed(env, subnet["name"])})

    return compose_dict, dockerfile_list


def run_compile(env_path: str | None = None):
    # Load the env JSON (arg path or a default), compile, print the build dir.
    #   path = Path(env_path) if env_path else (common.DEFAULT_RUNS_DIR / "env.json")
    # The orchestrator coordinates: load -> DSL -> build_compose + build_routes, then hand the
    # results to write_artifact (pure I/O). to_dsl() turns the FLAT IDE export into the nested
    # DSL (and passes through if the input is already a DSL).
    path = Path(env_path) if env_path else (common.DEFAULT_RUNS_DIR / "env.json")
    raw = common.load_json(path)
    dsl = to_dsl(raw)
    compose_dict, dockerfile_list = build_compose(dsl)
    routes = build_routes(dsl)
    build = write_artifact(dsl, compose_dict, dockerfile_list, routes)
    print(build)


if __name__ == "__main__":
    run_compile(sys.argv[1] if len(sys.argv) > 1 else None)
