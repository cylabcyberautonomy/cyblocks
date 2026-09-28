from typing import Any

from .types import Env
from .helpers import host_container_name, router_ip_on_subnet, subnet_cidr_map


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
    # PER-DESTINATION routing (replaces the old single-default scheme). For a host on subnet S, for
    # every OTHER subnet T, if a router bridges BOTH S and T, add a route to T's cidr via that
    # router's pinned IP on S. This:
    #   - supports MULTI-ROUTER chains (A--r1--B--r2--C): a host on B gets A via r1 AND C via r2.
    #   - enables PIVOTING ("B as proxy") without inter-router routing -- A reaches B, B reaches C,
    #     and an attacker hops through a B host to get from A to C. (A->C is intentionally NOT direct:
    #     no single router bridges A and C, so there's no route -- the pivot is required.)
    #   - keeps each host's DEFAULT route on the Docker bridge (.1) for internet egress, so no router
    #     NAT is required for off-range traffic (unlike the old catch-all default).
    # `to` is a cidr here, so apply_routes runs `ip route replace <cidr> via <via>`.
    cidr_by_subnet = subnet_cidr_map(env)
    routes: list[dict[str, Any]] = []

    for net in env["networks"]:
        for subnet in net["subnets"]:
            S = subnet["name"]
            if S not in cidr_by_subnet:
                continue
            for host in subnet.get("hosts", []):
                container = host_container_name(env, host)   # uniquified, matches the compose container_name
                for T, t_cidr in cidr_by_subnet.items():
                    if T == S:
                        continue
                    # a router that bridges BOTH the host's subnet and the destination subnet.
                    router = next(
                        (r for r in env.get("routers", [])
                         if S in r.get("networks", []) and T in r.get("networks", [])),
                        None,
                    )
                    if router is None:
                        continue   # no direct router S<->T (e.g. A<->C) -> reach it by pivoting
                    via = router_ip_on_subnet(env, cidr_by_subnet[S], router["name"], S)
                    routes.append({"host": container, "via": via, "to": t_cidr})

    return routes
