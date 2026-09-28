import posixpath

from .types import Payloads
from backend.library import vulnerabilities


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
        # Best-effort install: a service may be a LOGICAL anchor rather than an apt package -- e.g.
        # a web app served by the base image (struts on a tomcat:* host) or a vuln that installs its
        # own software. Those have no package by that name, so we end the chain with `|| true` and
        # let the service act purely as an expose/vuln anchor instead of failing the whole build.
        # Trade-off: a typo in a REAL package name installs nothing silently -- check the marker
        # files / `docker logs` if a service you expected to install isn't running.
        dockerfile += f"RUN (apt-get update && apt-get install -y {pkg}) \\\n"
        dockerfile += f" || (apk add --no-cache {pkg}) \\\n"
        dockerfile += f" || (yum install -y {pkg}) \\\n"
        dockerfile += f" || true\n"
        # EXPOSE only when the service declares a port.
        if service.get("port"):
            dockerfile += f"EXPOSE {service['port']}\n"

    # Step 3: vulnerabilities -> query the library for the real recipe (Dockerfile lines that stand
    #   up the vuln + a marker file). Unknown names fall back to a marker file only (see
    #   vulnerability_library.render_for_host), so an unrecognized vuln never breaks the build.
    for vuln in payloads_for_host["vulnerabilities"]:
        for line in vulnerabilities.render_for_host(vuln):
            dockerfile += line + "\n"

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

    # Step 6 (users/files milestone): realize accounts from payloads_for_host["users"].
    #   For each user {name, password, privilege_level}:
    #     - create the account WITH a home dir + shell,
    #     - set the password only if one is given,
    #     - elevate admins/root (sudo on debian, wheel on rhel/alpine -- same || fallback style).
    #   NOTE: do users BEFORE files so a future `chown <user> <path>` has an account to point at.
    for user in payloads_for_host["users"]:
        dockerfile += f"RUN useradd -m -s /bin/bash {user['name']}\n"
        if user.get("password"):
            dockerfile += f"RUN echo '{user['name']}:{user['password']}' | chpasswd\n"
        if user.get("privilege_level") in ("admin", "root"):
            dockerfile += f"RUN usermod -aG sudo {user['name']} || usermod -aG wheel {user['name']}\n"

    # Step 7 (users/files milestone): write files from payloads_for_host["files"].
    #   The File block has NO contents field yet, so write a marker (sensitivity, else name) to path.
    #   Ensure the parent dir exists first.
    #   FUTURE: if a `contents` property is added to the File block (frontend + Service TypedDict),
    #           write that instead of the marker.
    for f in payloads_for_host["files"]:
        parent = posixpath.dirname(f["path"]) or "/"
        body = f.get("contents") or f.get("sensitivity") or f["name"]#so our file can always fall back to abody if one was not set up 
        dockerfile += f"RUN mkdir -p {parent} && echo '{body}' > {f['path']}\n"

    # Step 5: done -- one string, already newline-terminated per line.
    return dockerfile


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
    # Enable forwarding + NAT, then HAND OFF: run the given command if there is one, else stay alive.
    # Without the keep-alive the script returns after setup and the router container Exits (0) -- but
    # the router must keep running to forward traffic for the subnets it bridges.
    entrypoint = "#!/bin/sh\n"
    entrypoint += "sysctl -w net.ipv4.ip_forward=1\n"
    entrypoint += "iptables -t nat -A POSTROUTING -j MASQUERADE\n"
    entrypoint += "if [ \"$#\" -gt 0 ]; then\n"
    entrypoint += "  exec \"$@\"\n"
    entrypoint += "else\n"
    entrypoint += "  exec tail -f /dev/null\n"
    entrypoint += "fi\n"
    return entrypoint
