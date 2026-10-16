import json
import os
import subprocess
import sys
import tempfile
import unittest

HOOKS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STOP = os.path.join(HOOKS_DIR, "stop_preflight_check.py")
REMIND = os.path.join(HOOKS_DIR, "prompt_preflight_reminder.py")


def user(text):
    return {"type": "user", "message": {"role": "user", "content": [{"type": "text", "text": text}]}}


def assistant_text(text):
    return {"type": "assistant", "message": {"role": "assistant", "content": [{"type": "text", "text": text}]}}


def assistant_tool():
    return {"type": "assistant", "message": {"role": "assistant", "content": [{"type": "tool_use", "id": "t1"}]}}


def tool_result():
    return {"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1"}]}}


def skill_text():
    entry = user("# Some skill body")
    entry["isMeta"] = True
    return entry


def run(script, payload):
    proc = subprocess.run(
        [sys.executable, "-I", script], input=payload, capture_output=True, text=True, check=False
    )
    return proc.returncode, proc.stdout, proc.stderr


class StopHookTest(unittest.TestCase):
    def run_stop(self, entries, stop_hook_active=False):
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            for e in entries:
                f.write(json.dumps(e) + "\n")
            f.write("not json\n")
            path = f.name
        self.addCleanup(os.remove, path)
        payload = json.dumps({"transcript_path": path, "stop_hook_active": stop_hook_active})
        return run(STOP, payload)

    def test_allows_reply_starting_with_marker(self):
        code, out, _ = self.run_stop([user("hi"), assistant_text("preflight considered:\n\nHello")])
        self.assertEqual(code, 0)
        self.assertEqual(out, "")

    def test_blocks_reply_without_marker(self):
        code, out, _ = self.run_stop([user("hi"), assistant_text("Hello")])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)["decision"], "block")

    def test_blocks_turn_with_no_text(self):
        _, out, _ = self.run_stop([user("hi"), assistant_tool(), tool_result()])
        self.assertEqual(json.loads(out)["decision"], "block")

    def test_checks_first_text_after_tools_and_skill_bodies(self):
        entries = [
            user("old"), assistant_text("Old reply"),
            user("new task"), assistant_tool(), tool_result(), skill_text(),
            assistant_text("preflight considered:\n\nStarting"), assistant_text("Later message"),
        ]
        _, out, _ = self.run_stop(entries)
        self.assertEqual(out, "")

    def test_only_latest_prompt_counts(self):
        entries = [user("old"), assistant_text("preflight considered:\nok"), user("new"), assistant_text("No marker")]
        _, out, _ = self.run_stop(entries)
        self.assertEqual(json.loads(out)["decision"], "block")

    def test_does_not_block_twice_in_a_row(self):
        _, out, _ = self.run_stop([user("hi"), assistant_text("Hello")], stop_hook_active=True)
        self.assertEqual(out, "")

    def test_bad_input_fails_open(self):
        code, out, err = run(STOP, "not json")
        self.assertEqual(code, 0)
        self.assertEqual(out, "")
        self.assertIn("stop_preflight_check failed", err)

    def test_missing_transcript_fails_open(self):
        code, out, _ = run(STOP, json.dumps({"transcript_path": "/nonexistent/x.jsonl"}))
        self.assertEqual(code, 0)
        self.assertEqual(out, "")


class ReminderHookTest(unittest.TestCase):
    def test_injects_both_rules(self):
        code, out, _ = run(REMIND, "{}")
        self.assertEqual(code, 0)
        data = json.loads(out)["hookSpecificOutput"]
        self.assertEqual(data["hookEventName"], "UserPromptSubmit")
        self.assertIn("preflight considered:", data["additionalContext"])
        self.assertIn("Here's what I understand:", data["additionalContext"])
        self.assertIn("task, its purpose, and its scope", data["additionalContext"])


if __name__ == "__main__":
    unittest.main()
