import { HttpError } from '../utils/httpError.js';

export async function verifySignupCaptcha(token, settings, request = fetch) {
  if (!settings.siteKey || !settings.secretKey || !settings.hostnames.length) {
    throw new HttpError(503, 'Sign-up is temporarily unavailable. Please try again later.');
  }
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) {
    throw new HttpError(400, 'Complete the security check before signing up.', 'captcha');
  }
  let result;
  try {
    const response = await request('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: settings.secretKey, response: token }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Verification unavailable');
    result = await response.json();
  } catch {
    throw new HttpError(503, 'Security check is unavailable. Please try again.', 'captcha');
  }
  if (result?.success !== true || result.action !== 'signup' || !settings.hostnames.includes(result.hostname)) {
    throw new HttpError(400, 'Security check expired or failed. Please try again.', 'captcha');
  }
}
