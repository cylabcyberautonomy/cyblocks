import argparse
import ipaddress
import shlex
from pathlib import Path
from typing import Any

import common

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
    


    # Step 5: persist state for the API / teardown.
    #   FIX: build the state dict and qualify common.write_json / common.run_dir, e.g.
    #     state = {"project": project, "compose": str(compose_path), "log": str(log)}
    #     common.write_json(env_run_dir / "deployment.json", state)
    #     return state
    state = {"project": project, "compose": str(compose_path), "log": str(log)}

    common.write_json(env_run_dir / "deployment.json", state)
    return state
