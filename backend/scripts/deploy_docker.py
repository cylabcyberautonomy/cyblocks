#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shlex
from pathlib import Path
from typing import Any

from backend_common import (
    container_name,
    docker_bin,
    ensure_docker_ready,
    load_json,
    project_name,
    run,
    run_dir,
    slug,
    write_json,
)


def host_by_id(environment: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {host["id"]: host for host in environment.get("hosts", [])}


def router_by_id(environment: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {router["id"]: router for router in environment.get("routers", [])}


def networks_by_id(environment: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {network["id"]: network for network in environment.get("networks", [])}


def network_for_subnet(environment: dict[str, Any], subnet_id: str | None) -> dict[str, Any]:
    if subnet_id:
        network = networks_by_id(environment).get(subnet_id)
        if network:
            return network
    networks = environment.get("networks", [])
    if not networks:
        raise SystemExit("Intermediate DSL has no networks.")
    return networks[0]


def member_ip(network: dict[str, Any], node_id: str) -> str | None:
    for member in network.get("members", []):
        if member.get("id") == node_id:
            return member.get("ipAddress")
    return None


def ensure_network(docker: str, network: dict[str, Any], project: str, log_path: Path) -> None:
    network_name = slug(network.get("name") or network["id"])
    existing = run([docker, "network", "inspect", network_name], log_path=log_path, check=False, capture=True)
    if existing.returncode == 0:
        return
    driver = network.get("driver") or "bridge"
    cmd = [
        docker,
        "network",
        "create",
        "--driver",
        driver,
        "--label",
        f"cyblocks.project={project}",
    ]
    if driver == "bridge":
        cmd.extend(
            [
                "--opt",
                "com.docker.network.bridge.enable_icc=true",
                "--opt",
                "com.docker.network.bridge.enable_ip_masquerade=true",
            ]
        )
    if network.get("cidr"):
        cmd.extend(["--subnet", str(network["cidr"])])
    cmd.append(network_name)
    run(cmd, log_path=log_path, capture=True)


def remove_project_containers(docker: str, project: str, log_path: Path) -> None:
    result = run(
        [docker, "ps", "-aq", "--filter", f"label=cyblocks.project={project}"],
        log_path=log_path,
        capture=True,
        check=False,
    )
    container_ids = [line for line in (result.stdout or "").splitlines() if line.strip()]
    if container_ids:
        run([docker, "rm", "-f", *container_ids], log_path=log_path, check=False)


def remove_project_networks(docker: str, environment: dict[str, Any], project: str, log_path: Path) -> None:
    network_names = {slug(network.get("name") or network["id"]) for network in environment.get("networks", [])}

    labeled = run(
        [docker, "network", "ls", "-q", "--filter", f"label=cyblocks.project={project}"],
        log_path=log_path,
        capture=True,
        check=False,
    )
    network_names.update(line.strip() for line in (labeled.stdout or "").splitlines() if line.strip())

    listed = run(
        [docker, "network", "ls", "--format", "{{.Name}}"],
        log_path=log_path,
        capture=True,
        check=False,
    )
    for name in (listed.stdout or "").splitlines():
        if name == f"{project}-net" or name.startswith(f"{project}-"):
            network_names.add(name)

    for network_name in sorted(network_names):
        run([docker, "network", "rm", network_name], log_path=log_path, check=False, capture=True)


def write_host_content(host_dir: Path, host: dict[str, Any], environment: dict[str, Any]) -> None:
    host_dir.mkdir(parents=True, exist_ok=True)
    (host_dir / "index.html").write_text(
        "\n".join(
            [
                "<!doctype html>",
                "<html>",
                "<head><title>Cyblocks Host</title></head>",
                "<body>",
                f"<h1>{host['hostname']}</h1>",
                f"<p>environment={environment['name']}</p>",
                f"<p>ramGb={host['ramGb']}</p>",
                f"<p>storageGb={host['storageGb']}</p>",
                "</body>",
                "</html>",
            ]
        )
        + "\n"
    )


def deploy(environment: dict[str, Any], *, docker: str, replace: bool, project_override: str | None) -> dict[str, Any]:
    project = project_name(environment, project_override)
    env_run_dir = run_dir(project)
    log_path = env_run_dir / "deploy.log"
    env_run_dir.mkdir(parents=True, exist_ok=True)
    log_path.write_text("")

    ensure_docker_ready(docker, log_path)
    if replace:
        remove_project_containers(docker, project, log_path)
        remove_project_networks(docker, environment, project, log_path)

    networks = environment.get("networks") or [{"id": "default", "name": f"{project}-net", "driver": "bridge"}]
    for network in networks:
        ensure_network(docker, network, project, log_path)

    containers = []
    routers = []
    for router in environment.get("routers", []):
        router_state = deploy_router(docker, environment, router, project, log_path, replace)
        routers.append(router_state)

    for host in environment.get("hosts", []):
        containers.append(deploy_host(docker, environment, host, project, env_run_dir, log_path, replace))

    apply_routes(docker, environment, project, log_path)
    checks = verify_connections(docker, environment, project, containers, log_path)
    network_names = [slug(network.get("name") or network["id"]) for network in networks]
    state = {
        "project": project,
        "network": network_names[0] if len(network_names) == 1 else None,
        "networks": network_names,
        "environment": environment["name"],
        "containers": containers,
        "routers": routers,
        "checks": checks,
        "log": str(log_path),
    }
    write_json(env_run_dir / "deployment.json", state)
    print(f"Deployment state: {env_run_dir / 'deployment.json'}")
    return state


def deploy_router(
    docker: str,
    environment: dict[str, Any],
    router: dict[str, Any],
    project: str,
    log_path: Path,
    replace: bool,
) -> dict[str, str]:
    name = container_name(project, router["name"])
    image = router["dockerImage"]
    interfaces = router.get("interfaces", [])
    primary = interfaces[0] if interfaces else None
    primary_network = network_for_subnet(environment, primary.get("subnetId") if primary else None)
    primary_network_name = slug(primary_network.get("name") or primary_network["id"])
    primary_ip = primary.get("ipAddress") if primary else member_ip(primary_network, router["id"])

    run([docker, "pull", image], log_path=log_path)
    if replace:
        run([docker, "rm", "-f", name], log_path=log_path, check=False, capture=True)

    cmd = [
        docker,
        "run",
        "-d",
        "--name",
        name,
        "--hostname",
        router["name"],
        "--network",
        primary_network_name,
        "--label",
        f"cyblocks.project={project}",
        "--privileged",
        "--sysctl",
        "net.ipv4.ip_forward=1",
    ]
    if primary_ip:
        cmd.extend(["--ip", primary_ip])
    cmd.extend([image, "sh", "-c", "while true; do sleep 3600; done"])
    run(cmd, log_path=log_path)

    for interface in interfaces[1:]:
        network = network_for_subnet(environment, interface["subnetId"])
        connect_cmd = [docker, "network", "connect"]
        if interface.get("ipAddress"):
            connect_cmd.extend(["--ip", interface["ipAddress"]])
        connect_cmd.extend([slug(network.get("name") or network["id"]), name])
        run(connect_cmd, log_path=log_path)

    forwarding = run(
        [
            docker,
            "exec",
            name,
            "sh",
            "-lc",
            router_forwarding_command(require_nat=len(interfaces) > 1),
        ],
        log_path=log_path,
        check=True,
        capture=True,
    )
    return {
        "routerId": router["id"],
        "name": router["name"],
        "container": name,
        "image": image,
        "ipForwarding": (forwarding.stdout or "").strip(),
    }


def deploy_host(
    docker: str,
    environment: dict[str, Any],
    host: dict[str, Any],
    project: str,
    env_run_dir: Path,
    log_path: Path,
    replace: bool,
) -> dict[str, str]:
    name = container_name(project, host["hostname"])
    image = host["dockerImage"]
    host_dir = env_run_dir / "hosts" / host["hostname"]
    network = network_for_subnet(environment, host.get("primarySubnet"))
    network_name = slug(network.get("name") or network["id"])
    ip_address = member_ip(network, host["id"]) or host.get("ipAddresses", {}).get(network["id"])
    write_host_content(host_dir, host, environment)

    run([docker, "pull", image], log_path=log_path)

    if replace:
        run([docker, "rm", "-f", name], log_path=log_path, check=False, capture=True)

    volume = f"{host_dir.resolve()}:/usr/share/nginx/html:ro"
    cmd = [
        docker,
        "run",
        "-d",
        "--name",
        name,
        "--hostname",
        host["hostname"],
        "--network",
        network_name,
        "--label",
        f"cyblocks.project={project}",
        "--cap-add",
        "NET_ADMIN",
        "--memory",
        f"{host['ramGb']}g",
        "-v",
        volume,
    ]
    if ip_address:
        cmd.extend(["--ip", ip_address])

    for drive in host.get("externalDrives", []):
        drive_path = Path(drive).expanduser()
        if drive_path.exists():
            cmd.extend(["-v", f"{drive_path.resolve()}:/mnt/external/{drive_path.name}:rw"])
        else:
            with log_path.open("a") as log:
                log.write(f"Skipping missing external drive path for {host['hostname']}: {drive}\n")

    cmd.append(image)
    run(cmd, log_path=log_path)
    return {"hostId": host["id"], "hostname": host["hostname"], "container": name, "image": image}


def apply_routes(docker: str, environment: dict[str, Any], project: str, log_path: Path) -> None:
    hosts = host_by_id(environment)
    routers = router_by_id(environment)
    for route in environment.get("routes", []):
        node = routers.get(route["nodeId"]) if route["nodeKind"] == "router" else hosts.get(route["nodeId"])
        if not node:
            continue
        name = container_name(project, node.get("name") or node.get("hostname"))
        network = route["toCidr"].split("/", 1)[0]
        netmask = cidr_netmask(route["toCidr"])
        command = install_route_command(route["toCidr"], route["via"], network, netmask)
        run([docker, "exec", name, "sh", "-lc", command], log_path=log_path, capture=True)


def verify_connections(
    docker: str,
    environment: dict[str, Any],
    project: str,
    containers: list[dict[str, str]],
    log_path: Path,
) -> list[dict[str, Any]]:
    hosts = host_by_id(environment)
    container_by_host = {item["hostId"]: item["container"] for item in containers}
    checks = []

    for connection in environment.get("connections", []):
        if connection.get("kind") == "topology" or "port" not in connection:
            continue
        if connection["from"] not in hosts or connection["to"] not in hosts:
            continue
        source = hosts[connection["from"]]
        target = hosts[connection["to"]]
        source_container = container_by_host[source["id"]]
        target_container = container_by_host[target["id"]]
        target_address = target.get("ipAddresses", {}).get(target.get("primarySubnet")) or target["hostname"]
        url = f"http://{target_address}:{connection['port']}/"
        command = http_check_command(url)
        result = run(
            [docker, "exec", source_container, "sh", "-lc", command],
            log_path=log_path,
            check=False,
            capture=True,
        )
        output = (result.stdout or "").strip()
        if result.returncode != 0:
            output = "\n".join(
                item
                for item in [
                    output,
                    connection_diagnostics(
                        docker,
                        environment,
                        project,
                        source_container,
                        target_container,
                        target_address,
                        connection["port"],
                        log_path,
                    ),
                ]
                if item
            )
        checks.append(
            {
                "connection": connection["id"],
                "from": source["hostname"],
                "to": target["hostname"],
                "targetAddress": target_address,
                "url": url,
                "ok": result.returncode == 0,
                "output": output,
            }
        )

    for check in environment.get("serviceChecks", []):
        if any(item["connection"] == check["id"] for item in checks):
            continue
        if check["from"] not in hosts or check["to"] not in hosts:
            continue
        source = hosts[check["from"]]
        target = hosts[check["to"]]
        source_container = container_by_host[source["id"]]
        target_container = container_by_host[target["id"]]
        target_address = target.get("ipAddresses", {}).get(target.get("primarySubnet")) or target["hostname"]
        url = f"http://{target_address}:{check['port']}/"
        command = http_check_command(url)
        result = run(
            [docker, "exec", source_container, "sh", "-lc", command],
            log_path=log_path,
            check=False,
            capture=True,
        )
        output = (result.stdout or "").strip()
        if result.returncode != 0:
            output = "\n".join(
                item
                for item in [
                    output,
                    connection_diagnostics(
                        docker,
                        environment,
                        project,
                        source_container,
                        target_container,
                        target_address,
                        check["port"],
                        log_path,
                    ),
                ]
                if item
            )
        checks.append(
            {
                "connection": check["id"],
                "from": source["hostname"],
                "to": target["hostname"],
                "targetAddress": target_address,
                "url": url,
                "ok": result.returncode == 0,
                "output": output,
            }
        )

    failed = [check for check in checks if not check["ok"]]
    if failed:
        first = failed[0]
        raise SystemExit(
            f"{len(failed)} connection check(s) failed. First failure: "
            f"{first['from']} -> {first['to']} at {first['url']}. See {log_path}"
        )
    return checks


def http_check_command(url: str) -> str:
    quoted_url = shlex.quote(url)
    return (
        f"url={quoted_url}; "
        "rm -f /tmp/cyblocks-http-check /tmp/cyblocks-wget.err; "
        "if wget -S -O /tmp/cyblocks-http-check --timeout=10 \"$url\" 2>/tmp/cyblocks-wget.err; then "
        "head -c 120 /tmp/cyblocks-http-check; "
        "else "
        "status=$?; "
        "cat /tmp/cyblocks-wget.err 2>/dev/null || true; "
        "echo \"wget_exit=$status\"; "
        "exit $status; "
        "fi"
    )


def diagnostic_exec(docker: str, container: str, label: str, command: str, log_path: Path) -> str:
    result = run(
        [docker, "exec", container, "sh", "-lc", command],
        log_path=log_path,
        check=False,
        capture=True,
    )
    output = (result.stdout or "").strip()
    return f"--- {label} exit={result.returncode} ---\n{output}".rstrip()


def connection_diagnostics(
    docker: str,
    environment: dict[str, Any],
    project: str,
    source_container: str,
    target_container: str,
    target_address: str,
    target_port: int,
    log_path: Path,
) -> str:
    sections = [
        "Cyblocks connection diagnostics",
        diagnostic_exec(
            docker,
            source_container,
            f"{source_container} route to {target_address}",
            f"ip route get {shlex.quote(target_address)} 2>&1 || true; ip route 2>&1 || route -n 2>&1 || true",
            log_path,
        ),
        diagnostic_exec(
            docker,
            source_container,
            f"{source_container} interfaces",
            "ip -br addr 2>&1 || ip addr 2>&1 || true",
            log_path,
        ),
        diagnostic_exec(
            docker,
            target_container,
            f"{target_container} local HTTP",
            f"wget -qO- --timeout=3 http://127.0.0.1:{target_port}/ 2>&1 | head -c 200",
            log_path,
        ),
        diagnostic_exec(
            docker,
            target_container,
            f"{target_container} interfaces/routes",
            "ip -br addr 2>&1 || ip addr 2>&1 || true; ip route 2>&1 || route -n 2>&1 || true",
            log_path,
        ),
    ]
    for router in environment.get("routers", []):
        router_container = container_name(project, router["name"])
        sections.append(
            diagnostic_exec(
                docker,
                router_container,
                f"{router_container} forwarding/NAT",
                "cat /proc/sys/net/ipv4/ip_forward 2>&1; "
                "ip -br addr 2>&1 || ip addr 2>&1 || true; "
                "ip route 2>&1 || route -n 2>&1 || true; "
                "if command -v iptables >/dev/null 2>&1; then "
                "iptables -S FORWARD 2>&1 || true; "
                "iptables -t nat -S POSTROUTING 2>&1 || true; "
                "else echo iptables=missing; fi",
                log_path,
            )
        )

    diagnostics = "\n".join(sections)
    with log_path.open("a") as log:
        log.write(diagnostics + "\n")
    return diagnostics


def cidr_netmask(cidr: str) -> str:
    prefix = int(cidr.split("/", 1)[1])
    mask = (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF
    return ".".join(str((mask >> shift) & 0xFF) for shift in (24, 16, 8, 0))


def router_forwarding_command(*, require_nat: bool) -> str:
    require_nat_value = "1" if require_nat else "0"
    return (
        f"set -eu; require_nat={require_nat_value}; "
        "if ! command -v iptables >/dev/null 2>&1; then "
        "if command -v apk >/dev/null 2>&1; then "
        "apk add --no-cache iptables >/tmp/cyblocks-router-iptables.log 2>&1 || true; "
        "elif command -v apt-get >/dev/null 2>&1; then "
        "DEBIAN_FRONTEND=noninteractive apt-get update >/tmp/cyblocks-router-iptables.log 2>&1 "
        "&& DEBIAN_FRONTEND=noninteractive apt-get install -y iptables >>/tmp/cyblocks-router-iptables.log 2>&1 "
        "|| true; "
        "fi; "
        "fi; "
        "if [ \"$(cat /proc/sys/net/ipv4/ip_forward 2>/dev/null || echo 0)\" != \"1\" ]; then "
        "sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true; "
        "fi; "
        "for setting in /proc/sys/net/ipv4/conf/*/rp_filter; do "
        "[ -e \"$setting\" ] || continue; "
        "(echo 0 > \"$setting\") 2>/dev/null || true; "
        "done; "
        "if command -v iptables >/dev/null 2>&1; then "
        "iptables -P FORWARD ACCEPT >/dev/null 2>&1 || true; "
        "iptables -C FORWARD -j ACCEPT >/dev/null 2>&1 || iptables -A FORWARD -j ACCEPT >/dev/null 2>&1 || true; "
        "iptables -t nat -C POSTROUTING -j MASQUERADE >/dev/null 2>&1 "
        "|| iptables -t nat -A POSTROUTING -j MASQUERADE >/dev/null 2>&1 || true; "
        "fi; "
        "forwarding=$(cat /proc/sys/net/ipv4/ip_forward 2>/dev/null || echo 0); "
        "if [ \"$forwarding\" != \"1\" ]; then "
        "echo 'router IP forwarding is disabled; Docker did not apply net.ipv4.ip_forward=1' >&2; "
        "exit 1; "
        "fi; "
        "if [ \"$require_nat\" = \"1\" ]; then "
        "if ! command -v iptables >/dev/null 2>&1; then "
        "echo 'router NAT setup failed: iptables is not available in the router container' >&2; "
        "exit 1; "
        "fi; "
        "if ! iptables -t nat -C POSTROUTING -j MASQUERADE >/dev/null 2>&1; then "
        "echo 'router NAT setup failed: MASQUERADE rule was not installed' >&2; "
        "exit 1; "
        "fi; "
        "echo ip_forward=$forwarding nat=masquerade; "
        "else "
        "if command -v iptables >/dev/null 2>&1 "
        "&& iptables -t nat -C POSTROUTING -j MASQUERADE >/dev/null 2>&1; then "
        "echo ip_forward=$forwarding nat=masquerade; "
        "else "
        "echo ip_forward=$forwarding nat=not-required; "
        "fi; "
        "fi"
    )


def install_route_command(cidr: str, via: str, network: str, netmask: str) -> str:
    assignments = " ".join(
        [
            f"cidr={shlex.quote(cidr)}",
            f"via={shlex.quote(via)}",
            f"network={shlex.quote(network)}",
            f"netmask={shlex.quote(netmask)}",
        ]
    )
    return (
        f"set -u; {assignments}; "
        "for setting in /proc/sys/net/ipv4/conf/*/rp_filter; do "
        "[ -e \"$setting\" ] || continue; "
        "(echo 0 > \"$setting\") 2>/dev/null || true; "
        "done; "
        "if command -v ip >/dev/null 2>&1; then "
        "if ip route replace \"$cidr\" via \"$via\" "
        "&& ip route show \"$cidr\" | grep -F \"via $via\" >/dev/null; then "
        "exit 0; "
        "fi; "
        "fi; "
        "if command -v route >/dev/null 2>&1; then "
        "route del -net \"$network\" netmask \"$netmask\" >/dev/null 2>&1 || true; "
        "if route add -net \"$network\" netmask \"$netmask\" gw \"$via\" "
        "&& route -n | awk '{print $1 \" \" $2}' | grep -F \"$network $via\" >/dev/null; then "
        "exit 0; "
        "fi; "
        "fi; "
        "echo \"failed to install route $cidr via $via\" >&2; "
        "exit 1"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy a Cyblocks intermediate DSL to local Docker containers.")
    parser.add_argument("input", type=Path, help="Intermediate DSL JSON")
    parser.add_argument("--replace", action="store_true", help="Remove existing project containers before starting")
    parser.add_argument("--project", help="Override project/container prefix")
    parser.add_argument("--docker-bin", help="Path to docker executable")
    args = parser.parse_args()

    deploy(load_json(args.input), docker=docker_bin(args.docker_bin), replace=args.replace, project_override=args.project)


if __name__ == "__main__":
    main()
