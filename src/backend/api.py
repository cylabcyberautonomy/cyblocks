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

Run:  PYTHONPATH=src python3 -m backend.api     (listens on http://127.0.0.1:8000)
"""
import json
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from backend import common
from backend.attack.mapper import run_mapper
from backend.compiler.compose import build_compose
from backend.compiler.dsl import to_dsl
from backend.compiler.routes import build_routes
from backend.compiler.write import write_artifact
from backend.deploy import attacker, boot
from backend.deploy import docker as docker_deploy
from backend.library import services, vulnerabilities

import subprocess, threading, uuid #so we can run our attack right away from start experiment 
# we will run main.py as a child process 
# need unique id from uiud for each run 



import sys, os
_MAIN_PY = common.REPO_ROOT / "runs" / "attack" / "main.py"
_SRC     = common.REPO_ROOT / "src"
_jobs = {}#the memory of all our runs 
_jobs_lock = threading.Lock()#to prevent two thred from running at the same time 


HOST, PORT = "127.0.0.1", 8000


def _stream_attack(job_id: str) -> None:
    env = dict(os.environ, PYTHONUNBUFFERED="1", PYTHONPATH=str(_SRC))#rather than printing the output we copy the env and give it to the child process
    #we execute main.py here
    #we run the compiled runs/attack/main.py with src/ on PYTHONPATH but
    #[RUN]/[FOUND] lines arrive live instead of all at the end(arroives at our window)
    # stdin is piped so /attack-input can answer a Human(Reviewer) block's AWAITING INPUT prompt --
    # it has a timeout on its side, so an unanswered prompt still won't hang the run.
    proc = subprocess.Popen(
        [sys.executable, "-u", str(_MAIN_PY)],
        cwd=common.REPO_ROOT,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1, env=env,
    )
    with _jobs_lock:
        _jobs[job_id]["pid"] = proc.pid
        _jobs[job_id]["proc"] = proc
    for line in proc.stdout:                                # blocks per line until EOF
        with _jobs_lock:
            _jobs[job_id]["lines"].append(line.rstrip("\n"))
    proc.wait()
    with _jobs_lock:
        _jobs[job_id]["done"] = True
        _jobs[job_id]["returncode"] = proc.returncode


# --- pipeline wrappers (the API's actual work) -----------------------------
def do_compile(raw_env: dict) -> dict:
    # flat IDE export OR DSL -> nested DSL -> write build/ artifact. No Docker needed.
    dsl = to_dsl(raw_env)
    compose_dict, dockerfile_list = build_compose(dsl)
    routes = build_routes(dsl)
    build = write_artifact(dsl, compose_dict, dockerfile_list, routes)
    return {"project": common.project_name_from_ide_dict(dsl), "build": str(build), "dsl": dsl}

def do_compile_attack(attack: dict) -> dict:
    _MAIN_PY.parent.mkdir(parents=True, exist_ok=True)
    out = str(_MAIN_PY)
    run_mapper(out, out + ".pyimport", out + ".toolimport", attack)
    with open(out) as f:
        return {"project": attack.get("name", "attack"), "main_py": f.read()}

def do_deploy(raw_env: dict) -> dict:
    # Always compile first so build/ matches the request, then deploy (needs Docker).
    do_compile(raw_env)
    dsl = to_dsl(raw_env)
    return docker_deploy.deploy(dsl, docker=common.docker_bin(), project_override=None)


def do_deploy_attacker(raw_env: dict) -> dict:
    # Normalize to the canonical nested DSL first (same as do_deploy), so the attacker
    # reads the same shape the environment was deployed from.
    dsl = to_dsl(raw_env)
    return attacker.deploy_attacker(dsl, docker=common.docker_bin())

def do_quit_attacker(raw_env: dict) -> dict:
    dsl = to_dsl(raw_env)
    return attacker.quit_attacker(dsl, docker=common.docker_bin())
    
def do_quit(payload: dict) -> dict:
    # Accept {"project": "..."} or a full env; tear the project's stack down.
    project = payload["project"] if "project" in payload else common.project_name_from_ide_dict(to_dsl(payload))
    compose = common.build_dir(project) / "docker-compose.yaml"
    common.configure_docker_cli_environment()
    common.run([common.docker_bin(), "compose", "-f", str(compose), "down"], capture=True, check=False)
    return {"project": project, "status": "down"}

def do_run_attack(payload: dict) -> dict:
    # main.py must already be on disk (compile-attack writes it)
    # We just launch the attack from here 
    if not _MAIN_PY.exists():
        raise FileNotFoundError("no compiled main.py -- run compile-attack first")
    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _jobs[job_id] = {"lines": [], "done": False, "returncode": None, "pid": None, "proc": None}
    threading.Thread(target=_stream_attack, args=(job_id,), daemon=True).start()
    return {"job_id": job_id}

def do_attack_input(payload: dict) -> dict:
    # answers a Human(Reviewer) block's AWAITING INPUT prompt -- the frontend renders this as
    # continue/override/suggest buttons (override/suggest also carry free text from a text box)
    # and posts the clicked value here, which we write straight into the running attack's stdin
    # pipe as one JSON line so free text with spaces/punctuation survives intact. If nothing is
    # ever posted, Human._review's own timeout defaults to "continue" so the attack keeps going.
    job_id = payload["job_id"]
    value = str(payload.get("value", "")).strip()
    text = str(payload.get("text", "")).strip()
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            raise KeyError(f"unknown job {job_id}")
        proc = job.get("proc")
    if proc is None or proc.stdin is None or proc.poll() is not None:
        raise RuntimeError("attack process is not accepting input (already finished?)")
    proc.stdin.write(json.dumps({"decision": value, "text": text}) + "\n")
    proc.stdin.flush()
    return {"ok": True}

def do_attack_status(payload: dict) -> dict:
    #give back the only the lines past the cursor plus the new cursor 
    #so the frontend accumulates output instead of re-fetching the whole log each poll
    job_id = payload["job_id"]
    cursor = int(payload.get("cursor", 0))
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            raise KeyError(f"unknown job {job_id}")
        new = job["lines"][cursor:]
        return {"lines": new, "cursor": cursor + len(new),
                "done": job["done"], "returncode": job["returncode"]}





def do_end(payload: dict) -> dict:
    # "End Experiment": tear the stack down (compose down) AND stop the docker backend (Colima on
    # macOS / docker service on Linux). Deploy lazily restarts it next time. Tolerant of a missing
    # stack (e.g. nothing was deployed / backend never started) -- we still stop the backend.
    try:
        result = do_quit(payload)
    except Exception as exc:
        result = {"status": "down", "quit_error": str(exc)}
    boot.stop_docker_backend()
    result["backend"] = "stopped"
    return result


POST_ROUTES = {"/compile": do_compile, "/deploy": do_deploy, "/quit": do_quit, "/end": do_end, "/compile-attack": do_compile_attack,"/deploy-attacker": do_deploy_attacker, "/quit-attacker": do_quit_attacker, "/run-attack": do_run_attack, "/attack-status": do_attack_status, "/attack-input": do_attack_input }

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
            self._send(200, vulnerabilities.list_vulnerabilities())
        elif self.path == "/services":
            self._send(200, services.list_services())
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
