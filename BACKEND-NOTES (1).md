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

## Backend to-do from the front-end audit (20 November 2026)

Two tasks. Task 1 is required, task 2 is optional. The site keeps working as it does today until these ship.

### Task 1 (required): add a small "mini" thumbnail to every photo

Why:
- Grids show the 600px thumbnail at only 26–170px wide.
- A 60-photo album downloads 3–4 MB of thumbnails; with minis it's under 1 MB.

Make the mini:
- Make it wherever the 600px thumbnail is made today, from the same original.
- 320px wide, height to keep the photo's shape (no crop).
- WebP, quality about 75.
- Apply orientation, strip EXIF (no GPS in the file).
- Store it next to the thumbnail, with the same access rules.

Backfill:
- Run a one-off job to make minis for all existing photos.
- Include photos in the bin and hidden photos.

Send it:
- Add `miniUrl` to every photo object that already has `thumbnailUrl`, in:
  - `GET /api/albums/:id` (`photos[]`)
  - `GET /api/photos/bookmarked`
  - `GET /api/photos/liked`
  - `GET /api/trash`
  - `GET /api/hidden`
- No mini yet for a photo? Leave `miniUrl` out. Don't send `null` or `""`.
- Example: `{ "id": "p_123", "thumbnailUrl": "…?size=thumb", "miniUrl": "…?size=mini", … }`

Caching:
- Same cache headers as the thumbnail.
- If the URL changes when the image changes: `Cache-Control: public, max-age=31536000, immutable`.

Good to know:
- The front end is already done: it uses `miniUrl` when present and falls back to `thumbnailUrl` when not.
- `assets/devpreview.js` (sample data) already sends `miniUrl`, so you can check the shape there.
- 320px, not 200px: a 2× phone screen needs about 250–340px for these tiles; 200px would look blurry and the
  browser would skip it.

Check it worked:
- Open an album on a phone with the network panel open.
- Grid pictures should be the mini files, about 15–35 KB each (not 60–120 KB).

### Task 2 (optional): invite links show the album's own name and cover

Why:
- Pasting an invite link in WhatsApp or iMessage shows one generic Momento card today.
- The site is static (GitHub Pages) and those apps don't run JavaScript, so only the API can fill in the album.

Build one public route:
- `GET https://api.hexarch.org/s/:code` (works for album codes and group codes).
- Returns a small HTML page (`Content-Type: text/html; charset=utf-8`).

The page must have:
- `og:title`: "Join {album name} on Momento"
- `og:description`: e.g. "48 people are sharing photos. Open the link to see the album and add yours."
- `og:image`: the album cover, 1200×630 JPEG, under 300 KB (WhatsApp ignores bigger images)
- `og:image:width` 1200, `og:image:height` 630
- `og:url`: `https://api.hexarch.org/s/CODE`
- `og:site_name`: Momento, `og:type`: website
- `twitter:card`: `summary_large_image`
- A redirect: `<meta http-equiv="refresh" content="0; url=https://hexarch.org/events.html?join=CODE">`
  (groups: `events.html?group=CODE`), plus a normal link to the same address.

Rules:
- Private album, or a wrong / expired / revoked code: use the generic card
  (`https://hexarch.org/assets/og-momento.jpg`, title "Momento"), and still redirect.
- Never put a private album's name or photos in the tags.
- Cover = the host's chosen cover, else the most-liked photo.
- Cache the cover image per album; remake it when the cover changes.
- Escape the album name in the HTML.
- Cache the response for about 10 minutes.

When it's live:
- Tell the front end. The share and copy-link buttons will switch to `https://api.hexarch.org/s/CODE` links.
- QR codes can stay as they are.

### Nothing else needs the server

- All other audit fixes are front end only.
- One check: if the Momento server also serves the site locally (port 4000), it should send
  `manifest.webmanifest` as `application/manifest+json` and `.webp` as `image/webp`.
  Express's static middleware already does this.
