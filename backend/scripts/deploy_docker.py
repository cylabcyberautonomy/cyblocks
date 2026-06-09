import argparse
import ipaddress
import shlex
from pathlib import Path
from typing import Any

from common import (
    bridge_interface_name,
    container_name,
    docker_bin,
    ensure_docker_ready,
    load_json,
    network_name,
    project_name,
    run,
    run_dir,
    write_json,
)

def build_network_plan(environment: dict[str, Any], project: str) -> dict[str, Any]:
    source_networks = environment.get("networks", [])
    docker_networks = []
    for network in source_networks:
        docker_network = {
            "name": network_name(network),
            "subnet": network["cidr"],
            "gateway": str(ipaddress.ip_network(network["cidr"])[1]),
        }
        docker_networks.append(docker_network)
    mode = "bridge" if len(docker_networks) == 1 else "macvlan"
    return {
        "mode": mode,
        "sourceNetworks": source_networks,
        "dockerNetworks": docker_networks,
    }

def ensure_network(docker: str, network: dict[str, Any], project: str, log_path: Path) -> str | None:
    name = network["name"]
    subnet = network["subnet"]
    gateway = network["gateway"]
    existing = run([docker, "network", "ls", "--filter", f"name=^{name}$", "--format", "{{.Name}} {{.ID}}"], log_path=log_path, capture=True)
    if existing.stdout:
        print(f"Network {name} already exists, skipping creation.")
        return None
    run([docker, "network", "create", "--driver", "bridge", "--subnet", subnet, "--gateway", gateway, name], log_path=log_path)
    return bridge_interface_name(name)

def ensure_host_bridge_forwarding(docker: str, bridge_interfaces: list[str], log_path: Path) -> bool:
    if not bridge_interfaces:
        return False
    for interface in bridge_interfaces:
        run(["sudo", "iptables", "-A", "FORWARD", "-i", interface, "-j", "ACCEPT"], log_path=log_path)
        run(["sudo", "iptables", "-A", "FORWARD", "-o", interface, "-j", "ACCEPT"], log_path=log_path)
    return True

def deploy_router(docker: str, environment: dict[str, Any], router: dict[str, Any], project: str, log_path: Path, replace: bool, network_plan: dict[str, Any]) -> dict[str, Any]:
    name = container_name(project, router["name"])
    image = router["image"]
    capabilities = ["NET_ADMIN"]
    sysctls = { "net.ipv4.ip_forward": "1" }
    networks = []
    for network in network_plan["sourceNetworks"]:
        if any(network["name"] == n["name"] for n in router.get("networks", [])):
            networks.append(network_name(network))
    existing = run([docker, "ps", "--filter", f"name=^{name}$", "--format", "{{.Names}}"], log_path=log_path, capture=True)
    if existing.stdout:
        if replace:
            print(f"Container {name} already exists, removing.")
            run([docker, "rm", "-f", name], log_path=log_path)
        else:
            print(f"Container {name} already exists, skipping creation.")
            return {"name": name, "image": image, "networks": networks}
    run([docker, "run", "-d", "--name", name] + [f"--cap-add={cap}" for cap in capabilities] + [f"--sysctl={key}={value}" for key, value in sysctls.items()] + [f"--network={net}" for net in networks] + [image], log_path=log_path)
    return {"name": name, "image": image, "networks": networks}

def deploy_host(docker: str, environment: dict[str, Any], host: dict[str, Any], project: str, env_run_dir: Path, log_path: Path, replace: bool, network_plan: dict[str, Any]) -> dict[str, Any]:
    name = container_name(project, host["name"])
    image = host["image"]
    memory = host.get("memoryMb", 512)
    networks = []
    publish_ports = []
    for network in network_plan["sourceNetworks"]:
        if any(network["name"] == n["name"] for n in host.get("networks", [])):
            networks.append(network_name(network))
    for port in host.get("publishPorts", []):
        publish_ports.append(f"{port}:{port}")
    existing = run([docker, "ps", "--filter", f"name=^{name}$", "--format", "{{.Names}}"], log_path=log_path, capture=True)
    if existing.stdout:
        if replace:
            print(f"Container {name} already exists, removing.")
            run([docker, "rm", "-f", name], log_path=log_path)
        else:
            print(f"Container {name} already exists, skipping creation.")
            return {"name": name, "image": image, "networks": networks, "publishPorts": publish_ports}
    run([docker, "run", "-d", "--name", name, f"--memory={memory}m"] + [f"--network={net}" for net in networks] + [f"-p{port}" for port in publish_ports] + [image], log_path=log_path)
    return {"name": name, "image": image, "networks": networks, "publishPorts": publish_ports}

def apply_routes(docker: str, environment: dict[str, Any], project: str, log_path: Path) -> None:
    for route in environment.get("routes", []):
        source = container_name(project, route["source"])
        destination = route["destination"]
        run([docker, "exec", source, "ip", "route", "add", destination, "via", "default"], log_path=log_path)

def deploy(environment: dict[str, Any], *, docker: str, project_override: str | None) -> dict[str, Any]:
    project = project_name(environment, project_override)
    env_run_dir = run_dir(project)
    log_path = env_run_dir / "deploy.log"
    env_run_dir.mkdir(parents=True, exist_ok=True)
    log_path.write_text("")

    network_plan = build_network_plan(environment, project)
    ensure_docker_ready(docker, log_path)

    bridge_interfaces = []
    for network in network_plan["dockerNetworks"]:
        bridge_interface = ensure_network(docker, network, project, log_path)
        if bridge_interface:
            bridge_interfaces.append(bridge_interface)
    host_firewall = ensure_host_bridge_forwarding(docker, bridge_interfaces, log_path)

    containers = []
    routers = []
    for router in environment.get("routers", []):
        router_state = deploy_router(docker, environment, router, project, log_path, replace, network_plan)
        routers.append(router_state)

    for host in environment.get("hosts", []):
        containers.append(
            deploy_host(docker, environment, host, project, env_run_dir, log_path, replace, network_plan)
        )

    apply_routes(docker, environment, project, log_path)
    network_names = [network_name(network) for network in network_plan["dockerNetworks"]]
    state = {
        "project": project,
        "network": network_names[0] if len(network_names) == 1 else None,
        "networks": network_names,
        "networkMode": network_plan["mode"],
        "topologyNetworks": [network_name(network) for network in network_plan["sourceNetworks"]],
        "bridgeInterfaces": bridge_interfaces,
        "hostFirewall": host_firewall,
        "environment": environment["name"],
        "containers": containers,
        "routers": routers,
        "log": str(log_path),
    }
    write_json(env_run_dir / "deployment.json", state)
    print(f"Deployment state: {env_run_dir / 'deployment.json'}")
    return state
