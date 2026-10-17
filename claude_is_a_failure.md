# Claude Failure Log

## Patterns

- **Missing task opening line** | count: 1 | entries: F-001 | hook: none
- **New required setting not added to CI** | count: 1 | entries: F-006 | hook: built (test `utils.tests.CiSettingsTest` fails when a required setting is missing from CI)
- **Hook misjudged what counts as a user message** | count: 1 | entries: F-005 | hook: built (stop_preflight_check.py, fixed)
- **Tests not isolated from local services** | count: 1 | entries: F-004 | hook: none
- **Coded from memory instead of the source** | count: 4 | entries: F-002, F-003, F-007, F-011 | hook: not hookable (no script can tell whether behaviour was read before it was relied on; rule tightened in Conventions instead)
- **Staged files in git without being asked** | count: 1 | entries: F-008 | hook: none
- **Test raced the code it checks** | count: 1 | entries: F-009 | hook: none
- **Picked the newest version without checking it runs where it's needed** | count: 2 | entries: F-010, F-012 | hook: not hookable (no script can tell whether a version's changed defaults fit the rest of the stack); rule tightened instead: when adding or pinning a new major version, read its changelog for changed defaults and check the libraries that use it, then prove it through the real service, not only test stand-ins

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

### F-008: Deleted website files with `git rm`, which staged the deletions

- **Date:** 2026-10-16
- **Section:** Guardrails
- **Rule broken:** never stage, commit or push without the user asking.
- **What happened:** While moving the website's date, reaction and media helpers into `Shared/` (step 7), I removed the old files with `git rm`, which also stages their deletion.
- **How it was caught:** self-review, right after the command ran
- **Fix:** Unstaged them with `git restore --staged` (the files stay deleted on disk); confirmed nothing is staged. Files are deleted with `rm` from now on.
- **Pattern:** Staged files in git without being asked

### F-009: Messaging test read the live connection before the app had opened it

- **Date:** 2026-10-16
- **Section:** Pillars of Development (Testing)
- **Rule broken:** none: a new rule is needed (a test must wait for anything the app does after the page first shows).
- **What happened:** In step 6 I wrote messaging tests that took the live connection right after the Messages link appeared. The app opens that connection in an effect, which runs just after the page shows, so on the slower GitHub machine one test found no connection and failed (`Cannot read properties of undefined (reading 'serverClose')`) on the step 7 push.
- **How it was caught:** failed CI run 38993710927 (frontend job)
- **Fix:** Added `FakeSocket.opened()`, which waits for the connection, and used it in all four tests. Reproduced the failure locally by delaying the connection 50 ms: the old tests fail, the fixed ones pass; app code unchanged.
- **Pattern:** Test raced the code it checks

### F-010: Phone app built on Expo SDK 58 before Expo Go for SDK 58 was in the App Store

- **Date:** 2026-10-17
- **Section:** Conventions
- **Rule broken:** "Before relying on how a library, framework or tool behaves (defaults, shorthands, headers, what it overwrites), read that behaviour in the installed version's source or docs."
- **What happened:** In step 7 I chose Expo SDK 58 because it was the newest on npm. The plan was for the user to try the app in Expo Go, but the store version of Expo Go only runs SDK 57 until Expo ships the new one "within a few weeks" (SDK 58 announcement, 2026-10-15). Expo's create-expo docs said new projects still default to SDK 57 "during the SDK 58 transition"; I read that and didn't act on it. The user's iPhone showed "Project is incompatible with this version of Expo Go" and the App Store had no update.
- **How it was caught:** user report (screenshot of the error; App Store had no update)
- **Fix:** At the user's choice, moved the app to SDK 57 (expo 57.0.30, versions from Expo's own list for that SDK, pinned exactly), checked every API the app uses against the SDK 57 docs, and reran tests, lint and both bundles. Before choosing a version from now on, check that it runs where the user will run it.
- **Pattern:** Picked the newest version without checking it runs where it's needed

### F-011: App login check put first changed the website's logged-out answer from 403 to 401

- **Date:** 2026-10-17
- **Section:** Conventions
- **Rule broken:** "Before relying on how a library, framework or tool behaves (defaults, shorthands, headers, what it overwrites), read that behaviour in the installed version's source or docs."
- **What happened:** In step 8 I added the phone app's `Authorization: Bearer` login check at the top of DRF's authentication list without reading how DRF picks the status for a logged-out request. DRF takes it from the first check in the list, so every logged-out website request to an admin route would have answered 401 instead of 403.
- **How it was caught:** failed tests (messaging privacy test expected 403)
- **Fix:** Read `rest_framework/views.py` (`handle_exception`) and `request.py` (`_authenticate`). The session check is first again; an ended app login raises its own 401 error (`LoginEnded`), so the website keeps 403 and the app can still tell "log in again" from "not allowed". Checked both answers against the running server.
- **Pattern:** Coded from memory instead of the source

### F-012: Live connections broke every 5 seconds when idle (redis 8 read timeout vs channels_redis waits)

- **Date:** 2026-10-17
- **Section:** Conventions, Verification
- **Rule broken:** "Before relying on how a library, framework or tool behaves (defaults, shorthands, headers, what it overwrites), read that behaviour in the installed version's source or docs." and "check through the real path, not only mocks."
- **What happened:** In step 6 I pinned `redis==8.1.0`, the newest major version, without reading what it changed. Since version 8 it gives up reading after 5 seconds by default, while `channels_redis` waits up to 5 seconds for new events, so every idle live connection broke and reconnected about every 5 seconds. Tests use an in-memory channel layer and my step 6 live check received an event quickly, so neither caught it.
- **How it was caught:** user report (the same Redis traceback twice in the server window)
- **Fix:** Read `redis/_defaults.py` and `channels_redis/core.py`; reproduced 12 failures in 60 seconds of idle waiting against the real Redis, 0 with a 15-second read timeout. Added the required setting `CHANNEL_REDIS_SOCKET_TIMEOUT_SECONDS` and a start-up check (`messaging.E001`) that refuses a value not longer than the library's wait; checked an idle live connection on the running server stays open past 20 seconds.
- **Pattern:** Picked the newest version without checking it runs where it's needed

