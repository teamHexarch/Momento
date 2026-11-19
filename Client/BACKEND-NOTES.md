# Momento V2.5: notes for the backend team

The front end is plain HTML, CSS and JS (no build step). Nothing in `assets/` talks to the real server in a new
way except the endpoints below. Everything else is unchanged.

## Sample-data mode (`assets/devpreview.js`)

`assets/api.js` loads `devpreview.js` only when the page is on localhost or a local network address, and never on
the live site. Through the real server (port 4000) it is off unless `?dev` is added to the URL. It answers the API
calls with sample data, so it is the quickest reference for the request and response shapes below. It does not need
to ship to production.

## New endpoints the pages now call

### Recently deleted bin (My albums)
Full spec in **SERVER-TRASH-API.md**: soft delete, 30-day purge, host-only delete/restore/purge,
`POST /api/trash`, `GET /api/trash`, `POST /api/trash/restore`, `POST /api/trash/purge`, `GET /api/hidden`,
plus `trashCount` and `hiddenCount` on `GET /api/albums`.

**Change to an existing route:** `DELETE /api/photos/:id` must become **host only**. Today it also lets the uploader
delete their own photo.

### Liked tab and Save (My albums)
(shapes taken from `assets/devpreview.js`; please confirm against it)

- `POST /api/albums/:id/save`, body `{ "saved": true|false }`, returns `{ "saved": true|false }`.
  Only for albums the user is a member of.
- `GET /api/photos/liked`, returns `{ "photos": [ { id, albumId, albumName, url, thumbnailUrl, by, likedAt } ] }`,
  newest like first.
- `GET /api/albums` and `GET /api/albums/:id`: each album gains a boolean `saved`.
- Liking a photo must record `likedAt` (ISO time) so the Liked tab can sort.

## Removed from the front end

- **Chat** (groups and events): the UI, notifications, the red badge and the Settings switch are gone. The chat
  endpoints are no longer called.
- The swipe sorter is no longer on My albums. `sort.html` still exists and the footer still links to it.

## Other changes worth knowing

- `groups.html` is now only a redirect to `events.html#groups` (groups live on the Social page).
- Intro animation now plays on the home page only.
- The home hero Polaroids reuse the signed-in user's album photos (remembered per browser tab, cleared on sign-out).

## Fixes from the November 2026 review (server side still needed)

The front end for these is done; each needs a matching change in `Server/`.

- **Consent on sign-up.** `POST /api/auth/signup` now sends `acceptTerms: true` and `termsVersion` (currently
  `"2026-11-07"`, the Privacy Policy's "Last updated" date; it's `TERMS_VERSION` in `index.html`). `POST /api/auth/google`
  sends the same two fields when the person is on the Sign up tab. Please reject sign-up without `acceptTerms`
  (400) and write a consent record (user, type, version, time) for each.
- **"Activity on my public albums" switch.** `PATCH /api/auth/me { "notify": { "activity": false } }` returns 200
  but the value is dropped: `updateMe` in `authController.js` only accepts `photos`, `closing` and `recap`. Please
  add `activity` to that list and return it in `user.notify`. Settings now checks the reply and tells the person
  if the server didn't keep the change.
- **Download my data.** Settings → Your details calls `GET /api/auth/me/export` and saves the JSON it returns as
  `momento-data-YYYY-MM-DD.json`. If the export route has a different path, change it in `settings.html`
  (search `me/export`) and in `assets/devpreview.js`.
- **My albums before the email is confirmed.** The page no longer asks for `GET /api/albums` until the email is
  confirmed, so those 403s stop. No server change needed.
