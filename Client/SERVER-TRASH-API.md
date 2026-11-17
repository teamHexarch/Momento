# Recently deleted: what the Momento server needs

The My albums page now has a **Recently deleted** bin (like the Photos app). Photos you delete wait there for
30 days and can be recovered. The page already works against the sample-data stand-in
(`assets/devpreview.js`); this is what the real server has to match.

The old `DELETE /api/photos/:id` still deletes for good. The web app no longer calls it, but it should follow the
same rule: **host only** (today it also lets the uploader delete their own photo, which is no longer wanted).

## Rules

- Deleting moves a photo to the bin (a **soft delete**: set `deletedAt` and `deletedBy`).
- A soft-deleted photo is left out of everything people see: album photo lists, `photos` and `mine` counts,
  covers and `pics`, the feed and recent lists, the zip download, and like and reaction totals.
- **Only the host of an album can delete, recover or purge its photos.** Guests (and the person who uploaded a
  photo, if they aren't the host) get a 403. Guests can still hide other people's photos from their own view.
  Only hosts see a bin; it holds the trashed photos of the albums they host.
- A nightly job purges photos where `deletedAt` is older than **30 days**, including the stored files.
- Hiding (other people's photos, from your own view only) is unchanged: `POST /api/albums/:id/hidden`.

## Endpoints

Photo ids are the same ids the page already uses (for example `a4-p12`).

### `POST /api/trash`
Move photos to the bin.

    body:     { "photoIds": ["a4-p0", "a4-p1"] }
    200:      { "moved": 2, "skipped": 0 }      // skipped = not found, already in the bin, or not allowed
    403:      { "error": "Only the host of an album can delete its photos." }   // when nothing could be moved

### `GET /api/trash[?album=<albumId>]`
Photos in the bin, newest deleted first. `album` limits it to one album.

    200: { "photos": [ {
           "id": "a4-p0", "albumId": "a4", "albumName": "Team offsite",
           "url": "...", "thumbnailUrl": "...", "downloadUrl": "...",
           "deletedAt": "2026-11-16T10:00:00.000Z", "purgeAt": "2026-12-16T10:00:00.000Z"
         } ] }

### `POST /api/trash/restore`
Bring photos back to their albums (counts, covers and so on come back with them).

    body: { "photoIds": ["a4-p0"] }  or  { "all": true }  or  { "all": true, "album": "a4" }
    200:  { "restored": 1 }

### `POST /api/trash/purge`
Delete for good, now. Same body as restore.

    body: { "photoIds": ["a4-p0"] }  or  { "all": true }  or  { "all": true, "album": "a4" }
    200:  { "purged": 1 }

### `GET /api/hidden[?album=<albumId>]`
Photos **you** hid from your own view (the "Hidden by you" tab), across albums or in one.

    200: { "photos": [ { "id", "albumId", "albumName", "url", "thumbnailUrl", "downloadUrl", "by" } ] }

## Changes to existing responses

- `GET /api/albums`: add top-level `trashCount` (photos in your bin, all albums) and `hiddenCount`
  (photos you hid, all albums). The bin button's badge reads `trashCount`.
- Each album in that list (and in `GET /api/albums/:id`): add `trashCount` for that album.
- `photos` and `mine` on an album must **not** include trashed photos. Restoring puts them back.
