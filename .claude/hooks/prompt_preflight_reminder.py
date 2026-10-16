#!/usr/bin/env python3
"""UserPromptSubmit hook: remind Claude of the reply-opening rules in agent_preflight.md."""
import json
import sys

REMINDER = (
    "agent_preflight.md reply rules: start your reply with 'preflight considered:' on its own line. "
    "If this message explains a task or answers your questions about one, next write "
    "\"Here's what I understand:\" and restate it in short, simple sentences; "
    "if you are not sure you understood, stop and wait for the user to confirm. "
    "When you start a task, open it with one line stating the task, its purpose, and its scope."
)


def main():
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": REMINDER,
        }
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
