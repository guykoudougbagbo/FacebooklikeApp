# Release Notes

## Unreleased

### Admin accounts (step 2)

- Admins log in at `/connexion` with their email, password and a 6-digit code from an authenticator app. Each admin also gets one-time backup codes when they set up the app.
- The page owner invites admins with a single-use link that expires (48 hours by default) and sends it themselves.
- The owner can remove an admin or reset their authenticator app; either one logs that person out everywhere at once.
- The owner is also an admin: everything admins can do, the owner can do too.
- Removed admins appear under **Anciens administrateurs**. The owner can re-invite one with a link that works only for that person; they keep their name, choose a new password and set up their authenticator app again. A normal invite can't be used to take over a removed admin's account.
- Every admin can see the team list and an activity record of invites, new admins, removals and resets.
- Admins publish posts from the home page: text with clickable links, plus up to 10 photos. Visitors see them as posts from GenZ, newest first, loading more as they scroll; photos open full screen.
- Authors can edit or delete their own posts; the owner can delete any post. Admins see who published each post.
- Photos are checked, resized for fast loading, turned upright, and stripped of hidden data such as GPS location before anyone sees them.
- Posts can mix photos and videos (up to 10 items). For each video, admins set "Son d'origine" and "Musique" volumes and can add their own music file: keep the sound, mute it, replace it, or mix both. Music loops to the video's length.
- Videos are converted to play on every device, turned upright, and stripped of hidden data such as GPS location. In the feed they show a cover image and a play button; a video plays only when someone presses play (full screen, with sound), so nothing downloads before then.
- Visitors, without an account, can react to posts with Facebook's six reactions, comment (with a name), share, and follow the page. Counts appear under each post; reactions and shares count once per device.
- Followers get a notification for every new post. The site can be installed on a phone's home screen (needed for notifications on iPhone).
- Admins can delete comments, reply as "GenZ", and turn comments off on a post.
- Each post has its own page (`/publication/<id>`); shared links show a preview with the post's text and first image.
- Admins can message each other privately, one-on-one or in groups, from **Messages** in the header (with an unread badge). Messages arrive instantly; "Vu" / "Vu par N" shows who has read them; people can delete their own messages. A group's manager renames it and adds or removes members; anyone can leave. Only members can see a conversation, and removed admins lose access at once.
- Admins can switch to **Voir comme un visiteur** to see the page exactly as visitors do, without logging out, and switch back from the bar at the top.
- When the server is unreachable, the site now says "Le serveur ne répond pas. Réessayez dans un instant." instead of a vague error.
- The whole site is in French and shows the GenZ logo in the header and as the page background, behind see-through content boxes.
