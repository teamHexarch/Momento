# Momento (Next.js): what the front end now expects from the server

New since the original `BACKEND-NOTES.md` (which still applies). The front end for all of this is done and works
against the sample data (`public/assets/devpreview.js`, local only), which answers these routes with the shapes below:
use it as the reference. The typed client is `src/lib/api.ts`.

## 1. Reviews page (`/reviews`): done on the server (`Server/src/routes/reviewRoutes.js`, `models/Review.js`)

Private feedback for the team: **nobody sees anyone else's review**, and the page shows no list or numbers. One review
per person (sending again replaces it); leaving one needs a signed-in account. **Everything is out of 5 stars**: the
overall `rating` is the only required answer; each part of Momento has its own optional star rating (`scores`);
host or guest and a comment are optional. Each review is emailed to `SUPPORT_EMAIL` (subject `[Momento review] …`,
Reply-To the person).

Parts (`scores` keys, shared by the server and the page): `join` (joining the album), `upload` (adding photos),
`quality` (photo quality), `find` (finding photos). `role`: `host` | `guest`.

### `GET /api/reviews`
`{ "mine": { "id", "rating", "scores": { "join": 4, "upload": 3 }, "role"?, "body"?, "createdAt", "updatedAt"? } }`,
or `{ "mine": null }` (no review yet, or signed out). `scores` only has the parts that were rated.

### `POST /api/reviews` (signed in)
Body `{ "rating": 1-5, "scores"?: { "join"?: 1-5, "upload"?: 1-5, "quality"?: 1-5, "find"?: 1-5 }, "role"?, "body"?: "≤ 1,500 characters" }`.
A score that isn't a whole number from 1 to 5, or an unknown part, is dropped. Creates the review (`201`) or replaces it
(`200`; parts left out are cleared): `{ "review": {…} }`. Errors (shown as written): `401` with `code: "login-required"`,
`400` for a missing overall rating or a comment over 1,500 characters, `429` after 20 sends in an hour.

### `DELETE /api/reviews/:id` (signed in, own review only)
`{ "ok": true }`. `403` for someone else's review, `404` if it's gone.

### `GET /api/reviews/stats` (staff only; a plain 404 for everyone else)
The team's numbers for every review that isn't hidden:
```json
{ "summary": { "average": 4.3, "count": 15, "counts": { "1": 0, "2": 1, "3": 2, "4": 4, "5": 8 },
  "parts": { "join": { "average": 4.6, "count": 12 }, "upload": { "average": 3.9, "count": 11 },
             "quality": { "average": 4.8, "count": 10 }, "find": { "average": 3.5, "count": 8 } },
  "roles": { "host": 8, "guest": 6 }, "comments": 9 } }
```
To leave a review (spam, a test) out of the numbers, set `hidden: true` on it in the `reviews` collection. Reviews sent
with the earlier checklist version of the form may also hold `worked`, `better` and `event`; those are no longer read.

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
