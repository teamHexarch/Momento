# Momento (Next.js): what the front end now expects from the server

New since the original `BACKEND-NOTES.md` (which still applies). The front end for all of this is done and works
against the sample data (`public/assets/devpreview.js`, local only), which answers these routes with the shapes below:
use it as the reference. The typed client is `src/lib/api.ts`.

## 1. Reviews page (`/reviews`): done on the server (`Server/src/routes/reviewRoutes.js`, `models/Review.js`)

Private feedback for the team: **nobody sees anyone else's review**, and the page shows no list or numbers. One review
per person (sending again replaces it); leaving one needs a signed-in account. It's a checklist: **only the stars are
required**, everything else is an optional tap, and the comment is optional. Each review is emailed to `SUPPORT_EMAIL`
(subject `[Momento review] …`, Reply-To the person).

Checklist keys (the server and the page share them):
- `role`: `host` | `guest`
- `event`: `wedding` | `birthday` | `party` | `work` | `trip` | `other`
- `worked` / `better` (lists, an area is in one or the other, never both): `join` | `upload` | `quality` | `find` | `guests` | `privacy`

### `GET /api/reviews`
`{ "mine": { "id", "rating", "role"?, "event"?, "worked": [], "better": [], "body"?, "createdAt", "updatedAt"? } }`,
or `{ "mine": null }` (no review yet, or signed out).

### `POST /api/reviews` (signed in)
Body `{ "rating": 1-5, "role"?, "event"?, "worked"?: [], "better"?: [], "body"?: "≤ 1,500 characters" }`.
Unknown checklist values are dropped. Creates the review (`201`) or replaces it (`200`): `{ "review": {…} }`.
Errors (shown as written): `401` with `code: "login-required"`, `400` for a missing rating or a comment over 1,500
characters, `429` after 20 sends in an hour.

### `DELETE /api/reviews/:id` (signed in, own review only)
`{ "ok": true }`. `403` for someone else's review, `404` if it's gone.

### `GET /api/reviews/stats` (staff only; a plain 404 for everyone else)
The team's numbers for every review that isn't hidden:
```json
{ "summary": { "average": 4.3, "count": 15, "counts": { "1": 0, "2": 1, "3": 2, "4": 4, "5": 8 },
  "areas": { "join": { "worked": 7, "better": 1 }, "upload": { "worked": 6, "better": 2 } },
  "roles": { "host": 8, "guest": 6 }, "events": { "wedding": 4, "party": 3 }, "comments": 9 } }
```
To leave a review (spam, a test) out of the numbers, set `hidden: true` on it in the `reviews` collection.

## 2. Photos: optional `name` and `size` (album window sorting)

My albums can now sort an album's photos by **file name** and **largest first**. Those two choices only appear when the
photos carry these fields, so nothing breaks without them:

- `name`: the original file name, e.g. `"IMG_4210.HEIC"`
- `size`: the original file's size in bytes, e.g. `3481920`

Add them to each photo in `GET /api/albums/:id` (`photos[]`). Sorting is done in the browser on the photos the album
answer includes; if albums are ever paged, sorting by name or date on the server (`?sort=`) would be needed too.

## 3. Things that need no server change
- Camera zoom, flash, timer, grid lines, brightness: all in the browser (`assets/event.js`).
- The viewer's zoom, the album filters (yours, bookmarked, with reactions, added by): browser only.
- Upload formats: the picker now lists HEIC/HEIF, AVIF, JPEG XL, TIFF and camera RAW explicitly. The server must
  accept what it already accepts (`/api/config` `uploads.maxPhotoMB` / `maxRawMB` still set the limits).
