# Momento server

The API behind the Momento site: accounts (email and password, Google), albums, join codes and photo uploads. Live, the site (`Client/`) is on **https://hexarch.org** and this API on **https://api.hexarch.org** (AWS Lightsail). Locally, this server also serves the `Client/` pages, so one address does everything.

Node.js + Express + MongoDB Atlas (Mongoose). Photos go to a private Amazon S3 bucket (or, when S3_BUCKET isn’t set, to `Server/uploads/` on disk); their details live in MongoDB. Email goes out through Amazon SES. The sign-up check is Google reCAPTCHA.

## Layout

### Revocable login sessions

Each new login appends an entry (`id`, `expiresAt`) to the existing user's
`sessions` array and creates a JWT carrying that unique ID. No separate Session
model or sessions collection is used.
New logins are capped at three active sessions per account. Capacity is checked
atomically when appending the session, including simultaneous requests. A fourth
login returns 409/session_limit without issuing a cookie or evicting another
session. Logout and expiry free slots. This counts browser login sessions, not
physical hardware; separate browsers/incognito logins consume separate slots.
Existing sessions are not retroactively evicted by this change.
Authenticated requests require both a valid JWT and a matching unexpired record.
Logout deletes that record before clearing the cookie, so replaying the cookie
cannot restore access. Other device sessions remain active. Expiry is checked on
each request; expired array entries are pruned on login. There is no TTL index
on users, because it would delete entire user documents. Cookies issued by the
previous separate-collection implementation require a fresh login. Any old
sessions collection is unused; this change does not delete existing collections.
Run `node .qa/session-validation.mjs` from the project root for isolated replay,
multi-session, expiry, legacy-cookie and repeated logout checks.

### Connected frontend

Photo uploads are validated from their contents, not the multipart MIME type or
filename supplied by the browser. The server accepts a file only after sharp
detects an allowed format and fully decodes/re-encodes its pixels. Unsupported,
empty or corrupt files return 400 before a storage write or photo record is
created for that file. Stored extensions and response MIME types come from the
processed output. Existing upload byte/count limits still apply.

`Client/index.html` now uses the API for email/password signup and login, session
checks, logout, and album creation. `Client/albums.html` loads real albums and
photos from the API, gates unverified accounts, and supports joining, uploading,
ZIP downloads, deleting photos and deleting/leaving albums. Uploaded images are
displayed using the server's photo URL, never a local original-file blob URL.
The former browser-only sample albums are not migrated into real accounts.
Social sign-in preview buttons are hidden until their frontend flow is connected.

For a local check, keep the server running and hard-refresh
http://localhost:4000/albums.html. Log in with a real account and confirm its email.
Create or join an open album, upload a GPS-tagged original, then download it and
inspect its metadata. Existing stored photos are not retroactively sanitized.
Frontend integration test instructions are in `../.qa/README.md`.

```
Momento/
  Client/                  the website: index.html, albums.html, assets/ (icon, api.js)
                           also design-time files: CLAUDE.md, serve.mjs, screenshot.mjs, temporary screenshots/
  Server/
    scripts/               devMemory.js (temporary database), sendTestEmail.js
    src/
      app.js               builds the Express app: middleware, routes, the Client pages
      server.js            connects to MongoDB and starts listening
      config/              env.js (settings from .env), database.js
      routes/              URLs and their middleware only (authRoutes, albumRoutes, photoRoutes)
      controllers/         what each URL does (authController, albumController, photoController)
      services/            emailService (+ email/sesEmail), emailTemplates, emailTokenService (one-time links), captchaService,
                           verificationService, passwordResetService,
                           storageService (photo files) with storage/diskStorage and storage/s3Storage
      models/              Mongoose models: User, Album, Membership, Photo, EmailToken
      middleware/          authMiddleware (who is logged in), cors (which sites may call the API), errorHandler
      utils/               httpError, session (login cookie), albumCodes
    uploads/               photo files
```

Files are camelCase; models are PascalCase because each exports a class-like model.

## Run it

```bash
cd Server
npm install
# create a file called .env with the settings under "Settings" below
npm run dev                 # restarts on code changes; or: npm start
```

Open **http://localhost:4000**. You can also run `node serve.mjs` in `Client/` and open http://localhost:3000: the pages there talk to this server on port 4000, just as hexarch.org talks to api.hexarch.org.

`Client/assets/api.js` decides where the pages send API calls: the same address on port 4000, `http://localhost:4000` from any other local port, and `https://api.hexarch.org` everywhere else.

To try everything before Atlas is set up, run `npm run dev:memory`. It uses a temporary database that is wiped when it stops.

## The admin team (photo moderation)

Photo review (`review.html`) and every `/api/admin` endpoint (moderation, reports, takedowns, thresholds, switches, the
team) are for the **admin team: at most 6 people** (`admin_staff`, slots 1-6; a 7th can't be added).

- Everyone signs in to **the one shared staff account** (`ADMIN_ACCOUNT_EMAIL`; `ADMIN_OWNER_EMAIL` when that isn't
  set: team@hexarch.org), then enters **their own 6-character code** (A-Z and 0-9, at least one of each; only a salted
  scrypt hash is kept). The code alone says which of them it is (no two people have the same code), so the review page
  shows "reviewing as <name>" and every action is logged under that name. That unlocks the browser for **4 hours**
  (httpOnly cookie). Without it every admin endpoint answers `403 ADMIN_CODE_REQUIRED`; accounts not on the team get a
  plain 404. (A Momento account with a slot's own email also works, with that slot's code only.)
- **Nobody hands out codes.** Putting someone in a slot emails them a one-time link (24 hours) to `/set-code`, where
  they choose their own code; nobody else, not even the owners, ever sees it. A forgotten code: `rotate` sends a new
  link and the old code stops at once. The slot's email is only used for that link.
- **5 wrong codes in 15 minutes** (per IP address and per email) lock code entry for the rest of those 15 minutes.
- **Owners' second step** (an authenticator app): `npm run admin-team -- totp <slot>` prints a secret (and an
  `otpauth://` link) once; add it to Google Authenticator, 1Password or similar. From then on that owner enters the
  app's 6-digit code after their own code (each code works once). Lost phone: `npm run admin-team -- totp-off <slot>`,
  then `totp <slot>` again. The secret is kept encrypted with `ADMIN_TOTP_KEY` (or `JWT_SECRET` when that isn't set),
  so changing that key means setting the app up again.
- Owners manage the slots: `GET /api/admin/team`, `PUT /api/admin/team/:slot` (assign: emails the
  setup link), `POST /api/admin/team/:slot/rotate` (a new link), `DELETE /api/admin/team/:slot`, and the log at `GET /api/admin/audit`.
  Changing a code or removing someone ends their access at once. From the server:
  `npm run admin-team -- list | add <slot> <email> "<name>" [owner|moderator] | rotate <slot> | revoke <slot>`
  (on Lightsail inside the api container).
- First owner: `ADMIN_OWNER_EMAIL` + `ADMIN_OWNER_CODE` (or `ADMIN_STAFF_JSON`) fill empty slots at start-up.
- The team may have **no owner**: then everyone is a moderator and the team is managed only from the server
  (`npm run admin-team -- add | rotate | revoke | role <slot> owner|moderator`), which needs no code.
- Every code entry, lock-out, decision, threshold change and team change is in `admin_audit_logs` with the person's
  slot, name and email and the start of their IP address (append-only, kept 2 years).
- Try it locally: `node scripts/reviewPreview.js` (throwaway database; the test admin and code are in that file).

## Settings (.env)

Create `Server/.env` (it is never committed) with these settings. Only `MONGODB_URI` and `JWT_SECRET`
are required to start; the rest switch features on. On the AWS server the same settings live in
`/opt/momento-config/server.env` instead.

```ini
# MongoDB Atlas connection string (Atlas > Connect > Drivers). Put the database name before the "?".
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/momento?retryWrites=true&w=majority

PORT=4000
# Long random string used to sign login cookies. Generate one with:
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_SECRET=change-me
# How long a login lasts, in days
# How long a login lasts without being used, in days (its token is renewed every 12 hours of use)
TOKEN_DAYS=7
# The address this API is reached at (live: https://api.hexarch.org). Used in photo links and cookies.
PUBLIC_URL=http://localhost:4000
# Optional public API for verification emails when local testing shares its database.
# Example: https://api.hexarch.org. Defaults to PUBLIC_URL.
EMAIL_VERIFICATION_BASE_URL=
# Where people open the site. Leave empty locally (this server then serves the Client pages too).
# Live: FRONTEND_URL=https://hexarch.org  (and PUBLIC_URL=https://api.hexarch.org)
FRONTEND_URL=
# Sites allowed to call the API with the login cookie, comma-separated. Empty = FRONTEND_URL plus localhost:3000.
# Live: CORS_ORIGINS=https://hexarch.org,https://www.hexarch.org
CORS_ORIGINS=

# Folder with index.html and albums.html (relative to this Server folder)
CLIENT_DIR=../Client
# Where uploaded photos are written when S3_BUCKET is empty (relative to this Server folder)
UPLOAD_DIR=uploads
# Largest single photo, in megabytes (a bigger one is left out; the rest of the upload still goes in)
MAX_UPLOAD_MB=50
# Camera RAW files (CR2, CR3, NEF, ARW, RAF, DNG, ORF, RW2...) skip that limit; this is only their safety ceiling
MAX_RAW_UPLOAD_MB=300

# Google sign-in (Google Cloud Console > APIs & Services > Credentials > OAuth client ID, type "Web application")
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Google Maps JavaScript API + Places API (New) key, for picking the venue when creating an album.
# A browser key: restrict it to your site (HTTP referrers) in Google Cloud. Empty = venue from the host's location.
GOOGLE_MAPS_API_KEY=
# Google reCAPTCHA v2 ("I'm not a robot") for sign-up; sign-up is closed until both are set (see below)
RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET_KEY=
# Sites where the check may be solved (no https://), comma-separated. Defaults to FRONTEND_URL's.
CAPTCHA_HOSTNAMES=localhost,127.0.0.1,hexarch.org,www.hexarch.org

# ---- Amazon Web Services (see "Moving the API to AWS" below) ----
# Region for S3 and SES (Sydney)
AWS_REGION=ap-southeast-2
# An IAM user allowed to use the photo bucket and send email
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
# Photos in this private S3 bucket. Empty = photos in UPLOAD_DIR on this machine.
S3_BUCKET=
# The sender people see; hexarch.org must be verified in Amazon SES. Without it (or the AWS keys),
# emails are printed in the server's terminal instead of sent.
EMAIL_FROM=Momento <team@hexarch.org>
# Where replies go
EMAIL_REPLY_TO=team@hexarch.org

# ---- Push notifications (reactions, new photos, joins, requests, group invites, closing soon) ----
# Make the pair once with "npx web-push generate-vapid-keys". Without them, notifications only show
# in the inbox. Changing the pair switches push off on every device until they allow it again.
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:team@hexarch.org

# ---- Optional: faster photos through Amazon CloudFront (see "Faster photos with CloudFront") ----
CLOUDFRONT_DOMAIN=
CLOUDFRONT_KEY_PAIR_ID=
# The private key, on one line with \n where the line breaks go
CLOUDFRONT_PRIVATE_KEY=

# ---- Nudity check (on by default; see "What the server does by itself") ----
# NSFW_CHECK=off

# ---- Security and privacy (see "Security and privacy") ----
# Where security alerts go: an email address and/or a Slack/Discord incoming webhook (both optional)
# SECURITY_ALERT_EMAIL=
# SECURITY_ALERT_WEBHOOK=
# The current Terms and Privacy Policy versions. Change one when the policy changes.
# TOS_VERSION=2026-11-19
# PRIVACY_VERSION=2026-11-19
# on: people must accept the current versions before using the site (only once the site asks them to)
# REQUIRE_CONSENT=on
# on: sign-up needs a date of birth (under 13s are refused either way when the form sends one)
# REQUIRE_AGE=on
# How many different people reporting a photo hide it for everyone until staff decide
# REPORTS_TO_HIDE=3
# How much upload data the server holds in memory at once (MB; the server has 1 GB)
# UPLOAD_MEMORY_MB=400
```

## 1. MongoDB Atlas

1. In Atlas, open your cluster and choose **Connect > Drivers**. Copy the `mongodb+srv://...` string.
2. Put your database user's password into it, and add the database name `momento` before the `?`:
   `mongodb+srv://me:PASSWORD@cluster0.abcde.mongodb.net/momento?retryWrites=true&w=majority`
3. Paste it into `.env` as `MONGODB_URI`.
4. In **Network Access**, allow your current IP address (and later, your server's IP address).

Collections (`users`, `albums`, `memberships`, `photos`) and their indexes are created automatically.

## 2. JWT secret

Generate a long random value and set it as `JWT_SECRET` in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Changing it later logs everyone out.

## 3. Google sign-in

1. Go to https://console.cloud.google.com, create a project (or pick one).
2. **APIs & Services > OAuth consent screen**: choose External, fill in the app name and your email, and add the scopes `openid`, `email` and `profile`. While it is in "Testing", add your own Google account as a test user.
3. **APIs & Services > Credentials > Create credentials > OAuth client ID**, type **Web application**.
4. Under **Authorized JavaScript origins**, add `http://localhost:4000` (and your real domain later, e.g. `https://momento.app`). No redirect URIs are needed.
5. Copy the **Client ID** and **Client secret** into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart the server.

"Continue with Google" says it isn't set up until both values are present.

## 4. Email (Amazon SES)

Momento's emails (confirm, reset, password changed, group invites, reminders) go through **Amazon
SES** from `EMAIL_FROM`, using the AWS key in `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. Replies go to
`EMAIL_REPLY_TO`. The server logs it at startup (`Email: ses, from …`). hexarch.org is verified in SES
(3 DKIM records at GoDaddy) and the account has production access. Setup: see "Moving the API to AWS".

Check it: `npm run email:test -- you@gmail.com` (needs the AWS settings in `.env`).

Without those settings the server still works: outside production, emails and confirm links are printed
in the server's terminal so you can open them by hand.

## 5. Photos (Amazon S3)

With `S3_BUCKET` set, photos go to that private S3 bucket. When someone opens a photo, the API checks
they're in the album, then sends their browser to a signed link straight to S3 that works for an hour.
The server checks the bucket at startup and prints `Photos: Amazon S3 bucket "…"`, or stops with the reason.

Without `S3_BUCKET`, photos are stored in `UPLOAD_DIR` on the machine, which is fine locally.

**Direct uploads** (`DIRECT_UPLOADS=on`): phones send each photo straight to the bucket with a signed link, instead of
through the server (`services/directUploads.js`); the old way stays as the fallback. Before turning it on:

1. Bucket CORS (S3 → the photo bucket → Permissions → CORS), so the site may PUT to it:
   ```json
   [{ "AllowedOrigins": ["https://hexarch.org", "https://www.hexarch.org"], "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["content-type", "x-amz-checksum-sha256"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3000 }]
   ```
2. A lifecycle rule on the same bucket: prefix `quarantine/direct/`, expire current versions after **2 days**
   (photos sent but never processed).
3. `DIRECT_UPLOADS=on` in `server.env`, then `sudo momento-update`. `GET /api/config` then says `uploads.direct: true`.

The server's key already has `s3:PutObject` on the bucket, which is what the links use. Locally (no S3) direct uploads
work through a stand-in (`PUT /api/uploads/local/:token`), never in production.

## Album life cycle

Each album is **upcoming** before its date, **live** around the day and the day after, **wrapping** until 30 days after the event (its `closes` date), then **kept**: still there to view and download, but closed to new photos and invites. The date is the host's local day and the server doesn't know their time zone, so "live" runs from the UTC day before to two UTC days after. The 30 days are `OPEN_DAYS` in `src/controllers/albumController.js`.

## How accounts work

- Passwords are hashed with bcrypt (cost 12). The login lives in an httpOnly cookie (`momento_session`, a signed JWT, 30 days by default), so page scripts never see the token.
- One account per email. If someone signed up with a password and later uses Google with the same verified email, they get the same account with that provider linked. If that password account never confirmed its email, linking removes the password, because someone else could have registered that address first. The person then signs in with Google. Confirmed accounts keep their password.
- Signing up with a password sends a confirm link (valid 24 hours, single use). Only a hash of each link's token is stored. A failed email never blocks signing up, and My albums shows a "Send it again" link until the address is confirmed.
- "Forgot your password?" emails a reset link (valid 1 hour, single use). The reply is the same whether or not the address has an account, so it can't be used to find out who uses Momento. Accounts that only use Google or Apple can use it to add a password. Saving a new password logs the person in, logs out every other device (logins issued before `passwordChangedAt` are refused), marks the email confirmed, and sends a "your password was changed" email.
- Login, signup and social sign-in are limited to 20 tries per 15 minutes per IP address; resending the confirm email and asking for reset links to 5 per hour.

User fields: `name`, `email`, `passwordHash`, `avatarUrl`, `emailVerified`, `plan` (`free`, `plus`, `admin` or `staff`), `googleId`, `lastLoginAt`.

## API

All responses are JSON. Errors look like `{ "error": "A sentence for the person" }`.

| Method | Path | What it does |
|---|---|---|
| GET | `/api/config` | Which sign-in providers are set up |
| POST | `/api/auth/signup` | `{ name, email, password }` creates an account and logs in |
| POST | `/api/auth/login` | `{ email, password }` |
| POST | `/api/auth/google` | `{ code }` from Google's popup |
| POST | `/api/auth/logout` | Ends the session |
| GET | `/api/auth/me` | `{ user }`, or `{ user: null }` when logged out |
| PATCH | `/api/auth/me` | `{ name?, notify?: { photos, closing, recap } }` |
| DELETE | `/api/auth/me` | `{ password }` (password accounts): deletes the account and everything about it (see "Security and privacy") |
| GET | `/api/auth/me/export` | Everything stored about you, as a JSON file (3 an hour) |
| GET / POST | `/api/auth/consent` | The current Terms/Privacy versions and whether you accepted them; POST `{ tos, privacy }` (the versions shown) or `{ accept: true }` records acceptance |
| GET / POST | `/api/auth/unsubscribe?u=&k=&s=` | **No login.** The signed one-click unsubscribe link in emails (`k`: closing, recap, photos) |
| POST | `/api/auth/moderation/:id/review` | Ask a person to look at a declined upload (the album's `checks` id) or a refused cover/profile picture (`decisionId` from the 422). Emails staff |
| POST | `/api/auth/email` | `{ email, password }`: emails a confirm link to the new address and a notice to the old one |
| GET | `/api/auth/email/confirm?token=` | The link in that email: switches the address, then goes to `settings.html?email=changed` (or `taken` / `invalid`) |
| GET | `/api/auth/verify-email?token=` | The link in the email: confirms the address, then goes to `/?verified=1` (or `=invalid`) |
| POST | `/api/auth/verify-email/resend` | Emails a new confirm link to the logged-in person |
| POST | `/api/auth/password/forgot` | `{ email }` emails a reset link; always `{ ok: true }` |
| POST | `/api/auth/password/reset` | `{ token, password }` from the reset link; logs in and logs out other devices |
| GET | `/api/albums` | Your albums (host and guest, with `status`, `closes`, `open`, `saved`, and for hosts `waiting` and `trashCount`), the 12 newest photos, `feed` (who added what, in batches), and totals `trashCount` (your bin) and `hiddenCount` |
| POST | `/api/albums` | `{ name, date: "YYYY-MM-DD", place?, zone?, visibility? }` creates an album with a join code; `visibility: "public"` also lists it on the Events map |
| POST | `/api/albums/join` | `{ code, location? }` joins as a guest; any case, dash optional. Follows the album's rules: location check, host approval when closed |
| GET | `/api/albums/preview/:code` | **No login needed.** What an album is (name, host's first name, counts, how joining works), never its photos. See GUEST-AND-NEARBY-API.md |
| POST | `/api/albums/:id/remind` | Host only: emails guests who haven't added photos (once a day per album, at most 25 people) |
| GET | `/api/events/nearby` | **No login needed.** `?lat&lng&radius` (1000 or 5000 metres: 1 km by default, 5 km for anything bigger) Public events that haven't finished, nearest first, with `distanceM`, `bearing`, `direction`, `inside`, `inScan`. See GUEST-AND-NEARBY-API.md |
| POST | `/api/events/:id/join` | `{ location }` joins a public event as a guest (inside its zone, or the host approves) |
| GET | `/api/albums/:id` | One album with its photos (each with `bookmarked` (yours, private; `liked` is its old name), `reactions`, `reaction`), minus any you've hidden or the host has deleted; `album.hiddenCount`, `album.saved`, and for the host `album.trashCount`. `?hidden=1` includes your hidden ones, marked `hidden: true` |
| POST | `/api/albums/:id/save` | `{ saved }` the bookmark (saved albums show under Bookmarked) |
| PUT | `/api/albums/:id/cover` | Host only: multipart field `cover` (one image, up to 15 MB) sets the album's cover picture, re-encoded as WebP |
| DELETE | `/api/albums/:id/cover` | Host only: takes the cover picture off |
| GET | `/api/albums/:id/cover/:token` | **No login needed.** The cover picture (`?size=thumb` for the small one). The address comes with the album as `cover.url` |
| POST | `/api/albums/:id/hidden` | `{ photoIds, hidden }` hides photos from your own view, or shows them again; `{ all: true, hidden: false }` shows every hidden photo. Other people still see them |
| PATCH | `/api/albums/:id` | Host only: change name, date, place or zone |
| DELETE | `/api/albums/:id` | Host only: deletes the album and its photos |
| DELETE | `/api/albums/:id/membership` | A guest leaves the album |
| POST | `/api/albums/:id/photos` | multipart field `photos`, up to 30 files of up to 25 MB each (JPEG, PNG, WebP, HEIC, GIF). Returns 202 `{ checks, skipped, banned, tooBig }`: each photo is saved privately and checked (`checks`: its id, name and state); it appears in the album once it passes, or shows as declined to its uploader. `skipped` were duplicates |
| GET | `/api/albums/:id/download` | Every photo as a .zip. Albums over 300 photos or 1 GB are zipped in the background instead: the page is told (`?zip=preparing`) and an email brings the link |
| GET | `/api/albums/:id/zip/:token` | The emailed link to a background zip (members only; 3 days) |
| GET | `/api/notifications` | Your inbox, newest first (`?before=` for more): reactions, photos added, joins, requests to join, being let in, group invites, albums closing soon. Each has `id`, `type`, `title`, `body?`, `actor: { id, name, avatarUrl }`, `albumId`, `photoIds` (the photos it's about), `at`, `read`; plus `unread` |
| GET | `/api/notifications/unread` | Just the unread count, for a badge |
| POST | `/api/notifications/read` | `{ ids }` marks those read; `{}` (or `{ all: true }`) marks every one |
| POST | `/api/notifications/clear` | `{ before }` (ISO time) deletes yours up to then ("Clear all"); without it, all of them |
| GET | `/api/notifications/push/key` | **No login needed.** The public key a browser needs to subscribe to push |
| POST / DELETE | `/api/notifications/push` | `{ subscription }` (from PushManager.subscribe) turns push on for that device; `{ endpoint }` turns it off |
| GET | `/api/photos/:id` | The image file, for album members only |
| DELETE | `/api/photos/:id` | Host only: deletes for good at once (the pages use the bin below instead) |
| POST | `/api/photos/:id/bookmark` | `{ bookmarked }` bookmarks it or takes it off; returns `{ bookmarked }`. Private: nobody is told, no counts. (`POST /:id/like` with `{ liked }` is the old address for the same thing.) An album's cover is its photo with the most reactions |
| GET | `/api/photos/bookmarked` | The photos you bookmarked, newest first (the Bookmarked tab), each with `bookmarkedAt`. Photos liked before bookmarks count. (`/api/photos/liked` is the old address) |
| POST | `/api/photos/:id/reaction` | `{ emoji }` one of 😍 😂 🔥 👏 🥹 😮 (one per person; `null` removes yours); returns `{ reactions, reaction }` |
| POST | `/api/photos/:id/report` | `{ reason: nudity\|abuse\|privacy\|copyright\|other, note? }`: hidden for you at once; at 3 reports, for everyone until staff decide |
| (staff) | `/api/admin/...` | Staff only (404 for everyone else): `GET reports`, `POST reports/:id/dismiss`, `POST photos/:id/takedown { reason, notice }`, `POST users/:id/unsuspend`, `GET moderation`, `POST moderation/:id { allow }`, `GET/PATCH switches`, `POST sessions/revoke-all` |
| GET | `/api/photos/:id/reactions` | Who reacted with what: `{ people: [{ by, emoji, mine, avatarUrl }] }` |
| POST | `/api/trash` | Host only: `{ photoIds }` moves photos to the Recently deleted bin; returns `{ moved, skipped }` |
| GET | `/api/trash` | `?album=` Photos in your bin (albums you host), with `deletedAt` and `purgeAt` (30 days later, when they go for good) |
| POST | `/api/trash/restore` | `{ photoIds }` or `{ all: true, album? }` puts photos back |
| POST | `/api/trash/purge` | `{ photoIds }` or `{ all: true, album? }` deletes them for good now |
| GET | `/api/hidden` | `?album=` The photos you hid from your own view |

Anyone who isn't in an album gets "not found" for it and its photos, so album ids can't be probed.
Logged-out visitors get a 401 with `code: "login-required"` and an `action` (join, upload, react, ...)
for anything other than the album preview and the nearby scan. See GUEST-AND-NEARBY-API.md.

## What the server does by itself

Every hour (src/services/jobs.js), each job claiming its work first so nothing happens twice:

- **"An album is about to close" emails**, once per album, when uploads close within 12 hours (to
  members who haven't turned it off).
- **Weekly recap emails** to people who turned them on, only when there are new photos.
- **Tidying**: sign-ups never confirmed after 7 days (with no albums or photos), join requests left
  unanswered for 30 days, background zips older than 3 days.
- **A daily backup** of every collection into the photo storage (S3): `backups/day-YYYY-MM-DD` for each of the
  last 14 days, and `backups/month-YYYY-MM` (one per month, kept 12 months). Restore with
  `node --env-file=.env scripts/restoreBackup.js day-2026-11-25` (add `--apply` to really restore).

Every 6 hours: photos more than 30 days in the Recently deleted bin are removed for good.

Other things to know:
- **Nudity check**: AWS Rekognition (services/rekognitionService.js) gives each photo one of 7 levels, with fixed
  label thresholds. Album photos are saved privately, checked in the background and published at level 0-75; from
  level 25, only if nobody in it may be under 18 (otherwise staff look first). Level 85-95 is declined: the uploader
  sees "Declined" with **Request review**, which puts the photo on `review.html` for staff and emails
  `STAFF_REVIEW_EMAIL` (team@hexarch.org). Level 100 is never published. Declined photos nobody asks about are deleted
  after 30 days. Covers and profile pictures are checked as they're added (422, `code: "nsfw"` when explicit).
- New photos skip duplicates (the same file twice in one album), and their originals are stored in S3
  Intelligent-Tiering (the same speed, cheaper once a photo hasn't been opened for a while).
- 5 wrong passwords in a row lock that account for 15 minutes (resetting the password lifts it).
- `/api/health` answers 200 only when the database is reachable, so an uptime check catches real outages.
- `npm test` runs every test (no settings or real data needed). `npm run clean:old-data` shows what's left
  of the old chat, comments and email invites in the database; add `-- --apply` to remove it.

## Security and privacy

**Who someone is** comes only from their signed login cookie (httpOnly, Secure on HTTPS, SameSite=Lax)
and its record on the account, checked on every request. Album and photo routes check membership on
every read and write. Logins are JWTs (HS256 only, issuer and audience checked) that are swapped for a
new one every 12 hours of use and expire after `TOKEN_DAYS` (7) unused. An old token presented more than
2 minutes after its swap means it was copied: that login ends and staff are alerted. Logging out,
changing the password, "sign everyone out" and deleting the account end logins on the server at once.

**Plans** decide limits and powers (`src/utils/plans.js`): `free`/`plus` 3 devices, `admin` (every new account)
no device limit, and `staff` = everything `admin` has plus the moderation and emergency tools under `/api/admin`
(needs a confirmed email). Plans are changed only on the server:
`sudo docker compose exec api node scripts/setPlan.js someone@example.com staff` (in
`/opt/momento/Server/deploy`; `admin` takes staff away again). Everyone else gets 404 from `/api/admin`.
Accounts that had the old `role: staff` field are moved to the staff plan automatically at start-up.

**Requests**: JSON up to 100 KB; any key starting with `$` or named `__proto__`/`constructor`/`prototype`
is refused (no MongoDB operator injection); every route reads only the fields it expects. Uploads are
fully decoded before anything is stored (the file's real format, not its name or claimed type).
Rate limits: per IP and per account on login (10 per 15 min per address, plus a 15-minute lock after
5 wrong passwords), signup, resets (3 an hour per address), codes, uploads (600 an hour; the page sends big selections as small uploads, 3 at a time), joins,
exports, new albums (30 an hour), album zips (20 an hour), and an overall ceiling. Uploads held in
memory are capped server-wide (`UPLOAD_MEMORY_MB`, 400) and to 4 at a time per account. Profile photos
are only shown to people who share an album or group with that person (or are in their inbox). Headers: HSTS, CSP `default-src 'none'`, X-Frame-Options, nosniff,
`Cache-Control: no-store` on API answers. Errors: unexpected ones answer a plain sentence and a
`requestId` (also in the `X-Request-Id` header); details only go to the log. Logs never contain
passwords, tokens, keys or email addresses (they're masked automatically).

**Emergency switches** (staff): pause sign-ups, uploads or joining, and sign everyone out.
**Alerts** (to `SECURITY_ALERT_EMAIL` / `SECURITY_ALERT_WEBHOOK`, and the log): spikes of 401/403/429,
copied login tokens, plan changes made on the server and staff switches, suspensions, many data exports.

**Photos**: originals are kept as uploaded **minus where they were taken** (GPS in EXIF and XMP is
emptied in place, so nothing else changes); previews and thumbnails carry no metadata at all. Storage is a
private bucket served through links that expire in an hour. Uploads are checked for nudity by a model on
the server; every refusal is recorded (model, threshold, scores, time) and the person can ask a human
to review it. Reports hide a photo for the reporter at once and for everyone at 3 reports. Staff
takedowns delete it for good, record the notice, ban the file's fingerprint (the same file can't be
uploaded again anywhere) and, for copyright, give the uploader a strike: 3 strikes suspend the account
(they can still log in to download or delete their data).

**Personal data map**

| Where | What | Removed |
|---|---|---|
| MongoDB `users` | name, email, password hash (bcrypt 12), Google id, avatar, logins (device name, times), email choices, age check result, strikes | account deletion |
| `albums`, `memberships`, `groups`, `groupmembers`, `groupinvites` | albums hosted, places and venue coordinates, join requests, group memberships, invites by email | account deletion |
| `photos` (+ S3 `<albumId>/…`) | photos added (no location), reactions, bookmarks | account deletion; bin after 30 days |
| `notifications`, `pushsubscriptions` | inbox items, push endpoints | account deletion; 90 days |
| `consents` | policy versions accepted, time, hashed IP | account deletion |
| `reports`, `moderationdecisions` | reports made, automatic refusals (scores, file hash) | account deletion; 1 year |
| `emailtokens` | one-time link hashes | when used; on expiry |
| `zipfiles` (+ S3 `zips/`) | album downloads | 3 days; account deletion |
| `auditlogs` | security events: account id, hashed IP, request id (no names or emails) | 2 years |
| `takedowns` | file fingerprint, notice text, uploader id | kept (legal record) |
| S3 `backups/` | copies of all of the above | daily: 7 days; monthly: 12 months |
| Amazon SES, Google (sign-in, reCAPTCHA), web push services | email addresses as emails are sent; Google sign-in data | their own policies |

**Your rights**: `GET /api/auth/me/export` downloads everything; `DELETE /api/auth/me` deletes it. Deletion
marks the account first (no login works from then), and the hourly job finishes any deletion that stops
halfway. **Consent**: acceptances are recorded with the policy version (`POST /api/auth/consent`, or
`acceptTerms: true` on sign-up); with `REQUIRE_CONSENT=on`, using the site needs the current versions.
**Emails**: none are marketing; the weekly recap is off by default; non-account emails carry a one-click
unsubscribe link and header. **Age**: a date of birth sent at sign-up is checked first (under 13: refused,
nothing stored); 13-17 accounts are marked minors and aren't named on the public Events map. Only the
result is kept, never the date.

**Doesn't apply to Momento** (nothing to secure): payments, credits, subscriptions, invoices and tax
records, idempotency keys, incoming webhooks, AI/LLM spending or vector search, and BaaS row-level
security (Momento uses its own server with MongoDB Atlas).

**To do outside the code** (AWS / Atlas consoles):
- Back-ups the server can't delete: turn on S3 **Object Lock** (or versioning plus a lifecycle rule) on a
  separate backup bucket, and give the server's IAM user `s3:PutObject` only there. Today the same key
  that writes backups could delete them.
- Atlas: limit network access to the Lightsail IP (13.55.151.140) instead of 0.0.0.0/0, and turn on
  Atlas's own backups when the plan allows.
- Known dependency issue: `npm audit` reports a moderate denial-of-service in `minimatch` (inside
  `archiver`'s folder globbing). Momento never globs folders (zips are built from photo streams), so it
  can't be reached; npm's only "fix" downgrades `archiver`. Re-check when archiver updates.

## Not built yet

- **Saving to the host's Google Drive, Dropbox or OneDrive.** Photos go to Amazon S3 (or this PC's disk
  locally). All file handling is in `src/services/storageService.js`, so that is the one file to change.
- **Plans.** Only the device limit and staff access depend on the plan so far.

## Deploying

The live setup: **the site on https://hexarch.org** (GitHub Pages) and **the API on https://api.hexarch.org**
(an AWS Lightsail server; see "Moving the API to AWS"). Both are on hexarch.org, so the browser treats them as
the same site and the login cookie works everywhere, Safari and iPhones included.

### The site on hexarch.org

The GitHub repo (teamHexarch/Momento) holds `Client/` and `Server/`. The workflow in `.github/workflows/pages.yml` publishes the site on every push that changes `Client/`, copying only the pages, `CNAME` and the files in `assets/`. `CLAUDE.md`, `serve.mjs`, `screenshot.mjs` and the screenshots stay in the repo but are never served.

Repo **Settings > Pages > Source** must be **GitHub Actions**, with the custom domain `hexarch.org`. Its DNS (GoDaddy) has GitHub Pages' four A records for `@`.

### Google sign-in on the live site

In Google Cloud Console, add `https://hexarch.org` (and `https://www.hexarch.org` if used) to the OAuth client's **Authorized JavaScript origins**.

# Photo location privacy

New photos are decoded and re-encoded with sharp before either disk or S3 storage.
EXIF (including GPS), XMP and IPTC are discarded, and EXIF orientation is applied
to the pixels first. Stored MIME type, extension and size reflect the output.
Full-resolution downloads use lossless PNG for still images, or lossless WebP
for animations, preserving decoded pixels without an additional lossy encoding.
These downloads can be larger than the uploaded JPEG. The display version uses
JPEG/WebP quality 82 with a 2500px longest edge. Still WebP thumbnails use quality
75 and a 600px longest edge. Small images are never enlarged. All versions discard
location metadata. Use Download photo or Download all for full-resolution files;
browser Save image as saves the displayed preview. Existing photos fall back to
their stored file and are not regenerated. Deleting photos removes all variants.
PNG transparency and GIF/WebP animation are retained. HEIC/HEIF decoding depends on the installed
sharp/libvips build; unsupported files receive a 400 response asking for JPEG/PNG,
and original bytes are never stored as a fallback.

Run `node --test src/services/imageService.test.js` for local checks.
Run `node --env-file=.env scripts/testPhotoPrivacy.js` to test the configured
storage: it uploads a synthetic image to `test-upload`, reads it back, verifies
metadata removal and deletes only its own test object. It does not write to MongoDB.

Deploy the updated server together with package.json and package-lock.json and
install dependencies before restarting. Existing stored photos are not changed;
they need a separate migration. Uploads directly to the S3 console bypass this
server protection. This does not remove location information visible in image pixels.

# Signup CAPTCHA (Google reCAPTCHA)

Sign-up requires a Google reCAPTCHA v2 ("I'm not a robot") check, verified by the server before database
access, password hashing, account creation or any email. Login is unchanged. Missing keys and Google being
unreachable block sign-up; there is no bypass.

1. Go to https://www.google.com/recaptcha/admin/create (sign in with the Google account that owns the
   Momento Google Cloud project).
2. **Label:** `Momento sign-up`. **reCAPTCHA type:** **Challenge (v2)** > **"I'm not a robot" Checkbox**.
3. **Domains:** `hexarch.org`, `www.hexarch.org` and `localhost` (for testing on this PC).
4. Pick the Google Cloud project used for Google sign-in, then **Submit**.
5. Copy the **site key** into `RECAPTCHA_SITE_KEY` and the **secret key** into `RECAPTCHA_SECRET_KEY`
   (in `.env` locally and in `/opt/momento-config/server.env` on the server), and restart.

Only the public site key is sent to the browser (in /api/config). Unit tests: `node --test src/services/captchaService.test.js`
(they mock Google's answers; try a real sign-up once the keys are in).

The check reduces automated sign-ups but is not a daily email budget: the resend and password-reset
rate limits still apply.

# Moving the API to AWS

Only the backend moves. The website stays on GitHub Pages (hexarch.org) and the database stays on
MongoDB Atlas. The site keeps calling `https://api.hexarch.org`; at the end that address simply points
at AWS instead of Render.

| Now (Render setup)     | On AWS                                                            |
|------------------------|-------------------------------------------------------------------|
| Render web service (old) | **Lightsail** server (Ubuntu, 1 GB), running the API in Docker with **Caddy** in front for free, self-renewing HTTPS |
| Cloudflare R2 (photos) | **Amazon S3** bucket, private                                     |
| Resend (emails)        | **Amazon SES**                                                    |
| MongoDB Atlas          | MongoDB Atlas (unchanged)                                         |

> **Cost:** about US$7 a month for the server (the 1 GB Lightsail plan, public IP included), plus cents
> for S3 and SES at Momento's size.

Everything is in **Asia Pacific (Sydney) `ap-southeast-2`**. The code now only supports S3 and SES, so
**before pushing it to GitHub, turn off Render's auto-deploy** (Render > the service > Settings > Auto-Deploy
**No**). Render then keeps running the old version, with R2 and Resend, until the switch in step 9.

Pushing also publishes the website, whose sign-up box now expects reCAPTCHA from the server. Until
api.hexarch.org points at AWS (step 9), new sign-ups on hexarch.org show "temporarily unavailable"; logging
in, and "Continue with Google", keep working. So do steps 3 to 9 in one go once you've pushed.

The server files are in `Server/deploy/`: `setup.sh` (first-time setup), `update.sh` (start / update),
`docker-compose.yml` and `Caddyfile`.

## 0. Budget alert ✅

Billing and Cost Management > **Budgets** > *Monthly cost budget*, e.g. US$60, with your email.

## 1. S3 bucket for photos ✅

S3 > **Create bucket**: `momento-photos-hexarch`, region Sydney, General purpose, Global namespace,
**Block all public access on**, everything else default.

## 2. SES for emails ✅

SES > Identities: `hexarch.org` (Easy DKIM, 3 CNAME records at GoDaddy) and `team@hexarch.org`, both
**Verified**. Production access **granted**, so it can email anyone. No MAIL FROM domain, no
Virtual Deliverability Manager, no dedicated IPs.

## 3. An access key for the server

The server needs its own AWS login that may only use the photo bucket and send email.

IAM > **Users** > **Create user**
- Name: `momento-server`. Leave *Provide user access to the AWS Management Console* **off**. Next.
- Permissions: skip (no group, no policies) > **Create user**.

Open `momento-server` > **Add permissions** > **Create inline policy** > **JSON**, paste this (with your
bucket name), **Next**, name it `momento-s3-ses`, **Create policy**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::momento-photos-hexarch" },
    { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::momento-photos-hexarch/*" },
    { "Effect": "Allow", "Action": ["ses:SendEmail", "ses:SendRawEmail"], "Resource": "*" }
  ]
}
```

Then **Security credentials** > **Create access key** > *Application running outside AWS* > **Create**.
Keep the **Access key ID** and **Secret access key** somewhere safe (a password manager): the secret is
shown only once. They go into the server's settings in step 5, never into Git or chat.

## 4. The Lightsail server

Go to **lightsail.aws.amazon.com** > **Create instance**
1. **Region:** Sydney (`ap-southeast-2`), any zone.
2. **Platform:** Linux/Unix. **Blueprint:** *Operating System (OS) only* > **Ubuntu 24.04 LTS**.
3. **+ Add launch script:** paste the whole of `Server/deploy/setup.sh`. It installs Docker and Git,
   adds swap memory, downloads the code from GitHub and makes the `momento-update` command.
4. **SSH key:** keep the default.
5. **Plan:** *Dual-stack* (with a public IPv4 address), **1 GB memory** (about US$7).
6. **Name:** `momento-api` > **Create instance**.

When it's **Running**, open it:
- **Networking** tab > **Create static IP** (attach it to `momento-api`, name `momento-api-ip`). It's free
  while attached, and it never changes. Note the address.
- Same tab, **IPv4 Firewall** > **Add rule** > **HTTPS** (port 443). SSH (22) and HTTP (80) are already there.

## 5. The server's settings

On the instance page click **Connect using SSH**. A black terminal window opens in your browser.

First check the setup script finished (it takes a few minutes after the server starts):

```
sudo tail -n 2 /var/log/momento-setup.log
```

It should end with `Momento setup finished`. Then open the settings file:

```
sudo nano /opt/momento-config/server.env
```

Type or paste the settings below, one per line as `NAME=value` (copy the values from your `.env` /
Render settings, except where shown). Save with **Ctrl+O**, **Enter**, then exit with **Ctrl+X**.

| Name | Value |
|---|---|
| `MONGODB_URI` | same as now (Atlas) |
| `JWT_SECRET` | **same as now**, or everyone gets logged out |
| `TOKEN_DAYS` | 7 (or leave it out) |
| `PUBLIC_URL` | `https://api.hexarch.org` |
| `FRONTEND_URL` | `https://hexarch.org` |
| `CORS_ORIGINS` | `https://hexarch.org,https://www.hexarch.org` |
| `EMAIL_VERIFICATION_BASE_URL` | same as now (or leave out) |
| `AWS_REGION` | `ap-southeast-2` |
| `S3_BUCKET` | `momento-photos-hexarch` |
| `AWS_ACCESS_KEY_ID` | from step 3 |
| `AWS_SECRET_ACCESS_KEY` | from step 3 |
| `EMAIL_FROM` | `Momento <team@hexarch.org>` |
| `EMAIL_REPLY_TO` | same as now |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | same as now |
| `GOOGLE_MAPS_API_KEY` | when you have it |
| `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` | from "Signup CAPTCHA" above |
| `CAPTCHA_HOSTNAMES` | `hexarch.org,www.hexarch.org` |
| `MAX_UPLOAD_MB` | leave out for 50 (camera RAW files skip it; `MAX_RAW_UPLOAD_MB`, 300, is their ceiling) |

Leave out `PORT`, `NODE_ENV` and `TRUST_PROXY`: the server sets them.

## 6. MongoDB Atlas network access

Atlas > **Network Access**. If `0.0.0.0/0` is already there (Render needs it), nothing to do.
Otherwise **Add IP Address** > the static IP from step 4.

## 7. Start it on a test address first

So the live site isn't touched while testing, the server first answers on **aws-api.hexarch.org**.

1. **GoDaddy** > hexarch.org > DNS > **Add New Record**: Type **A**, Name `aws-api`, Value = the static IP.
2. In the SSH window:

   ```
   echo 'aws-api.hexarch.org' | sudo tee /opt/momento-config/domains
   sudo momento-update
   ```

   The first run builds the server (a few minutes). It ends with `Momento API is running` and the
   startup messages, which should include `Photos: Amazon S3 bucket "…"` and `Email: ses, from …`.
3. Open **https://aws-api.hexarch.org/api/health**. It should say `{"ok":true}` with a padlock. (Caddy
   gets the HTTPS certificate on the first visit after the DNS record works; give it a minute.)

If it says *no AWS access found* or *access was refused*, check the step 3 key and policy and the
`server.env` lines, then run `sudo momento-update` again.

## 8. Copy the existing photos from R2 to S3 (done)

Done in November 2026: every photo was copied from Cloudflare R2 into the S3 bucket, keeping each
file's name. Momento no longer uses Cloudflare at all, so the copy script and the `R2_*` settings have
been removed.

## 9. Switch api.hexarch.org to AWS

1. **GoDaddy** > hexarch.org > DNS: **delete** the `api` CNAME (the one pointing to
   `momento-vpyw.onrender.com`), then **add** an **A** record: Name `api`, Value = the static IP.
2. In the SSH window:

   ```
   echo 'api.hexarch.org, aws-api.hexarch.org' | sudo tee /opt/momento-config/domains
   sudo momento-update
   ```

3. Check on hexarch.org: log in (with email and with Google), open an album, upload a photo, and trigger
   an email ("Forgot your password").

DNS changes can take up to an hour to reach everyone; Render keeps answering for anyone still on the old
record, so nobody is cut off in between.

## 10. Tidy up

- Done: the PC's `Server/.env` has no Cloudflare (`R2_*`, Turnstile), Resend, Microsoft or Apple settings
  left, and `scripts/copyR2ToS3.js` is gone. (Remove the AWS lines there too if you'd rather keep local
  photos on disk and emails printed in the terminal.)
- After a few days without problems: delete the Render service, the R2 bucket, the Resend account and the
  Turnstile widget, and in Microsoft Entra the "Momento-Backend" app registration (its Mail.Send permission
  isn't needed any more).
- The `aws-api` test record and the Certificate Manager certificate for api.hexarch.org aren't needed any
  more (Caddy makes its own certificates); delete them whenever you like.

## Updating the server later

`sudo momento-update` only deploys a commit whose **Server tests** passed (GitHub Actions,
`.github/workflows/server-tests.yml`; the tests are in the private repo `teamHexarch/momento-tests`). It waits up to 20
minutes for the run. `sudo momento-update --force` deploys anyway.

Push the code to GitHub, then on the Lightsail instance > **Connect using SSH**:

```
sudo momento-update
```

It gets the latest code, rebuilds and restarts the API, and prints its startup messages.

To see the API's recent log: `cd /opt/momento/Server/deploy && sudo docker compose logs --tail 100 api`.
