# Development Setup

How to run the app on a Mac with Apple Silicon.

## Tools

Installed with Homebrew from `/opt/homebrew` (the Apple Silicon install, not the old Intel one in `/usr/local`):

| Tool | Version | Used for |
|------|---------|----------|
| Python | 3.14 | Backend (Django) |
| Node | 24 (LTS) | Frontend (React + Vite) |
| PostgreSQL | 18 | Database |
| Redis | 8 | Instant messaging and background jobs (later steps) |
| FFmpeg | 9 | Mixing sound into videos (later steps) |
| Celery | 5.6 | Background worker that prepares photos (Python package, uses Redis) |

PostgreSQL and Redis run in the background: `brew services list` shows them.

## Backend

```
cd Backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env        # then fill in every value
.venv/bin/python manage.py check
.venv/bin/python manage.py migrate
.venv/bin/python manage.py test
.venv/bin/python manage.py runserver 8000
```

In a second terminal, start the background worker (it also runs the scheduled repair job):

```
cd Backend
.venv/bin/celery -A config worker -B --pool threads --concurrency 2 --loglevel info
```

`--pool threads` is for macOS: there, Celery 5.6's default process pool starts its helper processes with "spawn", which skips the worker's setup and makes every job fail with `not enough values to unpack` (celery/celery issue 9894). Linux servers keep the default process pool.

Without the worker, posts with photos stay at "Publication en cours…".

- Every setting in `.env.example` is required. The server stops at startup with a clear message if one is missing or invalid.
- `.env` holds secrets and is never committed.
- The database user needs the `CREATEDB` right, because tests create and delete a temporary `test_<name>` database.
- Every API route requires a logged-in user by default (`REST_FRAMEWORK` in `config/settings.py`).
- Business logic lives in `Backend/utils/`; route files only define routes.
- Tests use an in-memory cache instead of Redis, so running them never touches your Redis data.

### Posts and photos

- Logic lives in `Backend/utils/posts/` (`posts.py` for posts and the repair job, `photos.py` for checking and resizing photos).
- An upload is checked by actually opening it as an image (JPEG, PNG, WebP or HEIC), within `PHOTO_MAX_UPLOAD_BYTES` and `PHOTO_MAX_PIXELS`. The original goes to private storage (`PHOTO_ORIGINALS_ROOT`, never served).
- The worker builds two WebP versions (feed and full screen, sized by `PHOTO_FEED_MAX_PX` / `PHOTO_FULL_MAX_PX`), turns phone photos upright, and drops all hidden metadata such as GPS location. Then it deletes the original.
- The repair job (`posts.tasks.repair_stuck_photos`, every `POST_REPAIR_INTERVAL_SECONDS`) retries photos stuck longer than `POST_PROCESSING_TIMEOUT_SECONDS` and gives up after `POST_PROCESSING_MAX_ATTEMPTS`. It starts in log-only mode: with `POST_REPAIR_APPLY=false` it only writes what it would do to the worker log. Read that log, then set it to `true`.
- Production must also limit request size at the web server (for example nginx `client_max_body_size`), since Django checks each photo only after it has arrived.

### Creating the page owner

The owner can only be created from the server, once:

```
.venv/bin/python manage.py create_owner --email you@example.com --display-name "Your name"
```

It asks for the password twice. Then log in at `/connexion` on the site and link an authenticator app. After that, the owner invites admins from **Administrateurs**.

### Roles and permissions

`Backend/utils/accounts/roles.py` is the central list of roles (`owner`, `admin`) and the permissions each one has. After every `migrate`, the role groups are rebuilt to match that list exactly, so edit the list, not the groups.

The owner is also an admin: the owner's permissions are built from `ADMIN_PERMISSIONS` plus `OWNER_ONLY_PERMISSIONS`. Add a new admin ability to `ADMIN_PERMISSIONS` and the owner gets it automatically.

## Frontend

```
cd Frontend
npm ci
cp .env.example .env   # then set BACKEND_URL, for example http://localhost:8000
npm run dev       # local site at http://localhost:5173
npm test          # tests
npm run lint
```

The local site sends every `/api/...` request to `BACKEND_URL` and keeps the browser's address on the way (`apiProxy` in `vite.config.js`), so the browser sees one address, login cookies work, and Django's form-origin check passes. Pages live in `src/pages/`, shared pieces in `src/components/`, and the API helper in `src/api/client.js`. All text shown to people is in French.

`Frontend/.npmrc` sets `save-exact=true`, so every new package is pinned to an exact version.

## Automatic tests (GitHub Actions)

`.github/workflows/ci.yml` runs the backend and frontend tests on every push and pull request. Backend tests run against a real PostgreSQL 18 container with `DJANGO_DEBUG=false`. Actions are pinned to commit hashes.
