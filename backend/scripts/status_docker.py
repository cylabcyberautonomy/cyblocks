#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from backend_common import docker_bin, ensure_docker_ready, load_json, project_name, run, run_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="Show Docker deployment status for a Cyblocks environment.")
    parser.add_argument("input", type=Path, help="Intermediate DSL JSON")
    parser.add_argument("--project", help="Override project/container prefix")
    parser.add_argument("--docker-bin", help="Path to docker executable")
    args = parser.parse_args()

    environment = load_json(args.input)
    project = project_name(environment, args.project)
    state_path = run_dir(project) / "deployment.json"
    docker = docker_bin(args.docker_bin)
    ensure_docker_ready(docker)

    print(f"Project: {project}")
    if state_path.exists():
        print(state_path.read_text())
    else:
        print(f"No deployment state found at {state_path}")

    run(
        [
            docker,
            "ps",
            "--filter",
            f"label=cyblocks.project={project}",
            "--format",
            "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Networks}}",
        ]
    )


if __name__ == "__main__":
    main()
