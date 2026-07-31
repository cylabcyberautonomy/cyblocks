from pathlib import Path
from typing import Any

import common

SERVICE_DATA_PATH = Path(__file__).with_name("services.json")

LIBRARY: list[dict[str, Any]] = []


def load_library(path: Path = SERVICE_DATA_PATH) -> None:
    global LIBRARY
    data = common.load_json(path)
    LIBRARY = list(data.get("services", []))


def list_services() -> list[dict[str, Any]]:
    return list(LIBRARY)


load_library()