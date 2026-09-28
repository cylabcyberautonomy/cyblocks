import ipaddress, sys
from typing import Any

from backend import common
from .types import Env


def build_networks(env: Env) -> list[dict[str, Any]]:
    # Returns one {"key","cidr","gateway"} per subnet for build_compose's networks block.
    #
    # GATEWAY: this is the Docker BRIDGE address (host-side veth), NOT a container -- it can't
    # be the router. So it stays the first usable host: str(ipaddress.ip_network(cidr)[1]).
    # To make the router the gateway for OTHER subnets only (the east-west chokepoint), do it
    # at RUNTIME, not here: inside each host the deploy/entrypoint step runs
    #     ip route add <other-subnet-cidr> via <router-ip-on-this-subnet>   (needs NET_ADMIN)
    # while the DEFAULT route stays on the bridge so internet egress/NAT keeps working. That
    # runtime route override is the routing milestone; this field is unaffected by it.
    #
    # TODO:
    #   1. Key each network by common.network_name_from_ide_dict(env, subnet["name"]) (NOT the
    #      raw name) so it cross-references what hosts/routers attach to. <-- currently "name".
    #   2. gateway = str(ipaddress.ip_network(cidr)[1])  (first usable host = the bridge).
    #   3. Guard a missing cidr: skip + warn to stderr instead of KeyError. <-- still missing.
    networks = []
    for network in env["networks"]:
        for subnet in network["subnets"]:
            cidr = subnet.get("cidr")
            if not cidr:
                print(f"warning: subnet {subnet.get('name')} has no cidr, skipping", file=sys.stderr)
                continue

            name = subnet["name"]
            gateway = str(ipaddress.ip_network(cidr, strict=False)[1])

            networks.append({
                "key": common.network_name_from_ide_dict(env, name),   # was "name": name
                "cidr": cidr,
                "gateway": gateway,
            })

    return networks
