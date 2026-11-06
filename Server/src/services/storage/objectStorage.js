import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Photos in a private Amazon S3 bucket.
// The bucket stays private: the API checks someone is in the album, then sends their browser to a
// signed link that works for an hour, so photo traffic flows from the bucket, not through this server.

const LINK_SECONDS = 3600;

/**
 * @param {object} o
 * @param {string} o.name   short name for logs ('s3')
 * @param {string} o.label  what to call it in error messages ('Amazon S3')
 * @param {import('@aws-sdk/client-s3').S3Client} o.client
 * @param {string} o.bucket
 * @param {string} o.keyHint what to check when access is refused
 */
export function objectStorage({ name, label, client, bucket, keyHint }) {
  return {
    name,
    bucket,
    // Fails at startup, with the reason, if the keys or bucket name are wrong
    async init() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (err) {
        const status = err.$metadata?.httpStatusCode;
        const why = status === 404 ? `there's no bucket called "${bucket}" (check the name and region)`
          : status === 403 || status === 401 ? `access to bucket "${bucket}" was refused (${keyHint})`
          : status === 301 ? `bucket "${bucket}" is in a different region (check AWS_REGION)`
          : err.name === 'CredentialsProviderError' ? 'no AWS access found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY'
          : err.message;
        throw new Error(`${label}: ${why}.`);
      }
    },
    async save(key, buffer, mimeType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeType }));
    },
    async send(res, key) {
      const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: LINK_SECONDS });
      // The browser may reuse this redirect for a while, so the same photo isn't re-signed on every view
      res.set('Cache-Control', `private, max-age=${LINK_SECONDS - 300}`);
      res.redirect(302, url);
      return true;
    },
    async open(key) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return out.Body;
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
