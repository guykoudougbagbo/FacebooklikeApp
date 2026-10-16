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
.venv/bin/python manage.py migrate
.venv/bin/python manage.py test
.venv/bin/python manage.py runserver 8000
```

- Every setting in `.env.example` is required. The server stops at startup with a clear message if one is missing or invalid.
- `.env` holds secrets and is never committed.
- The database user needs the `CREATEDB` right, because tests create and delete a temporary `test_<name>` database.
- Every API route requires a logged-in user by default (`REST_FRAMEWORK` in `config/settings.py`).
- Business logic lives in `Backend/utils/`; route files only define routes.
- Tests use an in-memory cache instead of Redis, so running them never touches your Redis data.

### Creating the page owner

The owner can only be created from the server, once:

```
.venv/bin/python manage.py create_owner --email you@example.com --display-name "Your name"
```

It asks for the password twice. Then log in at `/connexion` on the site and link an authenticator app. After that, the owner invites admins from **Administrateurs**.

### Roles and permissions

`Backend/utils/accounts/roles.py` is the central list of roles (`owner`, `admin`) and the permissions each one has. After every `migrate`, the role groups are rebuilt to match that list exactly, so edit the list, not the groups.

## Frontend

```
cd Frontend
npm ci
cp .env.example .env   # then set BACKEND_URL, for example http://localhost:8000
npm run dev       # local site at http://localhost:5173
npm test          # tests
npm run lint
```

The local site sends every `/api/...` request to `BACKEND_URL`, so the browser sees one address and login cookies work. Pages live in `src/pages/`, shared pieces in `src/components/`, and the API helper in `src/api/client.js`. All text shown to people is in French.

`Frontend/.npmrc` sets `save-exact=true`, so every new package is pinned to an exact version.

## Automatic tests (GitHub Actions)

`.github/workflows/ci.yml` runs the backend and frontend tests on every push and pull request. Backend tests run against a real PostgreSQL 18 container with `DJANGO_DEBUG=false`. Actions are pinned to commit hashes.
