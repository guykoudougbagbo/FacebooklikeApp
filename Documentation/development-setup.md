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
| FFmpeg | 9 | Converting videos and mixing their sound (the worker runs it) |
| Celery | 5.6 | Background worker that prepares photos (Python package, uses Redis) |
| Daphne / Channels | 4.2 / 4.3 | Serves live connections (private messages); `runserver` uses Daphne automatically |

PostgreSQL and Redis run in the background: `brew services list` shows them.

## Backend

```
cd Backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt   # requirements.txt plus development tools
cp .env.example .env        # then fill in every value
.venv/bin/python manage.py check
.venv/bin/python manage.py migrate
.venv/bin/python manage.py test
.venv/bin/python manage.py runserver 8000
```

In a second terminal, start the background worker (it also runs the scheduled repair job). In development, run it through `watchfiles`, which restarts it whenever a Python file changes, so it never runs old code:

```
cd Backend
.venv/bin/watchfiles --filter python --ignore-paths .venv '.venv/bin/celery -A config worker -B --pool threads --concurrency 2 --loglevel info' .
```

Servers run the plain `celery -A config worker ...` command and restart it on each deployment.

`--pool threads` is for macOS: there, Celery 5.6's default process pool starts its helper processes with "spawn", which skips the worker's setup and makes every job fail with `not enough values to unpack` (celery/celery issue 9894). Linux servers keep the default process pool.

Without the worker, posts with photos or videos stay at "Publication en cours…".

- Every setting in `.env.example` is required. The server stops at startup with a clear message if one is missing or invalid.
- `.env` holds secrets and is never committed.
- The database user needs the `CREATEDB` right, because tests create and delete a temporary `test_<name>` database.
- Every API route requires a logged-in user by default (`REST_FRAMEWORK` in `config/settings.py`).
- Business logic lives in `Backend/utils/`; route files only define routes.
- Tests use an in-memory cache instead of Redis, so running them never touches your Redis data.

### Posts, photos and videos

- Logic lives in `Backend/utils/posts/`: `posts.py` (posts, processing, repair job), `uploads.py` (reading an upload request), `photos.py` and `videos.py`.
- Each post holds up to `POST_MAX_MEDIA` items (`PostMedia`, kind `photo` or `video`), in order.
- An upload is checked by actually opening it as an image (JPEG, PNG, WebP or HEIC), within `PHOTO_MAX_UPLOAD_BYTES` and `PHOTO_MAX_PIXELS`. The original goes to private storage (`PHOTO_ORIGINALS_ROOT`, never served).
- The worker builds two WebP versions (feed and full screen, sized by `PHOTO_FEED_MAX_PX` / `PHOTO_FULL_MAX_PX`), turns phone photos upright, and drops all hidden metadata such as GPS location. Then it deletes the original.
- Videos are recognised by their first bytes (MP4/MOV or WebM; music: MP3, M4A, WAV, OGG, AAC), within `VIDEO_MAX_UPLOAD_BYTES` / `MUSIC_MAX_UPLOAD_BYTES`. The worker runs FFmpeg (`FFMPEG_BINARY`, `FFPROBE_BINARY`) only on local files of the detected format (`-protocol_whitelist file`, `-format_whitelist`), so a crafted file can't make it open playlists or network addresses. It refuses videos longer than `VIDEO_MAX_SECONDS`.
- The conversion: H.264 MP4 at most `VIDEO_MAX_PX` on the long side (`VIDEO_CRF` quality), turned upright, with the index first so playback starts while loading; sound is the original at `original_volume` % mixed with the looped music at `music_volume` % (`amix normalize=0`), or no sound at all when both are 0. All metadata (including phone GPS location) is dropped, and a WebP cover image is made. Each FFmpeg run is limited to `VIDEO_PROCESSING_TIMEOUT_SECONDS`.
- In production, run the worker as a user that can't write outside the media folders, since FFmpeg reads files from the public.
- The repair job (`posts.tasks.repair_stuck_media`, every `POST_REPAIR_INTERVAL_SECONDS`) retries photos and videos stuck longer than `POST_PROCESSING_TIMEOUT_SECONDS` and gives up after `POST_PROCESSING_MAX_ATTEMPTS`. It starts in log-only mode: with `POST_REPAIR_APPLY=false` it only writes what it would do to the worker log. Read that log, then set it to `true`.
- Production must also limit request size at the web server (for example nginx `client_max_body_size`), since Django checks each photo only after it has arrived.

### Visitor interactions and notifications

- Logic lives in `Backend/utils/interactions/`: `devices.py` (anonymous device cookie), `activity.py` (reactions, comments, shares, counts), `follows.py` (following and Web Push), `serializers.py` (counts added to feeds in a fixed number of queries).
- When a post first becomes visible (text-only at once; with media after processing), the worker sends a notification to every follower in batches of `PUSH_BATCH_SIZE`. Push services answering 404/410 mark a subscription as gone; with `PUSH_PRUNE_APPLY=false` that's only logged.
- Web Push keys: generate once (see the CI workflow for a snippet), keep `VAPID_PRIVATE_KEY` secret. Changing them unsubscribes every follower.
- Notifications need HTTPS in production (browsers allow `http://localhost` for testing). On iPhone they only work once the site is added to the home screen; `Frontend/public/manifest.webmanifest`, the icons in `Frontend/public/icons/` and `Frontend/public/sw.js` make the site installable.
- Started without `watchfiles`, the worker doesn't reload code by itself: after adding background jobs, restart it, or an old worker rejects jobs it doesn't know (`KeyError` in its log).

### Private messages

- Logic lives in `Backend/utils/messaging/` (`conversations.py`, `realtime.py`); the live connection is `Backend/messaging/consumers.py`, routed in `config/asgi.py`.
- `runserver` serves normal pages and live connections together (Daphne is first in `INSTALLED_APPS`). Production needs an ASGI server (for example Daphne or Uvicorn) instead of a WSGI-only one, and the web server must pass WebSocket upgrades for `/ws/`.
- Events go through Redis (`CHANNEL_REDIS_URL`), so every server process can reach every admin's open page.
- Only members of a conversation can see it — the owner included. When an admin is removed from the team, they're taken out of every group (`utils.accounts.signals.admin_removed`), and open live connections close at the next event once their session has ended.
- Messages are stored in PostgreSQL like everything else; they aren't end-to-end encrypted.

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
