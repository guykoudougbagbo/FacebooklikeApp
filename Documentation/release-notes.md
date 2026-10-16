# Release Notes

## Unreleased

### Admin accounts (step 2)

- Admins log in at `/connexion` with their email, password and a 6-digit code from an authenticator app. Each admin also gets one-time backup codes when they set up the app.
- The page owner invites admins with a single-use link that expires (48 hours by default) and sends it themselves.
- The owner can remove an admin or reset their authenticator app; either one logs that person out everywhere at once.
- The owner is also an admin: everything admins can do, the owner can do too.
- Removed admins appear under **Anciens administrateurs**. The owner can re-invite one with a link that works only for that person; they keep their name, choose a new password and set up their authenticator app again. A normal invite can't be used to take over a removed admin's account.
- Every admin can see the team list and an activity record of invites, new admins, removals and resets.
- The whole site is in French and shows the GenZ logo in the header and as the page background, behind see-through content boxes.
