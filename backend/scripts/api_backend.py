"""
api_backend.py -- the HTTP API the frontend (IDE at http://localhost:5173) talks to.

The frontend never runs Python; it POSTs JSON here and the backend drives the
compile/deploy pipeline. Stdlib only -- no Flask needed.

API SPEC
  GET  /health
        -> 200 {"status": "ok"}

  GET  /vulnerabilities
        -> 200 [{"name","description","cve","severity"}, ...]   (the IDE vuln dropdown source)

  POST /compile        body: env JSON  (flat IDE "Export Environment"  OR  nested DSL)
        flat -> DSL -> build/ artifact (docker-compose.yaml + Dockerfiles + routes.json + dsl.json)
        -> 200 {"project": str, "build": "<path>", "dsl": {...}}

  POST /deploy         body: env JSON  (same shapes)        [requires Docker/Colima running]
        compiles (so build/ is current) then `docker compose up` + applies routes
        -> 200 {deployment state: "project","compose","log", ...}

  POST /quit           body: {"project": str}  OR  env JSON
        `docker compose ... down` for that project
        -> 200 {"project": str, "status": "down"}

  POST /end            body: {"project": str}  OR  env JSON   ("End Experiment")
        `docker compose ... down` AND stops the docker backend (Colima on macOS /
        docker service on Linux). Deploy lazily restarts it next time.
        -> 200 {"project": str, "status": "down", "backend": "stopped"}

  Any handler error -> 500 {"error": str, "traceback": str}.

Run:  python3 backend/scripts/api_backend.py     (listens on http://127.0.0.1:8000)
"""
import json
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import common
import deploy_docker
import docker_boot
import vulnerability_library
from dsl.compile_to_dsl import to_dsl
from compiler.routes import build_routes
from compiler.write import write_artifact
from IDE_compile_to_DockerFiles import build_compose

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "Attack"))
from mapper import run_mapper

HOST, PORT = "127.0.0.1", 8000


# --- pipeline wrappers (the API's actual work) -----------------------------
def do_compile(raw_env: dict) -> dict:
    # flat IDE export OR DSL -> nested DSL -> write build/ artifact. No Docker needed.
    dsl = to_dsl(raw_env)
    compose_dict, dockerfile_list = build_compose(dsl)
    routes = build_routes(dsl)
    build = write_artifact(dsl, compose_dict, dockerfile_list, routes)
    return {"project": common.project_name_from_ide_dict(dsl), "build": str(build), "dsl": dsl}


def do_compile_attack(attack: dict) -> dict:
    out = os.path.join(os.path.dirname(__file__), "..", "generated", "main.py")
    run_mapper(out, out + ".pyimport", out + ".toolimport", attack)
    with open(out) as f:
        return {"project": attack.get("name", "attack"), "main_py": f.read()}

        
def do_deploy(raw_env: dict) -> dict:
    # Always compile first so build/ matches the request, then deploy (needs Docker).
    do_compile(raw_env)
    dsl = to_dsl(raw_env)
    return deploy_docker.deploy(dsl, docker=common.docker_bin(), project_override=None)


def do_quit(payload: dict) -> dict:
    # Accept {"project": "..."} or a full env; tear the project's stack down.
    project = payload["project"] if "project" in payload else common.project_name_from_ide_dict(to_dsl(payload))
    compose = common.build_dir(project) / "docker-compose.yaml"
    common.configure_docker_cli_environment()
    common.run([common.docker_bin(), "compose", "-f", str(compose), "down"], capture=True, check=False)
    return {"project": project, "status": "down"}


def do_end(payload: dict) -> dict:
    # "End Experiment": tear the stack down (compose down) AND stop the docker backend (Colima on
    # macOS / docker service on Linux). Deploy lazily restarts it next time. Tolerant of a missing
    # stack (e.g. nothing was deployed / backend never started) -- we still stop the backend.
    try:
        result = do_quit(payload)
    except Exception as exc:
        result = {"status": "down", "quit_error": str(exc)}
    docker_boot.stop_docker_backend()
    result["backend"] = "stopped"
    return result


POST_ROUTES = {"/compile": do_compile, "/deploy": do_deploy, "/quit": do_quit, "/end": do_end, "/compile-attack": do_compile_attack}

# --- HTTP plumbing ---------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")          # dev: allow the Vite origin
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:                                    # CORS preflight
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send(200, {"status": "ok"})
        elif self.path == "/vulnerabilities":
            self._send(200, vulnerability_library.list_vulnerabilities())
        else:
            self._send(404, {"error": f"unknown endpoint {self.path}"})

    def do_POST(self) -> None:
        handler = POST_ROUTES.get(self.path)
        if handler is None:
            self._send(404, {"error": f"unknown endpoint {self.path}"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
            self._send(200, handler(payload))
        except Exception as exc:
            self._send(500, {"error": str(exc), "traceback": traceback.format_exc()})


if __name__ == "__main__":
    print(f"cyblocks api listening on http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
