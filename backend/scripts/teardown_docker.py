#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from backend_common import docker_bin, ensure_docker_ready, load_json, project_name, run, run_dir, slug


def main() -> None:
    parser = argparse.ArgumentParser(description="Tear down a Cyblocks Docker deployment.")
    parser.add_argument("input", type=Path, help="Intermediate DSL JSON")
    parser.add_argument("--project", help="Override project/container prefix")
    parser.add_argument("--docker-bin", help="Path to docker executable")
    args = parser.parse_args()

    environment = load_json(args.input)
    project = project_name(environment, args.project)
    state_path = run_dir(project) / "deployment.json"
    docker = docker_bin(args.docker_bin)
    ensure_docker_ready(docker)

    if state_path.exists():
        state = load_json(state_path)
        for container in [*state.get("containers", []), *state.get("routers", [])]:
            run([docker, "rm", "-f", container["container"]], check=False)
        for network in state.get("networks", []):
            run([docker, "network", "rm", network], check=False)
        if state.get("network"):
            run([docker, "network", "rm", state["network"]], check=False)
        state_path.unlink()
        print(f"Removed deployment state {state_path}")
        return

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
    for network in environment.get("networks", []):
        run([docker, "network", "rm", slug(network.get("name") or network["id"])], check=False)
    print(f"Torn down containers for project {project}. No state file was present.")


if __name__ == "__main__":
    main()
