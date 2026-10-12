#!/usr/bin/env python3
"""PreToolUse hook for Bash: blocks destructive commands.

Claude Code sends the tool call as JSON on stdin. Exit code 2 blocks the call and
shows stderr to Claude; exit 0 lets it run. (Exit 1 would NOT block.)
"""
import json
import re
import sys

BLOCKED = [
    (r"\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b", "recursive force delete"),
    (r"\bgit\s+push\b.*(--force\b|-f\b)", "force push"),
    (r"\bgit\s+reset\s+--hard\b", "hard reset"),
    (r"\bgit\s+clean\s+-[a-zA-Z]*f", "git clean -f"),
    (r"\bDROP\s+(TABLE|DATABASE)\b", "SQL drop"),
    (r"\bgcloud\s+.*\b(delete|disable)\b", "deleting or disabling cloud resources"),
    # A reader command whose file argument is a .env file (not "cat > x" or text that mentions .env).
    (r"\b(cat|less|more|head|tail|bat|strings)\s+(-\S+\s+)*[\"']?(\S*/)?\.env(\.\S+)?[\"']?(\s|$)", "printing secrets from .env"),
]


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return 0
    command = (payload.get("tool_input") or {}).get("command", "")
    for pattern, why in BLOCKED:
        if re.search(pattern, command, re.IGNORECASE):
            print(f"Blocked by project hook: {why}. Ask the user to run it if it is really needed.", file=sys.stderr)
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
