import { HttpError } from '../utils/httpError.js';

// The "are you human?" check on sign-up: Google reCAPTCHA (v2 "I'm not a robot" box).
// The token is checked with Google before anything is written or emailed, and it fails closed:
// missing keys, a bad token or Google being unreachable all block the sign-up.
const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

export async function verifySignupCaptcha(token, settings, request = fetch) {
  if (!settings.siteKey || !settings.secretKey || !settings.hostnames?.length) {
    throw new HttpError(503, 'Sign-up is temporarily unavailable. Please try again later.');
  }
  if (typeof token !== 'string' || !token.trim() || token.length > 4096) {
    throw new HttpError(400, 'Complete the security check before signing up.', 'captcha');
  }
  let result;
  try {
    const response = await request(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: settings.secretKey, response: token }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Verification unavailable');
    result = await response.json();
  } catch {
    throw new HttpError(503, 'Security check is unavailable. Please try again.', 'captcha');
  }
  // The token must be good and solved on one of our own sites
  if (result?.success !== true || !settings.hostnames.includes(result.hostname)) {
    throw new HttpError(400, 'Security check expired or failed. Please try again.', 'captcha');
  }
}
