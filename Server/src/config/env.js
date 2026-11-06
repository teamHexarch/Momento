import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = process.env;

function required(name) {
  const v = env[name];
  if (!v) throw new Error(`${name} is not set. Add it to Server/.env (see Settings in README.md).`);
  return v;
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret === 'change-me' && env.NODE_ENV === 'production') throw new Error('Set a real JWT_SECRET before running in production.');

const trimSlash = (u) => u.replace(/\/+$/, '');
// Where this API is reached (e.g. https://api.hexarch.org)
const publicUrl = trimSlash(env.PUBLIC_URL || `http://localhost:${env.PORT || 4000}`);
// Where people open the site (e.g. https://hexarch.org). Locally the API serves the pages itself.
const frontendUrl = trimSlash(env.FRONTEND_URL || publicUrl);
// Sites allowed to call the API from the browser with the login cookie
const corsOrigins = (env.CORS_ORIGINS || [frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'].join(','))
  .split(',').map((o) => trimSlash(o.trim())).filter(Boolean);

export const config = {
  // The sign-up "are you human?" check (Google reCAPTCHA). Sign-up is closed until both keys are set.
  // Only tokens solved on CAPTCHA_HOSTNAMES (default: FRONTEND_URL's) count.
  captcha: {
    siteKey: env.RECAPTCHA_SITE_KEY || '',
    secretKey: env.RECAPTCHA_SECRET_KEY || '',
    hostnames: (env.CAPTCHA_HOSTNAMES || new URL(frontendUrl).hostname).split(',').map((s) => s.trim()).filter(Boolean),
  },
  port: Number(env.PORT) || 4000,
  // Proxies in front of the server (see app.js)
  trustProxy: Number.isInteger(Number(env.TRUST_PROXY)) && env.TRUST_PROXY !== '' && env.TRUST_PROXY != null ? Number(env.TRUST_PROXY) : 1,
  mongoUri: required('MONGODB_URI'),
  jwtSecret,
  sessionDays: Number(env.SESSION_DAYS) || 30,
  publicUrl,
  verificationBaseUrl: trimSlash(env.EMAIL_VERIFICATION_BASE_URL || publicUrl),
  frontendUrl,
  corsOrigins,
  // The API serves the Client pages only when the site and API share an address (local development)
  serveClient: frontendUrl === publicUrl,
  secureCookies: publicUrl.startsWith('https://'),
  clientDir: path.resolve(serverRoot, env.CLIENT_DIR || '../Client'),
  uploadDir: path.resolve(serverRoot, env.UPLOAD_DIR || 'uploads'),
  maxUploadBytes: (Number(env.MAX_UPLOAD_MB) || 25) * 1024 * 1024,
  // Amazon Web Services: photos in the S3 bucket S3_BUCKET (otherwise UPLOAD_DIR on this machine) and
  // email through Amazon SES. Access comes from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (an IAM user
  // that may only use the photo bucket and send email), which the AWS SDK reads by itself.
  aws: {
    region: env.AWS_REGION || 'ap-southeast-2',
    s3Bucket: env.S3_BUCKET || '',
    hasKeys: Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY),
  },
  google: { clientId: env.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '' },
  // Google Maps JavaScript API key for picking the venue (a browser key: restrict it to your site's
  // address in Google Cloud). Without it, hosts set the venue from their current location instead.
  mapsApiKey: env.GOOGLE_MAPS_API_KEY || '',
  email: {
    // The sender people see, e.g. "Momento <team@hexarch.org>" (its domain verified in Amazon SES)
    from: env.EMAIL_FROM || '',
    // Where replies go, so "reply to this email" reaches a person
    replyTo: env.EMAIL_REPLY_TO || '',
  },
  // Where the support form's messages go
  supportEmail: env.SUPPORT_EMAIL || env.EMAIL_REPLY_TO || '',
  isProduction: env.NODE_ENV === 'production',
};
