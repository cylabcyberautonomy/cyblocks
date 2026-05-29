#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from backend_common import DEFAULT_RUNS_DIR, docker_bin, load_json, run, run_dir, slug, write_json
from compile_ide_to_intermediate import compile_ide_graph
from deploy_docker import deploy


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8787
GENERATED_DIR = Path(__file__).resolve().parents[1] / "generated"


def configure_docker_environment() -> None:
    os.environ["PATH"] = f"/opt/homebrew/bin:/usr/local/bin:{os.environ.get('PATH', '')}"
    os.environ.setdefault("DOCKER_CONFIG", str(DEFAULT_RUNS_DIR / "docker-config"))

    docker_config = Path(os.environ["DOCKER_CONFIG"])
    docker_config.mkdir(parents=True, exist_ok=True)
    config_path = docker_config / "config.json"
    if not config_path.exists():
        config_path.write_text('{ "auths": {} }\n')

    if not os.environ.get("DOCKER_HOST") and not os.environ.get("DOCKER_CONTEXT"):
        os.environ["DOCKER_HOST"] = f"unix://{Path.home()}/.colima/default/docker.sock"


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
        "containers": containers,
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
    server.serve_forever()


if __name__ == "__main__":
    main()
