from email.policy import default
import json
import sys
import os
import platform
import re
import shutil
import subprocess
from hashlib import sha1
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RUNS_DIR = REPO_ROOT / "backend" / "runs"

def load_json(path: Path) -> dict:
    return json.loads(path.read_text())

def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")

def configure_docker_cli_environment() -> None:
    system = platform.system().lower()

    os.environ.setdefault("DOCKER_CONFIG", str(DEFAULT_RUNS_DIR / "docker-config"))
    docker_config = Path(os.environ["DOCKER_CONFIG"])
    docker_config.mkdir(parents=True, exist_ok=True)
    config_path = docker_config / "config.json"
    if not config_path.exists():
        config_path.write_text('{ "auths": {} }\n')

    docker_host = os.environ.get("DOCKER_HOST")

    if os.environ.get("DOCKER_HOST") or os.environ.get("DOCKER_CONTEXT"):
        return

    if system == "linux":
        runtime_dir = os.environ.get("XDG_RUNTIME_DIR")
        rootless_socket = Path(runtime_dir) / "docker.sock" if runtime_dir else None
        if rootless_socket and rootless_socket.exists() and not Path("/var/run/docker.sock").exists():
            os.environ["DOCKER_HOST"] = f"unix://{rootless_socket}"
        else:
            raise RuntimeError("No Docker socket found. Please set DOCKER_HOST or DOCKER_CONTEXT environment variable.")
    
    if system == "darwin":
        home = Path.home()
        profile = os.environ.get("COLIMA_PROFILE","default")
        candidates = [
            home / ".colima" / profile / "docker.sock",
            home / ".colima" / default / "docker.sock",
            home / ".colima" / "docker.sock",
        ]

        socket = next((s for s in candidates if s.exists()), None)
        if socket:
            os.environ["DOCKER_HOST"] = f"unix://{socket}"
        else:
            raise RuntimeError("No Docker socket found. Please set DOCKER_HOST or DOCKER_CONTEXT environment variable.")


    raise RuntimeError("System is not supported. Please use Mac or Linux.")

def run():
    

def run_dir(project: str, base: Path | None = None) -> Path:
    return (base or DEFAULT_RUNS_DIR) / project
