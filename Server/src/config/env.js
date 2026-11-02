import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = process.env;

function required(name) {
  const v = env[name];
  if (!v) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
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
  port: Number(env.PORT) || 4000,
  mongoUri: required('MONGODB_URI'),
  jwtSecret,
  sessionDays: Number(env.SESSION_DAYS) || 30,
  publicUrl,
  frontendUrl,
  corsOrigins,
  // The API serves the Client pages only when the site and API share an address (local development)
  serveClient: frontendUrl === publicUrl,
  secureCookies: publicUrl.startsWith('https://'),
  clientDir: path.resolve(serverRoot, env.CLIENT_DIR || '../Client'),
  uploadDir: path.resolve(serverRoot, env.UPLOAD_DIR || 'uploads'),
  maxUploadBytes: (Number(env.MAX_UPLOAD_MB) || 25) * 1024 * 1024,
  // Cloudflare R2 for photos. With all four set, photos go there; otherwise to UPLOAD_DIR on disk.
  r2: {
    accountId: env.R2_ACCOUNT_ID || '',
    accessKeyId: env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: env.R2_SECRET_ACCESS_KEY || '',
    bucket: env.R2_BUCKET || '',
  },
  google: { clientId: env.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '' },
  apple: { clientId: env.APPLE_CLIENT_ID || '' },
  // Microsoft Graph (Entra ID app registration) for sending email from SENDER_EMAIL's mailbox
  email: {
    tenantId: env.MS_TENANT_ID || '',
    clientId: env.MS_CLIENT_ID || '',
    clientSecret: env.MS_CLIENT_SECRET || '',
    sender: env.SENDER_EMAIL || '',
  },
  isProduction: env.NODE_ENV === 'production',
};
