# Claude Failure Log

## Patterns

- **Missing task opening line** | count: 1 | entries: F-001 | hook: none
- **Coded from memory instead of the source** | count: 1 | entries: F-002 | hook: none

## Entries

### F-001: Replies on a task did not open with the task, purpose and scope line

- **Date:** 2026-10-16
- **Section:** Working Style
- **Rule broken:** "Open each task with one line stating the task, its purpose, and its scope."
- **What happened:** My replies to the app request and to the first round of answers went straight into "Here's what I understand:" without the one-line task, purpose and scope statement.
- **How it was caught:** self-review
- **Fix:** Later replies open with the line. Added the reply-opening rules to the reminder hook.
- **Pattern:** Missing task opening line

### F-002: Test HTTPS fix written from memory of Django's test client

- **Date:** 2026-10-16
- **Section:** Conventions
- **Rule broken:** "Write the code against that version's official documentation, not from memory."
- **What happened:** To make tests send HTTPS requests, I set `wsgi.url_scheme` as a client default from memory. Django 6.1's test client overwrites it on every request, so 33 tests still failed with debug off.
- **How it was caught:** failed test
- **Fix:** Read `django/test/client.py`, then set the scheme in `SecureAPIClient.request()`, which runs after Django's defaults.
- **Pattern:** Coded from memory instead of the source
