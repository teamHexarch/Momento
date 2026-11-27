# Server changes the website needs

Each item says what the website does already, and what the server needs to add. The website keeps working with
the server as it is today: nothing here breaks if it isn't done yet; the feature is just incomplete.

## 1. Remember the upload agreement (per person, per album): server done, needs switching on

**Website (done):** the first time someone uploads to an album, the upload window asks them to tick:

> I took these photos or have permission to share them, and the people in them are happy for them to be shared
> with this album. I let Momento store, check and show them to the album's members, as set out in the Terms.

Upload stays off until it's ticked. When it's ticked, the website records it with `POST /api/albums/:id/consent`
(the Terms version from the album's `termsVersion`), before the upload starts. A second device skips the question
when the album's `uploadConsent` matches. If the Terms changed while the page was open (`409 terms-outdated`), the
box is shown again. If the record didn't get through (the connection dropped as the box was ticked) and an upload
is then refused with `consent-required`, the website sends the agreement again and carries on; only if that fails
does it ask again. Against a server without the endpoint, it's remembered on the device as before.

**Server (done in f09478b):** the endpoint, `uploadConsent` and `termsVersion` on the album, and `UPLOAD_CONSENT`.

**Still needed:** once the website with this change is live, set `UPLOAD_CONSENT=on` in production. The tests run
with it on (`e2e/server.mjs`).

## 2. Guests on borrowed or shared phones (the 3-device limit)

**Website (done):** new events don't check guests' location unless the host ticks "Check guests are at the venue"
(the website saves `locationRequired: false` with `PATCH /api/events/:id/policy` right after creating the event,
which the server already supports). A guest with the link or QR code goes straight into the album; nobody is asked
for their location.

**Server (needed):** guests hit the login device limit (3) on a borrowed phone or when moving between devices.

- Raise the device limit to 10 (`services/deviceLogin.js`).
- For accounts that only join albums (not hosts), don't send the takeover email; just sign the oldest device out.
- Optional: default `locationRequired` to `false` in `Album.js` too, so events made any other way match the website.

## 3. Big albums: photos deleted for good in live updates

**Website (done):** an album opens with its newest 200 photos and loads the rest a page at a time in the
background (`?limit=200&before=`). While it's open, a changed stamp asks only for what changed (`?since=`) plus the
album's details (`?limit=1`). The stamp is checked every 3 seconds while you use the page, every 15 after a
minute idle and every 30 after five; never while the tab is in the background; and less often after errors.

**Server (would help):** `DELETE /api/photos/:id` removes the photo row, so `?since=` can't list it in `removed`.
The website notices because `total` no longer matches and loads the whole album again, which is correct but
heavy for a big album. Keeping a short-lived note of deleted photo ids per album (for example for a day), and
listing them in `removed`, would let it drop just that photo.
