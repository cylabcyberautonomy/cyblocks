from typing import Any, Literal, TypedDict

# ---------------------------------------------------------------------------
# env type: the JSON the IDE exports (Frontend/src/App.jsx exportEnv()).
# ---------------------------------------------------------------------------
class Host(TypedDict):
    name: str
    image: str
    ip: str
    ram: str
    disk: str

class Subnet(TypedDict):
    name: str
    cidr: str
    hosts: list[Host]

class Network(TypedDict):
    name: str
    subnets: list[Subnet]

class SubnetConnection(TypedDict):
    router: str
    from_subnet: str
    to_subnet: str | None
    bidirectional: bool

# Services share one array but carry per-kind fields, hence total=False.
class Service(TypedDict, total=False):
    name: str
    type: str
    protocol: str
    port: str
    version: str
    privilege_level: str  # type == "user"
    password: str         # type == "user"
    path: str             # type == "file"
    sensitivity: str      # type == "file"

class Vulnerability(TypedDict):
    name: str
    type: str
    cve: str
    description: str
    severity: str

class Misconfiguration(TypedDict):
    name: str
    description: str

class Router(TypedDict):
    name: str
    image: str
    networks: list[str]   # subnet names this router attaches to

# 'from' is a reserved word, so the functional TypedDict form is required.
Connection = TypedDict("Connection", {
    "from": str,
    "to": str,
    "fromType": str,
    "toType": str,
    "label": str,
})

class Env(TypedDict):
    name: str
    networks: list[Network]
    subnet_connections: list[SubnetConnection]
    services: list[Service]
    vulnerabilities: list[Vulnerability]
    misconfigurations: list[Misconfiguration]
    routers: list[Router]
    users: list[Any]
    files: list[Any]
    connections: list[Connection]

# ---------------------------------------------------------------------------
# Schema types for payloads and plans.
# ---------------------------------------------------------------------------
class Payloads(TypedDict):
    services: list[Service]
    vulnerabilities: list[Vulnerability]
    misconfigurations: list[Misconfiguration]

class Plan(TypedDict):
    slug: str
    type: Literal["host", "router"]
    image: str
    payloads: Payloads
    router: Router | None
