#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from backend_common import REPO_ROOT, load_json, slug, write_json
from compile_ide_to_intermediate import compile_ide_graph


DEFAULT_INCALMO_ROOT = REPO_ROOT.parent / "Incalmo"
DEFAULT_C2_SERVER = "http://localhost:8888"
DEFAULT_STRATEGY = "DefaultStrategy"
DEFAULT_ENVIRONMENT = "DefaultEnvironment"
DEFAULT_C2_PORTS = ["8888", "6379", "5678"]


def load_or_compile_environment(path: Path, *, name: str | None = None) -> tuple[dict[str, Any], dict[str, Any] | None]:
    source = load_json(path)
    if source.get("kind") == "cyblocks.intermediate.environment":
        return source, None
    if "hosts" in source and "networks" in source:
        return source, None
    compiled = compile_ide_graph(source, name=name)
    return compiled, source


def relative_path(path: Path, base: Path) -> str:
    path = path.resolve()
    base = base.resolve()
    try:
        return str(path.relative_to(base))
    except ValueError:
        return os.path.relpath(path, base)


def compose_key(value: str) -> str:
    normalized = slug(value).replace("-", "_")
    return normalized or "cyblocks"


def host_role(host: dict[str, Any]) -> str:
    incalmo = host.get("incalmo") if isinstance(host.get("incalmo"), dict) else {}
    role = str(incalmo.get("role") or "").strip().lower()
    if role:
        return role
    hostname = str(host.get("hostname") or "").lower()
    if hostname in {"attacker", "kali"}:
        return "attacker"
    if hostname in {"webserver", "web", "web-1"}:
        return "webserver"
    if hostname in {"db", "database", "db-1"}:
        return "database"
    return ""


def incalmo_environment_config(environment: dict[str, Any]) -> dict[str, Any]:
    value = environment.get("incalmo")
    return value if isinstance(value, dict) else {}


def network_compose_names(environment: dict[str, Any]) -> dict[str, str]:
    return {network["id"]: compose_key(network.get("name") or network["id"]) for network in environment.get("networks", [])}


def host_networks(host: dict[str, Any], network_names: dict[str, str]) -> dict[str, dict[str, str]]:
    attachments = {}
    for subnet_id in host.get("subnetIds", []):
        ip_address = (host.get("ipAddresses") or {}).get(subnet_id)
        network_name = network_names.get(subnet_id, compose_key(subnet_id))
        attachment: dict[str, str] = {}
        if ip_address:
            attachment["ipv4_address"] = ip_address
        attachments[network_name] = attachment
    return attachments


def service_ports_by_host(environment: dict[str, Any]) -> dict[str, list[int]]:
    ports_by_host: dict[str, set[int]] = {host["id"]: set() for host in environment.get("hosts", [])}
    for service in environment.get("services", []):
        port = service.get("port")
        if not port:
            continue
        for host_id in service.get("hostIds", []):
            ports_by_host.setdefault(host_id, set()).add(int(port))
    return {host_id: sorted(ports) for host_id, ports in ports_by_host.items()}


def build_compose(
    environment: dict[str, Any],
    *,
    out_dir: Path,
    incalmo_root: Path,
    c2_server: str,
    debug: bool,
) -> dict[str, Any]:
    network_names = network_compose_names(environment)
    ports_by_host = service_ports_by_host(environment)
    c2_ports = incalmo_c2_ports(environment)
    incalmo_root = incalmo_root.resolve()

    compose: dict[str, Any] = {
        "networks": {},
        "services": {},
        "volumes": {},
    }

    for network in environment.get("networks", []):
        compose["networks"][network_names[network["id"]]] = {
            "driver": network.get("driver") or "bridge",
            "ipam": {
                "config": [
                    {
                        "subnet": network["cidr"],
                    }
                ]
            },
        }

    attacker_found = False
    for host in sorted(environment.get("hosts", []), key=lambda item: item["hostname"]):
        role = host_role(host)
        if role == "attacker":
            attacker_found = True
            compose["services"][compose_key(host["hostname"])] = attacker_service(
                host,
                out_dir=out_dir,
                incalmo_root=incalmo_root,
                network_names=network_names,
                c2_server=c2_server,
                c2_ports=c2_ports,
                debug=debug,
            )
            compose["volumes"]["venv-volume"] = {}
            compose["volumes"]["frontend-ignore"] = {}
            continue

        compose["services"][compose_key(host["hostname"])] = target_service(
            host,
            out_dir=out_dir,
            incalmo_root=incalmo_root,
            network_names=network_names,
            ports=ports_by_host.get(host["id"], []),
        )

    if not attacker_found:
        raise SystemExit("Incalmo Compose export requires one host with incalmo.role='attacker'.")

    if not compose["volumes"]:
        compose.pop("volumes")

    return compose


def incalmo_c2_ports(environment: dict[str, Any]) -> list[str]:
    for control in environment.get("controlBlocks", []):
        if str(control.get("role") or "").lower() in {"c2", "c2-server", "command-and-control"}:
            ports = [str(port) for port in control.get("ports", []) if str(port).strip()]
            if ports:
                return ports
    return list(DEFAULT_C2_PORTS)


def attacker_service(
    host: dict[str, Any],
    *,
    out_dir: Path,
    incalmo_root: Path,
    network_names: dict[str, str],
    c2_server: str,
    c2_ports: list[str],
    debug: bool,
) -> dict[str, Any]:
    incalmo = host.get("incalmo") if isinstance(host.get("incalmo"), dict) else {}
    build_context = incalmo.get("buildContext") or "."
    context = Path(str(build_context))
    if not context.is_absolute():
        context = incalmo_root / context
    dockerfile = str(incalmo.get("dockerfile") or "docker/attacker/incalmo.Dockerfile")
    return {
        "build": {
            "context": relative_path(context, out_dir),
            "dockerfile": dockerfile,
        },
        "env_file": [relative_path(incalmo_root / ".env", out_dir)],
        "environment": [
            "SERVER_IP=localhost",
            "MODE=docker",
            f"DEBUG={'true' if debug else 'false'}",
        ],
        "volumes": [
            f"{relative_path(incalmo_root, out_dir)}:/incalmo",
            "frontend-ignore:/incalmo/incalmo/frontend",
            "venv-volume:/incalmo/.venv",
        ],
        "networks": host_networks(host, network_names),
        "ports": [f"127.0.0.1:{port}:{port}" for port in c2_ports],
    }


def target_service(
    host: dict[str, Any],
    *,
    out_dir: Path,
    incalmo_root: Path,
    network_names: dict[str, str],
    ports: list[int],
) -> dict[str, Any]:
    incalmo = host.get("incalmo") if isinstance(host.get("incalmo"), dict) else {}
    service: dict[str, Any] = {
        "restart": "always",
        "networks": host_networks(host, network_names),
    }

    container_name = incalmo.get("containerName")
    if container_name:
        service["container_name"] = str(container_name)

    build_context = incalmo.get("buildContext")
    dockerfile = incalmo.get("dockerfile")

    if build_context:
        context = Path(str(build_context))
        if not context.is_absolute():
            context = incalmo_root / context
        service["build"] = {"context": relative_path(context, out_dir)}
        if dockerfile:
            service["build"]["dockerfile"] = str(dockerfile)
    else:
        image = str(host.get("dockerImage") or "ubuntu:22.04")
        if image.startswith("incalmo://"):
            raise SystemExit(
                f"Host {host.get('hostname')!r} uses {image!r}; set host.incalmo.buildContext or use a docker:// image."
            )
        service["image"] = image

    published_ports = list(incalmo.get("publishedPorts") or [])
    if not published_ports and incalmo.get("publishServicePorts"):
        published_ports.extend(f"127.0.0.1:{port}:{port}" for port in ports if port)
    if published_ports:
        service["ports"] = [str(port) for port in published_ports]

    return service


def build_incalmo_config(
    environment: dict[str, Any],
    *,
    strategy: str,
    incalmo_environment: str,
    c2_server: str,
) -> dict[str, Any]:
    incalmo = incalmo_environment_config(environment)
    resolved_strategy = strategy or str(incalmo.get("strategy") or DEFAULT_STRATEGY)
    resolved_environment = incalmo_environment or str(incalmo.get("environment") or DEFAULT_ENVIRONMENT)
    resolved_c2_server = c2_server or str(incalmo.get("c2Server") or DEFAULT_C2_SERVER)
    attacker_ips = []
    for host in environment.get("hosts", []):
        if host_role(host) != "attacker":
            continue
        attacker_ips.extend((host.get("ipAddresses") or {}).values())

    return {
        "name": environment.get("name") or "cyblocks-incalmo",
        "strategy": {"name": resolved_strategy},
        "environment": resolved_environment,
        "c2c_server": resolved_c2_server,
        "blacklist_ips": sorted(set(attacker_ips)),
    }


def write_export_readme(
    out_dir: Path,
    *,
    compose_path: Path,
    config_path: Path,
    incalmo_root: Path,
    project: str,
) -> None:
    readme = f"""# Incalmo Compose Export

Generated from Cyblocks IDE/intermediate DSL.

## Files

- `compose.yml`: Docker Compose environment with Incalmo attacker plus generated target hosts/networks.
- `incalmo.config.json`: matching Incalmo runner config. Copy this to `{relative_path(incalmo_root / 'config' / 'config.json', out_dir)}` before running Incalmo.
- `intermediate.json`: compiled Cyblocks intermediate DSL used for the export.

## Runtime Metadata

Incalmo runtime controls are carried in `intermediate.json` as `controlBlocks[]`.
The `c2-server` control block determines the attacker ports published in `compose.yml`.
Runtime controls do not create target host/network blocks.

## Run

```bash
cd {incalmo_root}
cp {relative_path(config_path, incalmo_root)} config/config.json
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose -p {project} -f {relative_path(compose_path, incalmo_root)} up --build
```

In another terminal:

```bash
cd {incalmo_root}
docker compose -p {project} -f {relative_path(compose_path, incalmo_root)} exec attacker uv run main.py
```

## Cleanup

```bash
cd {incalmo_root}
docker compose -p {project} -f {relative_path(compose_path, incalmo_root)} down -v --remove-orphans
```
"""
    (out_dir / "README.md").write_text(readme)


def yaml_scalar(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return json.dumps(str(value))


def dump_yaml(value: Any, *, indent: int = 0) -> list[str]:
    prefix = " " * indent
    if isinstance(value, dict):
        lines = []
        for key, item in value.items():
            if isinstance(item, (dict, list)) and item:
                lines.append(f"{prefix}{key}:")
                lines.extend(dump_yaml(item, indent=indent + 2))
            elif item == {}:
                lines.append(f"{prefix}{key}:")
            elif item == []:
                lines.append(f"{prefix}{key}: []")
            else:
                lines.append(f"{prefix}{key}: {yaml_scalar(item)}")
        return lines
    if isinstance(value, list):
        lines = []
        for item in value:
            if isinstance(item, (dict, list)):
                lines.append(f"{prefix}-")
                lines.extend(dump_yaml(item, indent=indent + 2))
            else:
                lines.append(f"{prefix}- {yaml_scalar(item)}")
        return lines
    return [f"{prefix}{yaml_scalar(value)}"]


def write_yaml(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(dump_yaml(value)) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Cyblocks IDE/DSL JSON to an Incalmo Docker Compose project.")
    parser.add_argument("input", type=Path, help="Cyblocks IDE JSON or intermediate DSL JSON")
    parser.add_argument("--out-dir", type=Path, required=True, help="Directory for compose.yml and companion files")
    parser.add_argument("--incalmo-root", type=Path, default=DEFAULT_INCALMO_ROOT, help="Local Incalmo checkout")
    parser.add_argument("--name", help="Override environment/project name when compiling IDE JSON")
    parser.add_argument("--project", help="Docker Compose project name")
    parser.add_argument("--strategy", help="Incalmo strategy name for incalmo.config.json")
    parser.add_argument("--environment", help="Incalmo environment value for config")
    parser.add_argument("--c2-server", help="C2 server URL for config")
    parser.add_argument("--debug", action="store_true", help="Set DEBUG=true in attacker container")
    args = parser.parse_args()

    environment, source = load_or_compile_environment(args.input, name=args.name)
    project = slug(args.project or environment.get("name") or "cyblocks-incalmo")
    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    compose = build_compose(
        environment,
        out_dir=out_dir,
        incalmo_root=args.incalmo_root,
        c2_server=args.c2_server,
        debug=args.debug,
    )
    compose_path = out_dir / "compose.yml"
    config_path = out_dir / "incalmo.config.json"

    if source is not None:
        write_json(out_dir / "source.ide.json", source)
    write_json(out_dir / "intermediate.json", environment)
    write_yaml(compose_path, compose)
    write_json(
        config_path,
        build_incalmo_config(
            environment,
            strategy=args.strategy,
            incalmo_environment=args.environment,
            c2_server=args.c2_server,
        ),
    )
    write_export_readme(
        out_dir,
        compose_path=compose_path,
        config_path=config_path,
        incalmo_root=args.incalmo_root.resolve(),
        project=project,
    )

    print(f"Wrote {compose_path}")
    print(f"Wrote {config_path}")
    print(f"Compose project: {project}")


if __name__ == "__main__":
    main()
