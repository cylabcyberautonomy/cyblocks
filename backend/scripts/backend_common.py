from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RUNS_DIR = REPO_ROOT / "backend" / "runs"
MACOS_DOCKER_PATHS = ["/opt/homebrew/bin", "/usr/local/bin"]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def slug(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_.-]+", "-", value.strip().lower())
    normalized = re.sub(r"-+", "-", normalized).strip("-")
    return normalized or "cyblocks"


def docker_image_from_os_path(os_image_path: str) -> str:
    if os_image_path.startswith("docker://"):
        return os_image_path.removeprefix("docker://")
    return os_image_path


def docker_bin(explicit: str | None = None) -> str:
    candidates = [
        explicit,
        os.environ.get("DOCKER_BIN"),
        shutil.which("docker"),
        "/opt/homebrew/bin/docker",
        "/usr/local/bin/docker",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    raise SystemExit(
        "Docker CLI was not found. Install Docker Engine or set DOCKER_BIN to the docker executable."
    )


def configure_docker_cli_environment() -> None:
    extra_paths = [path for path in MACOS_DOCKER_PATHS if Path(path).exists()]
    if extra_paths:
        os.environ["PATH"] = f"{':'.join(extra_paths)}:{os.environ.get('PATH', '')}"

    os.environ.setdefault("DOCKER_CONFIG", str(DEFAULT_RUNS_DIR / "docker-config"))
    docker_config = Path(os.environ["DOCKER_CONFIG"])
    docker_config.mkdir(parents=True, exist_ok=True)
    config_path = docker_config / "config.json"
    if not config_path.exists():
        config_path.write_text('{ "auths": {} }\n')

    if os.environ.get("DOCKER_HOST") or os.environ.get("DOCKER_CONTEXT"):
        return

    system = platform.system().lower()
    if system == "darwin":
        colima_socket = Path.home() / ".colima" / "default" / "docker.sock"
        if colima_socket.exists():
            os.environ["DOCKER_HOST"] = f"unix://{colima_socket}"
        return

    if system == "linux":
        runtime_dir = os.environ.get("XDG_RUNTIME_DIR")
        rootless_socket = Path(runtime_dir) / "docker.sock" if runtime_dir else None
        if rootless_socket and rootless_socket.exists() and not Path("/var/run/docker.sock").exists():
            os.environ["DOCKER_HOST"] = f"unix://{rootless_socket}"


def run(
    args: list[str],
    *,
    log_path: Path | None = None,
    check: bool = True,
    capture: bool = False,
) -> subprocess.CompletedProcess[str]:
    line = " ".join(args)
    if log_path:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a") as log:
            log.write(f"$ {line}\n")
    print(line)
    result = subprocess.run(
        args,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
        check=False,
    )
    if capture and log_path:
        with log_path.open("a") as log:
            log.write(result.stdout or "")
    if check and result.returncode != 0:
        if capture and result.stdout:
            sys.stderr.write(result.stdout)
        raise SystemExit((result.stdout or "").strip() or result.returncode)
    return result


def ensure_docker_ready(docker: str, log_path: Path | None = None) -> None:
    try:
        run([docker, "info"], log_path=log_path, capture=True)
    except SystemExit as exc:
        raise SystemExit(
            "Docker CLI is installed, but the Docker daemon is not reachable. Start Docker Engine and verify `docker info` works, then retry."
        ) from exc


def project_name(environment: dict[str, Any], override: str | None = None) -> str:
    if override:
        return slug(override)
    deployment = environment.get("deployment", {})
    return slug(deployment.get("project") or environment.get("name") or "cyblocks-env")


def container_name(project: str, hostname: str) -> str:
    return slug(f"{project}-{hostname}")


def run_dir(project: str, base: Path | None = None) -> Path:
    return (base or DEFAULT_RUNS_DIR) / project
