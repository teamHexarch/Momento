import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config/env.js';

// Photos in a private Cloudflare R2 bucket (R2 speaks the Amazon S3 protocol). The bucket stays
// private: the API checks someone is in the album, then sends their browser to a signed link
// that works for an hour. Photo traffic then flows from Cloudflare, not through this server.

const LINK_SECONDS = 3600;
const { accountId, accessKeyId, secretAccessKey, bucket } = config.r2;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

export const name = 'r2';

// Fails at startup, with the reason, if the keys or bucket name are wrong
export async function init() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (err) {
    const status = err.$metadata?.httpStatusCode;
    const why = status === 404 ? `there's no bucket called "${bucket}" in this account`
      : status === 403 || status === 401 ? 'the access key can’t use this bucket (check R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY and the token’s bucket permissions)'
      : err.message;
    throw new Error(`Cloudflare R2: ${why}.`);
  }
}

export async function save(key, buffer, mimeType) {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeType }));
}

export async function send(res, key) {
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: LINK_SECONDS });
  // The browser may reuse this redirect for a while, so the same photo isn't re-signed on every view
  res.set('Cache-Control', `private, max-age=${LINK_SECONDS - 300}`);
  res.redirect(302, url);
  return true;
}

export async function open(key) {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return out.Body;
}

export async function remove(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
