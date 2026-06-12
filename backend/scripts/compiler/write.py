import shutil
from pathlib import Path
from typing import Any

import yaml
import common
from compiler.types import Env
from compiler.render import render_host_docker, render_router_docker, render_router_entrypoint


def write_artifact(
    env: Env,
    compose_dict: dict[str, Any],
    dockerfile_list: list[dict[str, Any]],
    routes: list[dict[str, Any]],
) -> Path:
    # Writes the build artifact for one project. Pure I/O -- build_compose lives in the
    # orchestrator, which builds compose_dict / dockerfile_list / routes and hands them in here.
    #   - project = common.project_name_from_ide_dict(env); build = common.build_dir(project).
    #   - clean rebuild: if build.exists(): shutil.rmtree(build); then build.mkdir(parents=True).
    #     WIPE ONLY build/, never runs/<project>/ (deploy writes log/state there later).
    #   - write build/"docker-compose.yaml" with yaml.safe_dump(compose_dict, sort_keys=False).
    #   - write build/"routes.json" (the default-gateway plan deploy's apply_routes consumes).
    #   - for each plan item: node_dir = build/"dockerfiles"/item["slug"]; node_dir.mkdir(parents=True);
    #     if host -> write node_dir/"Dockerfile" = render_host_docker(image, payloads, routed).
    #     if router -> write entrypoint.sh + node_dir/"Dockerfile" = render_router_docker(image).
    #   - return build.
    project = common.project_name_from_ide_dict(env)
    build = common.build_dir(project)
    if build.exists():
        shutil.rmtree(build)
    build.mkdir(parents=True)

    (build / "docker-compose.yaml").write_text(yaml.safe_dump(compose_dict, sort_keys=False))
    # routes for router-bridged subnets (default-gateway plan)
    common.write_json(build / "routes.json", {"routes": routes})

    for item in dockerfile_list:
        node_dir = build / "dockerfiles" / item["slug"]
        node_dir.mkdir(parents=True, exist_ok=True)
        if item["type"] == "host":
            # iproute2 THREAD: pass the routed flag so the renderer installs iproute2 when needed.
            (node_dir / "Dockerfile").write_text(render_host_docker(item["image"], item["payloads"], item["routed"]))
        elif item["type"] == "router":
            (node_dir / "entrypoint.sh").write_text(render_router_entrypoint())
            (node_dir / "Dockerfile").write_text(render_router_docker(item["image"]))

    return build
