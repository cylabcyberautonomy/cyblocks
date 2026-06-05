import json
import sys
import os
import platform
import re
import shutil
import subprocess
from hashlib import sha1
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RUNS_DIR = REPO_ROOT / "backend" / "runs"

def load_json(path: Path) -> dict:
    return json.loads(path.read_text())

def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")

def run():
    