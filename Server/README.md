# Momento server

The API behind the Momento site: accounts (email and password, Google, Apple), albums, join codes and photo uploads. Live, the site (`Client/`) is on **https://hexarch.org** and this API on **https://api.hexarch.org** (Render). Locally, this server also serves the `Client/` pages, so one address does everything.

Node.js + Express + MongoDB (Mongoose). Photos go to a private Cloudflare R2 bucket (or, when R2 isn’t set up, to `Server/uploads/` on disk); their details live in MongoDB. Email goes out through Microsoft Graph.

## Layout

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
      services/            emailService (Graph), emailTemplates, emailTokenService (one-time links),
                           verificationService, passwordResetService,
                           storageService (photo files) with storage/diskStorage and storage/r2Storage
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
cp .env.example .env        # then fill in .env (see below)
npm run dev                 # restarts on code changes; or: npm start
```

Open **http://localhost:4000**. You can also run `node serve.mjs` in `Client/` and open http://localhost:3000: the pages there talk to this server on port 4000, just as hexarch.org talks to api.hexarch.org.

`Client/assets/api.js` decides where the pages send API calls: the same address on port 4000, `http://localhost:4000` from any other local port, and `https://api.hexarch.org` everywhere else.

To try everything before Atlas is set up, run `npm run dev:memory`. It uses a temporary database that is wiped when it stops.

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

## 4. Sign in with Apple

You need a paid Apple Developer account, and Apple only accepts **HTTPS on a real domain**, so this cannot be tested on localhost. Set it up once the site is deployed.

1. In https://developer.apple.com/account go to **Certificates, Identifiers & Profiles > Identifiers**.
2. Create an **App ID** with **Sign in with Apple** turned on (or reuse your iOS app's).
3. Create a **Services ID** (for example `app.momento.web`). Turn on Sign in with Apple, click **Configure**, choose the App ID as primary, and add:
   - Domain: `momento.app` (your domain)
   - Return URL: exactly your `PUBLIC_URL`, e.g. `https://momento.app`
4. Put the Services ID in `.env` as `APPLE_CLIENT_ID` and set `PUBLIC_URL` to your HTTPS address.

No private key (`.p8`) is needed: the server checks Apple's signed ID token against Apple's public keys. Apple only shares the person's name the first time they sign in, so it is saved then. People may choose "Hide my email", in which case Apple gives a relay address.

## 5. Email (Microsoft Graph)

Confirm-your-email messages are sent from a Microsoft 365 mailbox through an Entra ID app registration.

1. In https://entra.microsoft.com open **App registrations** and your app.
2. **Overview**: copy **Directory (tenant) ID** to `MS_TENANT_ID` and **Application (client) ID** to `MS_CLIENT_ID`.
3. **Certificates & secrets > New client secret**: copy its **Value** (shown once, not the Secret ID) to `MS_CLIENT_SECRET`. Note its expiry date; email stops when it expires.
4. **API permissions > Add a permission > Microsoft Graph > Application permissions > Mail.Send**, then **Grant admin consent**. It must be an *application* permission, not delegated.
5. Set `SENDER_EMAIL` to the mailbox to send from, e.g. `hello@yourdomain.com`. It must be a licensed Exchange Online mailbox (a shared mailbox works) in the same tenant.
6. Check it: `npm run email:test -- you@example.com`. If Microsoft refuses, the script says what to fix.

Mail.Send as an application permission lets the app send as *any* mailbox in the tenant. To limit it to `SENDER_EMAIL`, an Exchange admin can add an application access policy (`New-ApplicationAccessPolicy`, or the newer RBAC for Applications).

Until these are filled in, the server still works: outside production, confirm links are printed in the server's terminal so you can open them by hand.

## 6. Photos in Cloudflare R2 (free)

R2 keeps up to 10 GB free each month, and people viewing photos costs nothing. The bucket stays private: when someone opens a photo, the API checks they're in the album, then sends their browser to a signed link straight to Cloudflare that works for an hour.

1. In https://dash.cloudflare.com open **R2 Object Storage**. The first time, Cloudflare asks you to turn R2 on and add a payment card; nothing is charged while you stay within the free amounts.
2. **Create bucket**, name it e.g. `momento-photos`, location Automatic. Leave public access **off**.
3. Copy the **Account ID** from the R2 overview page into `R2_ACCOUNT_ID`, and the bucket name into `R2_BUCKET`.
4. **Manage API tokens > Create API token**: permission **Object Read & Write**, applied to **that bucket only**. Copy the **Access Key ID** and **Secret Access Key** (shown once) into `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
5. Restart the server. It checks the bucket at startup and prints `Photos: Cloudflare R2 bucket "momento-photos"`, or stops with the reason if a value is wrong.

Without these four values, photos are stored in `UPLOAD_DIR` on the machine, which is fine locally. Photos uploaded to disk don't move to R2 by themselves.

## How accounts work

- Passwords are hashed with bcrypt (cost 12). The login lives in an httpOnly cookie (`momento_session`, a signed JWT, 30 days by default), so page scripts never see the token.
- One account per email. If someone signed up with a password and later uses Google or Apple with the same verified email, they get the same account with that provider linked. If that password account never confirmed its email, linking removes the password, because someone else could have registered that address first. The person then signs in with Google or Apple. Confirmed accounts keep their password.
- Signing up with a password sends a confirm link (valid 24 hours, single use). Only a hash of each link's token is stored. A failed email never blocks signing up, and My albums shows a "Send it again" link until the address is confirmed.
- "Forgot your password?" emails a reset link (valid 1 hour, single use). The reply is the same whether or not the address has an account, so it can't be used to find out who uses Momento. Accounts that only use Google or Apple can use it to add a password. Saving a new password logs the person in, logs out every other device (logins issued before `passwordChangedAt` are refused), marks the email confirmed, and sends a "your password was changed" email.
- Login, signup and social sign-in are limited to 20 tries per 15 minutes per IP address; resending the confirm email and asking for reset links to 5 per hour.

User fields: `name`, `email`, `passwordHash`, `avatarUrl`, `emailVerified`, `plan` (`free` or `plus`), `googleId`, `appleId`, `lastLoginAt`.

## API

All responses are JSON. Errors look like `{ "error": "A sentence for the person" }`.

| Method | Path | What it does |
|---|---|---|
| GET | `/api/config` | Which sign-in providers are set up |
| POST | `/api/auth/signup` | `{ name, email, password }` creates an account and logs in |
| POST | `/api/auth/login` | `{ email, password }` |
| POST | `/api/auth/google` | `{ code }` from Google's popup |
| GET | `/api/auth/apple/start` | Gives a nonce for Apple's popup |
| POST | `/api/auth/apple` | `{ idToken, name? }` from Apple's popup |
| POST | `/api/auth/logout` | Ends the session |
| GET | `/api/auth/me` | `{ user }`, or `{ user: null }` when logged out |
| PATCH | `/api/auth/me` | `{ name }` |
| GET | `/api/auth/verify-email?token=` | The link in the email: confirms the address, then goes to `/?verified=1` (or `=invalid`) |
| POST | `/api/auth/verify-email/resend` | Emails a new confirm link to the logged-in person |
| POST | `/api/auth/password/forgot` | `{ email }` emails a reset link; always `{ ok: true }` |
| POST | `/api/auth/password/reset` | `{ token, password }` from the reset link; logs in and logs out other devices |
| GET | `/api/albums` | Your albums (host and guest) plus the 12 newest photos across them |
| POST | `/api/albums` | `{ name, date: "YYYY-MM-DD", place?, zone? }` creates an album with a join code |
| POST | `/api/albums/join` | `{ code }` joins as a guest; any case, dash optional |
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

The live setup: **the site on https://hexarch.org** (any static host) and **the API on https://api.hexarch.org** (Render). Both are on hexarch.org, so the browser treats them as the same site and the login cookie works everywhere, Safari and iPhones included. A plain `onrender.com` address would not: it's a different site, and Safari blocks its cookie.

### The API on Render

1. The code is on GitHub at teamHexarch/Momento. `Server/.gitignore` keeps `.env`, `node_modules` and uploaded photos out of it.
2. In Render: **New > Web Service**, pick the repository, then:
   - **Root Directory:** `Server`
   - **Runtime:** Node
   - **Build Command:** `npm ci --omit=dev` (skips the test-only database download)
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
3. **Environment**: add every value from your `.env`, with these changes:
   - `NODE_ENV=production`
   - `PUBLIC_URL=https://api.hexarch.org`
   - `FRONTEND_URL=https://hexarch.org`
   - `CORS_ORIGINS=https://hexarch.org,https://www.hexarch.org`
   - Leave `PORT` out; Render sets it.
4. **Settings > Custom Domains**: add `api.hexarch.org`, then create the DNS record Render shows (a CNAME from `api` to your `…onrender.com` address) in GoDaddy's DNS for hexarch.org. Render issues the HTTPS certificate itself.
5. **MongoDB Atlas > Network Access**: allow Render to connect. Either add Render's outbound IP addresses (shown on the service's **Connect** tab) or, more simply, `0.0.0.0/0` (the database password still protects it).

**Photos must use R2 on Render.** Render wipes the service's own files on every deploy and restart, so set the four `R2_*` values (step 6 above) in Render's environment. The server warns in its log if it's running in production with photos on disk.

On Render's free plan the API goes to sleep after about 15 minutes without visitors; the next request wakes it, which can take up to a minute.

### The site on hexarch.org

The GitHub repo (teamHexarch/Momento) holds `Client/` and `Server/`. The workflow in `.github/workflows/pages.yml` publishes the site on every push that changes `Client/`, copying only `index.html`, `albums.html`, `CNAME` and the plain files in `assets/`. `CLAUDE.md`, `serve.mjs`, `screenshot.mjs` and the screenshots stay in the repo but are never served.

Repo **Settings > Pages > Source** must be **GitHub Actions**, with the custom domain `hexarch.org`. Its DNS (GoDaddy) has GitHub Pages' four A records for `@`.

### Afterwards

- **Google sign-in:** in Google Cloud Console, add `https://hexarch.org` (and `https://www.hexarch.org` if used) to the OAuth client's **Authorized JavaScript origins**.
- **Apple sign-in:** the Services ID's domain is `hexarch.org` and its Return URL is `https://hexarch.org`.
- **Email:** nothing changes. Links in emails now point to `FRONTEND_URL` (hexarch.org), and the confirm link goes through the API first.
- **Check it:** open https://api.hexarch.org/api/health (should say `{"ok":true}`), then sign up on https://hexarch.org.
