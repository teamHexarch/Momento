# Signup CAPTCHA

Signup requires Cloudflare Turnstile server verification before database access, password hashing, account creation or verification email delivery. Login is unchanged. Missing keys and verification outages block signup; there is no client-side or development bypass.

Create a Managed widget in Cloudflare Turnstile. Allow the frontend hostnames `hexarch.org` and `www.hexarch.org`, and `localhost` / `127.0.0.1` if using the same widget locally. Set `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` and `TURNSTILE_HOSTNAMES` in the local Server/.env and Render environment. Restart locally or redeploy on Render, and publish the updated frontend together with the backend. Only the public site key is returned by /api/config.

Open Sign up, complete the challenge, and create a test account. Missing, forged, expired or reused tokens must be rejected without creating an account or sending mail. Login must still work.

CAPTCHA reduces automated signups but is not a hard daily email budget. Existing resend and password-reset rate limits remain; distributed abuse of those endpoints and a shared daily mail quota require additional protection.

Reference: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
