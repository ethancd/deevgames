#!/usr/bin/env python3
"""Exercise real hooks and worktrees against a disposable local remote."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class FreshnessTest(unittest.TestCase):
    def run_cmd(self, *args, cwd=None, ok=True, input=None):
        result = subprocess.run(args, cwd=cwd or self.clone, text=True,
                                input=input, capture_output=True)
        if ok:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def git(self, *args, **kwargs):
        return self.run_cmd("git", *args, **kwargs)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="deevgames-hooks-test-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.clone = self.base / "clone"
        self.clone.mkdir()
        self.remote = self.base / "remote.git"
        self.git("init", "--bare", "-b", "master", str(self.remote))
        self.git("init", "-b", "master")
        self.git("config", "user.name", "Hook Test")
        self.git("config", "user.email", "test@example.invalid")
        self.git("commit", "--allow-empty", "-m", "initial")
        self.old = self.git("rev-parse", "HEAD").stdout.strip()
        self.git("remote", "add", "origin", str(self.remote))
        self.git("push", "-u", "origin", "master")
        shutil.copytree(ROOT / ".githooks", self.clone / ".githooks")
        self.run_cmd("python3", str(ROOT / "tools/install-git-hooks.py"))
        self.hooks = Path(self.git("config", "--get", "core.hooksPath").stdout.strip())

    def advance_remote(self):
        self.publisher = self.base / "publisher"
        self.git("clone", str(self.remote), str(self.publisher))
        self.git("-c", "user.name=Hook Test", "-c", "user.email=test@example.invalid",
                 "commit", "--allow-empty", "-m", "published", cwd=self.publisher)
        self.git("push", cwd=self.publisher)

    def test_fresh_commit_then_unfetched_remote_blocks_commit_and_dev(self):
        self.git("commit", "--allow-empty", "-m", "fresh work")
        self.advance_remote()
        result = self.git("commit", "--allow-empty", "-m", "stale work", ok=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing commits", result.stderr)
        result = self.run_cmd("python3", str(self.hooks / "check-freshness.py"),
                              "pre-dev", ok=False)
        self.assertNotEqual(result.returncode, 0)
        self.git("merge", "--no-edit", "origin/master")
        self.git("commit", "--allow-empty", "-m", "current again")

    def test_pushed_revision_checked_not_just_current_head(self):
        self.advance_remote()
        self.git("fetch", "origin")
        self.git("merge", "--ff-only", "origin/master")
        self.git("branch", "old-feature", self.old)
        result = self.git("push", "origin", "old-feature", ok=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing commits", result.stderr)
        self.git("push", "origin", "HEAD:refs/heads/current-feature")
        self.git("push", "origin", "--delete", "current-feature")

    def test_old_worktree_protected_without_tracked_hook_files(self):
        self.advance_remote()
        self.git("fetch", "origin")
        other = self.base / "old-worktree"
        result = self.git("worktree", "add", "-b", "old", str(other), self.old)
        self.assertIn("freshness warning", result.stderr)
        self.assertFalse((other / ".githooks").exists())
        result = self.git("commit", "--allow-empty", "-m", "stale", cwd=other, ok=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing commits", result.stderr)

    def test_unreachable_remote_fails_closed(self):
        self.git("remote", "set-url", "origin", str(self.base / "missing.git"))
        result = self.git("commit", "--allow-empty", "-m", "unverified", ok=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Cannot verify origin/master", result.stderr)

    def test_install_idempotent_and_preserves_other_hooks(self):
        self.run_cmd("python3", str(ROOT / "tools/install-git-hooks.py"))
        self.git("config", "--unset", "core.hooksPath")
        existing = self.clone / ".git/hooks/pre-commit"
        existing.write_text("#!/bin/sh\nexit 0\n")
        result = self.run_cmd("python3", str(ROOT / "tools/install-git-hooks.py"), ok=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Existing hooks", result.stderr)
        self.assertEqual(existing.read_text(), "#!/bin/sh\nexit 0\n")


if __name__ == "__main__":
    unittest.main()
