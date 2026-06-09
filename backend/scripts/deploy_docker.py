import argparse
import ipaddress
import shlex
from pathlib import Path
from typing import Any

from backend_common import (
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
def deploy(environment: dict[str, Any], *, docker: str, replace: bool, project_override: str | None) -> dict[str, Any]:
    project = project_name(environment, project_override)
    env_run_dir = run_dir(project)
    log_path = env_run_dir / "deploy.log"
    env_run_dir.mkdir(parents=True, exist_ok=True)
    log_path.write_text("")

    network_plan = build_network_plan(environment, project)
    ensure_docker_ready(docker, log_path)
    if replace:
        remove_previous_host_bridge_forwarding(docker, project, network_plan, log_path)
        remove_project_containers(docker, project, log_path)
        remove_project_networks(docker, environment, project, log_path, network_plan)

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
    checks = verify_connections(docker, environment, project, containers, log_path)
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
        "checks": checks,
        "log": str(log_path),
    }
    write_json(env_run_dir / "deployment.json", state)
    print(f"Deployment state: {env_run_dir / 'deployment.json'}")
    return state
