import json
import os
import platform
import re
import shutil
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RUNS_DIR = REPO_ROOT / "backend" / "runs"

def load_json(path: Path) -> dict:
    return json.loads(path.read_text())

def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")

def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r'[^a-z0-9]+', '-', value)
    value = value.strip('-')
    return value or "unnamed"

def project_name_from_ide_dict(IDE_dict: dict) -> str:
    return slugify(IDE_dict.get("name", "unnamed"))

def network_name_from_ide_dict(IDE_dict: dict, network_id: str) -> str:
    return f"cyblocks_{project_name_from_ide_dict(IDE_dict)}_{slugify(network_id)}"

def container_name_from_ide_dict(IDE_dict: dict, container_id: str) -> str:
    return f"cyblocks_{project_name_from_ide_dict(IDE_dict)}_{slugify(container_id)}"

def service_name_from_ide_dict(IDE_dict: dict, service_id: str) -> str:
    return f"cyblocks_{project_name_from_ide_dict(IDE_dict)}_{slugify(service_id)}"

def docker_bin() -> str:
    # Prefer the standalone Docker Engine CLI over Docker Desktop's client. On Apple-Silicon macOS
    # the Homebrew (engine) client is /opt/homebrew/bin/docker while Desktop's is
    # /usr/local/bin/docker; on Linux the distro client is /usr/bin/docker. Falls back to PATH.
    # (The daemon is pinned to Colima via DOCKER_HOST regardless -- this just avoids invoking the
    # Desktop client.)
    for candidate in ("/opt/homebrew/bin/docker", "/usr/bin/docker"):
        if Path(candidate).exists():
            return candidate
    return shutil.which("docker") or "docker"

def _link_cli_plugins(docker_config: Path) -> None:
    # Docker discovers user CLI plugins (compose, buildx) in $DOCKER_CONFIG/cli-plugins. Because we
    # point DOCKER_CONFIG at an isolated dir, the host's plugins are no longer found and
    # `docker compose -f ...` breaks with "unknown shorthand flag: 'f'" (compose seen as unknown ->
    # -f parsed as a docker flag). Symlink the plugins we need into the isolated dir.
    #
    # Prefer the Homebrew / system (Docker Engine CLI) plugins over ~/.docker, which on macOS points
    # at Docker Desktop -- we run on Colima, so we deliberately avoid Desktop.
    plugins_dir = docker_config / "cli-plugins"
    plugins_dir.mkdir(parents=True, exist_ok=True)
    search = [
        Path("/opt/homebrew/lib/docker/cli-plugins"),   # Homebrew (Apple Silicon) -- engine CLI
        Path("/usr/local/lib/docker/cli-plugins"),      # Homebrew (Intel) / Linux
        Path("/usr/local/libexec/docker/cli-plugins"),
        Path("/usr/lib/docker/cli-plugins"),            # Linux distro packages
        Path("/usr/libexec/docker/cli-plugins"),
        Path.home() / ".docker" / "cli-plugins",        # last resort (Docker Desktop on macOS)
    ]
    for name in ("docker-compose", "docker-buildx"):
        dest = plugins_dir / name
        if dest.exists() or dest.is_symlink():
            continue
        src = next((d / name for d in search if (d / name).exists()), None)
        if src is not None:
            try:
                dest.symlink_to(src.resolve())
            except OSError:
                pass


def configure_docker_cli_environment() -> None:
    system = platform.system().lower()

    os.environ.setdefault("DOCKER_CONFIG", str(DEFAULT_RUNS_DIR / "docker-config"))
    docker_config = Path(os.environ["DOCKER_CONFIG"])
    docker_config.mkdir(parents=True, exist_ok=True)
    config_path = docker_config / "config.json"
    if not config_path.exists():
        config_path.write_text('{ "auths": {} }\n')
    # Keep compose/buildx discoverable under the isolated DOCKER_CONFIG (see _link_cli_plugins).
    _link_cli_plugins(docker_config)

    if os.environ.get("DOCKER_HOST") or os.environ.get("DOCKER_CONTEXT"):
        return

    if system == "linux":
        runtime_dir = os.environ.get("XDG_RUNTIME_DIR")
        rootless_socket = Path(runtime_dir) / "docker.sock" if runtime_dir else None
        if rootless_socket and rootless_socket.exists() and not Path("/var/run/docker.sock").exists():
            os.environ["DOCKER_HOST"] = f"unix://{rootless_socket}"
            return
        raise RuntimeError("No Docker socket found. Please set DOCKER_HOST or DOCKER_CONTEXT environment variable.")

    if system == "darwin":
        home = Path.home()
        profile = os.environ.get("COLIMA_PROFILE","default")
        candidates = [
            home / ".colima" / profile / "docker.sock",
            home / ".colima" / "default" / "docker.sock",
            home / ".colima" / "docker.sock",
        ]

        socket = next((s for s in candidates if s.exists()), None)
        if socket:
            os.environ["DOCKER_HOST"] = f"unix://{socket}"
            return
        raise RuntimeError("No Docker socket found. Please set DOCKER_HOST or DOCKER_CONTEXT environment variable.")

    raise RuntimeError("System is not supported. Please use Mac or Linux.")

def run(cmd, *, log_path = None, capture = False, check = True):
    if log_path is not None:
        with open(log_path, "a") as f:
            f.write(f"Running command: {cmd}\n\n")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if log_path is not None:
        with open(log_path, "a") as f:
            if result.stdout: f.write(result.stdout)
            if result.stderr: f.write(result.stderr)
            
    if check and result.returncode != 0:
        raise RuntimeError(f"Command failed: {cmd}\nstdout: {result.stdout}\nstderr: {result.stderr}")
    return result

def ensure_docker_ready(docker: str | None = None, log_path: Path | None = None) -> str:
    # 1. point the CLI at the right daemon socket (sets DOCKER_HOST / DOCKER_CONFIG).
    configure_docker_cli_environment()
    # 2. resolve the docker binary if the caller didn't pass one.
    docker = docker or docker_bin()
    # 3. prove the daemon actually answers -- `docker info` fails (check=True) if not.
    run([docker, "info"], log_path=log_path, capture=True)
    return docker

def run_dir(project: str, base: Path | None = None) -> Path:
    return (base or DEFAULT_RUNS_DIR) / project

def build_dir(project: str, base: Path | None = None) -> Path:
    return run_dir(project, base) / "build"

def dockerfiles_dir(project: str, base: Path | None = None) -> Path:
    return build_dir(project, base) / "dockerfiles"


