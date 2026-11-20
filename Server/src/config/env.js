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
// A short secret could be guessed, and with it anyone could forge a login: production refuses to start
if (jwtSecret.length < 32 && env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET is shorter than 32 characters. Make a long random one (openssl rand -base64 48) and set it in the settings; everyone will need to log in again.');
}

const trimSlash = (u) => u.replace(/\/+$/, '');
// Where this API is reached (e.g. https://api.hexarch.org)
const publicUrl = trimSlash(env.PUBLIC_URL || `http://localhost:${env.PORT || 4000}`);
// Where people open the site (e.g. https://hexarch.org). Locally the API serves the pages itself.
const frontendUrl = trimSlash(env.FRONTEND_URL || publicUrl);
// Sites allowed to call the API from the browser with the login cookie: the site itself, plus the
// local preview (localhost:3000) only when not in production. CORS_ORIGINS replaces the list.
const isProduction = env.NODE_ENV === 'production';
const corsOrigins = (env.CORS_ORIGINS || [frontendUrl, ...(isProduction ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000'])].join(','))
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
  // How long a login lasts without being used (its token is renewed every 12 hours of use)
  tokenDays: Number(env.TOKEN_DAYS) || 7,
  publicUrl,
  verificationBaseUrl: trimSlash(env.EMAIL_VERIFICATION_BASE_URL || publicUrl),
  frontendUrl,
  corsOrigins,
  // The API serves the Client pages only when the site and API share an address (local development)
  serveClient: frontendUrl === publicUrl,
  secureCookies: publicUrl.startsWith('https://'),
  clientDir: path.resolve(serverRoot, env.CLIENT_DIR || '../Client'),
  uploadDir: path.resolve(serverRoot, env.UPLOAD_DIR || 'uploads'),
  // Each photo may be up to MAX_UPLOAD_MB (50). Camera RAW files (CR2, CR3, NEF, ARW, RAF, DNG...) are
  // much bigger by nature, so they skip that limit; MAX_RAW_UPLOAD_MB (300) is only a safety ceiling
  maxUploadBytes: (Number(env.MAX_UPLOAD_MB) || 50) * 1024 * 1024,
  maxRawUploadBytes: (Number(env.MAX_RAW_UPLOAD_MB) || 300) * 1024 * 1024,
  // Amazon Web Services: photos in the S3 bucket S3_BUCKET (otherwise UPLOAD_DIR on this machine) and
  // email through Amazon SES. Access comes from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (an IAM user
  // that may only use the photo bucket and send email), which the AWS SDK reads by itself.
  aws: {
    region: env.AWS_REGION || 'ap-southeast-2',
    s3Bucket: env.S3_BUCKET || '',
    hasKeys: Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY),
    // Optional: photos served through Amazon CloudFront (faster, cheaper) instead of straight from the
    // bucket. All three are needed; see "Faster photos with CloudFront" in README.md.
    cloudfront: {
      domain: (env.CLOUDFRONT_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, ''),
      keyPairId: env.CLOUDFRONT_KEY_PAIR_ID || '',
      privateKey: (env.CLOUDFRONT_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
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
  // Where the support page's "Send us a message" form is emailed (e.g. the team's Gmail)
  support: { inbox: env.SUPPORT_EMAIL || 'support@hexarch.org' },
  // Push notifications to phones and computers (Web Push). Make the pair once with
  // "npx web-push generate-vapid-keys"; without them, notifications only show in the inbox.
  push: {
    publicKey: env.VAPID_PUBLIC_KEY || '',
    privateKey: env.VAPID_PRIVATE_KEY || '',
    subject: env.VAPID_SUBJECT || 'mailto:team@hexarch.org',
  },
  isProduction,
  // The Terms and Privacy Policy versions people must have accepted. REQUIRE_CONSENT=on makes accepting
  // the current versions a condition for using the site (off until the site asks for it).
  policies: {
    tos: env.TOS_VERSION || '2026-11-20',
    privacy: env.PRIVACY_VERSION || '2026-11-19',
    enforce: env.REQUIRE_CONSENT === 'on',
  },
  // The age check at sign-up: under 13s are refused. REQUIRE_AGE=on makes the birth date required
  // (otherwise it's checked when the sign-up form sends one).
  age: { required: env.REQUIRE_AGE === 'on', minimum: 13, adult: 18 },
  // Where security alerts go (both optional; they're always in the server log too)
  security: { alertEmail: env.SECURITY_ALERT_EMAIL || '', alertWebhook: env.SECURITY_ALERT_WEBHOOK || '' },
};
