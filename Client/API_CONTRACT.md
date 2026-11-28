# API_CONTRACT.md: the Momento server's API, as the front end must use it

> **CRITICAL FRONTEND RULE:** Any UI, styling, or feature modifications made to this client **MUST** work strictly with
> the existing Node.js backend endpoints, request/response schemas, authentication headers, and WebSocket events
> documented in `API_CONTRACT.md`. Do not invent, rename, or alter backend routes or payload structures without
> updating the backend together.

- **Server:** `Server/` in this repository (Express 5 + MongoDB). Routes live in `Server/src/routes/*.js`, mounted in
  `Server/src/app.js`. The server is the source of truth: if this file and the server disagree, the server wins and this
  file gets fixed.
- **Address:** `https://api.hexarch.org` today. It moves to `https://momento.hexarch.org/api` with the domain change.
  The address is set in one place, `public/assets/api.js`.
- **Auth:** an HttpOnly login cookie set by `POST /api/auth/login` (or signup / Google). Requests send it with
  `credentials: 'include'`; there is no Authorization header. Writes are checked as same-origin (`sameOriginWrites`).
- **Admin** (`/api/admin/*`): only the admin team's accounts (at most 6) see these (404 for everyone else). Everything except
  `GET /api/admin/session`, `POST /api/admin/verify-code` `{ code, totp? }` and `POST /api/admin/lock` also needs the
  4-hour pass that `verify-code` sets (an httpOnly cookie); without it: `403` with `code: "ADMIN_CODE_REQUIRED"`.
  Owners with an authenticator app set up also send its 6-digit code as `totp` (`GET /api/admin/session` says
  `totpRequired`); missing: `401 ADMIN_TOTP_REQUIRED`, wrong or already used: `401 ADMIN_TOTP_WRONG`.
  Staff sign in to the one shared staff account; the code alone says who it is (`session` has `shared: true` and
  `staff: null` until a code is entered). Each person chooses their code at `/set-code#<key>` (the emailed link):
  `GET /api/admin-setup/:key` → `{ name, slot, role, expiresAt }`, `POST /api/admin-setup/:key` `{ code }` → `{ ok, name }`;
  `410 ADMIN_SETUP_EXPIRED` once used, expired or after 5 refused codes; `409 ADMIN_CODE_TAKEN`, `400 ADMIN_CODE_INVALID`.
  Team management answers never contain a code (`emailed: true`).
  5 wrong codes in 15 minutes: `429` with `code: "ADMIN_CODE_LOCKED"`. Team management (`/api/admin/team*`,
  `/api/admin/audit`) is for owners (`403 ADMIN_OWNER_ONLY` otherwise).
- **Errors:** `{ "error": "Message to show as written", "code"?: "machine-code" }` with a 4xx/5xx status. Rate limits
  answer `429` with the same shape.
- **WebSockets:** none yet. If any are added, list every event here before the front end uses it.
- **Payload shapes:** `BACKEND-NOTES.md`, `BACKEND-NOTES-NEXT.md`, `SERVER-TRASH-API.md` and the typed client
  `src/lib/api.ts`. Keep them in step with the server when either side changes.

## Max 3 devices (Settings → Active devices, and the 4th login)

- **A 4th login** (free and plus plans; admin and staff plans have no limit) answers `409`:
  `{ "code": "SESSION_LIMIT_REACHED", "error": "…", "max": 3, "devices": [Device, …] (least recently active first),
  "pendingLoginToken": "…" (10 minutes, one use), "challenge": "…" (the older emailed-code way, still works) }`
- **`POST /api/auth/devices/takeover`** `{ pendingLoginToken, oldest: true }` ("Sign out oldest device & continue") or
  `{ pendingLoginToken, deviceId }` (sign out that one): logs in here, `{ user, signedOut: { id, name } }`.
  `403 PENDING_LOGIN_EXPIRED` (expired, used, or the password changed), `404 DEVICE_NOT_FOUND`.
- **`GET /api/auth/devices`** (signed in): `{ devices: [Device], max: 3 | null (no limit), count }`, this device first.
- **`DELETE /api/auth/devices/:id`**: signs that device out at once (`400 DEVICE_IS_CURRENT` for this one: use log out).
- **`POST /api/auth/devices/sign-out-others`**: `{ ok, signedOut: n }`.
- `Device`: `{ id, name: "iPhone • Safari", ipPrefix: "203.0.113.x" | null, loggedInAt, lastActiveAt, expiresAt, current }`
  (lastActiveAt is updated at most every 5 minutes).

## Photo comments

- **`GET /api/photos/:id/comments`** (album members): `{ comments: [Comment] (oldest first), count, max: 50, allowComments, maxLength: 200 }`
- **`POST /api/photos/:id/comments`** `{ text }` (1-50 characters, trimmed, spaces collapsed): `201 { comment, commentCount }`.
  `403 COMMENTS_OFF` (the host turned them off), `409 COMMENT_LIMIT` (50 already), `429 COMMENT_RATE_LIMIT` (10 a minute),
  `400 TEXT_TOO_LONG` / `TEXT_EMPTY`. 404 for anyone outside the album or a photo in the bin.
- **`DELETE /api/photos/:id/comments/:commentId`**: the author or the album's host: `{ ok, commentCount }`
  (`403 COMMENT_NOT_YOURS`). The admin team: `DELETE /api/admin/comments/:id`.
- `Comment`: `{ id, text, by: "You" | first name, mine, at, canDelete }`
- Each photo in `GET /api/albums/:id` has `commentCount` (for the badge); the album has `allowComments`, which the host
  changes with `PATCH /api/albums/:id { allowComments: true | false }`.
- Comments go with their photo (any deletion) and with their author's account.

## Text limits (server-enforced; show a live counter)

Text is trimmed and runs of spaces collapsed; over the limit: `400 { code: "TEXT_TOO_LONG", max }`.
Photo comment 200 · review comment 300 · review "Other" feature request 100 · a person's name 40 ·
album, event and group names 60 (an older, longer album name is kept until it's renamed) · descriptions, trivia
questions and prompts 160. (Server/src/utils/text.js `LIMITS`.)

## Sorting

- **`GET /api/albums?sort_by=name|date&order=asc|desc`** (default: date, newest first).
- **`GET /api/albums/:id?sort_by=uploaded|taken|name|uploader&order=asc|desc`** (default: uploaded, newest first; name
  and uploader default to A→Z; name uses natural order, so img_2 comes before IMG_10; taken = capture date, falling
  back to the upload date).
- Each photo in `GET /api/albums/:id` now also has `name` (original file name), `size` (bytes) and `takenAt`
  (capture date or null), for sorting in the browser too.

## Uploads

- **Before uploading:** `POST /api/albums/:id/photos/known` `{ hashes: [sha256 hex, …] }` (up to 500; compute each
  file's SHA-256 with `crypto.subtle.digest`) → `{ known: [hash, …] }`: files the album already has (or that you have
  waiting), so the page can skip them. Uploading one anyway is still skipped (`skipped` in the answer).
- **Caps:** each album has `uploadLimits: { perGuest, total }` (defaults 150 and 1,500; the host has no per-person cap).
  The host changes them with `PATCH /api/albums/:id { uploadLimits: { perGuest?: 1-1000, total?: 1-10000 } }`.
  An upload answer now has `overLimit: [names]` (left out, later photos first) and `uploadLimits`; when nothing could
  be added for that reason: `409 { code: "UPLOAD_LIMIT", overLimit, uploadLimits }`.
- **What's stored:** iPhone HEIC/HEIF photos work (kept as HEIC, shown from a JPEG preview). Camera RAW files
  (.NEF, .CR3, .ARW, …) are stored as a JPEG of up to 2560 px; the RAW itself is not kept, so Download gives the JPEG.
  Previews are up to 2560 px, with no EXIF or GPS. The capture date is kept (`takenAt` on each photo).
- **Direct uploads** (when `GET /api/config` has `uploads.direct: true`): `POST /api/albums/:id/uploads`
  `{ files: [{ name, size, sha256 (hex) }] }` (1-30) → `{ uploads: [{ i, ticket, url, method: "PUT", headers }],
  skipped: [i], tooBig: [names], expiresIn }`. PUT each file to its `url` with exactly those `headers` (no cookie; the
  storage checks the SHA-256), then `POST /api/albums/:id/uploads/process` `{ tickets: [...] }` → the same answer as
  `POST /api/albums/:id/photos` (plus `missing: [names]`). `409 upload-missing` when none arrived (send again);
  `404 direct-upload-off` when the server takes uploads only through `POST /api/albums/:id/photos`, which still works.

## Joining an event: the location check

- `POST /api/albums/join` `{ code, location?: { lat, lng, accuracy, timestamp } }` (and `POST /api/events/:id/join` for
  public events). When the host requires location, the guest's fix counts when it's within the zone's radius plus its
  `accuracy`, but at most **100 m** extra (indoor GPS drift). A fix older than 2 minutes doesn't count. No location
  sent: `409 check-location`; outside the zone: a join request for the host (`202 { pending: true }`).
- The host chooses public or invite-only (`PATCH /api/albums/:id { visibility }`) and turns the location check on or
  off with `PATCH /api/events/:id/policy { locationRequired: true | false }`.

## Asking for a review of a declined photo

- `POST /api/auth/moderation/:id/review` first takes an automatic second, closer look (the photo up to 4096 px, against
  the thresholds learned from staff). If it now comes out at level 75 or below the photo is published at once:
  `{ id, status: "allowed", published: true, message }`. Otherwise it goes to staff as before: `{ id, status: "review-requested", message }`.
- At level 85 or 95 with Rekognition at least 85% sure (`REVIEW_SURE_AT`), the upload is `explicit` like level 100:
  no review possible (`400 explicit`).

## Recently deleted (the bin)

- `GET /api/trash[?album=]` → `{ photos: [{ id, albumId, albumName, url, thumbnailUrl, miniUrl?, downloadUrl, host, deletedBy, deletedAt, purgeAt }] }`:
  every deleted photo in albums you host (`host: true`), and in other albums the ones you added **and** deleted yourself.
  `deletedBy` is `"You"` or the first name of whoever deleted it (the host sees guests' deletions).
- `POST /api/trash/restore` and `POST /api/trash/purge` (`{ photoIds }` or `{ all: true[, album] }`) act on the same set:
  a guest can recover or delete for good only their own deleted photos.
- `trashCount` on `GET /api/albums` (each album and the total) and `GET /api/albums/:id` counts the same set.

## Event mini-games (polls, trivia, photo battle, scavenger bingo, mystery crop, photo competitions)

**Events only** (albums with a time and a place): in a plain photo album `GET …/games` answers `{ enabled: false,
rounds: [] }` (don't show a games section) and everything else `403 GAMES_EVENTS_ONLY`. In events: album members
only (404 otherwise); creating and running games is for the host (`403 GAME_HOST_ONLY`).
**Poll the state every `pollEveryMs` (3 s)**: the server builds it at most every 2 s per album, so polling is cheap.

- `GET /api/albums/:id/games` → `{ enabled: true, rounds: [Game], leaderboard: [{ rank, name, points, mine }] (top 10), myPoints, host, pollEveryMs }`
- `GET /api/albums/:id/games/:round` → `{ game: Game }`
- **Games on or off:** an event has games unless its host turns them off. `POST /api/albums` with `games: false` (events
  only; default on) and `PATCH /api/albums/:id { games: true | false }` (host; `400 GAMES_EVENTS_ONLY` for a plain
  album). Album summaries carry `games` (always `false` for plain albums). With games off, `GET …/games` answers
  `{ enabled: false, off: true, … }` and everything else `403 GAMES_OFF` (nothing is deleted; turning them back on
  brings the games back).
- **Time limits** (polls, photo battles, bingo): add `minutes: 1-1440` or `untilEventEnds: true` when creating the game.
  It ends by itself at `Game.endsAt` (set when it starts; the server checks every 15 s, and on every state read).
  Every `Game` carries `endsAt` (null without a limit), `minutes`, `untilEventEnds`.
- **Winners:** when any game except a poll ends (time up, or the host ends or finishes it), the top 3 places are
  saved (ties share a place): a finished `Game` carries `results: [{ name, points, place, mine }]` and `iWon`.
  Everyone in 1st place gets a `game-won` notification ("You won <game> at <event>! 🏆", with `gameId`, `gameTitle`;
  it opens `albums#album=<id>&game=<gameId>`). The games response also has `winsBoard: [{ rank, name, wins, points,
  mine }]` (top 10 by games won) and `myWins`.
- **Host:** `POST /api/albums/:id/games` with
  `{ type: "poll", title, question, options: [2-6 texts], start?: true }` or
  `{ type: "trivia", title, questions: [{ text, options: [2-4], answer: index, seconds?: 5-120 (20) }] (1-20), start?: true }`
  → `201 { game }` (a draft unless `start`). Then `POST …/:round/start`, `…/:round/next` (trivia: next question; after
  the last one it ends), `…/:round/end`, `DELETE …/:round`. Titles and options up to 60 characters, questions 160.
- **Players:** poll `POST …/:round/vote { option: id }` (can be changed while live; 10 points for taking part).
  Trivia `POST …/:round/answer { question: index, option: index }`: only the question on screen, before its time is
  up, once (`409 GAME_STATE` / `GAME_TIME_UP` / `GAME_ANSWERED`); right answers score 100 + up to 50 for speed.
  `409 GAME_NOT_LIVE` before the start or after the end. 60 votes/answers a minute (`429 GAME_RATE_LIMIT`).
- **Photo battle** (host: `{ type: "battle", title, maxEntries?: 1-5 (1), start?: true }`): while it's live, players enter
  their own photos from the event: `POST …/:round/entries { photo: photoId }` (`403 GAME_PHOTO_NOT_YOURS`,
  `409 GAME_ENTRY_LIMIT`), withdraw with `DELETE …/:round/entries/:photo`. Voting: `GET …/:round/pair` →
  `{ pair: [{ photo, url, thumbnailUrl, miniUrl }, …] }` (never your own photos, never a pair you've voted on) or
  `{ pair: null, reason: "all-voted" | "not-enough-photos" }`; then `POST …/:round/pick { winner, loser }`
  (`403 GAME_OWN_PHOTO`, `409 GAME_ANSWERED`). 2 points per vote for the first 10 votes; when the host ends it, the
  owners of the 1st, 2nd and 3rd photos get 100, 60 and 30 (one place per person). Deleted photos drop out.
- **Scavenger bingo** (host: `{ type: "bingo", title, size?: 3 | 4 (3), prompts?: [size x size texts, up to 160 characters,
  row by row] (a ready-made card if left out), start?: true }`): while live, claim a tile with one of your own event photos:
  `POST …/:round/claims { tile: index, photo: photoId }` (again on the same tile swaps the photo; each photo counts once:
  `409 GAME_PHOTO_USED`; `403 GAME_PHOTO_NOT_YOURS`). Take it back: `DELETE …/:round/claims/:tile`; the host removes
  anyone's: `DELETE …/:round/claims/:tile?user=<userId>`. 10 points a tile, 30 per full row/column/diagonal, 100 for
  the full card (they follow the claims: a removed claim or deleted photo takes its points away).
- **Mystery crop** (host: `{ type: "crop", title, photos: [photoId | { photo, question, options: [2-4], answer }] (1-10)
  or auto: 1-10 (random event photos), seconds?: 15-120 (30), start?: true }`). Without a question, each photo asks
  "Whose photo is this?" with the photographer and up to 3 other people with photos in the event (made automatically;
  `409 GAME_NOT_ENOUGH_PEOPLE` if only one person has photos). It runs like trivia (`…/next`, the last one ends it).
  The picture: `GET …/:round/image` (a JPEG of the photo on screen at its **current** zoom only: a close-up, then
  wider, then the whole photo, each a third of the time; header `X-Crop-Stage`). Guess: `POST …/:round/guess
  { question: index, option: index }`, one each: 150 points on the close-up, 100 on the middle zoom, 50 on the whole
  photo. Refresh the picture when `question.stage` changes (or at `question.nextStageAt`).
- **Photo competition** (host: `{ type: "contest", title: e.g. "Best dance move", maxEntries?: 1-3 (1), start?: true }`):
  while entries are open, players upload a photo **for the competition** (not an album photo):
  `POST …/:round/submissions` (multipart, one file named `photo`; checked like any upload, `422 nsfw` at level 85+,
  `409 GAME_ENTRY_LIMIT`), take it back with `DELETE …/:round/submissions/:entry`. Entry pictures:
  `GET …/:round/submissions/:entry/image[?size=thumb]` (while open: only your own and the host's; finalists, the podium
  and, once ended, the kept top 10 for everyone in the event). **Host:** `POST …/:round/shortlist` closes entries and
  picks 5-7 finalists with a one-line reason each (Rekognition; level 75+ never; without AI: the sharpest, and
  `ai: false`); `POST …/:round/podium { first, second, third }` (entry ids, different people: 100 / 60 / 30 points);
  `POST …/:round/end`: the top 10 are kept (the podium first), every other entry is deleted at once. A competition
  open for more than 24 hours is ended the same way automatically.
- `Game` (poll): `{ id, type, title, status: draft|live|ended, question, options: [{ id, text, votes, percent }], total, myChoice }`
- `Game` (trivia): `{ id, type, title, status, questionCount, current, question: { index, text, options, seconds, endsAt,
  answers, answer (only once time is up) }, myAnswer: { option, correct?, points? }, myScore }`; the host also gets
  `questions` (with the answers).
- `Game` (contest): `{ id, type, title, status, phase: entries|judging|ended, maxEntries, entries, ai, canEnter,
  myEntries: [{ id, url, thumbnailUrl }], finalists: [{ entry, score, reason, by, mine, url, thumbnailUrl }],
  podium: [{ place, entry, by, mine, url, thumbnailUrl }], top (once ended): [{ rank, entry, by, mine, url, thumbnailUrl }] }`;
  the host also gets `all` (every entry, with its level and score) while it's open.
- `Game` (crop): like trivia, and `question` also has `{ stage: 0-2, stages: 3, points, image, nextStageAt,
  photo + url, thumbnailUrl, miniUrl (once time is up) }`.
- `Game` (bingo): `{ id, type, title, status, size, tiles: [{ index, prompt, claims, mine: { photo, url, thumbnailUrl, miniUrl } | null }],
  myTiles, myLines, fullCard, myScore, leaders: [{ rank, name, mine, tiles, lines, full, points }] (top 5) }`; the host also
  gets `claims: [{ tile, user, name, photo, … }]`.
- `Game` (battle): `{ id, type, title, status, maxEntries, entries, standings: [{ rank, photo, url, thumbnailUrl, miniUrl, by,
  mine, wins, losses, rating, place? (once ended) }], myEntries: [photoId], myVotes, canEnter, canVote }`

## Every endpoint

Paths are full paths. Generated from the server's route files on 2026-11-25; regenerate when routes change.

| Method | Path |
|---|---|
| GET | /api/config |
| GET | /api/health |
| GET | /api/admin/session |
| POST | /api/admin/verify-code |
| POST | /api/admin/lock |
| GET | /api/admin/reports |
| GET | /api/admin/reports/:id/preview |
| POST | /api/admin/reports/:id/dismiss |
| POST | /api/admin/photos/:id/takedown |
| DELETE | /api/admin/comments/:id |
| POST | /api/admin/users/:id/unsuspend |
| GET | /api/admin/moderation |
| GET | /api/admin/moderation-status |
| GET | /api/admin/moderation/:id/preview |
| GET | /api/admin/moderation/:id |
| POST | /api/admin/moderation/:id |
| GET | /api/admin/switches |
| PATCH | /api/admin/switches |
| POST | /api/admin/sessions/revoke-all |
| GET | /api/admin/team |
| PUT | /api/admin/team/:slot |
| POST | /api/admin/team/:slot/rotate |
| DELETE | /api/admin/team/:slot |
| GET | /api/admin/audit |
| GET | /api/albums/preview/:code |
| GET | /api/albums/:id/cover/:token |
| GET | /api/albums |
| POST | /api/albums |
| POST | /api/albums/join |
| GET | /api/albums/:id |
| GET | /api/albums/:id/checks |
| DELETE | /api/albums/:id/checks/:check |
| PATCH | /api/albums/:id |
| DELETE | /api/albums/:id |
| DELETE | /api/albums/:id/membership |
| POST | /api/albums/:id/photos/known |
| POST | /api/albums/:id/photos |
| POST | /api/albums/:id/uploads |
| POST | /api/albums/:id/uploads/process |
| GET | /api/albums/:id/download |
| GET | /api/albums/:id/zip/:token |
| POST | /api/albums/:id/hidden |
| POST | /api/albums/:id/save |
| PUT | /api/albums/:id/cover |
| DELETE | /api/albums/:id/cover |
| POST | /api/albums/:id/remind |
| POST | /api/auth/signup |
| POST | /api/auth/login |
| POST | /api/auth/devices/code |
| POST | /api/auth/devices/verify |
| POST | /api/auth/devices/replace |
| POST | /api/auth/devices/takeover |
| GET | /api/auth/devices |
| POST | /api/auth/devices/sign-out-others |
| DELETE | /api/auth/devices/:id |
| POST | /api/auth/logout |
| GET | /api/auth/me |
| PATCH | /api/auth/me |
| DELETE | /api/auth/me |
| POST | /api/auth/email |
| POST | /api/auth/password/code |
| POST | /api/auth/password/code/verify |
| POST | /api/auth/password |
| GET | /api/auth/email/confirm |
| GET | /api/auth/email/approve-info |
| POST | /api/auth/email/approve |
| POST | /api/auth/email/cancel |
| GET | /api/auth/verify-email |
| POST | /api/auth/verify-email/resend |
| POST | /api/auth/password/forgot |
| POST | /api/auth/password/reset |
| POST | /api/auth/google |
| POST | /api/auth/avatar |
| GET | /api/auth/me/export |
| GET | /api/auth/consent |
| POST | /api/auth/consent |
| GET | /api/auth/unsubscribe |
| POST | /api/auth/unsubscribe |
| POST | /api/auth/moderation/:id/review |
| DELETE | /api/auth/avatar |
| GET | /api/events/nearby |
| GET | /api/events/requests |
| PATCH | /api/events/:id/policy |
| POST | /api/events/:id/requests/:guest |
| POST | /api/events/:id/join |
| GET | /api/albums/:id/games |
| GET | /api/albums/:id/games/:round |
| POST | /api/albums/:id/games |
| DELETE | /api/albums/:id/games/:round |
| POST | /api/albums/:id/games/:round/vote |
| POST | /api/albums/:id/games/:round/answer |
| GET | /api/groups/preview/:code |
| GET | /api/groups |
| POST | /api/groups/join |
| POST | /api/groups/:id/invite-link |
| POST | /api/groups |
| POST | /api/groups/invites/:inviteId/accept |
| POST | /api/groups/invites/:inviteId/decline |
| GET | /api/groups/:id |
| PATCH | /api/groups/:id |
| DELETE | /api/groups/:id |
| POST | /api/groups/:id/invites |
| DELETE | /api/groups/:id/invites/:inviteId |
| DELETE | /api/groups/:id/members/:userId |
| GET | /api/notifications/push/key |
| GET | /api/notifications |
| GET | /api/notifications/unread |
| POST | /api/notifications/read |
| POST | /api/notifications/clear |
| POST | /api/notifications/push |
| DELETE | /api/notifications/push |
| GET | /api/photos/bookmarked |
| GET | /api/photos/:id |
| GET | /api/photos/:id/download |
| DELETE | /api/photos/:id |
| POST | /api/photos/:id/bookmark |
| POST | /api/photos/:id/reaction |
| GET | /api/photos/:id/reactions |
| GET | /api/photos/:id/comments |
| POST | /api/photos/:id/comments |
| DELETE | /api/photos/:id/comments/:commentId |
| POST | /api/photos/:id/report |
| GET | /api/reviews |
| GET | /api/reviews/stats |
| POST | /api/reviews |
| DELETE | /api/reviews/:id |
| POST | /api/support |
| GET | /api/trash |
| POST | /api/trash |
| POST | /api/trash/restore |
| POST | /api/trash/purge |
| GET | /api/hidden |
| GET | /api/users/:id/avatar |
| POST | /api/albums/:id/games/:round/submissions |
| DELETE | /api/albums/:id/games/:round/submissions/:entry |
| GET | /api/albums/:id/games/:round/submissions/:entry/image |
| POST | /api/albums/:id/games/:round/shortlist |
| POST | /api/albums/:id/games/:round/podium |
| POST | /api/albums/:id/games/:round/guess |
| GET | /api/albums/:id/games/:round/image |
| POST | /api/albums/:id/games/:round/claims |
| DELETE | /api/albums/:id/games/:round/claims/:tile |
| POST | /api/albums/:id/games/:round/entries |
| DELETE | /api/albums/:id/games/:round/entries/:photo |
| GET | /api/albums/:id/games/:round/pair |
| POST | /api/albums/:id/games/:round/pick |
| POST | /api/albums/:id/games/:round/start |
| POST | /api/albums/:id/games/:round/next |
| POST | /api/albums/:id/games/:round/end |
