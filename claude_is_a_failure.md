# Claude Failure Log

## Patterns

- **Missing task opening line** | count: 1 | entries: F-001 | hook: none
- **New required setting not added to CI** | count: 1 | entries: F-006 | hook: built (test `utils.tests.CiSettingsTest` fails when a required setting is missing from CI)
- **Hook misjudged what counts as a user message** | count: 1 | entries: F-005 | hook: built (stop_preflight_check.py, fixed)
- **Tests not isolated from local services** | count: 1 | entries: F-004 | hook: none
- **Coded from memory instead of the source** | count: 3 | entries: F-002, F-003, F-007 | hook: not hookable (no script can tell whether behaviour was read before it was relied on; rule tightened in Conventions instead)

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

### F-004: Post tests sent real jobs to the local Redis queue

- **Date:** 2026-10-16
- **Section:** Pillars of Development (Testing)
- **Rule broken:** none: a new rule is needed (tests must not reach the developer's real services).
- **What happened:** Two photo tests ran on-commit callbacks without mocking the Celery `delay`, so they pushed jobs into the local Redis queue. The worker picked them up when it started.
- **How it was caught:** self-review (the worker log showed jobs nobody had created)
- **Fix:** `PostsTestCase` now mocks `process_post_photos.delay` for every test; confirmed the queue stays at 0 after the full backend suite.
- **Pattern:** Tests not isolated from local services

### F-005: Stop hook raised a false alarm after a system notice

- **Date:** 2026-10-16
- **Section:** Failure Log / hooks
- **Rule broken:** none: the reply did start with "preflight considered:"; the hook I built misjudged it.
- **What happened:** A background-task notice was saved as a user entry labelled `promptSource: system`. The Stop hook treated it as the person's message, and the opening of my reply after it was missing from the saved transcript (session restart), so the hook blocked a correct reply.
- **How it was caught:** the hook blocked the turn; checked against the transcript
- **Fix:** `stop_preflight_check.py` ignores entries with `promptSource: system`; added a test reproducing the case. Re-ran the hook logic on the real transcript: it now finds the right message and the marker.
- **Pattern:** Hook misjudged what counts as a user message

### F-006: Step 3 pushed without its new required settings in CI

- **Date:** 2026-10-16
- **Section:** Conventions
- **Rule broken:** "Required config values have no fallback defaults" is followed, but I didn't add the new values to `.github/workflows/ci.yml`, so the backend job failed with "Missing required setting MEDIA_ROOT".
- **How it was caught:** failed CI run 38983367213
- **Fix:** Added all step 3 settings to the CI job; checked that every key in `Backend/.env.example` is in CI and that `manage.py check` passes with only the CI settings.
- **Pattern:** New required setting not added to CI

### F-007: Role sync clashed with Django 6.1's permission rename

- **Date:** 2026-10-16
- **Section:** Conventions
- **Rule broken:** "Before relying on how a library, framework or tool behaves (defaults, shorthands, headers, what it overwrites), read that behaviour in the installed version's source or docs."
- **What happened:** In step 3 my post-migrate role sync created every app's permissions itself. When step 4 renamed PostPhoto to PostMedia, it created the new permission names before Django 6.1's own rename step ran, so that step failed with "4 permission rename conflict(s)". I hadn't read how Django orders its post-migrate permission handlers.
- **How it was caught:** `migrate` failed on the local database
- **Fix:** Read `django/contrib/auth/apps.py` and `emit_post_migrate_signal`; the sync now runs once, after the last app, without creating permissions itself. Proved on a throwaway database migrated from the old version; removed the 4 unused obsolete permissions locally; added a test.
- **Pattern:** Coded from memory instead of the source

