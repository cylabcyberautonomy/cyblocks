import json
import os
import platform
import subprocess
import common
from pathlib import Path
from typing import Any
REPO_ROOT = common.REPO_ROOT

def extract_networks(IDE_dict: dict[str, Any]) -> list[Any]:
    networks = []
    for i in IDE_dict['nodes']:
        if i["type"] == "subnet":
            network = {
                "name": i["data"]["name"],
                "cidr": i["data"]["cidr"],
                "subnet-id": i["id"]
            }
            networks.append(network)
    return networks

def extract_containers(IDE_dict: dict[str, Any], networks: list[Any]) -> list[dict[str, Any]]:
    containers = []
    for i in IDE_dict['nodes']:
        if i["type"] == "router":
            container = {
                "name": i["data"]["name"],
                "image": i["data"]["image"],
                "capabilities": ["NET_ADMIN"],
                "sysctls": { "net.ipv4.ip_forward": "1" },
                "networks": []
            }
            for e in IDE_dict['edges']:
                # add subnets
                if e["target"] == i["id"] and e["source"] in [n["id"] for n in networks]:
                    container['networks'].append({"name":e["source"]})

            containers.append(container)
        elif i["type"] == "host":
            container = {
                "name": i["data"]["name"],
                "image": i["data"]["image"],
                "memoryMb": i["data"]["ramGb"] * 1024,
                "networks": [],
                "publishPorts": []
            }
            for e in IDE_dict['edges']:
                # add subnets
                if e["target"] == i["id"] and e["source"] in [n["id"] for n in networks]:
                    container['networks'].append({"name":e["source"]})

            
            containers.append(container)
        

def compile_ide_graph(IDE_dict: dict[str, Any], *, name: str | None = None) -> dict[str, Any]:
    networks = extract_networks(IDE_dict)
    containers = extract_containers(IDE_dict, networks)
    published_ports = []
    services = []
    findings = []
    deployOrder = ["networks","containers","published_ports","findings","health"]
    health = []



def run_compile():

    pass

if __name__ == "__main__":
    run_compile()
