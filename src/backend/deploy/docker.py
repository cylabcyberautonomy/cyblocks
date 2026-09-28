import argparse
import ipaddress
import shlex
from pathlib import Path
from typing import Any

from backend import common
from . import boot

def apply_routes(docker: str, project: str, log: Path) -> None:
    # Sets each routed host's DEFAULT route to its router (the routing milestone). Reads the
    # routes.json the compiler emits -- rows of:
    #   {"host": <container>, "via": <router ip on host's subnet>, "to": "default"}
    # Runs AFTER `compose up` (the host containers must exist before we can exec into them).
    # PREREQ: each host image needs NET_ADMIN (done) + the `ip` binary / iproute2 (compiler TODO),
    # or the exec fails "executable not found".

    # Step 1: locate routes.json; bail if absent (no routers -> compiler emits no file).
    #   FIX: common.load_json (there is no read_json). Guard existence BEFORE reading:
    #     path = common.build_dir(project) / "routes.json"
    #     if not path.exists(): return
    #     routes = common.load_json(path)["routes"]
    path = common.build_dir(project) / "routes.json"
    if not path.exists():
        log.write_text(log.read_text() + "\nNo routes.json found; skipping route application.")
        return
    routes = common.load_json(path)["routes"]

    # Step 2: nothing to do if the list is empty.
    if not routes:
        log.write_text(log.read_text() + "\nNo routes to apply.")
        return

    # Step 3: for each row, replace the host's default route so off-subnet traffic goes to the
    #   router. ONE `docker exec` per row; build_routes already deduped to one row per host.
    #
    #   The command, expanded:
    #     docker exec <route["host"]>              -- runs in THAT host container's net namespace
    #       ip route replace <route["to"]> via <route["via"]>
    #     with to == "default" and via == the router's IP on the host's subnet, this is literally:
    #       ip route replace default via 172.20.0.254
    #
    #   What it does inside the host:
    #     - overwrites the host's existing default route (Docker set it to the bridge .1) and
    #       points the default at the router instead. `replace` adds-or-updates, so it's
    #       idempotent -- safe to re-run every deploy (unlike `add`, which errors "File exists").
    #     - the CONNECTED route for the host's own subnet is left intact, so same-subnet traffic
    #       still goes direct via L2/ARP. ONLY off-subnet traffic is redirected to the router.
    #
    #   CONSEQUENCE (egress): the default now also captures internet-bound traffic, so the router
    #     must MASQUERADE/NAT for outbound or the host loses internet (the egress caveat from
    #     build_routes). If you switch to the per-cidr variant, `to` is a subnet cidr and the
    #     default stays on the bridge -- no NAT needed, but no single catch-all either.
    #
    #   ERROR HANDLING (decide): if a host lacks the `ip` binary (iproute2 missing) the exec
    #     fails. common.run defaults to check=True -> it raises and aborts the whole deploy on the
    #     first bad host. Pass check=False to log-and-continue so one broken host doesn't sink the
    #     rest. Recommend check=True once the compiler installs iproute2 (fail loud on real
    #     misconfig); use check=False only as a temporary tolerance while that lands.
    #
    #   ORDERING: the container must be running before exec -- guaranteed because deploy() calls
    #     this AFTER `compose up -d` (which creates + starts every service).
    #
    #   VERIFY after deploy:  docker exec <host> ip route   -> should show `default via <via>`,
    #     and from the host:  ping a host on another subnet should now traverse the router.
    for route in routes:
        cmd = [docker, "exec", route["host"], "ip", "route", "replace", route["to"], "via", route["via"]]
        # check=False: a host that isn't running / lacks `ip` logs the failure but doesn't sink the
        # whole deploy (the rest of the stack stays up). Inspect deploy.log if routing misbehaves.
        common.run(cmd, log_path=log, check=False)

def deploy(environment: dict[str, Any], *, docker: str, project_override: str | None) -> dict[str, Any]:
    # Step 1: resolve project + artifact.
    #   FIX: use `environment` (the param), not `env`. Raise if compose_path is missing
    #   (compile step hasn't run yet).
    project      = common.project_name_from_ide_dict(environment)
    compose_path = common.build_dir(project) / "docker-compose.yaml"   # must exist
    if not compose_path.exists():
        raise RuntimeError(f"Compose file not found at {compose_path}. Please run the compile step first.")

    # Step 2: per-run log dir + Docker readiness.
    #   ADD before this line:
    #     env_run_dir = common.run_dir(project); env_run_dir.mkdir(parents=True, exist_ok=True)
    #     log = env_run_dir / "deploy.log"; log.write_text("")
    #   FIX: qualify common.ensure_docker_ready(...) -- it returns the resolved docker bin,
    #   so:  docker = common.ensure_docker_ready(docker, log)
    env_run_dir = common.run_dir(project)
    env_run_dir.mkdir(parents=True, exist_ok=True)
    log = env_run_dir / "deploy.log"
    log.write_text("")
    # Boot the Docker backend (Colima on macOS / native daemon on Linux) if it isn't already up, so
    # "Run Environment" works without a manual start. Dispatched by OS in docker_boot. Must run
    # BEFORE ensure_docker_ready, which needs the socket to exist + the daemon to answer.
    boot.ensure_docker_backend_running(log)
    docker = common.ensure_docker_ready(docker, log)

    # Step 3: bring the stack up. Compose creates the networks (IPAM), builds the host images
    #   from dockerfiles/<slug>/, and starts each container with its caps/sysctls/mem/ports/IP.
    #   FIX: common.run([...], log_path=log).  (compose uses the file's top-level `name:` as the
    #   project namespace, so -p is optional.)
    common.run([docker, "compose", "-f", compose_path, "up", "-d", "--build", "--remove-orphans"], log_path=log)

    # Step 4: (DEFERRED -- routing milestone) host iptables FORWARD rules, which compose can't do.
    #   For each compose network: id = `docker network inspect -f '{{.Id}}' <name>`;
    #   iface = common.bridge_interface_name(id); then ensure_host_bridge_forwarding(ifaces).
    #   REMOVE: `build_network_plan` + the duplicate ensure_docker_ready are leftovers from the
    #   old imperative path -- they don't belong here.
        # --- IGNORE ---
        # network_plan = build_network_plan(env)
        # bridge_ifaces = [common.bridge_interface_name(network["id"]) for network in network_plan["networks"]]
        # ensure_host_bridge_forwarding(docker, bridge_ifaces, log)
    apply_routes(docker, project, log)


    # Step 5: persist state for the API / teardown.
    #   FIX: build the state dict and qualify common.write_json / common.run_dir, e.g.
    #     state = {"project": project, "compose": str(compose_path), "log": str(log)}
    #     common.write_json(env_run_dir / "deployment.json", state)
    #     return state
    state = {"project": project, "compose": str(compose_path), "log": str(log)}

    common.write_json(env_run_dir / "deployment.json", state)
    return state


if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) < 2:
        raise SystemExit("usage: python3 -m backend.deploy.docker <env.json>  (run the compile step first)")
    env = common.load_json(Path(sys.argv[1]))
    state = deploy(env, docker=common.docker_bin(), project_override=None)
    print(json.dumps(state, indent=2))
