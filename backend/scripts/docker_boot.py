# docker_boot.py
# One place to start/stop the Docker backend, dispatched by the detected OS:
#   - macOS: Colima (a VM hosting the docker daemon) -- `colima start` / `colima stop`.
#   - Linux: the native systemd-managed docker daemon -- `systemctl start/stop docker`.
#
# Deploy lazily starts it (ensure_docker_backend_running) on the first "Run Environment"; the
# "End Experiment" flow stops it (stop_docker_backend). Both are exposed via api_backend so the
# user only ever runs api_backend.py + `npm run dev` and clicks buttons.

import platform
import shutil
from pathlib import Path

import common


# --- macOS / Colima --------------------------------------------------------
def colima_is_running() -> bool:
    # `colima status` exits 0 only when the VM (and its docker daemon) is up. check=False so a
    # "not running" status doesn't raise; common.run always captures, so no stdout spam.
    colima = shutil.which("colima")
    if not colima:
        return False
    return common.run([colima, "status"], check=False).returncode == 0


def _start_colima(log_path: Path | None = None) -> None:
    colima = shutil.which("colima")
    if not colima:
        raise RuntimeError(
            "Colima is not installed. Install it with `brew install colima docker`, "
            "then it will be auto-started on deploy."
        )
    if colima_is_running():
        return
    # `colima start` blocks until the VM + docker daemon are ready (~30-60s on a cold first boot),
    # so by the time this returns docker works.
    common.run([colima, "start"], log_path=log_path)


def _stop_colima(log_path: Path | None = None) -> None:
    # Best-effort: no-op if colima isn't installed or already stopped.
    colima = shutil.which("colima")
    if not colima or not colima_is_running():
        return
    common.run([colima, "stop"], log_path=log_path, check=False)


# --- Linux / native daemon -------------------------------------------------
def _systemctl() -> str | None:
    return shutil.which("systemctl")


def _docker_service_active(systemctl: str, scope: list[str]) -> bool:
    # scope is the systemctl arg list, e.g. ["is-active","docker"] or ["--user","is-active","docker"].
    return common.run([systemctl, *scope], check=False).returncode == 0


def _start_docker_linux(log_path: Path | None = None) -> None:
    systemctl = _systemctl()
    if not systemctl:
        # No systemd (WSL, minimal containers, etc.) -- can't manage the daemon here; let
        # common.ensure_docker_ready() verify next and raise a clear error if docker isn't up.
        return
    # already up? check the system service, then the rootless user service.
    if _docker_service_active(systemctl, ["is-active", "docker"]) or \
       _docker_service_active(systemctl, ["--user", "is-active", "docker"]):
        return
    # try rootless (user) first -- no sudo needed -- then the system service.
    common.run([systemctl, "--user", "start", "docker"], log_path=log_path, check=False)
    if _docker_service_active(systemctl, ["--user", "is-active", "docker"]):
        return
    common.run([systemctl, "start", "docker"], log_path=log_path, check=False)


def _stop_docker_linux(log_path: Path | None = None) -> None:
    # End-experiment teardown. Best-effort (check=False): the rootless user service stops without
    # privileges; stopping the system daemon may need them.
    systemctl = _systemctl()
    if not systemctl:
        return
    common.run([systemctl, "--user", "stop", "docker"], log_path=log_path, check=False)
    common.run([systemctl, "stop", "docker"], log_path=log_path, check=False)


# --- OS dispatcher (the public API) ----------------------------------------
def ensure_docker_backend_running(log_path: Path | None = None) -> None:
    system = platform.system().lower()
    if system == "darwin":
        _start_colima(log_path)
    elif system == "linux":
        _start_docker_linux(log_path)
    # other OSes: common.ensure_docker_ready() raises the unsupported-system error.


def stop_docker_backend(log_path: Path | None = None) -> None:
    system = platform.system().lower()
    if system == "darwin":
        _stop_colima(log_path)
    elif system == "linux":
        _stop_docker_linux(log_path)
