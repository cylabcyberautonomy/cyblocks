#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import signal
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import parse_qs, urlparse

from backend_common import configure_docker_cli_environment, docker_bin, load_json, run, run_dir, slug, write_json
from compile_ide_to_intermediate import compile_ide_graph
from deploy_docker import deploy
from export_incalmo_compose import (
    DEFAULT_C2_SERVER,
    DEFAULT_ENVIRONMENT,
    DEFAULT_INCALMO_ROOT,
    DEFAULT_STRATEGY,
    build_compose,
    build_incalmo_config,
    write_export_readme,
    write_yaml,
)
from teardown_docker import teardown, teardown_all_cyblocks


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8787
DEFAULT_FRONTEND_PORT = 5173
GENERATED_DIR = Path(__file__).resolve().parents[1] / "generated"
LLM_API_KEY_ENV_NAMES = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GOOGLE_API_KEY",
    "gemini": "GOOGLE_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "mistral": "MISTRAL_API_KEY",
}


def configure_docker_environment() -> None:
    configure_docker_cli_environment()


def compile_source(source: dict[str, Any]) -> dict[str, Any]:
    name = slug(str(source.get("name") or "cyblocks-board"))
    compiled = compile_ide_graph(source, name=name)

    source_path = GENERATED_DIR / f"{name}.ide.json"
    intermediate_path = GENERATED_DIR / f"{name}.intermediate.json"
    write_json(source_path, source)
    write_json(intermediate_path, compiled)

    return {
        "name": compiled["name"],
        "sourcePath": str(source_path),
        "intermediatePath": str(intermediate_path),
        "intermediate": compiled,
    }


def export_incalmo_source(source: dict[str, Any], options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or {}
    result = compile_source(source)
    name = result["name"]
    out_dir = GENERATED_DIR / f"{name}-compose"
    out_dir.mkdir(parents=True, exist_ok=True)

    incalmo_root = Path(options.get("incalmoRoot") or DEFAULT_INCALMO_ROOT).expanduser()
    project = slug(str(options.get("project") or name))
    incalmo_metadata = result["intermediate"].get("incalmo")
    if not isinstance(incalmo_metadata, dict):
        incalmo_metadata = {}
    c2_server = str(options.get("c2Server") or incalmo_metadata.get("c2Server") or DEFAULT_C2_SERVER)
    strategy = str(options.get("strategy") or incalmo_metadata.get("strategy") or DEFAULT_STRATEGY)
    incalmo_environment = str(options.get("environment") or incalmo_metadata.get("environment") or DEFAULT_ENVIRONMENT)
    debug = options.get("debug", incalmo_metadata.get("debug", True))
    debug = bool(debug)

    compose_path = out_dir / "compose.yml"
    config_path = out_dir / "incalmo.config.json"
    intermediate_path = out_dir / "intermediate.json"

    compose = build_compose(
        result["intermediate"],
        out_dir=out_dir,
        incalmo_root=incalmo_root,
        c2_server=c2_server,
        debug=debug,
    )
    write_yaml(compose_path, compose)
    write_json(intermediate_path, result["intermediate"])
    write_json(
        config_path,
        build_incalmo_config(
            result["intermediate"],
            strategy=strategy,
            incalmo_environment=incalmo_environment,
            c2_server=c2_server,
        ),
    )
    write_export_readme(
        out_dir,
        compose_path=compose_path,
        config_path=config_path,
        incalmo_root=incalmo_root.resolve(),
        project=project,
    )

    return {
        **result,
        "incalmo": {
            "project": project,
            "outDir": str(out_dir),
            "composePath": str(compose_path),
            "configPath": str(config_path),
            "intermediatePath": str(intermediate_path),
            "readmePath": str(out_dir / "README.md"),
            "incalmoRoot": str(incalmo_root),
        },
    }


def deployment_status(name: str) -> dict[str, Any]:
    project = slug(name)
    state_path = run_dir(project) / "deployment.json"
    intermediate_path = GENERATED_DIR / f"{project}.intermediate.json"
    containers = []

    try:
        docker = docker_bin()
        result = run(
            [
                docker,
                "ps",
                "--filter",
                f"label=cyblocks.project={project}",
                "--format",
                "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Networks}}",
            ],
            capture=True,
            check=False,
        )
        for line in (result.stdout or "").splitlines():
            name_part, image, status, networks = (line.split("\t") + ["", "", "", ""])[:4]
            if name_part:
                containers.append(
                    {
                        "name": name_part,
                        "image": image,
                        "status": status,
                        "networks": networks,
                    }
                )
    except SystemExit:
        pass

    return {
        "project": project,
        "statePath": str(state_path),
        "state": load_json(state_path) if state_path.exists() else None,
        "intermediatePath": str(intermediate_path),
        "intermediate": load_json(intermediate_path) if intermediate_path.exists() else None,
        "containers": containers,
    }


def update_incalmo_api_key(payload: dict[str, Any]) -> dict[str, Any]:
    provider = slug(str(payload.get("provider") or "openai"))
    key_name = LLM_API_KEY_ENV_NAMES.get(provider)
    if not key_name:
        supported = ", ".join(sorted(LLM_API_KEY_ENV_NAMES))
        raise ValueError(f"Unsupported LLM provider {provider!r}; expected one of: {supported}.")

    api_key = str(payload.get("apiKey") or payload.get("key") or "").strip()
    if not api_key:
        raise ValueError("LLM API key is required.")
    if "\n" in api_key or "\r" in api_key:
        raise ValueError("LLM API key must be a single line.")

    incalmo_root = Path(payload.get("incalmoRoot") or DEFAULT_INCALMO_ROOT).expanduser()
    if not incalmo_root.exists():
        raise ValueError(f"Incalmo root does not exist: {incalmo_root}")
    env_path = incalmo_root / ".env"
    update_env_file(env_path, key_name, api_key)
    return {"keyName": key_name, "envPath": str(env_path), "incalmoRoot": str(incalmo_root)}


def update_env_file(path: Path, key: str, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = path.read_text().splitlines() if path.exists() else []
    escaped_value = value.replace("\\", "\\\\").replace('"', '\\"')
    next_line = f'{key}="{escaped_value}"'
    updated = False
    output = []
    for line in lines:
        if re.match(rf"^\s*{re.escape(key)}\s*=", line):
            output.append(next_line)
            updated = True
        else:
            output.append(line)
    if not updated:
        output.append(next_line)
    path.write_text("\n".join(output).rstrip() + "\n")


def incalmo_status(name: str, *, incalmo_root: Path | None = None) -> dict[str, Any]:
    project = slug(name or "incalmo-equifax")
    incalmo_root = (incalmo_root or DEFAULT_INCALMO_ROOT).expanduser()
    out_dir = GENERATED_DIR / f"{project}-compose"
    compose_path = out_dir / "compose.yml"
    config_path = out_dir / "incalmo.config.json"
    services: list[dict[str, Any]] = []
    docker_error = None

    if compose_path.exists():
        try:
            configure_docker_environment()
            compose_command = docker_compose_command()
            result = run(
                [
                    *compose_command,
                    "-p",
                    project,
                    "-f",
                    str(compose_path),
                    "ps",
                    "--format",
                    "json",
                ],
                capture=True,
                check=False,
            )
            if result.returncode == 0:
                services = parse_compose_ps(result.stdout or "")
            else:
                docker_error = (result.stdout or "").strip() or f"docker compose ps exited {result.returncode}"
        except SystemExit as exc:
            docker_error = str(exc)

    return {
        "project": project,
        "outDir": str(out_dir),
        "composePath": str(compose_path),
        "composeExists": compose_path.exists(),
        "configPath": str(config_path),
        "configExists": config_path.exists(),
        "services": services,
        "dockerError": docker_error,
        "c2": probe_c2(DEFAULT_C2_SERVER),
        "latestLog": latest_incalmo_log(incalmo_root),
    }


def docker_compose_command() -> list[str]:
    docker = docker_bin()
    result = run([docker, "compose", "version"], capture=True, check=False)
    if result.returncode == 0:
        return [docker, "compose"]

    standalone = shutil.which("docker-compose")
    if standalone:
        return [standalone]

    for candidate in ("/opt/homebrew/bin/docker-compose", "/usr/local/bin/docker-compose"):
        if Path(candidate).exists():
            return [candidate]

    return [docker, "compose"]


def parse_compose_ps(output: str) -> list[dict[str, Any]]:
    text = output.strip()
    if not text:
        return []
    records: list[Any] = []
    try:
        parsed = json.loads(text)
        records = parsed if isinstance(parsed, list) else [parsed]
    except json.JSONDecodeError:
        for line in text.splitlines():
            if not line.strip():
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                records.append({"Name": line.strip(), "Status": line.strip()})

    services = []
    for record in records:
        if not isinstance(record, dict):
            continue
        services.append(
            {
                "name": record.get("Name") or record.get("name") or "",
                "service": record.get("Service") or record.get("service") or "",
                "state": record.get("State") or record.get("state") or "",
                "status": record.get("Status") or record.get("status") or "",
                "publishers": record.get("Publishers") or record.get("publishers") or [],
            }
        )
    return services


def probe_c2(url: str) -> dict[str, Any]:
    try:
        with urllib_request.urlopen(url, timeout=1.0) as response:
            return {"url": url, "reachable": True, "status": response.status}
    except urllib_error.HTTPError as exc:
        return {"url": url, "reachable": True, "status": exc.code}
    except Exception as exc:
        return {"url": url, "reachable": False, "error": str(exc)}


def latest_incalmo_log(incalmo_root: Path) -> dict[str, Any] | None:
    output_dir = incalmo_root / "output"
    if not output_dir.exists():
        return None
    candidates = [
        path
        for path in output_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in {".log", ".txt", ".json"}
    ]
    if not candidates:
        return None
    latest = max(candidates, key=lambda path: path.stat().st_mtime)
    lines = latest.read_text(errors="replace").splitlines()
    tail = "\n".join(lines[-80:])
    if len(tail) > 12000:
        tail = tail[-12000:]
    return {
        "path": str(latest),
        "updatedAt": latest.stat().st_mtime,
        "lineCount": len(lines),
        "tail": tail,
    }


def listening_pids(port: int) -> list[int]:
    pids: set[int] = set()
    lsof = shutil.which("lsof")
    if lsof:
        result = subprocess.run(
            [lsof, f"-tiTCP:{port}", "-sTCP:LISTEN"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        pids.update(int(line) for line in result.stdout.splitlines() if line.strip().isdigit())

    fuser = shutil.which("fuser")
    if fuser and not pids:
        result = subprocess.run(
            [fuser, "-n", "tcp", str(port)],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        pids.update(int(match) for match in re.findall(r"\b\d+\b", result.stdout or ""))

    if not pids:
        pids.update(linux_proc_listening_pids(port))

    return sorted(pids)


def linux_proc_listening_pids(port: int) -> set[int]:
    socket_inodes: set[str] = set()
    for table in (Path("/proc/net/tcp"), Path("/proc/net/tcp6")):
        if not table.exists():
            continue
        for line in table.read_text(errors="ignore").splitlines()[1:]:
            parts = line.split()
            if len(parts) < 10 or parts[3] != "0A":
                continue
            _, raw_port = parts[1].rsplit(":", 1)
            if int(raw_port, 16) == port:
                socket_inodes.add(parts[9])

    pids: set[int] = set()
    if not socket_inodes:
        return pids

    for proc_dir in Path("/proc").iterdir():
        if not proc_dir.name.isdigit():
            continue
        fd_dir = proc_dir / "fd"
        try:
            fds = list(fd_dir.iterdir())
        except (FileNotFoundError, PermissionError):
            continue
        for fd in fds:
            try:
                target = os.readlink(fd)
            except (FileNotFoundError, OSError, PermissionError):
                continue
            match = re.fullmatch(r"socket:\[(\d+)\]", target)
            if match and match.group(1) in socket_inodes:
                pids.add(int(proc_dir.name))
                break
    return pids


def stop_pids(pids: list[int], *, exclude: set[int] | None = None) -> list[int]:
    exclude = exclude or set()
    stopped = []
    for pid in pids:
        if pid in exclude:
            continue
        try:
            os.kill(pid, signal.SIGTERM)
            stopped.append(pid)
        except ProcessLookupError:
            continue
    return stopped


def schedule_quit(server: ThreadingHTTPServer, *, frontend_port: int = DEFAULT_FRONTEND_PORT) -> list[int]:
    frontend_pids = listening_pids(frontend_port)

    def shutdown() -> None:
        time.sleep(0.25)
        stop_pids(frontend_pids, exclude={os.getpid()})
        server.shutdown()

    threading.Thread(target=shutdown, daemon=True).start()
    return frontend_pids


def current_docker_context() -> str:
    try:
        docker = docker_bin()
    except SystemExit:
        docker = shutil.which("docker")
    if not docker:
        return ""

    result = subprocess.run(
        [docker, "context", "show"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    if result.returncode != 0:
        return ""
    return (result.stdout or "").strip()


def apple_virtualization_pids() -> list[int]:
    if platform.system().lower() != "darwin":
        return []

    pgrep = shutil.which("pgrep")
    if not pgrep:
        return []

    result = subprocess.run(
        [pgrep, "-f", "com.apple.Virtualization.VirtualMachine"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    pids = []
    for line in (result.stdout or "").splitlines():
        value = line.strip()
        if value.isdigit():
            pids.append(int(value))
    return sorted(set(pids))


def stop_colima_docker_vm() -> dict[str, Any]:
    result: dict[str, Any] = {
        "backend": "colima",
        "attempted": False,
        "stopped": False,
        "message": "",
        "virtualizationPidsBefore": apple_virtualization_pids(),
        "virtualizationPidsAfter": [],
    }

    if platform.system().lower() != "darwin":
        result["message"] = "Docker VM shutdown is only needed on macOS Colima deployments."
        result["virtualizationPidsAfter"] = result["virtualizationPidsBefore"]
        return result

    colima = shutil.which("colima")
    if not colima:
        result["message"] = "Colima command not found; no Apple Virtualization VM stop attempted."
        result["virtualizationPidsAfter"] = apple_virtualization_pids()
        return result

    docker_context = current_docker_context()
    docker_host = os.environ.get("DOCKER_HOST", "")
    uses_colima = docker_context == "colima" or ".colima" in docker_host
    result["dockerContext"] = docker_context
    result["dockerHost"] = docker_host

    if not uses_colima:
        result["message"] = f"Docker context is {docker_context or 'unknown'}; no Colima VM stop attempted."
        result["virtualizationPidsAfter"] = apple_virtualization_pids()
        return result

    status = subprocess.run(
        [colima, "status"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    status_output = (status.stdout or "").strip()
    result["statusOutput"] = status_output[-4000:]
    if status.returncode != 0 and "not running" in status_output.lower():
        result["stopped"] = True
        result["message"] = "Colima is already stopped."
        result["virtualizationPidsAfter"] = apple_virtualization_pids()
        return result

    stop = subprocess.run(
        [colima, "stop"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    output = (stop.stdout or "").strip()
    result.update(
        {
            "attempted": True,
            "returnCode": stop.returncode,
            "output": output[-4000:],
            "stopped": stop.returncode == 0,
            "virtualizationPidsAfter": apple_virtualization_pids(),
        }
    )
    if stop.returncode == 0:
        result["message"] = "Colima VM stopped."
    else:
        result["message"] = output or f"colima stop exited with status {stop.returncode}."
    return result


def cleanup_before_quit() -> dict[str, Any]:
    try:
        configure_docker_environment()
        cleanup = teardown_all_cyblocks(docker_bin())
    except SystemExit as exc:
        cleanup = {
            "project": "all",
            "statePaths": [],
            "removedContainers": [],
            "removedNetworks": [],
            "error": str(exc),
        }
    except Exception as exc:
        cleanup = {
            "project": "all",
            "statePaths": [],
            "removedContainers": [],
            "removedNetworks": [],
            "error": str(exc),
        }
    cleanup["dockerVm"] = stop_colima_docker_vm()
    return cleanup


class ApiHandler(BaseHTTPRequestHandler):
    server_version = "CyblocksBackend/0.1"

    def do_OPTIONS(self) -> None:
        self.send_json({"ok": True})

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self.send_json({"ok": True})
            return

        if parsed.path == "/api/status":
            query = parse_qs(parsed.query)
            name = query.get("name", ["cyblocks-board"])[0]
            self.send_json({"ok": True, "status": deployment_status(name)})
            return

        if parsed.path == "/api/incalmo/status":
            query = parse_qs(parsed.query)
            name = query.get("name", ["incalmo-equifax"])[0]
            root_value = query.get("incalmoRoot", [None])[0]
            root = Path(root_value).expanduser() if root_value else None
            self.send_json({"ok": True, "status": incalmo_status(name, incalmo_root=root)})
            return

        self.send_json({"ok": False, "error": "Not found"}, status=404)

    def do_POST(self) -> None:
        try:
            payload = self.read_payload()
            if self.path == "/api/incalmo/api-key":
                result = update_incalmo_api_key(payload)
                self.send_json({"ok": True, "result": result})
                return

            source = payload.get("graph", payload)
            if not isinstance(source, dict):
                raise ValueError("Request body must contain a graph object.")

            if self.path == "/api/compile":
                result = compile_source(source)
                self.send_json({"ok": True, "result": result})
                return

            if self.path == "/api/export/incalmo":
                result = export_incalmo_source(source, payload.get("incalmo") if isinstance(payload.get("incalmo"), dict) else {})
                self.send_json({"ok": True, "result": result})
                return

            if self.path == "/api/deploy":
                configure_docker_environment()
                result = compile_source(source)
                state = deploy(
                    result["intermediate"],
                    docker=docker_bin(),
                    replace=True,
                    project_override=result["name"],
                )
                self.send_json({"ok": True, "result": result, "deployment": state})
                return

            if self.path == "/api/teardown":
                configure_docker_environment()
                result = compile_source(source)
                state = teardown(
                    result["intermediate"],
                    docker=docker_bin(),
                    project_override=result["name"],
                )
                self.send_json({"ok": True, "result": result, "teardown": state})
                return

            if self.path == "/api/quit":
                cleanup = cleanup_before_quit()
                frontend_pids = schedule_quit(self.server)
                self.send_json(
                    {
                        "ok": True,
                        "message": "Stopping frontend and backend.",
                        "cleanup": cleanup,
                        "frontendPort": DEFAULT_FRONTEND_PORT,
                        "frontendPids": frontend_pids,
                    }
                )
                return

            self.send_json({"ok": False, "error": "Not found"}, status=404)
        except SystemExit as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=500)
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=500)

    def read_payload(self) -> dict[str, Any]:
        content_length = int(self.headers.get("content-length") or 0)
        if content_length <= 0:
            return {}
        raw = self.rfile.read(content_length)
        return json.loads(raw.decode("utf-8"))

    def send_json(self, data: dict[str, Any], *, status: int = 200) -> None:
        encoded = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the local Cyblocks compile/deploy API.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    configure_docker_environment()
    server = ThreadingHTTPServer((args.host, args.port), ApiHandler)
    print(f"Cyblocks backend API listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
