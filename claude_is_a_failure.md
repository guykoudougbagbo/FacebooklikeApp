# Claude Failure Log

## Patterns

- **Missing task opening line** | count: 1 | entries: F-001 | hook: none
- **Coded from memory instead of the source** | count: 2 | entries: F-002, F-003 | hook: not hookable (no script can tell whether behaviour was read before it was relied on; rule tightened in Conventions instead)

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

### F-003: Admin login blocked because the dev proxy rewrote the address

- **Date:** 2026-10-16
- **Section:** Conventions, Verification
- **Rule broken:** "Write the code against that version's official documentation, not from memory." and "Before you say something is true, prove it."
- **What happened:** I set the Vite proxy with the string shorthand, assuming it keeps the browser's address. Vite's shorthand turns `changeOrigin` on, so Django saw `localhost:8000` against an Origin of `localhost:5173` and refused every login with 403. I had also written in the setup doc that login worked through the proxy, without testing that path; every test mocked the API or skipped the proxy.
- **How it was caught:** user correction (login failed in the browser; the server log showed the origin mismatch)
- **Fix:** Read Vite's proxy code, switched to the object form with `changeOrigin: false` (`apiProxy` in `vite.config.js`), added a regression test, and confirmed through the real browser path (proxy, running Django server) that login reaches the password check and a foreign origin is still refused.
- **Pattern:** Coded from memory instead of the source
