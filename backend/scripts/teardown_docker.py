#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from backend_common import (
    DEFAULT_RUNS_DIR,
    bridge_interface_name,
    docker_bin,
    ensure_docker_ready,
    load_json,
    network_name,
    project_name,
    run,
    run_dir,
)
from deploy_docker import (
    build_network_plan,
    inspect_bridge_interface,
    remove_container_if_exists,
    remove_host_bridge_forwarding,
    state_bridge_interfaces,
)


def state_container_names(state: dict) -> set[str]:
    names = set()
    for container in [*state.get("containers", []), *state.get("routers", [])]:
        if isinstance(container, dict) and container.get("container"):
            names.add(container["container"])
        elif isinstance(container, str):
            names.add(container)
    return names


def state_network_names(state: dict) -> set[str]:
    names = {network for network in state.get("networks", []) if isinstance(network, str)}
    if isinstance(state.get("network"), str):
        names.add(state["network"])
    return names


def environment_bridge_interfaces(project: str, environment: dict) -> list[str]:
    network_plan = build_network_plan(environment, project)
    return [
        bridge_interface_name(project, network)
        for network in network_plan.get("dockerNetworks", [])
        if (network.get("driver") or "bridge") == "bridge"
    ]


def docker_network_bridge_interfaces(docker: str, network_names: set[str]) -> list[str]:
    bridge_interfaces = []
    for docker_network_name in sorted(network_names):
        bridge_interface = inspect_bridge_interface(docker, docker_network_name)
        if bridge_interface:
            bridge_interfaces.append(bridge_interface)
    return bridge_interfaces


def teardown(environment: dict, *, docker: str, project_override: str | None = None) -> dict:
    project = project_name(environment, project_override)
    state_path = run_dir(project) / "deployment.json"
    ensure_docker_ready(docker)

    removed_containers = []
    removed_networks = []

    if state_path.exists():
        state = load_json(state_path)
        bridge_interfaces = set(state_bridge_interfaces(state))
        bridge_interfaces.update(environment_bridge_interfaces(project, environment))
        remove_host_bridge_forwarding(docker, sorted(bridge_interfaces))
        for container in [*state.get("containers", []), *state.get("routers", [])]:
            container_name = container["container"]
            if remove_container_if_exists(docker, container_name):
                removed_containers.append(container_name)
        state_networks = state_network_names(state)
        for network in sorted(state_networks):
            run([docker, "network", "rm", network], check=False, capture=True)
            removed_networks.append(network)
        state_path.unlink()
    else:
        remove_host_bridge_forwarding(docker, environment_bridge_interfaces(project, environment))

    result = run(
        [
            docker,
            "ps",
            "-aq",
            "--filter",
            f"label=cyblocks.project={project}",
        ],
        capture=True,
        check=False,
    )
    container_ids = [line for line in (result.stdout or "").splitlines() if line.strip()]
    if container_ids:
        run([docker, "rm", "-f", *container_ids], check=False, capture=True)
        removed_containers.extend(container_ids)

    network_plan = build_network_plan(environment, project)
    network_names = {network_name(network) for network in network_plan.get("dockerNetworks", [])}
    network_names.update(network_name(network) for network in environment.get("networks", []))
    labeled = run(
        [docker, "network", "ls", "--format", "{{.Name}}", "--filter", f"label=cyblocks.project={project}"],
        capture=True,
        check=False,
    )
    network_names.update(line.strip() for line in (labeled.stdout or "").splitlines() if line.strip())
    listed = run([docker, "network", "ls", "--format", "{{.Name}}"], capture=True, check=False)
    for network in (listed.stdout or "").splitlines():
        if network == f"{project}-net" or network.startswith(f"{project}-"):
            network_names.add(network)

    remove_host_bridge_forwarding(docker, docker_network_bridge_interfaces(docker, network_names))

    for network in sorted(network_names):
        run([docker, "network", "rm", network], check=False, capture=True)
        removed_networks.append(network)

    return {
        "project": project,
        "statePath": str(state_path),
        "removedContainers": sorted(set(removed_containers)),
        "removedNetworks": sorted(set(removed_networks)),
    }


def teardown_all_cyblocks(docker: str) -> dict:
    ensure_docker_ready(docker)

    state_paths = sorted(DEFAULT_RUNS_DIR.glob("*/deployment.json")) if DEFAULT_RUNS_DIR.exists() else []
    state_containers: set[str] = set()
    state_networks: set[str] = set()
    state_projects: set[str] = set()
    state_bridges: set[str] = set()
    removed_containers: set[str] = set()
    removed_networks: set[str] = set()

    for state_path in state_paths:
        try:
            state = load_json(state_path)
        except Exception:
            continue
        state_containers.update(state_container_names(state))
        state_networks.update(state_network_names(state))
        state_bridges.update(state_bridge_interfaces(state))
        if isinstance(state.get("project"), str):
            state_projects.add(state["project"])

    remove_host_bridge_forwarding(docker, sorted(state_bridges))

    container_names = sorted(state_containers)
    if container_names:
        run([docker, "rm", "-f", *container_names], check=False, capture=True)
        removed_containers.update(container_names)

    labeled_containers = run(
        [docker, "ps", "-aq", "--filter", "label=cyblocks.project"],
        capture=True,
        check=False,
    )
    container_ids = [line.strip() for line in (labeled_containers.stdout or "").splitlines() if line.strip()]
    if container_ids:
        run([docker, "rm", "-f", *container_ids], check=False, capture=True)
        removed_containers.update(container_ids)

    labeled_networks = run(
        [docker, "network", "ls", "--format", "{{.Name}}", "--filter", "label=cyblocks.project"],
        capture=True,
        check=False,
    )
    network_names = set(state_networks)
    network_names.update(line.strip() for line in (labeled_networks.stdout or "").splitlines() if line.strip())

    listed = run([docker, "network", "ls", "--format", "{{.Name}}"], capture=True, check=False)
    for network in (listed.stdout or "").splitlines():
        if any(network == f"{project}-net" or network.startswith(f"{project}-") for project in state_projects):
            network_names.add(network)

    remove_host_bridge_forwarding(docker, docker_network_bridge_interfaces(docker, network_names))

    for network in sorted(network_names):
        run([docker, "network", "rm", network], check=False, capture=True)
        removed_networks.add(network)

    removed_state_paths = []
    for state_path in state_paths:
        try:
            state_path.unlink()
            removed_state_paths.append(str(state_path))
        except FileNotFoundError:
            continue

    return {
        "project": "all",
        "statePaths": removed_state_paths,
        "removedContainers": sorted(removed_containers),
        "removedNetworks": sorted(removed_networks),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Tear down a Cyblocks Docker deployment.")
    parser.add_argument("input", nargs="?", type=Path, help="Intermediate DSL JSON")
    parser.add_argument("--all", action="store_true", help="Remove all Cyblocks Docker resources and deployment state")
    parser.add_argument("--project", help="Override project/container prefix")
    parser.add_argument("--docker-bin", help="Path to docker executable")
    args = parser.parse_args()

    docker = docker_bin(args.docker_bin)
    if args.all:
        result = teardown_all_cyblocks(docker)
        print(
            f"Torn down {len(result['removedContainers'])} Cyblocks container(s), "
            f"{len(result['removedNetworks'])} network(s), and "
            f"{len(result['statePaths'])} deployment state file(s)."
        )
        return

    if not args.input:
        parser.error("input is required unless --all is set")

    environment = load_json(args.input)
    result = teardown(environment, docker=docker, project_override=args.project)
    print(
        f"Torn down {len(result['removedContainers'])} container(s) and "
        f"{len(result['removedNetworks'])} network(s) for project {result['project']}."
    )


if __name__ == "__main__":
    main()
