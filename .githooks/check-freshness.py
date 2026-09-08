#!/usr/bin/env python3
"""Keep new work based on published master; never change working files."""
import subprocess
import sys


def git(*args):
    return subprocess.run(["git", *args], text=True, capture_output=True, timeout=30)


def check(mode, updates):
    # Checkout hooks cannot veto a checkout. Warn using the last fetched tip;
    # commits and pushes always refresh it and fail closed if unavailable.
    warning = mode == "post-checkout"
    if not warning:
        fetched = git("fetch", "--quiet", "--no-tags", "--no-write-fetch-head",
                      "origin", "refs/heads/master:refs/remotes/origin/master")
        if fetched.returncode:
            raise RuntimeError("Cannot verify origin/master. Restore remote access and retry.\n"
                               + fetched.stderr.strip())
    tip = git("rev-parse", "--verify", "refs/remotes/origin/master^{commit}")
    if tip.returncode:
        raise RuntimeError("origin/master is missing. Fetch origin before continuing.")
    candidates = [("HEAD", "this checkout")]
    if mode == "pre-push":
        candidates = []
        for line in updates.splitlines():
            local_ref, local_oid, remote_ref, _ = line.split()
            if remote_ref.startswith("refs/heads/") and set(local_oid) != {"0"}:
                candidates.append((local_oid, local_ref))
    stale = []
    for revision, label in candidates:
        result = git("merge-base", "--is-ancestor", tip.stdout.strip(), revision)
        if result.returncode == 1:
            stale.append(label)
        elif result.returncode:
            raise RuntimeError(result.stderr.strip() or "Cannot verify commit ancestry.")
    if stale:
        raise RuntimeError(
            ", ".join(stale) + " is missing commits from origin/master.\n"
            "Preserve your edits, then merge origin/master into your branch; "
            "on master use git pull --ff-only.\n"
            "A worktree release does not update the other checkouts automatically.")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "pre-commit"
    if mode not in {"pre-commit", "pre-push", "post-checkout", "pre-dev"}:
        sys.exit("Unknown freshness check mode: " + mode)
    try:
        check(mode, sys.stdin.read() if mode == "pre-push" else "")
    except (RuntimeError, subprocess.TimeoutExpired, OSError, ValueError) as error:
        print("\nDeev Games freshness " + ("warning" if mode == "post-checkout" else "check failed")
              + ": " + str(error), file=sys.stderr)
        sys.exit(0 if mode == "post-checkout" else 1)
