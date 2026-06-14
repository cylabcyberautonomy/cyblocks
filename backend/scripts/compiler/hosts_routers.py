from typing import Any

import common
from compiler.types import Env, Host, Payloads, Router, Subnet
from compiler.helpers import router_ip_on_subnet, subnet_cidr_map, subnet_is_routed


# Bare OS base images have no long-running process -- a container from them exits immediately, so
# the host vanishes (and routing can't `docker exec` into it). These get a keep-alive command.
# Daemon images (nginx, tomcat, mysql, redis, httpd, ...) stay up on their own, so we leave their
# CMD intact -- overriding it would stop the very service we want running.
_BARE_OS_IMAGES = (
    "ubuntu", "debian", "alpine", "busybox", "fedora", "centos",
    "rockylinux", "almalinux", "oraclelinux", "amazonlinux", "archlinux",
)


def _needs_keepalive(image: str) -> bool:
    base = (image or "").split("/")[-1].split(":")[0].lower()
    return base in _BARE_OS_IMAGES


def _service_start_cmds(payloads_for_host: Payloads) -> list[str]:
    # Installed packages don't run themselves -- a bare-OS host with openssh-server installed has no
    # sshd listening until something starts it. Map the host's bound services/vulns to start commands
    # so the vuln is actually LIVE (exploitable), not just present on disk. Best-effort (|| true) so
    # a missing tool never crashes container start.
    names = {s.get("name", "") for s in payloads_for_host["services"]}
    names |= {v.get("name", "") for v in payloads_for_host["vulnerabilities"]}
    cmds: list[str] = []
    if names & {"openssh-server", "ssh", "weak-ssh-credentials"}:
        cmds.append("ssh-keygen -A >/dev/null 2>&1 || true")          # generate host keys (first boot)
        cmds.append("mkdir -p /run/sshd >/dev/null 2>&1 || true")     # sshd needs this dir
        cmds.append("(/usr/sbin/sshd 2>/dev/null || service ssh start >/dev/null 2>&1) || true")
    if names & {"apache2", "apache", "httpd"}:
        cmds.append("(service apache2 start 2>/dev/null || apache2ctl start 2>/dev/null) || true")
    return cmds


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
        "container_name": common.container_name_from_ide_dict(env, host["name"]),
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
    if has_payload or routed:
        service_dict["build"] = f"./dockerfiles/{slug}"
    else:
        service_dict["image"] = host["image"]

    # Step 5: optional keys -- add only when the source value exists (omit, don't write null).
    #   if host.get("ram"):  service_dict["mem_limit"] = host["ram"]
    if host.get("ram"):
        service_dict["mem_limit"] = host["ram"]

    # Step 5b: command for BARE-OS images only (daemon images like tomcat/nginx keep their own CMD
    #   so their service keeps serving). If the host has startable services, start them then keep the
    #   container alive; otherwise just keep-alive. tail -f /dev/null is portable across debian/alpine.
    if _needs_keepalive(host["image"]):
        start_cmds = _service_start_cmds(payloads_for_host)
        if start_cmds:
            script = "; ".join(start_cmds) + "; exec tail -f /dev/null"
            service_dict["command"] = ["/bin/sh", "-c", script]
        else:
            service_dict["command"] = ["tail", "-f", "/dev/null"]

    # Step 6: EXPOSE service ports to the range's internal networks ONLY -- do NOT publish to the
    #   host. Publishing ("<p>:<p>") binds the host port, which (a) collides when the host already
    #   uses it (e.g. sshd on 22 -> "address already in use") or when two containers share a port,
    #   and (b) exposes intentionally-vulnerable services on the host's interface -- wrong for an
    #   isolated cyber-range. Containers on the same docker network already reach each other directly;
    #   `expose` just documents the ports. (To poke a service from the host instead, publish an
    #   EPHEMERAL port -- use ["<p>"] not ["<p>:<p>"] -- so docker picks a free host port.)
    exposed = [str(s["port"]) for s in payloads_for_host["services"] if s.get("port")]
    if exposed:
        service_dict["expose"] = exposed

    return slug, service_dict


def build_router_service(env: Env, router: Router) -> tuple[str, dict[str, Any]]:
    # Returns (slug, service_dict). Runs FIRST (before networks + hosts) so the router can
    # RESERVE a fixed address on each subnet it attaches to. That reserved IP is the router's
    # PINNED ipv4_address; at the routing milestone it becomes the next-hop hosts route through
    # (`ip route add <other-subnet> via <router-ip>`). It is NOT the compose ipam gateway --
    # that stays the Docker bridge (.1). The reservation just has to be deterministic and not
    # collide with a host, so use a convention like the LAST usable host (avoids the .1 bridge).
    # Uses a build context: the entrypoint enables ip_forward + the MASQUERADE NAT rule at runtime.

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
        net_key = common.network_name_from_ide_dict(env, name)
        # distinct IP per router on a shared subnet (multiple routers otherwise both grab .254).
        reserved = router_ip_on_subnet(env, cidr_by_subnet[name], router["name"], name)
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
