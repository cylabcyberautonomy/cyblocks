# Docker Canvas IDE Mapping Notes

This note captures the future canvas-to-container design without putting those details into the current React frontend prototype. The UI should stay playful, colorful, and neutral for now: drag blocks from a palette and place them on a plain board. The Docker, MHBench, and environment deployment concepts belong here until the product surface is ready for them.

## Intended Flow

```text
canvas graph -> compiler function -> container DSL -> parser/deployer -> Docker or MHBench
```

The compiler is ordinary application code:

```text
compileEnvironment(canvasJson) -> environment.yml + image specs + topology specs
```

The parser/deployer is backend-specific:

```text
container DSL -> Docker parser  -> Dockerfiles + docker-compose.yml -> Docker Engine
container DSL -> MHBench parser -> Ansible/OpenStack/MHBench files
```

The stable part is the canvas graph and DSL. Docker is the first deployment backend, not the whole product model.

## Reference Files Reviewed

The requested paths were not present in this `cyblocks` checkout, but matching files existed in the sibling `Incalmo` checkout and were used as source context:

- `docs/docker-canvas-ide-chat-helper.md`
- `docker/docker-compose.yml`
- `docker/equifax/webserver/Dockerfile`
- `docker/equifax/database/Dockerfile`

## Future Block Types

The Equifax Docker setup maps cleanly into a small set of editable canvas blocks:

| Docker/Compose concept | Future canvas block | Editable fields | DSL target |
| --- | --- | --- | --- |
| Compose service/container | Host | id, image, role, connected networks | `hosts[]` |
| Compose network/IPAM subnet | Network | id, CIDR, visual zone | `networks[]` |
| Compose static IP assignment | Host network attachment | network id, static IP | `hosts[].networks[]` |
| Dockerfile `FROM` | Image | id, base image, platform notes | `images[].from` |
| `apt-get install` | Package set | package names, install group | `images[].packages` |
| Dockerfile `ENV` | Environment variable | key, value | `images[].env` |
| `useradd`, `groupadd`, `chsh` | User | username, group, home, shell | `images[].users` |
| `COPY` ordinary artifacts | File | source, target, owner, mode | `images[].files` |
| SSH keys, authorized keys, configs | Secret/credential | secret id, target, owner, mode | `images[].secrets` |
| `EXPOSE` | Service/port | label, port, protocol | `images[].services` |
| Compose `ports` | Exposed port | host bind, host port, container port | `hosts[].exposes` |
| Dockerfile `CMD` | Start command | command args | `images[].start` |

## Reference Topology

The Compose file defines three bridge networks:

| Network | CIDR | Purpose in future canvas |
| --- | --- | --- |
| `attacker_network` | `192.168.199.0/24` | Internet-facing or entry-side zone |
| `web_network` | `192.168.200.0/24` | Internal application zone |
| `db_network` | `192.168.201.0/24` | Backend data zone |

Hosts and static IPs:

| Host | Networks | Exposed host ports |
| --- | --- | --- |
| `attacker` | `attacker_network: 192.168.199.10`, `web_network: 192.168.200.10` | `127.0.0.1:8888:8888`, `127.0.0.1:6379:6379`, `127.0.0.1:5678:5678` |
| `webserver` | `web_network: 192.168.200.20`, `db_network: 192.168.201.20` | `127.0.0.1:8080:8080` |
| `db` | `db_network: 192.168.201.100` | none |

In the future canvas this becomes a simple three-zone graph:

```text
internet-facing zone -> internal zone -> backend zone
```

The current frontend prototype avoids these labels and uses a plain board instead. A later compiler can introduce explicit network blocks when that part of the product is ready.

## Webserver Image Recipe

The webserver Dockerfile contains these image-building facts:

| Category | Source detail | Future block |
| --- | --- | --- |
| Base image | `ubuntu:22.04` | Image |
| Environment | `TOMCAT_USER=tomcat`, `TOMCAT_GROUP=tomcat`, `TOMCAT_HOME=/opt/tomcat`, `GOPATH=/opt/go`, `PATH=...` | Environment variable |
| Packages | `openssh-client`, `default-jdk`, `wget`, `sshpass`, `nmap`, `ncat`, `python3`, `python3-pip`, `net-tools`, `curl`, `unzip` | Package set |
| User/group | `tomcat` user and group, home `/opt/tomcat`, shell `/bin/bash` | User |
| Files | `struts/tomcat.zip` copied to `/tmp/tomcat.zip`, unpacked into `/opt/tomcat` | File |
| Secrets/credentials | `ssh/config`, `ssh/id_rsa`, `ssh/id_rsa.pub` under `/opt/tomcat/.ssh` | Secret/credential |
| Service | `EXPOSE 8080` | Service/port |
| Start command | `/opt/tomcat/bin/catalina.sh run` | Start command |

Important backend rule: the Dockerfile hardcodes `go1.24.2.linux-amd64.tar.gz`. Generated Docker backends should avoid architecture-specific downloads unless selected through platform-aware variables such as `${TARGETARCH}`.

## Database Image Recipe

The database Dockerfile contains these image-building facts:

| Category | Source detail | Future block |
| --- | --- | --- |
| Base image | `ubuntu:22.04` | Image |
| Packages | `openssh-server`, `sshpass`, `nmap`, `ncat`, `python3`, `python3-pip`, `net-tools`, `curl`, `wget` | Package set |
| Users | root password setup, `database` user with `/home/database`, shell `/bin/bash` | User |
| Files | `data.json` copied to `/home/database/data.json` | File |
| Secrets/credentials | `authorized_keys` copied to `/home/database/.ssh/authorized_keys` | Secret/credential |
| Service | `EXPOSE 22` | Service/port |
| Start command | `/usr/sbin/sshd -D` | Start command |

## DSL Sketch

The DSL should be boring YAML that describes the environment, not a specific deployment backend:

```yaml
version: 1
name: equifax-reference

networks:
  - id: attacker_network
    cidr: 192.168.199.0/24
  - id: web_network
    cidr: 192.168.200.0/24
  - id: db_network
    cidr: 192.168.201.0/24

images:
  - id: equifax-webserver
    from: ubuntu:22.04
    env:
      TOMCAT_USER: tomcat
      TOMCAT_GROUP: tomcat
      TOMCAT_HOME: /opt/tomcat
    packages:
      - openssh-client
      - default-jdk
      - sshpass
      - nmap
      - ncat
      - python3
      - python3-pip
      - net-tools
      - curl
      - wget
      - unzip
    users:
      - name: tomcat
        group: tomcat
        home: /opt/tomcat
        shell: /bin/bash
    files:
      - source: docker/equifax/webserver/struts/tomcat.zip
        target: /tmp/tomcat.zip
        unpack_to: /opt/tomcat
    secrets:
      - id: webserver-ssh-config
        target: /opt/tomcat/.ssh/config
        owner: tomcat
        mode: "0600"
      - id: webserver-ssh-keypair
        target: /opt/tomcat/.ssh
        owner: tomcat
    services:
      - id: struts-tomcat
        port: 8080
        protocol: tcp
    start:
      - /opt/tomcat/bin/catalina.sh
      - run

  - id: equifax-db
    from: ubuntu:22.04
    packages:
      - openssh-server
      - sshpass
      - nmap
      - ncat
      - python3
      - python3-pip
      - net-tools
      - curl
      - wget
    users:
      - name: database
        home: /home/database
        shell: /bin/bash
    files:
      - source: docker/equifax/database/data.json
        target: /home/database/data.json
        owner: database
    secrets:
      - id: db-authorized-keys
        target: /home/database/.ssh/authorized_keys
        owner: database
        mode: "0600"
    services:
      - id: ssh
        port: 22
        protocol: tcp
    start:
      - /usr/sbin/sshd
      - -D

hosts:
  - id: attacker
    networks:
      - id: attacker_network
        ip: 192.168.199.10
      - id: web_network
        ip: 192.168.200.10
    exposes:
      - host: 8888
        container: 8888
      - host: 6379
        container: 6379
      - host: 5678
        container: 5678

  - id: webserver
    image: equifax-webserver
    networks:
      - id: web_network
        ip: 192.168.200.20
      - id: db_network
        ip: 192.168.201.20
    exposes:
      - host: 8080
        container: 8080

  - id: db
    image: equifax-db
    networks:
      - id: db_network
        ip: 192.168.201.100
```

## Compiler Responsibilities

- Convert canvas nodes and edges into DSL.
- Assign stable IDs.
- Validate required fields.
- Reject duplicate static IPs.
- Reject overlapping CIDRs.
- Reject conflicting exposed host ports.
- Reject missing image, service, file, and secret references.
- Keep validation errors readable enough for a chat helper.

## Parser/Deployer Responsibilities

- Convert DSL `images` entries into generated Dockerfiles.
- Convert DSL `hosts` and `networks` into generated Compose YAML.
- Create generated env/config files.
- Prefer command-line Docker Engine for the first target.
- Stream build/deploy logs back to the IDE.
- Track deployment IDs so environments can be destroyed cleanly.
- Keep MHBench/OpenStack generation as a separate parser target.

## Current Frontend Scope

Do implement:

- A small React app.
- A colorful block palette.
- A plain center board.
- Drag from palette to board.
- Drag existing blocks around.

Do not implement yet:

- Docker generation.
- DSL generation.
- Deployment.
- Secrets handling.
- Cyber-specific labels.
- Equifax-specific names in the UI.
- Connecting blocks.
- Front/middle/back board lanes.
- Inspector and outline panels.
