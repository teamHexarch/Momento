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
  `GET /api/admin/session`, `POST /api/admin/verify-code` `{ email, code }` and `POST /api/admin/lock` also needs the
  4-hour pass that `verify-code` sets (an httpOnly cookie); without it: `403` with `code: "ADMIN_CODE_REQUIRED"`.
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
| POST | /api/admin/users/:id/unsuspend |
| GET | /api/admin/moderation |
| GET | /api/admin/moderation-status |
| POST | /api/admin/moderation-status/relearn |
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
| POST | /api/albums/:id/photos |
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
| GET | /api/photos/liked |
| GET | /api/photos/:id |
| GET | /api/photos/:id/download |
| DELETE | /api/photos/:id |
| POST | /api/photos/:id/bookmark |
| POST | /api/photos/:id/like |
| GET | /api/photos/:id/likes |
| POST | /api/photos/:id/reaction |
| GET | /api/photos/:id/reactions |
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
