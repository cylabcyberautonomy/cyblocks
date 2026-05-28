#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from backend_common import docker_image_from_os_path, load_json, slug, write_json


def require_host(block: dict[str, Any]) -> dict[str, Any]:
    host = block.get("host")
    if not isinstance(host, dict):
        raise ValueError(f"Block {block.get('id')!r} is missing host attributes.")
    return host


def compile_ide_graph(source: dict[str, Any], *, name: str | None = None) -> dict[str, Any]:
    blocks = source.get("blocks")
    connections = source.get("connections", [])
    if not isinstance(blocks, list):
        raise ValueError("IDE graph must contain a blocks array.")
    if not isinstance(connections, list):
        raise ValueError("IDE graph connections must be an array.")

    env_name = slug(name or source.get("name") or "cyblocks-three-host-http")
    hosts = []
    known_ids = set()
    known_hostnames = set()

    for index, block in enumerate(blocks):
        block_id = str(block.get("id") or f"host-{index + 1}")
        if block_id in known_ids:
            raise ValueError(f"Duplicate block id {block_id!r}.")
        host = require_host(block)
        hostname = slug(str(host.get("hostname") or block_id))
        if hostname in known_hostnames:
            raise ValueError(f"Duplicate hostname {hostname!r}.")
        os_image_path = str(host.get("osImagePath") or "docker://nginx:alpine")
        ram_gb = int(host.get("ramGb") or 1)
        storage_gb = int(host.get("storageGb") or 8)
        if ram_gb < 1:
            raise ValueError(f"Host {hostname}: ramGb must be at least 1.")
        if storage_gb < 1:
            raise ValueError(f"Host {hostname}: storageGb must be at least 1.")
        external_drives = host.get("externalDrives") or []
        if not isinstance(external_drives, list):
            raise ValueError(f"Host {hostname}: externalDrives must be a list.")

        known_ids.add(block_id)
        known_hostnames.add(hostname)
        hosts.append(
            {
                "id": block_id,
                "hostname": hostname,
                "osImagePath": os_image_path,
                "dockerImage": docker_image_from_os_path(os_image_path),
                "ramGb": ram_gb,
                "storageGb": storage_gb,
                "externalDrives": external_drives,
                "position": block.get("position", {}),
            }
        )

    compiled_connections = []
    for index, connection in enumerate(connections):
        from_id = str(connection.get("from") or "")
        to_id = str(connection.get("to") or "")
        if from_id not in known_ids or to_id not in known_ids:
            raise ValueError(f"Connection {connection.get('id') or index}: unknown endpoint.")
        port = int(connection.get("port") or 80)
        if port < 1 or port > 65535:
            raise ValueError(f"Connection {connection.get('id') or index}: port must be 1-65535.")
        compiled_connections.append(
            {
                "id": str(connection.get("id") or f"connection-{index + 1}"),
                "label": str(connection.get("label") or "http"),
                "from": from_id,
                "to": to_id,
                "protocol": "tcp",
                "port": port,
            }
        )

    return {
        "kind": "cyblocks.intermediate.environment",
        "version": 1,
        "name": env_name,
        "sourceKind": source.get("kind", "block-board"),
        "deployment": {
            "target": "docker",
            "project": env_name,
        },
        "networks": [
            {
                "id": "default",
                "name": f"{env_name}-net",
                "driver": "bridge",
            }
        ],
        "hosts": hosts,
        "connections": compiled_connections,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Compile a Cyblocks IDE graph into an intermediate environment DSL.")
    parser.add_argument("input", type=Path, help="IDE graph JSON from the webpage")
    parser.add_argument("--out", type=Path, required=True, help="Intermediate DSL output path")
    parser.add_argument("--name", help="Override environment name")
    args = parser.parse_args()

    compiled = compile_ide_graph(load_json(args.input), name=args.name)
    write_json(args.out, compiled)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
