#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from backend_common import configure_docker_cli_environment, docker_bin, load_json, run, run_dir, slug, write_json
from compile_ide_to_intermediate import compile_ide_graph
from deploy_docker import deploy
from teardown_docker import teardown, teardown_all_cyblocks


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8787
DEFAULT_FRONTEND_PORT = 5173
GENERATED_DIR = Path(__file__).resolve().parents[1] / "generated"


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


def cleanup_before_quit() -> dict[str, Any]:
    try:
        configure_docker_environment()
        return teardown_all_cyblocks(docker_bin())
    except SystemExit as exc:
        return {
            "project": "all",
            "statePaths": [],
            "removedContainers": [],
            "removedNetworks": [],
            "error": str(exc),
        }
    except Exception as exc:
        return {
            "project": "all",
            "statePaths": [],
            "removedContainers": [],
            "removedNetworks": [],
            "error": str(exc),
        }


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

        self.send_json({"ok": False, "error": "Not found"}, status=404)

    def do_POST(self) -> None:
        try:
            payload = self.read_payload()
            source = payload.get("graph", payload)
            if not isinstance(source, dict):
                raise ValueError("Request body must contain a graph object.")

            if self.path == "/api/compile":
                result = compile_source(source)
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
