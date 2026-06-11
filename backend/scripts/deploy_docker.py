import argparse
import ipaddress
import shlex
from pathlib import Path
from typing import Any

import common



def ensure_host_bridge_forwarding(docker: str, bridge_interfaces: list[str], log_path: Path) -> bool:
    if not bridge_interfaces:
        return False
    for interface in bridge_interfaces:
        run(["sudo", "iptables", "-A", "FORWARD", "-i", interface, "-j", "ACCEPT"], log_path=log_path)
        run(["sudo", "iptables", "-A", "FORWARD", "-o", interface, "-j", "ACCEPT"], log_path=log_path)
    return True


def deploy(environment: dict[str, Any], *, docker: str, project_override: str | None) -> dict[str, Any]:
    project      = common.project_name_from_ide_dict(env)
    compose_path = common.build_dir(project) / "docker-compose.yaml"   # must exist
    ensure_docker_ready(docker, log)
    run([docker, "compose", "-f", compose_path, "up", "-d", "--build", "--remove-orphans"], log)


    network_plan = build_network_plan(environment, project)
    ensure_docker_ready(docker, log_path)
    write_json(run_dir(project)/"deployment.json", state)
