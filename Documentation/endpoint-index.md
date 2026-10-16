# Endpoint Index

Every backend route, who can call it, and where it's defined. Update this file in the same change that adds or removes a route.

All paths start with `/api/`. Routes are defined in `Backend/accounts/urls.py` and `Backend/accounts/api.py`; their logic lives in `Backend/utils/accounts/`.

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
| POST | `invites/check/` | Public (holder of the link) | Body `{"token"}`. 404 when the link is unknown, used, revoked or expired. |
| POST | `invites/accept/` | Public (holder of the link) | Creates the admin account; next step is always `setup`. |

## Managing admins

| Method | Path | Who can call it | Notes |
|--------|------|-----------------|-------|
| GET | `admin/invites/` | Owner (`accounts.invite_admin`) | Pending links, newest first, paginated. |
| POST | `admin/invites/` | Owner (`accounts.invite_admin`) | Creates a link; the raw token is returned once. |
| DELETE | `admin/invites/<id>/` | Owner (`accounts.invite_admin`) | Cancels a pending link. |
| GET | `admin/admins/` | Owner and admins (`accounts.view_admins`) | Active team, paginated. |
| POST | `admin/admins/<id>/remove/` | Owner (`accounts.remove_admin`) | Deactivates and logs out everywhere. Not for the owner or yourself. |
| POST | `admin/admins/<id>/reset-second-step/` | Owner (`accounts.reset_admin_two_factor`) | Removes the app and recovery codes and logs out everywhere. |
| GET | `admin/activity/` | Owner and admins (`accounts.view_admin_activity`) | Admin activity, newest first, paginated. |
