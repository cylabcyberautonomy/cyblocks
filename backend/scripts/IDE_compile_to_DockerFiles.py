import ipaddress, shutil, sys
from collections import defaultdict
import yaml
import common
from pathlib import Path
from typing import Any, Literal, TypedDict


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

# ---------------------------------------------------------------------------
# env type: the JSON the IDE exports (Frontend/src/App.jsx exportEnv()).
# ---------------------------------------------------------------------------
class Host(TypedDict):
    name: str
    image: str
    ip: str
    ram: str
    disk: str

class Subnet(TypedDict):
    name: str
    cidr: str
    hosts: list[Host]

class Network(TypedDict):
    name: str
    subnets: list[Subnet]

class SubnetConnection(TypedDict):
    router: str
    from_subnet: str
    to_subnet: str | None
    bidirectional: bool

# Services share one array but carry per-kind fields, hence total=False.
class Service(TypedDict, total=False):
    name: str
    type: str
    protocol: str
    port: str
    version: str
    privilege_level: str  # type == "user"
    password: str         # type == "user"
    path: str             # type == "file"
    sensitivity: str      # type == "file"

class Vulnerability(TypedDict):
    name: str
    type: str
    cve: str
    description: str
    severity: str

class Misconfiguration(TypedDict):
    name: str
    description: str

class Router(TypedDict):
    name: str
    image: str
    networks: list[str]   # subnet names this router attaches to

# 'from' is a reserved word, so the functional TypedDict form is required.
Connection = TypedDict("Connection", {
    "from": str,
    "to": str,
    "fromType": str,
    "toType": str,
    "label": str,
})

class Env(TypedDict):
    name: str
    networks: list[Network]
    subnet_connections: list[SubnetConnection]
    services: list[Service]
    vulnerabilities: list[Vulnerability]
    misconfigurations: list[Misconfiguration]
    routers: list[Router]
    users: list[Any]
    files: list[Any]
    connections: list[Connection]

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Shema types for payloads and plans

class Payloads(TypedDict):
    services: list[Service]
    vulnerabilities: list[Vulnerability]
    misconfigurations: list[Misconfiguration]

class Plan(TypedDict):
    slug: str
    type: Literal["host", "router"]
    image: str
    payloads: Payloads
    router: Router | None

# ---------------------------------------------------------------------------

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


# 
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

def build_host_service(env: Env, host: Host, subnet: Subnet, payloads_for_host: Payloads) -> tuple[str, dict[str, Any]]:
    # Returns (slug, service_dict). Runs LAST (after routers + networks): the host's
    # ipv4_address must not collide with the address the router reserved on this subnet.
    # Payloads do NOT go in the compose dict -- they travel via the dockerfile plan.

    # Step 1: identity. slug = the compose service key + dockerfiles/<slug> folder name.
    #   slug         = common.slugify(host["name"])
    #   net_key      = common.network_name_from_ide_dict(env, subnet["name"])
    #   has_payload  = any payload bucket is non-empty
    slug = common.slugify(host["name"])
    net_key = common.network_name_from_ide_dict(env, subnet["name"])
    has_payload = any(payloads_for_host[k] for k in ("services", "vulnerabilities", "misconfigurations"))

    # Step 2: network attach. Pin the IP only if present (null ipv4_address is rejected).
    #   net_attach = {"ipv4_address": host["ip"]} if host.get("ip") else {}
    net_attach: dict[str, Any] = {"ipv4_address": host["ip"]} if host.get("ip") else {}

    # Step 3: base dict -- the keys every host always has.
    service_dict: dict[str, Any] = {
        "container_name": common.container_name_from_ide_dict(env, host["name"]),            # common.container_name_from_ide_dict(env, host["name"])
        "networks": {net_key: net_attach},
    }

    if subnet_is_routed(env, subnet["name"]):
        service_dict["cap_add"] = ["NET_ADMIN"]   # needed to run `ip route` in the host's namespace

    # iproute2 THREAD: capture whether this host is routed (reuse the check above). A routed host
    #   needs the `ip` binary, so it must BUILD (get a Dockerfile) even with NO payload.
    #   routed = subnet_is_routed(env, subnet["name"])
    routed = subnet_is_routed(env, subnet["name"])

    # Step 4: HYBRID image-vs-build (exactly one). Payload OR routed -> build context, else image.
    #   CHANGE the condition to `if has_payload or routed:` so routed-but-payloadless hosts also
    #   get a Dockerfile (to install iproute2). It currently checks has_payload only.
    #   if has_payload or routed: service_dict["build"] = f"./dockerfiles/{slug}"
    #   else:                     service_dict["image"] = host["image"]
    ...
    if has_payload or routed:
        service_dict["build"] = f"./dockerfiles/{slug}"
    else:
        service_dict["image"] = host["image"]

    # Step 5: optional keys -- add only when the source value exists (omit, don't write null).
    #   if host.get("ram"):  service_dict["mem_limit"] = host["ram"]
    ...
    if host.get("ram"):  
        service_dict["mem_limit"] = host["ram"]

    # Step 6: ports. One "<p>:<p>" per bound service that declares a port; omit key if none.
    #   ports = [f"{s['port']}:{s['port']}" for s in payloads_for_host["services"] if s.get("port")]
    #   if ports: service_dict["ports"] = ports
    ...
    ports = [f"{s['port']}:{s['port']}" for s in payloads_for_host["services"] if s.get("port")]
    if ports: 
        service_dict["ports"] = ports

    return slug, service_dict

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
            # Step 2: the default-gateway for hosts on THIS subnet = the router's reserved IP on
            #   it (same L2 as those hosts, so they can ARP it). MUST match build_router_service.
            #   via = reserved_router_ip(cidr_by_subnet[subnet_name])
            via = reserved_router_ip(cidr_by_subnet[subnet_name])

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
            ...

    return routes


def build_router_service(env: Env, router: Router) -> tuple[str, dict[str, Any]]:
    # Returns (slug, service_dict). Runs FIRST (before networks + hosts) so the router can
    # RESERVE a fixed address on each subnet it attaches to. That reserved IP is the router's
    # PINNED ipv4_address; at the routing milestone it becomes the next-hop hosts route through
    # (`ip route add <other-subnet> via <router-ip>`). It is NOT the compose ipam gateway --
    # that stays the Docker bridge (.1). The reservation just has to be deterministic and not
    # collide with a host, so use a convention like the LAST usable host (avoids the .1 bridge).
    # Plain image: service for now -- compose `sysctls` already enables ip_forward; no build
    # context until cross-subnet routing lands. Payloads do NOT belong in the compose dict.

    # Step 1: identity.
    #   slug           = common.slugify(router["name"])
    #   container_name = common.container_name_from_ide_dict(env, router["name"])
    slug = common.slugify(router["name"])
    container_name = common.container_name_from_ide_dict(env, router["name"])

    # Step 2: subnet-name -> cidr lookup. Needed to derive a reserved IP per subnet (the Router
    # type carries no cidr/IP of its own). Walk env["networks"][*]["subnets"], skip cidr-less.
    #   cidr_by_subnet = {s["name"]: s["cidr"]
    #                     for net in env["networks"] for s in net["subnets"] if s.get("cidr")}
    cidr_by_subnet: dict[str, str] = subnet_cidr_map(env)

    # Step 3: attach + reserve. For each subnet name in router["networks"]:
    #   - skip + warn if name not in cidr_by_subnet (router points at an unknown subnet).
    #   - net_key  = common.network_name_from_ide_dict(env, name)
    #   - reserved = str(ipaddress.ip_network(cidr_by_subnet[name], strict=False)[-2])  # last usable
    #   - networks[net_key] = {"ipv4_address": reserved}
    networks: dict[str, Any] = {}
    for name in router.get("networks", []):
        net_key  = common.network_name_from_ide_dict(env, name)
        reserved = reserved_router_ip(cidr_by_subnet[name])
        networks[net_key] = {"ipv4_address": reserved}

    # Step 4: assemble. Exactly the compose runtime keys -- NO services/vulns/misconfigs.
    router_dict: dict[str, Any] = {
        "container_name": container_name,
        "build": f"./dockerfiles/{slug}",   # needs a Dockerfile to set sysctl net.ipv4.ip_forward=1 (can't do in compose)
        "cap_add": ["NET_ADMIN"],
        "sysctls": {"net.ipv4.ip_forward": "1"},
        "networks": networks,
    }

    return slug, router_dict

def build_compose(env: Env) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    # Order: payloads -> routers -> networks -> hosts (see header note for why).
    # Assumes build_networks returns {"key","cidr","gateway"} and build_host_service /
    # build_router_service return (slug, service_dict) per their TODOs.
    #   - top-level "name" namespaces the project (no obsolete "version" key).
    #   - only append a PLAN item for hosts that actually have a payload (stock image: hosts
    #     need no Dockerfile). Plan item shape:
    #       {"slug": slug, "type": "host", "image": host["image"], "payloads": p}
    #   - routers get NO plan item now (no build context per the decision above).
    payloads = bind_payloads(env)
    compose_dict: dict[str, Any] = {
        "name": f"cyblocks_{common.project_name_from_ide_dict(env)}",
        "networks": {},
        "services": {},
    }
    dockerfile_list: list[dict[str, Any]] = []
    dockerfile_list.append({"slug": slug, "type": "router", "image": router["image"]})

    # 1) Routers first (reserve their per-subnet addresses; plain image services for now).
    for router in env.get("routers", []):
        slug, router_dict = build_router_service(env, router)
        compose_dict["services"][slug] = router_dict

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
                compose_dict["services"][slug] = service_dict
                # iproute2 THREAD: also emit a plan item for ROUTED hosts (they need a Dockerfile
                #   to install iproute2 even with no payload), and TAG every item with "routed" so
                #   render_host_docker knows whether to add the iproute2 install line.
                #   CHANGE condition -> if any(...) or subnet_is_routed(env, subnet["name"]):
                #   CHANGE item      -> add "routed": subnet_is_routed(env, subnet["name"])
                if any(p[k] for k in ("services", "vulnerabilities", "misconfigurations")) or subnet_is_routed(env, subnet["name"]):
                    dockerfile_list.append({"slug": slug, "type": "host", "image": host["image"], "payloads": p, "routed": subnet_is_routed(env, subnet["name"])})

    return compose_dict, dockerfile_list

def render_router_docker(image: str) -> str:
    # FROM <image>
    # RUN (apt-get update && apt-get install -y iptables) || (apk add --no-cache iptables) || (yum install -y iptables)
    # COPY entrypoint.sh /entrypoint.sh
    # RUN chmod +x /entrypoint.sh
    # ENTRYPOINT ["/entrypoint.sh"]
    dockerfile = f"FROM {image}\n"
    dockerfile += "RUN (apt-get update && apt-get install -y iptables) \\\n"
    dockerfile += " || (apk add --no-cache iptables) \\\n"
    dockerfile += " || (yum install -y iptables)\n"
    dockerfile += "COPY entrypoint.sh /entrypoint.sh\n"
    dockerfile += "RUN chmod +x /entrypoint.sh\n"
    dockerfile += "ENTRYPOINT [\"/entrypoint.sh\"]\n"
    return dockerfile

def render_router_entrypoint() -> str:
    # #!/bin/sh
    # sysctl -w net.ipv4.ip_forward=1
    # iptables -t nat -A POSTROUTING -j MASQUERADE
    # exec "$@"
    entrypoint = "#!/bin/sh\n"
    entrypoint += "sysctl -w net.ipv4.ip_forward=1\n"
    entrypoint += "iptables -t nat -A POSTROUTING -j MASQUERADE\n"
    entrypoint += "exec \"$@\"\n"
    return entrypoint


def render_host_docker(image: str, payloads_for_host: Payloads, routed: bool = False) -> str:
    # Returns the Dockerfile text for one host (called for hosts WITH payloads OR routed hosts).
    # service["name"] IS the package name; vulns/misconfigs become marker files. Values are
    # interpolated raw -- shell-injection hardening intentionally skipped for now.
    # iproute2 THREAD: add a `routed: bool = False` param to the signature so write_artifact can
    #   tell this renderer whether to install the `ip` tool (see Step 4b below).

    # Step 1: base image. Every line below appends to this string.
    dockerfile = f"FROM {image}\n"

    # Step 2: services -> install layers (portable across debian/alpine/rhel), then EXPOSE.
    for service in payloads_for_host["services"]:
        pkg = service["name"]   # the PACKAGE name -- NOT the whole service dict
        dockerfile += f"RUN (apt-get update && apt-get install -y {pkg}) \\\n"
        dockerfile += f" || (apk add --no-cache {pkg}) \\\n"
        dockerfile += f" || (yum install -y {pkg})\n"
        # EXPOSE only when the service declares a port.
        if service.get("port"):
            dockerfile += f"EXPOSE {service['port']}\n"

    # Step 3: vulnerabilities -> marker file under /etc/cyblocks (cve if present, else name).
    for vuln in payloads_for_host["vulnerabilities"]:
        tag = vuln.get("cve") or vuln["name"]
        dockerfile += f"RUN mkdir -p /etc/cyblocks && echo '{tag}' >> /etc/cyblocks/vulnerabilities\n"

    # Step 4: misconfigurations -> marker file (description if present, else name).
    for misc in payloads_for_host["misconfigurations"]:
        tag = misc.get("description") or misc["name"]
        dockerfile += f"RUN mkdir -p /etc/cyblocks && echo '{tag}' >> /etc/cyblocks/misconfigurations\n"

    # Step 4b (iproute2 THREAD): when `routed`, install the `ip` binary so deploy's apply_routes
    #   can run `docker exec ... ip route replace`. Append the SAME portable install you use for
    #   services, with package "iproute2":
    #     if routed:
    #         dockerfile += "RUN (apt-get update && apt-get install -y iproute2) \\\n"
    #         dockerfile += " || (apk add --no-cache iproute2) \\\n"
    #         dockerfile += " || (yum install -y iproute2)\n"
    #   (Optional: factor the apt||apk||yum triple into a helper portable_install(pkg) -- it's now
    #    used for both services and iproute2.)
    if routed:
        dockerfile += "RUN (apt-get update && apt-get install -y iproute2) \\\n"
        dockerfile += " || (apk add --no-cache iproute2) \\\n"
        dockerfile += " || (yum install -y iproute2)\n"

    # Step 5: done -- one string, already newline-terminated per line.
    return dockerfile

def write_artifact(env: Env) -> Path:
    # TODO: rewrite. The old REPO_ROOT/"output" path is gone (REPO_ROOT no longer defined).
    #   - project = common.project_name_from_ide_dict(env); build = common.build_dir(project).
    #   - clean rebuild: if build.exists(): shutil.rmtree(build); then build.mkdir(parents=True).
    #     WIPE ONLY build/, never runs/<project>/ (deploy writes log/state there later).
    #   - write build/"docker-compose.yaml" with yaml.safe_dump(compose_dict, sort_keys=False).
    #   - for each plan item: node_dir = build/"dockerfiles"/item["slug"]; node_dir.mkdir(parents=True);
    #     if host -> write node_dir/"Dockerfile" = render_host_docker(item["image"], item["payloads"]).
    #   - return build.
    compose_dict, dockerfile_list = build_compose(env)
    project = common.project_name_from_ide_dict(env); 
    build = common.build_dir(project)
    if build.exists():
        shutil.rmtree(build)
    build.mkdir(parents=True)

    (build / "docker-compose.yaml").write_text(yaml.safe_dump(compose_dict, sort_keys=False))
    # build routes for router-bridged subnets
    common.write_json(build / "routes.json", {"routes": build_routes(env)})

    for item in dockerfile_list:
        node_dir = build / "dockerfiles" / item["slug"]
        node_dir.mkdir(parents=True, exist_ok=True)
        if item["type"] == "host":
            # iproute2 THREAD: pass the routed flag so the renderer installs iproute2 when needed.
            #   CHANGE -> render_host_docker(item["image"], item["payloads"], item["routed"])
            (node_dir / "Dockerfile").write_text(render_host_docker(item["image"], item["payloads"], item["routed"]))
        elif item["type"] == "router":
            (node_dir / "entrypoint.sh").write_text(render_router_entrypoint())
            (node_dir / "Dockerfile").write_text(render_router_docker(item["image"]))


    
    return build

def run_compile(env_path: str | None = None):
    # TODO: load the env JSON (arg path or a default), compile, print the build dir.
    #   path = Path(env_path) if env_path else (common.DEFAULT_RUNS_DIR / "env.json")
    #   build = write_artifact(common.load_json(path)); print(build)
    path = Path(env_path) if env_path else (common.DEFAULT_RUNS_DIR / "env.json")
    build = write_artifact(common.load_json(path)); 
    
    print(build)

    return

if __name__ == "__main__":
    run_compile(sys.argv[1] if len(sys.argv) > 1 else None)
