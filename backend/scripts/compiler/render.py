from compiler.types import Payloads


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
