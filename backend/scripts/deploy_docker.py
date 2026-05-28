#!/usr/bin/env python3
from __future__ import annotations

import argparse
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


def ensure_network(docker: str, network: str, log_path: Path) -> None:
    existing = run([docker, "network", "inspect", network], log_path=log_path, check=False, capture=True)
    if existing.returncode == 0:
        return
    run([docker, "network", "create", "--driver", "bridge", network], log_path=log_path)


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
    network_name = slug(environment.get("networks", [{}])[0].get("name") or f"{project}-net")
    ensure_network(docker, network_name, log_path)

    containers = []
    for host in environment.get("hosts", []):
        name = container_name(project, host["hostname"])
        image = host["dockerImage"]
        host_dir = env_run_dir / "hosts" / host["hostname"]
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
            "--memory",
            f"{host['ramGb']}g",
            "-v",
            volume,
        ]

        for drive in host.get("externalDrives", []):
            drive_path = Path(drive).expanduser()
            if drive_path.exists():
                cmd.extend(["-v", f"{drive_path.resolve()}:/mnt/external/{drive_path.name}:rw"])
            else:
                with log_path.open("a") as log:
                    log.write(f"Skipping missing external drive path for {host['hostname']}: {drive}\n")

        cmd.append(image)
        run(cmd, log_path=log_path)
        containers.append({"hostId": host["id"], "hostname": host["hostname"], "container": name, "image": image})

    checks = verify_connections(docker, environment, containers, log_path)
    state = {
        "project": project,
        "network": network_name,
        "environment": environment["name"],
        "containers": containers,
        "checks": checks,
        "log": str(log_path),
    }
    write_json(env_run_dir / "deployment.json", state)
    print(f"Deployment state: {env_run_dir / 'deployment.json'}")
    return state


def verify_connections(
    docker: str,
    environment: dict[str, Any],
    containers: list[dict[str, str]],
    log_path: Path,
) -> list[dict[str, Any]]:
    hosts = host_by_id(environment)
    container_by_host = {item["hostId"]: item["container"] for item in containers}
    checks = []

    for connection in environment.get("connections", []):
        source = hosts[connection["from"]]
        target = hosts[connection["to"]]
        source_container = container_by_host[source["id"]]
        url = f"http://{target['hostname']}:{connection['port']}/"
        command = f"wget -qO- --timeout=10 {url} >/tmp/cyblocks-http-check && head -c 120 /tmp/cyblocks-http-check"
        result = run(
            [docker, "exec", source_container, "sh", "-lc", command],
            log_path=log_path,
            check=False,
            capture=True,
        )
        checks.append(
            {
                "connection": connection["id"],
                "from": source["hostname"],
                "to": target["hostname"],
                "url": url,
                "ok": result.returncode == 0,
                "output": (result.stdout or "").strip(),
            }
        )

    failed = [check for check in checks if not check["ok"]]
    if failed:
        raise SystemExit(f"{len(failed)} connection check(s) failed. See {log_path}")
    return checks


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
