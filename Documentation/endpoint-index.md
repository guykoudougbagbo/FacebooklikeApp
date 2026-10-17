# Endpoint Index

Every backend route, who can call it, and where it's defined. Update this file in the same change that adds or removes a route.

All paths start with `/api/`. Routes are defined in `Backend/<app>/urls.py` and `Backend/<app>/api.py` (apps: `accounts`, `posts`); their logic lives in `Backend/utils/<app>/`.

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
| GET | `admin/posts/` | Owner and admins (`posts.view_post_details`) | Every post, any status, newest first, with author name, each media item's status and `can_edit` / `can_delete` for the caller. |
| POST | `admin/posts/` | Owner and admins (`posts.create_post`) | Multipart: `body`; `media` (repeat, in display order; photos and videos mixed). For the video at position *i*: `sound_original_<i>` and `sound_music_<i>` (0-100) and an optional `music_<i>` audio file. Text-only posts publish at once; otherwise the post is `processing` until the worker has prepared every item. |
| GET | `admin/posts/<id>/` | Owner and admins (`posts.view_post_details`) | One post, used to follow processing. |
| PATCH | `admin/posts/<id>/` | The post's author (`posts.edit_own_post`) | Multipart: `body`, new `media` (with the same sound fields), `remove_media_ids` (repeat). A video's sound can't be changed after upload: remove it and add it again. |
| DELETE | `admin/posts/<id>/` | The post's author (`posts.delete_own_post`) or the owner (`posts.delete_any_post`) | Deletes the post and its photo and video files. |

Photo and video files are served under `MEDIA_URL` (`/media/`). Uploads as received (and music files) are kept in private storage and deleted once processed.

