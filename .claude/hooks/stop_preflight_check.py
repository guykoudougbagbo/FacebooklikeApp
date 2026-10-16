#!/usr/bin/env python3
"""Stop hook: block a turn whose reply does not start with the preflight marker."""
import json
import sys

MARKER = "preflight considered:"


def is_user_prompt(entry):
    if entry.get("type") != "user" or entry.get("isMeta"):
        return False
    # Background-task notices arrive as user entries but come from the system, not the person.
    if entry.get("promptSource") == "system":
        return False
    content = (entry.get("message") or {}).get("content")
    if isinstance(content, str):
        return True
    if isinstance(content, list):
        return any(isinstance(b, dict) and b.get("type") == "text" for b in content)
    return False


def first_reply_text(entries):
    """First assistant text written after the latest real user prompt, or None."""
    start = None
    for i, entry in enumerate(entries):
        if is_user_prompt(entry):
            start = i
    if start is None:
        return None
    for entry in entries[start + 1:]:
        if entry.get("type") != "assistant":
            continue
        for block in (entry.get("message") or {}).get("content") or []:
            if isinstance(block, dict) and block.get("type") == "text" and block.get("text", "").strip():
                return block["text"]
    return None


def read_transcript(path):
    entries = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return entries


def decide(hook_input):
    """Return the block response dict, or None to let the turn end."""
    # A second block in a row would loop forever; the first block already told Claude.
    if hook_input.get("stop_hook_active"):
        return None
    text = first_reply_text(read_transcript(hook_input["transcript_path"]))
    if text is not None and text.lstrip().startswith(MARKER):
        return None
    return {
        "decision": "block",
        "reason": (
            "agent_preflight.md: every reply must start with 'preflight considered:' on its own line. "
            "This turn's reply did not. Send your reply again starting with that line, "
            "and log the miss in claude_is_a_failure.md."
        ),
    }


def main():
    try:
        result = decide(json.load(sys.stdin))
    except Exception as exc:  # A broken hook must not trap the session.
        print(f"stop_preflight_check failed: {exc}", file=sys.stderr)
        return 0
    if result:
        print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
