# Server changes the website needs

Each item says what the website does already, and what the server needs to add. The website keeps working with
the server as it is today: nothing here breaks if it isn't done yet; the feature is just incomplete.

## 1. Remember the upload agreement (per person, per album)

**Website (done):** the first time someone uploads to an album, the upload window asks them to tick:

> I took these photos or have permission to share them, and the people in them are happy for them to be shared
> with this album. I let Momento store, check and show them to the album's members, as set out in the Terms.

Upload stays off until it's ticked. It's remembered on that device for that account, that album and that Terms
version (`window.MOMENTO_TERMS_VERSION` in `public/assets/api.js`, currently `2026-11-07`), so later uploads to the
album go straight up. A new account, new Terms, or the server saying it has no record asks again.

**Server (needed):** a record that survives other devices and can be shown later.

- `POST /api/albums/:id/consent` with `{ termsVersion }` (members only). Stores `{ user, album, at, termsVersion }`
  (its own collection, or on the Membership). Answers `{ ok: true, termsVersion }`.
- `GET /api/albums/:id` (or the album summary) adds `uploadConsent: { termsVersion, at } | null` for the person
  asking, so a second device doesn't ask again.
- Uploads (`POST /api/albums/:id/photos`) without a record for the current Terms version: `409` with
  `code: "consent-required"` and a message such as "Tick the box to agree, then upload again."

When the server answers `consent-required`, the website already forgets its saved answer, stops the upload, keeps
the photos, and "Retry the rest" shows the agreement again. Once the endpoint exists, the website will call it
when the box is ticked (a one-line change in `assets/event.js`, `rememberConsent`).
