# Endpoint Index

Every backend route, who can call it, and where it's defined. Update this file in the same change that adds or removes a route.

All paths start with `/api/`. Routes are defined in `Backend/<app>/urls.py` and `Backend/<app>/api.py` (apps: `accounts`, `posts`, `interactions`, `messaging`); their logic lives in `Backend/utils/<app>/`.

"Public" routes are open on purpose; each one's reason is written next to it in `accounts/api.py`. Public routes that change something still require the CSRF token.

## Login

| Method | Path | Who can call it | Notes |
|--------|------|-----------------|-------|
| GET | `auth/csrf/` | Public | Sets the CSRF cookie the browser needs before logging in. |
| POST | `auth/login/` | Public | Email + password. Never logs in by itself; answers `{"next": "verify"}` or `{"next": "setup"}`. Limited per IP and per email. |
| POST | `auth/second-step/verify/` | Session that passed the password step | App code or recovery code. Logs in. Limited per account. |
| POST | `auth/second-step/setup/` | Session that passed the password step, with no app linked yet | Returns the authenticator setup link and secret. |
| POST | `auth/second-step/confirm/` | Same as setup | Confirms the app with a code, logs in, returns the one-time recovery codes. |
| POST | `auth/logout/` | Logged-in admin | |
| GET | `auth/me/` | Logged-in admin | Name, email and role (`owner` or `admin`). |

## Phone app login (admins)

The app has no cookies. Its password step answers with a signed `ticket` (valid `LOGIN_PENDING_TTL_SECONDS`, tied to the admin's logout counter) instead of a session; the code step turns it into a login `key`, shown once and stored by the app in secure storage (only its SHA-256 is kept). Every admin route in this index also accepts `Authorization: Bearer <key>` instead of the session cookie; header requests need no CSRF token. A key stops working when the admin logs out on that phone, is logged out everywhere (removal, authenticator reset, new password), or doesn't use the app for `APP_LOGIN_IDLE_SECONDS`; it then answers 401 (logged-out website requests still get 403). These routes set and read no cookies, so they need no CSRF check; same limits as the website login.

| Method | Path | Who can call it | Notes |
|--------|------|-----------------|-------|
| POST | `app/auth/login/` | Public | Body `{"email", "password"}`. Answers `{"next": "verify" or "setup", "ticket"}`. Limited per IP and per email. |
| POST | `app/auth/verify/` | Public (holder of a ticket) | Body `{"ticket", "code"}` (app code or recovery code). Answers `{"key", "user"}`. Limited per account. |
| POST | `app/auth/setup/` | Public (holder of a ticket, no authenticator yet) | Body `{"ticket"}`. Answers `{"otpauth_url", "secret"}`. |
| POST | `app/auth/confirm/` | Same as setup | Body `{"ticket", "code"}`. Answers `{"key", "recovery_codes", "user"}`. |
| POST | `app/auth/logout/` | Logged-in admin (app key) | Ends this phone's login only. |
| PUT | `app/auth/push-token/` | Logged-in admin (app key) | Body `{"expo_token"}`: where to send this phone's message notifications. A token moves to whoever logged in on that phone last. |
| DELETE | `app/auth/push-token/` | Logged-in admin (app key) | Stops message notifications on this phone. |

## Joining from an invite

| Method | Path | Who can call it | Notes |
|--------|------|-----------------|-------|
| POST | `invites/check/` | Public (holder of the link) | Body `{"token"}`. 404 when the link is unknown, used, revoked or expired. Answers `kind`: `new`, or `reactivate` with the former admin's name and email. |
| POST | `invites/accept/` | Public (holder of a `new` link) | Creates the admin account; next step is always `setup`. Refuses the email of a removed admin (they must use their own re-invite link). |
| POST | `invites/reactivate/` | Public (holder of a `reactivate` link) | Body `{"token", "password"}`. Switches that one removed admin back on with the new password; their old authenticator app, recovery codes and sessions are erased. Next step is always `setup`. |

## Managing admins

| Method | Path | Who can call it | Notes |
|--------|------|-----------------|-------|
| GET | `admin/invites/` | Owner (`accounts.invite_admin`) | Pending links, newest first, paginated. |
| POST | `admin/invites/` | Owner (`accounts.invite_admin`) | Creates a link; the raw token is returned once. |
| DELETE | `admin/invites/<id>/` | Owner (`accounts.invite_admin`) | Cancels a pending link. |
| GET | `admin/admins/` | Owner and admins (`accounts.view_admins`) | Active team, paginated. |
| POST | `admin/admins/<id>/remove/` | Owner (`accounts.remove_admin`) | Deactivates and logs out everywhere. Not for the owner or yourself. |
| POST | `admin/admins/<id>/reset-second-step/` | Owner (`accounts.reset_admin_two_factor`) | Removes the app and recovery codes and logs out everywhere. |
| GET | `admin/former-admins/` | Owner (`accounts.reinvite_admin`) | Removed admins, paginated. |
| POST | `admin/former-admins/<id>/reinvite/` | Owner (`accounts.reinvite_admin`) | Creates a link that only reactivates this person; cancels their earlier pending re-invite. The raw token is returned once. |
| GET | `admin/activity/` | Owner and admins (`accounts.view_admin_activity`) | Admin activity, newest first, paginated. |

## Posts

| Method | Path | Who can call it | Notes |
|--------|------|-----------------|-------|
| GET | `posts/` | Public | The page's feed: published posts only, newest first, cursor-paginated. Shows the page as author (no admin names) and only photos and videos that are ready. Each `media` item has `kind` (`photo` or `video`); photos give `feed_url`/`full_url`, videos give `video_url`/`poster_url`/`duration_seconds`. |
| GET | `posts/<id>/` | Public | One published post (its own page, where shared links and notifications lead). |
| GET | `admin/posts/` | Owner and admins (`posts.view_post_details`) | Every post, any status, newest first, with author name, each media item's status and `can_edit` / `can_delete` for the caller. |
| POST | `admin/posts/` | Owner and admins (`posts.create_post`) | Multipart: `body`; `media` (repeat, in display order; photos and videos mixed). For the video at position *i*: `sound_original_<i>` and `sound_music_<i>` (0-100) and an optional `music_<i>` audio file. Text-only posts publish at once; otherwise the post is `processing` until the worker has prepared every item. |
| GET | `admin/posts/<id>/` | Owner and admins (`posts.view_post_details`) | One post, used to follow processing. |
| PATCH | `admin/posts/<id>/` | The post's author (`posts.edit_own_post`) | Multipart: `body`, new `media` (with the same sound fields), `remove_media_ids` (repeat). A video's sound can't be changed after upload: remove it and add it again. |
| DELETE | `admin/posts/<id>/` | The post's author (`posts.delete_own_post`) or the owner (`posts.delete_any_post`) | Deletes the post and its photo and video files. |

Photo and video files are served under `MEDIA_URL` (`/media/`). Uploads as received (and music files) are kept in private storage and deleted once processed.

Feed and post responses also carry `comments_enabled` and `interactions`: `reactions` (count per kind), `comments`, `shares`, and `my_reaction` for the visitor's device.

## Visitor interactions

Visitors have no accounts. Their first interaction gives their browser an anonymous device cookie (`device`, HttpOnly); only its SHA-256 is stored. Visitor routes are public on purpose (reasons in `interactions/api.py`), check the CSRF token, and are limited per network address (comments also per device).

The phone app gets its device key once from `app/device/`, keeps it in the phone's secure storage and sends it as the `X-Device-Key` header on every request (reads included, so `my_reaction` and `following` are right). Requests carrying that header skip the CSRF check, because other websites can't add custom headers to a request; requests without it are checked as before. An unknown key answers 401 (the app then gets a new one).

| Method | Path | Who can call it | Notes |
|--------|------|-----------------|-------|
| POST | `posts/<id>/reaction/` | Public | Body `{"kind"}`: `like`, `love`, `haha`, `wow`, `sad`, `angry`. One per device; replaces the previous one. Returns the post's counts. |
| DELETE | `posts/<id>/reaction/` | Public | Removes this device's reaction. |
| GET | `posts/<id>/comments/` | Public | Oldest first, paginated. Each comment: `name`, `is_page`, `body`, `created_at`. Admin replies show as "GenZ". |
| POST | `posts/<id>/comments/` | Public | Body `{"name", "body", "website"}`; `website` must be empty. Refused when the post's comments are off. |
| POST | `posts/<id>/share/` | Public | Counts one share per device. |
| GET | `page/` | Public | `followers`, `following` (this device) and `push_public_key`. |
| POST | `page/follow/` | Public | Browsers: body `{"subscription"}` from the browser's push subscription; only endpoints on `PUSH_ALLOWED_HOSTS` are accepted. Phone app: body `{"expo_token"}` (`ExponentPushToken[...]`). |
| DELETE | `page/follow/` | Public | Stops following; removes this device's browser subscriptions and phone tokens. |
| POST | `app/device/` | Public | Phone app only: returns a new anonymous `device_key` (shown once; only its SHA-256 is stored). Limited per network address (`THROTTLE_APP_DEVICE_RATE`). |
| DELETE | `admin/comments/<id>/` | Owner and admins (`interactions.delete_any_comment`) | |
| POST | `admin/posts/<id>/comments/` | Owner and admins (`interactions.reply_as_page`) | Body `{"body"}`; shown as written by "GenZ". |
| PATCH | `admin/posts/<id>/comments-enabled/` | Owner and admins (`interactions.toggle_comments`) | Body `{"enabled": true/false}`. Existing comments stay. |

## Share previews

| Method | Path | Who can call it | Notes |
|--------|------|-----------------|-------|
| GET | `/p/<id>/` (not under `/api/`) | Public | HTML with Open Graph tags (text, first photo or video cover) for WhatsApp/Facebook previews; sends people on to `/publication/<id>`. |

## Private messages (admins)

Every route needs `messaging.use_messaging` (owner and admins) **and** membership of the conversation; a conversation someone isn't in answers 404, as if it didn't exist.

| Method | Path | Who can call it | Notes |
|--------|------|-----------------|-------|
| GET | `messages/conversations/` | Members | My conversations, latest activity first, with `title`, `members`, `manager_id`, `read_state` (last read message per member), `last_message` and `unread`. |
| POST | `messages/conversations/` | Admins | `{"kind": "direct", "user_id"}` (returns the existing one if any) or `{"kind": "group", "title", "member_ids"}` (at most `GROUP_MAX_MEMBERS`). |
| GET | `messages/conversations/<id>/` | Members | One conversation. |
| PATCH | `messages/conversations/<id>/` | The group's manager | `{"title"}`. |
| POST | `messages/conversations/<id>/members/` | The group's manager | `{"user_id"}`. |
| DELETE | `messages/conversations/<id>/members/<user_id>/` | The manager (anyone), or a member (themselves = leave) | Groups only. When the manager leaves, the longest-standing member takes over; the last one leaving deletes the group. |
| GET | `messages/conversations/<id>/messages/` | Members | Newest first, paginated. Items: `kind` (`text`/`event`), `event`, `sender`, `target`, `body`, `deleted`. |
| POST | `messages/conversations/<id>/messages/` | Members | `{"body"}`, at most `MESSAGE_MAX_LENGTH`; limited by `THROTTLE_MESSAGE_RATE`. |
| POST | `messages/conversations/<id>/read/` | Members | `{"message_id"}`; only ever moves forward. |
| DELETE | `messages/messages/<id>/` | The message's writer | Erases the text; shows "Message supprimé". |
| GET | `messages/unread/` | Admins | `{"count"}` of conversations with unread messages. |

### Live connection

`ws(s)://<site>/ws/messages/` — a WebSocket for logged-in admins: the website's session cookie, or the phone app's `Authorization: Bearer <key>` header. Either way its `Origin` must be one of `DJANGO_ALLOWED_HOSTS` (the app sends the server's own address). It only receives events: `message`, `message_deleted`, `read`, `removed`. Closes with 4403 when the person may not connect, and 4401 at the next event once their session or app login has ended (removed, logged out everywhere, logged out on that phone).

