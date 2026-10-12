"""Tests for the Bash guard hook. Run: python3 -m pytest -q scripts/hooks/test_guard_bash.py"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

HOOK = Path(__file__).with_name("guard_bash.py")


def run(command: str) -> int:
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}})
    return subprocess.run([sys.executable, str(HOOK)], input=payload, text=True, capture_output=True).returncode


@pytest.mark.parametrize("command", [
    "rm " + "-rf node_modules",
    "rm " + "-fr build",
    "git push " + "--force origin main",
    "git reset " + "--hard HEAD~1",
    "gcloud run services " + "delete kibo",
    "cat " + ".env",
])
def test_blocks_destructive(command):
    assert run(command) == 2


@pytest.mark.parametrize("command", [
    "npm run build",
    "git status",
    "git push origin feat-mvp",
    "ls -la",
    "rm build/tmp.txt",
    # Writing an ignore file that merely lists .env must not be treated as reading it.
    "cat > .dockerignore <<'EOF'\nnode_modules\n.env\nEOF",
    "grep -n OPENAI .gitignore",
])
def test_allows_normal(command):
    assert run(command) == 0


@pytest.mark.parametrize("command", [
    "cat " + "./.env",
    "less " + ".env.local",
    "head -5 " + ".env",
])
def test_blocks_reading_env_files(command):
    assert run(command) == 2


def test_bad_json_is_allowed():
    r = subprocess.run([sys.executable, str(HOOK)], input="not json", text=True, capture_output=True)
    assert r.returncode == 0
