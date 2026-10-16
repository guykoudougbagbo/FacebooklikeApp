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

PostgreSQL and Redis run in the background: `brew services list` shows them.

## Backend

```
cd Backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env        # then fill in every value
.venv/bin/python manage.py check
.venv/bin/python manage.py test
```

- Every setting in `.env.example` is required. The server stops at startup with a clear message if one is missing or invalid.
- `.env` holds secrets and is never committed.
- The database user needs the `CREATEDB` right, because tests create and delete a temporary `test_<name>` database.
- Every API route requires a logged-in user by default (`REST_FRAMEWORK` in `config/settings.py`).
- Business logic lives in `Backend/utils/`; route files only define routes.

## Frontend

```
cd Frontend
npm ci
npm run dev       # local site
npm test          # tests
npm run lint
```

`Frontend/.npmrc` sets `save-exact=true`, so every new package is pinned to an exact version.

## Automatic tests (GitHub Actions)

`.github/workflows/ci.yml` runs the backend and frontend tests on every push and pull request. Backend tests run against a real PostgreSQL 18 container with `DJANGO_DEBUG=false`. Actions are pinned to commit hashes.
