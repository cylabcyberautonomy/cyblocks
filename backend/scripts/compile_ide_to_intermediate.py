#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import deque
from itertools import combinations
from pathlib import Path
from typing import Any

from backend_common import docker_image_from_os_path, load_json, slug, write_json

DEFAULT_ROUTER_IMAGE = "docker://alpine:latest"
DEFAULT_HOST_IMAGE = "docker://nginx:alpine"
DEFAULT_CONNECTION_PORT = 80


def require_host(block: dict[str, Any]) -> dict[str, Any]:
    host = block.get("host")
    if not isinstance(host, dict):
        raise ValueError(f"Block {block.get('id')!r} is missing host attributes.")
    return host


def block_kind(block: dict[str, Any]) -> str:
    explicit = str(block.get("kind") or block.get("nodeType") or "").lower()
    if explicit in {"host", "router", "service", "vulnerability", "misconfiguration"}:
        return explicit
    if isinstance(block.get("router"), dict) or str(block.get("type") or "").startswith("router"):
        return "router"
    if isinstance(block.get("service"), dict) or str(block.get("type") or "").startswith("service"):
        return "service"
    if str(block.get("type") or "").startswith("misconfig"):
        return "misconfiguration"
    if isinstance(block.get("vulnerability"), dict) or str(block.get("type") or "").startswith("vuln"):
        return "vulnerability"
    return "host"


def is_finding_kind(kind: str) -> bool:
    return kind in {"vulnerability", "misconfiguration"}


def block_position(block: dict[str, Any]) -> dict[str, int]:
    position = block.get("position")
    if isinstance(position, dict):
        return {key: int(position[key]) for key in ("x", "y") if key in position}
    return {key: int(block[key]) for key in ("x", "y") if key in block}


def require_router(block: dict[str, Any]) -> dict[str, Any]:
    router = block.get("router")
    return router if isinstance(router, dict) else {}


def require_service(block: dict[str, Any]) -> dict[str, Any]:
    service = block.get("service")
    return service if isinstance(service, dict) else {}


def require_vulnerability(block: dict[str, Any]) -> dict[str, Any]:
    vulnerability = block.get("vulnerability")
    return vulnerability if isinstance(vulnerability, dict) else {}


def parse_port(value: Any, *, connection_id: str) -> int:
    port = int(value or 80)
    if port < 1 or port > 65535:
        raise ValueError(f"Connection {connection_id}: port must be 1-65535.")
    return port


def parse_optional_port(value: Any, *, context: str) -> int | None:
    if value in {None, ""}:
        return None
    port = int(value)
    if port < 1 or port > 65535:
        raise ValueError(f"{context}: port must be 1-65535.")
    return port


def normalize_network_interfaces(value: Any, *, hostname: str) -> list[dict[str, str]]:
    if value is None or value == "":
        return []
    if not isinstance(value, list):
        raise ValueError(f"Host {hostname}: networkInterfaces must be a list.")

    interfaces = []
    for index, interface in enumerate(value):
        if not isinstance(interface, dict):
            raise ValueError(f"Host {hostname}: networkInterfaces[{index}] must be an object.")
        network_label = str(
            interface.get("networkName")
            or interface.get("network")
            or interface.get("networkId")
            or ""
        ).strip()
        network_id = slug(str(interface.get("networkId") or network_label))
        cidr = str(interface.get("cidr") or interface.get("subnet") or "").strip()
        ip_address = str(interface.get("ipAddress") or interface.get("ip") or "").strip()
        if not network_id:
            raise ValueError(f"Host {hostname}: networkInterfaces[{index}] is missing networkId.")
        if not cidr:
            raise ValueError(f"Host {hostname}: networkInterfaces[{index}] is missing cidr.")
        if not ip_address:
            raise ValueError(f"Host {hostname}: networkInterfaces[{index}] is missing ipAddress.")
        interfaces.append(
            {
                "networkId": network_id,
                "network": network_label or network_id,
                "cidr": cidr,
                "ipAddress": ip_address,
            }
        )
    return interfaces


def normalize_incalmo_config(host: dict[str, Any]) -> dict[str, Any]:
    source = host.get("incalmo") if isinstance(host.get("incalmo"), dict) else {}
    role = str(source.get("role") or host.get("incalmoRole") or host.get("role") or "").strip()
    container_name = str(source.get("containerName") or host.get("containerName") or "").strip()
    build_context = str(source.get("buildContext") or host.get("buildContext") or "").strip()
    dockerfile = str(source.get("dockerfile") or host.get("dockerfile") or "").strip()
    publish_service_ports = source.get("publishServicePorts", host.get("publishServicePorts", False))
    published_ports = source.get("publishedPorts", host.get("publishedPorts", []))
    if published_ports is None or published_ports == "":
        published_ports = []
    if not isinstance(published_ports, list):
        raise ValueError("Host incalmo.publishedPorts must be a list.")

    result: dict[str, Any] = {}
    if role:
        result["role"] = role
    if container_name:
        result["containerName"] = container_name
    if build_context:
        result["buildContext"] = build_context
    if dockerfile:
        result["dockerfile"] = dockerfile
    if isinstance(publish_service_ports, bool):
        result["publishServicePorts"] = publish_service_ports
    if published_ports:
        result["publishedPorts"] = [str(port) for port in published_ports]
    return result


def normalize_incalmo_environment_config(value: Any) -> dict[str, Any]:
    if value is None or value == "":
        return {}
    if not isinstance(value, dict):
        raise ValueError("IDE graph incalmo metadata must be an object.")

    result: dict[str, Any] = {}
    for source_key, target_key in (
        ("project", "project"),
        ("strategy", "strategy"),
        ("environment", "environment"),
        ("c2Server", "c2Server"),
    ):
        text = str(value.get(source_key) or "").strip()
        if text:
            result[target_key] = text

    if isinstance(value.get("debug"), bool):
        result["debug"] = value["debug"]

    return result


def normalize_control_blocks(value: Any) -> list[dict[str, Any]]:
    if value is None or value == "":
        return []
    if not isinstance(value, list):
        raise ValueError("IDE graph runtimeBlocks must be an array.")

    controls = []
    known_ids = set()
    for index, block in enumerate(value):
        if not isinstance(block, dict):
            raise ValueError(f"Runtime block {index}: expected object.")
        control = block.get("control") if isinstance(block.get("control"), dict) else {}
        block_id = slug(str(block.get("id") or control.get("id") or f"runtime-{index + 1}"))
        if block_id in known_ids:
            raise ValueError(f"Duplicate runtime block id {block_id!r}.")
        known_ids.add(block_id)

        ports = control.get("ports", [])
        if ports is None or ports == "":
            ports = []
        if not isinstance(ports, list):
            raise ValueError(f"Runtime block {block_id}: control.ports must be a list.")

        controls.append(
            {
                "id": block_id,
                "kind": str(block.get("kind") or "control"),
                "type": str(block.get("type") or control.get("type") or "runtime"),
                "label": str(block.get("label") or control.get("name") or block_id),
                "name": str(control.get("name") or block.get("label") or block_id),
                "role": str(control.get("role") or ""),
                "product": str(control.get("product") or ""),
                "protocol": str(control.get("protocol") or ""),
                "ports": [str(port) for port in ports],
                "hostId": str(control.get("hostId") or control.get("runtimeHostId") or ""),
                "summary": str(control.get("summary") or ""),
                "position": block_position(block),
            }
        )
    return controls


def normalize_playbooks(playbooks: Any) -> list[dict[str, Any]]:
    if playbooks is None or playbooks == "":
        return []
    if not isinstance(playbooks, list):
        raise ValueError("IDE graph playbooks must be an array.")

    normalized = []
    for index, playbook in enumerate(playbooks):
        if not isinstance(playbook, dict):
            raise ValueError(f"Playbook {index}: expected object.")
        name = str(playbook.get("name") or "").strip()
        if not name:
            raise ValueError(f"Playbook {index}: missing name.")
        args = playbook.get("args") or {}
        if not isinstance(args, dict):
            raise ValueError(f"Playbook {name}: args must be an object.")
        normalized.append({"name": name, "args": args})
    return normalized


def subnet_ip(index: int, member_index: int, *, role: str) -> str:
    host_octet = 2 + member_index if role == "router" else 10 + member_index
    return f"10.80.{index}.{host_octet}"


def compile_ide_graph(source: dict[str, Any], *, name: str | None = None) -> dict[str, Any]:
    blocks = source.get("blocks")
    connections = source.get("connections", [])
    if not isinstance(blocks, list):
        raise ValueError("IDE graph must contain a blocks array.")
    if not isinstance(connections, list):
        raise ValueError("IDE graph connections must be an array.")

    env_name = slug(name or source.get("name") or "cyblocks-three-host-http")
    playbooks = normalize_playbooks(source.get("playbooks", []))
    incalmo = normalize_incalmo_environment_config(source.get("incalmo", {}))
    hosts = []
    routers = []
    services = []
    vulnerabilities = []
    control_blocks = normalize_control_blocks(source.get("runtimeBlocks", []))
    host_by_id: dict[str, dict[str, Any]] = {}
    router_by_id: dict[str, dict[str, Any]] = {}
    service_by_id: dict[str, dict[str, Any]] = {}
    vulnerability_by_id: dict[str, dict[str, Any]] = {}
    node_kinds: dict[str, str] = {}
    known_ids = set()
    known_hostnames = set()
    known_router_names = set()
    known_service_names = set()
    known_vulnerability_ids = set()

    for index, block in enumerate(blocks):
        block_id = str(block.get("id") or f"host-{index + 1}")
        if block_id in known_ids:
            raise ValueError(f"Duplicate block id {block_id!r}.")
        known_ids.add(block_id)
        kind = block_kind(block)
        node_kinds[block_id] = kind

        if kind == "router":
            router = require_router(block)
            router_name = slug(str(router.get("name") or block.get("label") or block_id))
            if router_name in known_router_names:
                raise ValueError(f"Duplicate router name {router_name!r}.")
            image_path = str(router.get("imagePath") or router.get("osImagePath") or DEFAULT_ROUTER_IMAGE)
            item = {
                "id": block_id,
                "name": router_name,
                "imagePath": image_path,
                "dockerImage": docker_image_from_os_path(image_path),
                "interfaces": [],
                "subnetIds": [],
                "ipAddresses": {},
                "position": block_position(block),
            }
            known_router_names.add(router_name)
            router_by_id[block_id] = item
            routers.append(item)
            continue

        if kind == "service":
            service = require_service(block)
            service_name = slug(str(service.get("name") or block.get("label") or block_id))
            if service_name in known_service_names:
                raise ValueError(f"Duplicate service name {service_name!r}.")
            port = parse_optional_port(service.get("port"), context=f"Service {service_name}")
            item = {
                "id": block_id,
                "name": service_name,
                "product": str(service.get("product") or block.get("label") or service_name),
                "version": str(service.get("version") or ""),
                "protocol": str(service.get("protocol") or "tcp"),
                "port": port,
                "mhbenchVmType": str(service.get("mhbenchVmType") or service.get("vmType") or ""),
                "hostIds": [],
                "vulnerabilityIds": [],
                "position": block_position(block),
            }
            known_service_names.add(service_name)
            service_by_id[block_id] = item
            services.append(item)
            continue

        if is_finding_kind(kind):
            vulnerability = require_vulnerability(block)
            vulnerability_id = str(
                vulnerability.get("id")
                or vulnerability.get("cve")
                or vulnerability.get("vulnerabilityId")
                or block_id
            )
            if vulnerability_id in known_vulnerability_ids:
                raise ValueError(f"Duplicate vulnerability id {vulnerability_id!r}.")
            item = {
                "id": block_id,
                "kind": kind,
                "vulnerabilityId": vulnerability_id,
                "name": str(vulnerability.get("name") or block.get("label") or vulnerability_id),
                "category": str(vulnerability.get("category") or "cve"),
                "severity": str(vulnerability.get("severity") or "medium"),
                "summary": str(vulnerability.get("summary") or vulnerability.get("description") or ""),
                "source": str(vulnerability.get("source") or ""),
                "sourceHostId": str(vulnerability.get("sourceHostId") or ""),
                "playbooks": normalize_playbooks(vulnerability.get("playbooks", [])),
                "serviceIds": [],
                "hostIds": [],
                "position": block_position(block),
            }
            known_vulnerability_ids.add(vulnerability_id)
            vulnerability_by_id[block_id] = item
            vulnerabilities.append(item)
            continue

        host = require_host(block)
        hostname = slug(str(host.get("hostname") or block_id))
        if hostname in known_hostnames:
            raise ValueError(f"Duplicate hostname {hostname!r}.")
        os_image_path = str(host.get("osImagePath") or DEFAULT_HOST_IMAGE)
        ram_gb = int(host.get("ramGb") or 1)
        storage_gb = int(host.get("storageGb") or 8)
        if ram_gb < 1:
            raise ValueError(f"Host {hostname}: ramGb must be at least 1.")
        if storage_gb < 1:
            raise ValueError(f"Host {hostname}: storageGb must be at least 1.")
        external_drives = host.get("externalDrives") or []
        if not isinstance(external_drives, list):
            raise ValueError(f"Host {hostname}: externalDrives must be a list.")

        item = {
            "id": block_id,
            "hostname": hostname,
            "osImagePath": os_image_path,
            "dockerImage": docker_image_from_os_path(os_image_path),
            "ramGb": ram_gb,
            "storageGb": storage_gb,
            "vmType": str(host.get("vmType") or ""),
            "flavor": str(host.get("flavor") or ""),
            "externalDrives": external_drives,
            "networkInterfaces": normalize_network_interfaces(
                host.get("networkInterfaces") or host.get("interfaces"),
                hostname=hostname,
            ),
            "incalmo": normalize_incalmo_config(host),
            "subnetIds": [],
            "ipAddresses": {},
            "position": block_position(block),
        }
        known_hostnames.add(hostname)
        host_by_id[block_id] = item
        hosts.append(item)

    compiled_connections = []
    topology_edges = []
    service_checks = []
    service_hosts: dict[str, set[str]] = {service["id"]: set() for service in services}
    service_vulnerabilities: dict[str, set[str]] = {service["id"]: set() for service in services}
    access_sources: dict[str, set[str]] = {vulnerability["id"]: set() for vulnerability in vulnerabilities}
    for index, connection in enumerate(connections):
        from_id = str(connection.get("from") or "")
        to_id = str(connection.get("to") or "")
        if from_id not in known_ids or to_id not in known_ids:
            raise ValueError(f"Connection {connection.get('id') or index}: unknown endpoint.")
        connection_id = str(connection.get("id") or f"connection-{index + 1}")
        endpoint_kinds = {node_kinds[from_id], node_kinds[to_id]}
        connection_kind = str(connection.get("kind") or "").lower()
        if "router" in endpoint_kinds:
            connection_kind = "topology"
        elif connection_kind == "access":
            connection_kind = "access"
        elif any(is_finding_kind(kind) for kind in endpoint_kinds):
            connection_kind = "vulnerability"
        elif connection_kind not in {"service", "topology", "vulnerability", "access"}:
            connection_kind = "service"
        if connection_kind == "topology" and not endpoint_kinds <= {"host", "router"}:
            raise ValueError(f"Connection {connection_id}: topology links may only connect hosts and routers.")
        if connection_kind == "access" and not ("host" in endpoint_kinds and any(is_finding_kind(kind) for kind in endpoint_kinds)):
            raise ValueError(f"Connection {connection_id}: access links must connect one host and one finding.")
        if connection_kind == "access" and not (
            node_kinds[from_id] == "host" and is_finding_kind(node_kinds[to_id])
        ):
            raise ValueError(f"Connection {connection_id}: access links must point from host to finding.")

        compiled = {
            "id": connection_id,
            "kind": connection_kind,
            "label": str(
                connection.get("label")
                or (
                    "link"
                    if connection_kind == "topology"
                    else "exposes"
                    if connection_kind == "vulnerability"
                    else "access"
                    if connection_kind == "access"
                    else "service"
                )
            ),
            "from": from_id,
            "to": to_id,
            "endpointKinds": {
                "from": node_kinds[from_id],
                "to": node_kinds[to_id],
            },
            "protocol": "tcp",
            "directed": bool(connection.get("directed")) or connection_kind in {"service", "vulnerability", "access"},
        }
        if connection_kind == "service":
            service_endpoint = from_id if node_kinds[from_id] == "service" else to_id if node_kinds[to_id] == "service" else None
            port_value = connection.get("port")
            if port_value in {None, ""} and service_endpoint:
                port_value = service_by_id[service_endpoint].get("port")
            if port_value in {None, ""} and endpoint_kinds == {"host"}:
                port_value = DEFAULT_CONNECTION_PORT
            if port_value not in {None, ""}:
                compiled["port"] = parse_port(port_value, connection_id=connection_id)

        compiled_connections.append(compiled)
        if connection_kind == "topology":
            topology_edges.append(compiled)
        elif node_kinds[from_id] == "host" and node_kinds[to_id] == "host":
            service_checks.append(
                {
                    "id": connection_id,
                    "label": compiled["label"],
                    "from": from_id,
                    "to": to_id,
                    "protocol": "tcp",
                    "port": compiled["port"],
                    "generated": False,
                }
            )
        elif connection_kind == "service" and endpoint_kinds == {"host", "service"}:
            service_id = from_id if node_kinds[from_id] == "service" else to_id
            host_id = from_id if node_kinds[from_id] == "host" else to_id
            service_hosts.setdefault(service_id, set()).add(host_id)
        elif connection_kind == "vulnerability" and "service" in endpoint_kinds and any(is_finding_kind(kind) for kind in endpoint_kinds):
            service_id = from_id if node_kinds[from_id] == "service" else to_id
            vulnerability_id = from_id if is_finding_kind(node_kinds[from_id]) else to_id
            service_vulnerabilities.setdefault(service_id, set()).add(vulnerability_id)
        elif connection_kind == "access":
            access_sources.setdefault(to_id, set()).add(from_id)

    networks = build_subnets(env_name, hosts, routers, topology_edges, node_kinds)
    assign_addresses(networks, host_by_id, router_by_id, node_kinds)
    subnet_connections = build_subnet_connections(routers)
    routes = build_routes(networks, hosts, routers)
    service_findings, generated_playbooks = build_service_findings(
        services,
        vulnerabilities,
        service_hosts,
        service_vulnerabilities,
        host_by_id,
        service_by_id,
        vulnerability_by_id,
        access_sources,
    )
    all_playbooks = merge_playbooks([*playbooks, *generated_playbooks])

    if routers and not service_checks and len(hosts) > 1:
        for source, target in combinations(hosts, 2):
            service_checks.append(
                {
                    "id": f"{source['id']}-to-{target['id']}-http",
                    "label": "http",
                    "from": source["id"],
                    "to": target["id"],
                    "protocol": "tcp",
                    "port": 80,
                    "generated": True,
                }
            )

    return {
        "kind": "cyblocks.intermediate.environment",
        "version": 1,
        "name": env_name,
        "sourceKind": source.get("kind", "block-board"),
        "deployment": {
            "target": "docker",
            "project": incalmo.get("project") or env_name,
        },
        "incalmo": incalmo,
        "networks": networks,
        "hosts": hosts,
        "routers": routers,
        "services": services,
        "vulnerabilities": vulnerabilities,
        "controlBlocks": control_blocks,
        "serviceFindings": service_findings,
        "connections": compiled_connections,
        "subnetConnections": subnet_connections,
        "routes": routes,
        "serviceChecks": service_checks,
        "playbooks": all_playbooks,
        "mhbench": build_mhbench_projection(env_name, networks, hosts, subnet_connections, all_playbooks),
    }


def build_service_findings(
    services: list[dict[str, Any]],
    vulnerabilities: list[dict[str, Any]],
    service_hosts: dict[str, set[str]],
    service_vulnerabilities: dict[str, set[str]],
    host_by_id: dict[str, dict[str, Any]],
    service_by_id: dict[str, dict[str, Any]],
    vulnerability_by_id: dict[str, dict[str, Any]],
    access_sources: dict[str, set[str]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    for service in services:
        service["hostIds"] = sorted(service_hosts.get(service["id"], set()))
        service["vulnerabilityIds"] = sorted(service_vulnerabilities.get(service["id"], set()))

    vulnerability_service_ids: dict[str, set[str]] = {vulnerability["id"]: set() for vulnerability in vulnerabilities}
    vulnerability_host_ids: dict[str, set[str]] = {vulnerability["id"]: set() for vulnerability in vulnerabilities}
    findings = []
    generated_playbooks = []

    for service_id, vulnerability_ids in service_vulnerabilities.items():
        service = service_by_id.get(service_id)
        if not service:
            continue
        host_ids = sorted(service_hosts.get(service_id, set()))
        for vulnerability_id in sorted(vulnerability_ids):
            vulnerability = vulnerability_by_id.get(vulnerability_id)
            if not vulnerability:
                continue
            vulnerability_service_ids.setdefault(vulnerability_id, set()).add(service_id)
            for host_id in host_ids:
                host = host_by_id.get(host_id)
                if not host:
                    continue
                vulnerability_host_ids.setdefault(vulnerability_id, set()).add(host_id)
                source_host_id = first_access_source(access_sources.get(vulnerability_id, set()), host_id)
                playbooks = [
                    render_playbook_template(playbook, host, service, vulnerability, host_by_id, source_host_id)
                    for playbook in vulnerability.get("playbooks", [])
                ]
                generated_playbooks.extend(playbooks)
                findings.append(
                    {
                        "id": slug(f"{host_id}-{service_id}-{vulnerability_id}"),
                        "hostId": host_id,
                        "host": host["hostname"],
                        "serviceId": service_id,
                        "service": service["name"],
                        "product": service["product"],
                        "version": service["version"],
                        "protocol": service["protocol"],
                        "port": service.get("port"),
                        "vulnerabilityId": vulnerability_id,
                        "vulnerability": vulnerability["vulnerabilityId"],
                        "category": vulnerability["category"],
                        "severity": vulnerability["severity"],
                        "summary": vulnerability["summary"],
                        "source": vulnerability["source"],
                        "playbooks": playbooks,
                    }
                )

    for vulnerability in vulnerabilities:
        vulnerability["serviceIds"] = sorted(vulnerability_service_ids.get(vulnerability["id"], set()))
        vulnerability["hostIds"] = sorted(vulnerability_host_ids.get(vulnerability["id"], set()))
        vulnerability["sourceHostIds"] = sorted(access_sources.get(vulnerability["id"], set()))

    return findings, generated_playbooks


def first_access_source(source_ids: set[str], target_host_id: str) -> str | None:
    candidates = sorted(source_id for source_id in source_ids if source_id != target_host_id)
    return candidates[0] if candidates else None


def render_playbook_template(
    playbook: dict[str, Any],
    host: dict[str, Any],
    service: dict[str, Any],
    vulnerability: dict[str, Any],
    host_by_id: dict[str, dict[str, Any]],
    source_host_id: str | None = None,
) -> dict[str, Any]:
    source_host_id = source_host_id or vulnerability.get("sourceHostId")
    source_host = host_by_id.get(source_host_id) if source_host_id else None
    context = {
        "host": host["hostname"],
        "hostId": host["id"],
        "sourceHost": source_host["hostname"] if source_host else host["hostname"],
        "sourceHostId": source_host["id"] if source_host else host["id"],
        "service": service["name"],
        "serviceId": service["id"],
        "product": service["product"],
        "version": service["version"],
        "protocol": service["protocol"],
        "port": service.get("port"),
        "vulnerability": vulnerability["vulnerabilityId"],
        "vulnerabilityId": vulnerability["id"],
    }

    return {
        "name": playbook["name"],
        "args": render_template_value(playbook.get("args", {}), context),
    }


def render_template_value(value: Any, context: dict[str, Any]) -> Any:
    if isinstance(value, str):
        rendered = value
        for key, replacement in context.items():
            rendered = rendered.replace(f"${key}", str(replacement or ""))
            rendered = rendered.replace(f"${{{key}}}", str(replacement or ""))
        return rendered
    if isinstance(value, list):
        return [render_template_value(item, context) for item in value]
    if isinstance(value, dict):
        return {key: render_template_value(item, context) for key, item in value.items()}
    return value


def merge_playbooks(playbooks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged = []
    seen = set()
    for playbook in playbooks:
        key = json.dumps(playbook, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        merged.append(playbook)
    return merged


def build_subnets(
    env_name: str,
    hosts: list[dict[str, Any]],
    routers: list[dict[str, Any]],
    topology_edges: list[dict[str, Any]],
    node_kinds: dict[str, str],
) -> list[dict[str, Any]]:
    if any(host.get("networkInterfaces") for host in hosts):
        return build_explicit_host_subnets(hosts)

    if not routers:
        return [
            {
                "id": "default",
                "name": f"{env_name}-net",
                "driver": "bridge",
                "cidr": "10.80.0.0/24",
                "members": [{"id": host["id"], "kind": "host"} for host in hosts],
            }
        ]

    networks = []
    attached = set()
    for index, edge in enumerate(topology_edges):
        subnet_id = slug(f"subnet-{edge['id']}") or f"subnet-{index + 1}"
        member_ids = [edge["from"], edge["to"]]
        attached.update(member_ids)
        networks.append(
            {
                "id": subnet_id,
                "name": f"{env_name}-{subnet_id}",
                "driver": "bridge",
                "cidr": f"10.80.{index}.0/24",
                "sourceConnection": edge["id"],
                "members": [{"id": member_id, "kind": node_kinds[member_id]} for member_id in member_ids],
            }
        )

    isolated = [node for node in [*hosts, *routers] if node["id"] not in attached]
    for offset, node in enumerate(isolated, start=len(networks)):
        subnet_id = slug(f"subnet-{node['id']}")
        networks.append(
            {
                "id": subnet_id,
                "name": f"{env_name}-{subnet_id}",
                "driver": "bridge",
                "cidr": f"10.80.{offset}.0/24",
                "members": [{"id": node["id"], "kind": "router" if node in routers else "host"}],
            }
        )
    return networks


def build_explicit_host_subnets(hosts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    networks_by_id: dict[str, dict[str, Any]] = {}
    for host in hosts:
        interfaces = host.get("networkInterfaces") or []
        if not interfaces:
            raise ValueError(
                f"Host {host['hostname']}: every host needs networkInterfaces when any host uses explicit interfaces."
            )
        for interface in interfaces:
            network_id = interface["networkId"]
            network = networks_by_id.setdefault(
                network_id,
                {
                    "id": network_id,
                    "name": interface["network"],
                    "driver": "bridge",
                    "cidr": interface["cidr"],
                    "members": [],
                    "source": "host.networkInterfaces",
                },
            )
            if network["cidr"] != interface["cidr"]:
                raise ValueError(
                    f"Network {network_id}: conflicting CIDRs {network['cidr']} and {interface['cidr']}."
                )
            network["members"].append(
                {
                    "id": host["id"],
                    "kind": "host",
                    "ipAddress": interface["ipAddress"],
                }
            )
    return [networks_by_id[key] for key in sorted(networks_by_id)]


def assign_addresses(
    networks: list[dict[str, Any]],
    host_by_id: dict[str, dict[str, Any]],
    router_by_id: dict[str, dict[str, Any]],
    node_kinds: dict[str, str],
) -> None:
    for subnet_index, network in enumerate(networks):
        role_counts = {"router": 0, "host": 0}
        for member in network["members"]:
            role = node_kinds[member["id"]]
            ip_address = member.get("ipAddress") or subnet_ip(subnet_index, role_counts[role], role=role)
            role_counts[role] += 1
            member["ipAddress"] = ip_address
            if role == "router":
                router = router_by_id[member["id"]]
                router["subnetIds"].append(network["id"])
                router["ipAddresses"][network["id"]] = ip_address
                router["interfaces"].append(
                    {
                        "subnetId": network["id"],
                        "network": network["name"],
                        "cidr": network["cidr"],
                        "ipAddress": ip_address,
                    }
                )
            else:
                host = host_by_id[member["id"]]
                host["subnetIds"].append(network["id"])
                host["ipAddresses"][network["id"]] = ip_address

    for host in host_by_id.values():
        host["primarySubnet"] = host["subnetIds"][0] if host["subnetIds"] else None
    for router in router_by_id.values():
        router["primarySubnet"] = router["subnetIds"][0] if router["subnetIds"] else None


def build_subnet_connections(routers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    subnet_connections = []
    for router in routers:
        for left, right in combinations(router["interfaces"], 2):
            subnet_connections.append(
                {
                    "router": router["id"],
                    "fromSubnet": left["subnetId"],
                    "toSubnet": right["subnetId"],
                    "protocol": "any",
                    "bidirectional": True,
                }
            )
    return subnet_connections


def build_routes(
    networks: list[dict[str, Any]],
    hosts: list[dict[str, Any]],
    routers: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    networks_by_id = {network["id"]: network for network in networks}
    router_ids_by_subnet = {
        network["id"]: {member["id"] for member in network["members"] if member["kind"] == "router"}
        for network in networks
    }
    subnet_graph: dict[str, set[str]] = {network["id"]: set() for network in networks}
    router_by_id = {router["id"]: router for router in routers}
    for router in routers:
        for left, right in combinations(router["subnetIds"], 2):
            subnet_graph[left].add(right)
            subnet_graph[right].add(left)

    routes = []
    for node in [*hosts, *routers]:
        source_kind = "router" if node["id"] in router_by_id else "host"
        for target_subnet in networks_by_id:
            if target_subnet in node["subnetIds"]:
                continue
            path = shortest_subnet_path(subnet_graph, node["subnetIds"], target_subnet)
            if len(path) < 2:
                continue
            gateway = first_gateway(path, node["id"] if source_kind == "router" else None, router_ids_by_subnet)
            if not gateway:
                continue
            gateway_router, gateway_subnet = gateway
            via = router_by_id[gateway_router]["ipAddresses"][gateway_subnet]
            routes.append(
                {
                    "nodeId": node["id"],
                    "nodeKind": source_kind,
                    "toSubnet": target_subnet,
                    "toCidr": networks_by_id[target_subnet]["cidr"],
                    "via": via,
                }
            )
    return routes


def build_mhbench_projection(
    env_name: str,
    networks: list[dict[str, Any]],
    hosts: list[dict[str, Any]],
    subnet_connections: list[dict[str, Any]],
    playbooks: list[dict[str, Any]],
) -> dict[str, Any]:
    hosts_by_id = {host["id"]: host for host in hosts}
    subnets = []
    for network in networks:
        subnet_hosts = []
        for member in network.get("members", []):
            if member.get("kind") != "host":
                continue
            host = hosts_by_id[member["id"]]
            subnet_hosts.append(
                {
                    "name": host["hostname"],
                    "vm_type": host.get("vmType") or "docker_host",
                    "flavor": host.get("flavor") or f"{host['ramGb']}gb-{host['storageGb']}gb",
                    "ip_address": member.get("ipAddress"),
                }
            )
        subnets.append(
            {
                "name": network["id"],
                "cidr": network.get("cidr"),
                "dns_servers": ["8.8.8.8"],
                "hosts": subnet_hosts,
            }
        )

    return {
        "name": env_name,
        "networks": [
            {
                "name": f"{env_name}_network",
                "description": "Cyblocks intermediate projection for MHBench-style topology and playbooks.",
                "subnets": subnets,
            }
        ],
        "subnet_connections": [
            {
                "from_subnet": item["fromSubnet"],
                "to_subnet": item["toSubnet"],
                "protocol": None if item.get("protocol") == "any" else item.get("protocol"),
                "ports": item.get("ports"),
                "bidirectional": item.get("bidirectional", True),
            }
            for item in subnet_connections
        ],
        "playbooks": playbooks,
    }


def shortest_subnet_path(graph: dict[str, set[str]], starts: list[str], target: str) -> list[str]:
    queue = deque((start, [start]) for start in starts)
    seen = set(starts)
    while queue:
        current, path = queue.popleft()
        if current == target:
            return path
        for neighbor in sorted(graph.get(current, [])):
            if neighbor in seen:
                continue
            seen.add(neighbor)
            queue.append((neighbor, [*path, neighbor]))
    return []


def first_gateway(
    path: list[str],
    source_router_id: str | None,
    router_ids_by_subnet: dict[str, set[str]],
) -> tuple[str, str] | None:
    for left, right in zip(path, path[1:]):
        shared_routers = sorted(router_ids_by_subnet[left] & router_ids_by_subnet[right])
        if not shared_routers:
            continue
        router_id = shared_routers[0]
        if source_router_id and router_id == source_router_id:
            continue
        return router_id, left
    return None


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
