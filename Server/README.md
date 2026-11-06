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
SESSION_DAYS=30
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
# Largest single photo, in megabytes
MAX_UPLOAD_MB=25

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
# Where the support form's messages go (default: EMAIL_REPLY_TO)
SUPPORT_EMAIL=
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

Momento's emails (confirm, reset, password changed, invites, reminders, support) go through **Amazon
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

## Album life cycle

Each album is **upcoming** before its date, **live** around the day and the day after, **wrapping** until 30 days after the event (its `closes` date), then **kept**: still there to view and download, but closed to new photos and invites. The date is the host's local day and the server doesn't know their time zone, so "live" runs from the UTC day before to two UTC days after. The 30 days are `OPEN_DAYS` in `src/controllers/albumController.js`.

## How accounts work

- Passwords are hashed with bcrypt (cost 12). The login lives in an httpOnly cookie (`momento_session`, a signed JWT, 30 days by default), so page scripts never see the token.
- One account per email. If someone signed up with a password and later uses Google with the same verified email, they get the same account with that provider linked. If that password account never confirmed its email, linking removes the password, because someone else could have registered that address first. The person then signs in with Google. Confirmed accounts keep their password.
- Signing up with a password sends a confirm link (valid 24 hours, single use). Only a hash of each link's token is stored. A failed email never blocks signing up, and My albums shows a "Send it again" link until the address is confirmed.
- "Forgot your password?" emails a reset link (valid 1 hour, single use). The reply is the same whether or not the address has an account, so it can't be used to find out who uses Momento. Accounts that only use Google or Apple can use it to add a password. Saving a new password logs the person in, logs out every other device (logins issued before `passwordChangedAt` are refused), marks the email confirmed, and sends a "your password was changed" email.
- Login, signup and social sign-in are limited to 20 tries per 15 minutes per IP address; resending the confirm email and asking for reset links to 5 per hour.

User fields: `name`, `email`, `passwordHash`, `avatarUrl`, `emailVerified`, `plan` (`free` or `plus`), `googleId`, `lastLoginAt`.

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
| DELETE | `/api/auth/me` | `{ password }` (password accounts): deletes the account, the albums it hosts with all their photos, and its photos in other albums |
| POST | `/api/auth/email` | `{ email, password }`: emails a confirm link to the new address and a notice to the old one |
| GET | `/api/auth/email/confirm?token=` | The link in that email: switches the address, then goes to `settings.html?email=changed` (or `taken` / `invalid`) |
| GET | `/api/auth/verify-email?token=` | The link in the email: confirms the address, then goes to `/?verified=1` (or `=invalid`) |
| POST | `/api/auth/verify-email/resend` | Emails a new confirm link to the logged-in person |
| POST | `/api/auth/password/forgot` | `{ email }` emails a reset link; always `{ ok: true }` |
| POST | `/api/auth/password/reset` | `{ token, password }` from the reset link; logs in and logs out other devices |
| GET | `/api/albums` | Your albums (host and guest, with `status`, `closes`, `open`, and for hosts `waiting`), the 12 newest photos, `feed` (who added what, in batches) and `invites` waiting for you |
| POST | `/api/albums` | `{ name, date: "YYYY-MM-DD", place?, zone? }` creates an album with a join code |
| POST | `/api/albums/join` | `{ code }` joins as a guest; any case, dash optional; uses up any invite to that album |
| POST | `/api/albums/:id/remind` | Host only: emails guests who haven't added photos (once a day per album, at most 25 people) |
| POST | `/api/albums/:id/invites` | Host only: `{ email }` emails an invite with the code; it also shows on their albums page |
| POST | `/api/support` | `{ name, email, topic, message }` from the Support page, emailed to `SUPPORT_EMAIL` (default `EMAIL_REPLY_TO`, then `SENDER_EMAIL`) with Reply-To set to the sender |
| GET | `/api/albums/:id` | One album with all its photos |
| PATCH | `/api/albums/:id` | Host only: change name, date, place or zone |
| DELETE | `/api/albums/:id` | Host only: deletes the album and its photos |
| DELETE | `/api/albums/:id/membership` | A guest leaves the album |
| POST | `/api/albums/:id/photos` | multipart field `photos`, up to 30 files of up to 25 MB each (JPEG, PNG, WebP, HEIC, GIF) |
| GET | `/api/albums/:id/download` | Every photo as a .zip |
| GET | `/api/photos/:id` | The image file, for album members only |
| DELETE | `/api/photos/:id` | The person who added it, or the host |

Anyone who isn't in an album gets "not found" for it and its photos, so album ids can't be probed.

## Not built yet

- **Sharing zone.** Albums store a location and radius (`zone`), but joining by code doesn't check it yet.
- **Saving to the host's Google Drive, Dropbox or OneDrive.** Photos go to this server's disk. All file handling is in `src/services/storageService.js`, so that is the one file to change. iCloud has no public API for this.
- **Thumbnails.** Full-size photos are served everywhere; adding `sharp` to make small copies on upload would speed up the albums page.
- **QR codes** for an album's join code.
- **Plans.** `plan` is stored on each user, but nothing is limited by it yet.

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
| `SESSION_DAYS` | same as now |
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
| `SUPPORT_EMAIL` | same as now |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | same as now |
| `GOOGLE_MAPS_API_KEY` | when you have it |
| `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` | from "Signup CAPTCHA" above |
| `CAPTCHA_HOSTNAMES` | `hexarch.org,www.hexarch.org` |
| `MAX_UPLOAD_MB` | same as now (or leave out for 25) |

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

## 8. Copy the existing photos from R2 to S3

`scripts/copyR2ToS3.js` is the only thing left that talks to Cloudflare R2; delete it once the move is
done. On this PC, `Server/.env` still has the old `R2_*` settings; add these next to them
**temporarily** (the step 3 key may read and write the bucket):

```
S3_BUCKET=momento-photos-hexarch
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Then, in `Server/`:

```
npm run aws:copy-photos -- --dry
npm run aws:copy-photos
```

It keeps every file's name, so the photo records in MongoDB work unchanged, and skips files already
copied, so it's safe to run again.

## 9. Switch api.hexarch.org to AWS

1. **GoDaddy** > hexarch.org > DNS: **delete** the `api` CNAME (the one pointing to
   `momento-vpyw.onrender.com`), then **add** an **A** record: Name `api`, Value = the static IP.
2. In the SSH window:

   ```
   echo 'api.hexarch.org, aws-api.hexarch.org' | sudo tee /opt/momento-config/domains
   sudo momento-update
   ```

3. Run `npm run aws:copy-photos` once more on the PC, to pick up anything uploaded to R2 in the meantime.
4. Check on hexarch.org: log in (with email and with Google), open an album, upload a photo, and trigger
   an email ("Forgot your password").

DNS changes can take up to an hour to reach everyone; Render keeps answering for anyone still on the old
record, so nobody is cut off in between.

## 10. Tidy up

- Tidy the PC's `Server/.env`: remove the `R2_*`, `RESEND_API_KEY`, `MS_*`, `SENDER_EMAIL`,
  `TURNSTILE_*` and `APPLE_CLIENT_ID` lines (nothing reads them any more), and the temporary AWS lines too
  if you'd rather keep local photos on disk and emails printed in the terminal.
- Delete `scripts/copyR2ToS3.js` and its `aws:copy-photos` line in `package.json`.
- After a few days without problems: delete the Render service, the R2 bucket, the Resend account and the
  Turnstile widget, and in Microsoft Entra the "Momento-Backend" app registration (its Mail.Send permission
  isn't needed any more).
- The `aws-api` test record and the Certificate Manager certificate for api.hexarch.org aren't needed any
  more (Caddy makes its own certificates); delete them whenever you like.

## Updating the server later

Push the code to GitHub, then on the Lightsail instance > **Connect using SSH**:

```
sudo momento-update
```

It gets the latest code, rebuilds and restarts the API, and prints its startup messages.

To see the API's recent log: `cd /opt/momento/Server/deploy && sudo docker compose logs --tail 100 api`.
