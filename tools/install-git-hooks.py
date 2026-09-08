#!/usr/bin/env python3
"""Install shared hooks outside the working tree so old branches stay protected."""
from pathlib import Path
import shutil
import subprocess


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def main():
    common = Path(git("rev-parse", "--git-common-dir")).resolve()
    destination = common / "deevgames-hooks"
    configured = subprocess.run(["git", "config", "--get", "core.hooksPath"],
                                text=True, capture_output=True).stdout.strip()
    if configured and Path(configured).resolve() != destination:
        raise SystemExit("Existing core.hooksPath must be integrated first: " + configured)
    if not configured:
        active = [p.name for p in (common / "hooks").iterdir()
                  if p.is_file() and not p.name.endswith(".sample")]
        if active:
            raise SystemExit("Existing hooks must be integrated first: " + ", ".join(active))
    source = Path(__file__).resolve().parent.parent / ".githooks"
    destination.mkdir(exist_ok=True)
    for name in ("check-freshness.py", "pre-commit", "pre-push", "post-checkout"):
        shutil.copy2(source / name, destination / name)
        (destination / name).chmod(0o755)
    subprocess.run(["git", "config", "--local", "core.hooksPath", str(destination)], check=True)
    print("Installed shared freshness hooks: " + str(destination))


if __name__ == "__main__":
    main()
