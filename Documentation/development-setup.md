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
| Expo | SDK 57 | Phone app (React Native); installed with the app's packages, nothing global. SDK 57 because Expo Go in the App Store and Google Play only runs SDK 57 until Expo ships the SDK 58 one (announced 2026-10-15 as "within a few weeks"); move up then with `npx expo install expo@^58.0.0 --fix` |

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

- Logic lives in `Backend/utils/interactions/`: `devices.py` (anonymous device cookie, or the phone app's `X-Device-Key`), `activity.py` (reactions, comments, shares, counts), `follows.py` (following, Web Push and Expo push), `serializers.py` (counts added to feeds in a fixed number of queries).
- When a post first becomes visible (text-only at once; with media after processing), the worker sends a notification to every follower in batches of `PUSH_BATCH_SIZE`. Push services answering 404/410 mark a subscription as gone; with `PUSH_PRUNE_APPLY=false` that's only logged.
- Web Push keys: generate once (see the CI workflow for a snippet), keep `VAPID_PRIVATE_KEY` secret. Changing them unsubscribes every follower.
- Phone app followers are notified through Expo's push service (`EXPO_PUSH_URL`, up to `EXPO_PUSH_BATCH_SIZE` per request, at most 100). When Expo is busy (429, 5xx or unreachable) the job tries again after `EXPO_RETRY_BASE_SECONDS`, doubling each time, up to `EXPO_PUSH_MAX_RETRIES` times. If Expo refuses a whole batch because of one bad token, the batch is split until only that token is left out. `EXPO_RECEIPT_DELAY_SECONDS` after sending, a second job reads Expo's receipts (`EXPO_RECEIPTS_URL`) to find phones where the app was uninstalled. Phones reported as `DeviceNotRegistered` follow `PUSH_PRUNE_APPLY` like browsers: only logged while it is `false`.
- Notifications need HTTPS in production (browsers allow `http://localhost` for testing). On iPhone they only work once the site is added to the home screen; `Frontend/public/manifest.webmanifest`, the icons in `Frontend/public/icons/` and `Frontend/public/sw.js` make the site installable.
- Started without `watchfiles`, the worker doesn't reload code by itself: after adding background jobs, restart it, or an old worker rejects jobs it doesn't know (`KeyError` in its log).

### Private messages

- Logic lives in `Backend/utils/messaging/` (`conversations.py`, `realtime.py`); the live connection is `Backend/messaging/consumers.py`, routed in `config/asgi.py`.
- `runserver` serves normal pages and live connections together (Daphne is first in `INSTALLED_APPS`). Production needs an ASGI server (for example Daphne or Uvicorn) instead of a WSGI-only one, and the web server must pass WebSocket upgrades for `/ws/`.
- Events go through Redis (`CHANNEL_REDIS_URL`), so every server process can reach every admin's open page.
- Only members of a conversation can see it — the owner included. When an admin is removed from the team, they're taken out of every group (`utils.accounts.signals.admin_removed`), and open live connections close at the next event once their session has ended.
- Messages are stored in PostgreSQL like everything else; they aren't end-to-end encrypted.
- Admins logged in on the phone app get a notification for each new text message in their conversations: "Nouveau message de Awa", never the message itself (`Backend/utils/messaging/notifications.py`). It goes through the same Expo sending code as visitor notifications (`Backend/utils/expo_push.py`: batches, retries when Expo is busy, bad-token splitting, receipts) and follows `PUSH_PRUNE_APPLY` for uninstalled apps. The conversation already on screen doesn't pop up.

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

## Code shared by the website and the phone app

`Shared/` holds plain JavaScript both apps use, imported as `@shared/...`: French dates and counts (`format.js`), the six reactions (`reactions.js`), which photos and videos can be shown (`media.js`), links in text (`links.js`), and error messages and paging (`api.js`). It must not import any package (it has no `node_modules`), and it writes French dates by hand because the phone's JavaScript engine lacks some of the browser's `Intl` formatters.

- Website: alias in `Frontend/vite.config.js` (`server.fs.allow` lets the dev server and tests read the folder). Its tests (`Shared/*.test.js`) run with the website's `npm test`.
- Phone app: alias in `Mobile/jsconfig.json` (read by Expo's bundler) and `moduleNameMapper` in `Mobile/package.json` (Jest). `Mobile/metro.config.js` watches the folder and lets its files use the app's packages.

## Phone app (visitors)

`Mobile/` is the GenZ app for iPhone and Android, built with Expo: the feed, photos and videos, reactions, comments, sharing, and following with notifications. Admins keep using the website.

```
cd Mobile
npm ci
cp .env.example .env   # then fill it in (below)
npx expo start         # shows a QR code to open the app on a phone
npm test               # tests
npm run lint
```

Trying it on your own phone:

1. Install **Expo Go** from the App Store or Google Play.
2. The phone must reach the backend over the Wi-Fi. Find the Mac's address (`ipconfig getifaddr en0`), add it to `DJANGO_ALLOWED_HOSTS` in `Backend/.env`, and start the server with `.venv/bin/python manage.py runserver 0.0.0.0:8000`. This opens the development server to everyone on that Wi-Fi, so only do it on a network you trust.
3. In `Mobile/.env`, set `API_URL=http://<that address>:8000` and `SITE_URL` to the website's address.
4. Run `npx expo start` and scan the QR code (Camera app on iPhone, Expo Go on Android).

How it talks to the server:

- The app has no cookies. The first time someone reacts, comments, shares or follows, it asks `/api/app/device/` for an anonymous key, keeps it in the phone's secure storage (`expo-secure-store`) and sends it as `X-Device-Key`. People who only scroll never get one. If the server no longer knows the key, the app gets a new one once.
- Notifications use Expo's push service (`expo-notifications`). They need an Expo account and a development or store build: Expo Go can't receive them on Android, and every build needs `EAS_PROJECT_ID` (`npx eas-cli@latest init`). Until then "Suivre la page" explains that notifications aren't available yet. Tapping a notification opens that post, and only post links are accepted.
- Videos show their cover until pressed, like on the website; only the pressed video plays.
- **Admin side (hidden):** nothing in the app links to it. Admins open `genz://admin` on the phone (from a note or a message to themselves); while trying the app in Expo Go the link is `exp://<Mac address>:8081/--/admin` (for example `exp://10.0.0.41:8081/--/admin`), opened from Safari. They log in with the same steps as the website (password, then the authenticator code; first-time set-up opens the authenticator app with a button). Once logged in on a phone, an "Admin" button appears in that phone's header until they log out. Screens live in `src/app/admin/` and need a logged-in admin; the pieces are in `src/components/admin/` and `src/admin/`.
- **Admin login on the phone:** the server gives the app a login key (stored in secure storage, sent as `Authorization: Bearer`); see `Backend/utils/accounts/app_logins.py`. It ends at logout, when the admin is logged out everywhere (removal, authenticator reset), or after `APP_LOGIN_IDLE_SECONDS` without use (14 days, like the website's login). The clean-up job `accounts.tasks.prune_app_logins` (every `APP_LOGIN_PRUNE_INTERVAL_SECONDS`) deletes ended logins; with `APP_LOGIN_PRUNE_APPLY=false` it only logs the list.
- Settings are read once, in `Mobile/app.config.js`: `API_URL` and `SITE_URL` are always required, and `APP_BUNDLE_ID` and `EAS_PROJECT_ID` are required for builds. `APP_BUNDLE_ID` (for example `com.example.genz`) can never change after the first store release.
- Screens live in `src/app/` (Expo Router: each file is a screen; tests stay out of that folder), pieces in `src/components/`, the API helper in `src/api/client.js`. The icon, splash and notification images in `assets/` come from the website's logo.

## Automatic tests (GitHub Actions)

`.github/workflows/ci.yml` runs the backend, website (with `Shared/`) and phone app tests on every push and pull request. Backend tests run against a real PostgreSQL 18 container with `DJANGO_DEBUG=false`. Actions are pinned to commit hashes.
