#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from backend_common import docker_bin, ensure_docker_ready, load_json, project_name, run, run_dir, slug


def teardown(environment: dict, *, docker: str, project_override: str | None = None) -> dict:
    project = project_name(environment, project_override)
    state_path = run_dir(project) / "deployment.json"
    ensure_docker_ready(docker)

    removed_containers = []
    removed_networks = []

    if state_path.exists():
        state = load_json(state_path)
        for container in [*state.get("containers", []), *state.get("routers", [])]:
            container_name = container["container"]
            run([docker, "rm", "-f", container_name], check=False)
            removed_containers.append(container_name)
        for network in state.get("networks", []):
            run([docker, "network", "rm", network], check=False)
            removed_networks.append(network)
        if state.get("network"):
            run([docker, "network", "rm", state["network"]], check=False)
            removed_networks.append(state["network"])
        state_path.unlink()

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
        run([docker, "rm", "-f", *container_ids], check=False)
        removed_containers.extend(container_ids)

    network_names = {slug(network.get("name") or network["id"]) for network in environment.get("networks", [])}
    labeled = run(
        [docker, "network", "ls", "-q", "--filter", f"label=cyblocks.project={project}"],
        capture=True,
        check=False,
    )
    network_names.update(line.strip() for line in (labeled.stdout or "").splitlines() if line.strip())
    listed = run([docker, "network", "ls", "--format", "{{.Name}}"], capture=True, check=False)
    for network in (listed.stdout or "").splitlines():
        if network == f"{project}-net" or network.startswith(f"{project}-"):
            network_names.add(network)

    for network in sorted(network_names):
        run([docker, "network", "rm", network], check=False)
        removed_networks.append(network)

    return {
        "project": project,
        "statePath": str(state_path),
        "removedContainers": sorted(set(removed_containers)),
        "removedNetworks": sorted(set(removed_networks)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Tear down a Cyblocks Docker deployment.")
    parser.add_argument("input", type=Path, help="Intermediate DSL JSON")
    parser.add_argument("--project", help="Override project/container prefix")
    parser.add_argument("--docker-bin", help="Path to docker executable")
    args = parser.parse_args()

    environment = load_json(args.input)
    docker = docker_bin(args.docker_bin)
    result = teardown(environment, docker=docker, project_override=args.project)
    print(
        f"Torn down {len(result['removedContainers'])} container(s) and "
        f"{len(result['removedNetworks'])} network(s) for project {result['project']}."
    )


if __name__ == "__main__":
    main()
