import json
import sys
from datetime import datetime

IMAGE_MAP = {
    "host-small":   "ubuntu_base",
    "host-medium":  "ubuntu_base",
    "host-large":   "ubuntu_base",
    "host-storage": "ubuntu_base",
    "host-custom":  "ubuntu_base",
    "webserver":    "webserver",
    "attacker":     "kali",
}

SUBNET_POOL = [
    "192.168.200.0/24",
    "192.168.201.0/24",
    "192.168.202.0/24",
    "192.168.203.0/24",
]

def cidr_to_base_ip(cidr):
    return cidr.split("/")[0].rsplit(".", 1)[0]

def compile(input_path, output_path):
    with open(input_path) as f:
        canvas = json.load(f)

    blocks = canvas.get("blocks", [])
    connections = canvas.get("connections", [])

    if not blocks:
        print("No blocks found in input.")
        sys.exit(1)

    subnet_cidr = SUBNET_POOL[0]
    base_ip = cidr_to_base_ip(subnet_cidr)

    hosts = []
    id_to_hostname = {}

    for i, block in enumerate(blocks):
        block_type = block.get("type", "host-small")
        host_info = block.get("host", {})
        hostname = host_info.get("hostname") or f"host_{i}"
        image = IMAGE_MAP.get(block_type, "ubuntu_base")
        ip = f"{base_ip}.{10 + i}"
        id_to_hostname[block["id"]] = hostname
        hosts.append({
            "name": hostname,
            "image": image,
            "ip_address": ip,
            "ram_gb": host_info.get("ramGb"),
            "storage_gb": host_info.get("storageGb"),
        })

    subnet = {
        "name": "subnet_0",
        "cidr": subnet_cidr,
        "dns_servers": ["8.8.8.8"],
        "hosts": hosts
    }

    subnet_connections = []
    seen = set()
    for conn in connections:
        from_id = conn.get("from")
        to_id = conn.get("to")
        key = tuple(sorted([from_id, to_id]))
        if key not in seen:
            seen.add(key)
            subnet_connections.append({
                "from_host": id_to_hostname.get(from_id, from_id),
                "to_host": id_to_hostname.get(to_id, to_id),
                "port": conn.get("port"),
                "label": conn.get("label"),
                "bidirectional": True
            })

    output = {
        "name": "cyblocks_network",
        "compiled_at": datetime.utcnow().isoformat() + "Z",
        "networks": [
            {
                "name": "cyblocks_network",
                "subnets": [subnet]
            }
        ],
        "subnet_connections": subnet_connections
    }

    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)
        f.write("\n")

    print(f"Compiled {len(blocks)} blocks, {len(subnet_connections)} connections -> {output_path}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python compiler.py <input.json> <output.json>")
        sys.exit(1)
    compile(sys.argv[1], sys.argv[2])
