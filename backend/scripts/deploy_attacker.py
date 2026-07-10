
#This code builds ONE attacker container and joins it to an already-running environment's
#our entry subnet is subent A for now so we do not touch the environment's compose file
#This continer can only run after the env is deployed 

#This file builds the attacker image which has tools like nmap, curl, ssh, ping, nc, sshpass, ip, ss
#we can run one continer from its image 
#this countiner should also have the same routes a normla host on subnet A has so it can navigate the envionmnet and initia a real attack
import json
from pathlib import Path
from typing import Any
import common
import docker_boot
from compiler.helpers import subnet_cidr_map, router_ip_on_subnet

def _entry_subnet(environment: dict) -> dict:# this could be a data leakage but from inside the continer we can not access it 
    return environment["networks"][0]["subnets"][0] # we need this to know our entry point  or entry subnet that we plan to plant the attacker on

def _entry_subnet_cidr(environment: dict) -> str:#here we just wanna retreive the CIDR of the entry subnet because we need to know which Docker network to attach to
    return environment["networks"][0]["subnets"][0]["cidr"]

ATTACKER_DIR = Path(__file__).resolve().parent / "attacker"   # to find folder holding the Dockerfile
IMAGE_TAG = "cyblocks-attacker:latest"#The tag used for the built image
ATTACKER_ID = "attacker"   # logical id -> container named cyblocks_<project>_attacker

# Find the Docker network associated with a given subnet CIDR
# loops through all running Docker networks and parses their configuration to find the one associated with the given subnet CIDR
#if the environment is still not deployed it will raise an error because it will not be able to attackh to anything 
def find_network_by_subnet(docker: str, subnet_cidr: str, log: Path) -> str:
    ids = common.run([docker, "network", "ls", "-q"], log_path=log).stdout.split()
    for nid in ids:
        info = common.run(
            [docker, "network", "inspect", nid,
             "--format", "{{.Name}}|{{range .IPAM.Config}}{{.Subnet}} {{end}}"],
            log_path=log,
        ).stdout.strip()
        name, _, subnets = info.partition("|")
        if subnet_cidr in subnets.split():
            return name
    raise RuntimeError(f"No running network owns {subnet_cidr}. Is the environment deployed?")

# Deploy the attacker container and set up its network configuration 

def deploy_attacker(environment: dict[str, Any], *, docker: str) -> dict[str, Any]:
    project = common.project_name_from_ide_dict(environment)#our slug derived from the environment dictionary
    name = common.container_name_from_ide_dict(environment, ATTACKER_ID)
    #set up for the project working directory + empty log file
    env_run_dir = common.run_dir(project)
    env_run_dir.mkdir(parents=True, exist_ok=True)
    log = env_run_dir / "attacker.log"
    log.write_text("")
    #set up the Docker backend
    docker_boot.ensure_docker_backend_running(log)
    docker = common.ensure_docker_ready(docker, log)
    cidr = _entry_subnet_cidr(environment)
    network = find_network_by_subnet(docker, cidr, log)
    #build the attacker image where it reads the Dockerfile and then produces the image 
    common.run([docker, "build", "-t", IMAGE_TAG, str(ATTACKER_DIR)], log_path=log)
    common.run([docker, "rm", "-f", name], log_path=log, check=False)#make sure the container is removed if it already exists
    common.run(
        [docker, "run", "-d", "--name", name,
         "--network", network,
         "--cap-add", "NET_ADMIN", IMAGE_TAG],
        log_path=log,
    )#the actual command to run the container

    entry_subnet = _entry_subnet(environment)
    cidr, S = entry_subnet["cidr"], entry_subnet["name"]
    # Give the attacker the SAME  routes any host on its own subnet gets —
    # If no single router bridges this subnet with another one, no route is
    # added for it: reaching it requires compromising a host that's actually on the way just like a real attacker would have to.
    cidr_by_subnet = subnet_cidr_map(environment)
    for r in environment.get("routers", []):
        if S not in r.get("networks", []):
            continue
        for T in r.get("networks", []):
            if T == S:
                continue
            via = router_ip_on_subnet(environment, cidr, r["name"], S)
            common.run([docker, "exec", name, "ip", "route", "replace", cidr_by_subnet[T], "via", via],
                        log_path=log, check=False)
    #record the state of the attacker
    state = {"project": project, "attacker": name, "network": network,
             "subnet": cidr, "log": str(log)}
    common.write_json(env_run_dir / "attacker.json", state)
    return state


#undo the deployment of the attacker
def quit_attacker(environment: dict[str, Any], *, docker: str) -> dict[str, Any]:
    project = common.project_name_from_ide_dict(environment)
    name = common.container_name_from_ide_dict(environment, ATTACKER_ID)
    common.ensure_docker_ready(docker, None)
    common.run([docker, "rm", "-f", name], check=False)
    return {"project": project, "attacker": name, "status": "down"}

# Main execution block
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        raise SystemExit("usage: python3 deploy_attacker.py <env.json>  (deploy the environment first)")
    env = common.load_json(Path(sys.argv[1]))
    print(json.dumps(deploy_attacker(env, docker=common.docker_bin()), indent=2))