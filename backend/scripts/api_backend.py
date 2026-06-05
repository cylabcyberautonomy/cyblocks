import common
from pathlib import Path
import subprocess

def run_compile_to_DSL():
    compile_script = common.REPO_ROOT / "backend" / "scripts" / "IDE_compile_to_DSL.py"
    result = subprocess.run(
        [str(compile_script)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print("Compilation failed:")
        print(result.stderr)
        raise SystemExit(1)
    print("Compilation succeeded:")
    print(result.stdout)