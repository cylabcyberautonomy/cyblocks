from typing import Any

import common
from compiler.types import Env
from compiler.helpers import router_ip_on_subnet, subnet_cidr_map


def build_routes(env: Env) -> list[dict[str, Any]]:
    # MODEL: default-gateway routing -- a host tries its own subnet first, else falls to the router.
    #
    # WHY each branch:
    #   - SAME-subnet destination: Docker installs a "connected" route for the host's own subnet,
    #     and L2 ARP resolves the peer directly on the shared bridge. The host "finds" it with no
    #     help from us -> emit NO row for same-subnet traffic.
    #   - OFF-subnet destination: nothing matches, so the kernel uses the DEFAULT route. We point
    #     that default at the router's pinned IP on the host's OWN subnet. The router has
    #     ip_forward=1 and an interface on every subnet it bridges, so it forwards the packet out
    #     the right interface and ARPs the target there. ("the router broadcasts" = this forwarding.)
    #
    # OUTPUT: exactly ONE catch-all row per host (not one per destination subnet):
    #   {"host": <docker container name>, "via": <router IP on the host's subnet>, "to": "default"}
    #
    # CONSISTENCY (must hold): `via` MUST equal the address build_router_service pinned for this
    #   router on this subnet -- both come from reserved_router_ip(cidr) (last usable host). If
    #   they ever diverge, the host points its default at an IP the router doesn't hold and routing
    #   silently dies. Always derive `via` from reserved_router_ip, never hardcode.
    #
    # EGRESS CAVEAT (decision to make): a real `default` route captures ALL non-local traffic,
    #   including internet-bound. The router must then MASQUERADE/NAT for outbound or hosts lose
    #   internet. Alternative that keeps Docker's egress on the bridge: set `to` to each OTHER
    #   bridged-subnet cidr (the per-destination variant) instead of "default".
    #
    # MULTI-ROUTER EDGE: if two routers both bridge a host's subnet, emitting a default row per
    #   router gives that host TWO conflicting defaults. Pick a tie-break (e.g. first router wins)
    #   and DEDUP per container so each host gets at most one "default" row (use the `seen` set).
    #
    # DEPLOY CONTRACT: apply_routes sees to == "default" and runs
    #   `ip route replace default via <via>` inside the host (vs `... <to> via <via>` for cidrs).
    cidr_by_subnet = subnet_cidr_map(env)
    routes: list[dict[str, Any]] = []
    seen: set[str] = set()   # container names already given a default route (multi-router dedup)

    for router in env.get("routers", []):
        # Step 1: the subnets this router actually bridges. Filter on cidr_by_subnet so a router
        #   that names an unknown / cidr-less subnet is skipped instead of raising KeyError later.
        #   bridged = [n for n in router["networks"] if n in cidr_by_subnet]
        bridged = [n for n in router["networks"] if n in cidr_by_subnet]

        for subnet_name in bridged:
            # Step 2: the default-gateway for hosts on THIS subnet = the router's pinned IP on it
            #   (same L2 as those hosts, so they can ARP it). Uses router_ip_on_subnet so it matches
            #   build_router_service exactly, even when several routers share the subnet (the seen
            #   dedup below means the FIRST router that bridges the subnet wins each host).
            via = router_ip_on_subnet(env, cidr_by_subnet[subnet_name], router["name"], subnet_name)

            # Step 3: locate the hosts ON subnet_name. Walk env["networks"][*]["subnets"], keep
            #   only the subnet whose name == subnet_name, then iterate its hosts.
            #   - host["ip"] is NOT required here -- a default route doesn't depend on the host's
            #     own address (it only needs a reachable gateway). Don't skip on missing ip.
            #   - container = common.container_name_from_ide_dict(env, host["name"]).
            #   - if container in seen: skip it (already has a default from an earlier router).
            for host in next(s["hosts"] for n in env["networks"] for s in n["subnets"] if s["name"] == subnet_name):
                container = common.container_name_from_ide_dict(env, host["name"])
                if container in seen:
                    continue
                # Step 4: emit one default row per host and record it:
                #   routes.append({"host": container, "via": via, "to": "default"})
                #   seen.add(container)
                routes.append({"host": container, "via": via, "to": "default"})
                seen.add(container)

    return routes
