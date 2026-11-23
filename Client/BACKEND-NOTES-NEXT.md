# Momento (Next.js): what the front end now expects from the server

New since the original `BACKEND-NOTES.md` (which still applies). The front end for all of this is done and works
against the sample data (`public/assets/devpreview.js`, local only), which answers these routes with the shapes below:
use it as the reference. The typed client is `src/lib/api.ts`.

## 1. Reviews page (`/reviews`) — new routes

One review per person. Anyone can read; posting and deleting need a signed-in account.

### `GET /api/reviews?sort=newest|highest|lowest&rating=1..5&cursor=…`
- `sort`: default `newest`. `highest` / `lowest`: by rating, newest first within a rating.
- `rating`: optional, only reviews with that many stars.
- `cursor`: optional, from the previous answer's `next`. Pages of about 6–20.

```json
{
  "reviews": [
    { "id": "r1", "name": "Hannah L.", "rating": 5, "title": "Every photo from the wedding, in one place",
      "body": "We put the QR code on the tables…", "createdAt": "2026-11-19T10:00:00.000Z",
      "updatedAt": "2026-11-20T09:00:00.000Z", "you": false }
  ],
  "summary": { "average": 4.3, "count": 12, "counts": { "1": 0, "2": 1, "3": 1, "4": 3, "5": 7 } },
  "mine": null,
  "next": "6"
}
```
- `summary` is for **all** reviews (ignores `rating`), average to one decimal.
- `mine`: the signed-in person's own review (same shape), or `null`. `you: true` on it wherever it appears in `reviews`.
- `name`: how the reviewer is shown. The sample data uses first name + last initial ("Priya S.").
- `title` is optional (leave it out when empty). `updatedAt` only when edited.

### `POST /api/reviews` (signed in)
Body `{ "rating": 1-5, "title": "optional, ≤ 80", "body": "20–1,500 characters" }`.
Creates the person's review, or **replaces** it if they already have one. Answer `201 { "review": {…}, "summary": {…} }`.
Errors (shown to the person as written): `401 { "error": "Log in to write a review.", "code": "login-required" }`,
`400` for a missing rating, too short or too long text.

### `DELETE /api/reviews/:id` (signed in, own review only)
Answer `{ "summary": {…} }`. `403` for someone else's review, `404` if it's gone.

Worth doing server side (no front-end change needed): rate limiting, a profanity/spam check, and a way for the team to
hide a review (just leave it out of `reviews` and `summary`).

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
