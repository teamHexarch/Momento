import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSignedUrl as cloudFrontUrl } from '@aws-sdk/cloudfront-signer';
import { Upload } from '@aws-sdk/lib-storage';

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
export function objectStorage({ name, label, client, bucket, keyHint, cdn }) {
  const useCdn = Boolean(cdn?.domain && cdn.keyPairId && cdn.privateKey);
  if (useCdn) console.log(`Photos: served through CloudFront (${cdn.domain})`);
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
    // tier: an original photo, kept in S3 Intelligent-Tiering (the same speed, cheaper once it hasn't been
    // opened for a while). Files under 128 KB don't benefit, so they stay in the standard class.
    async save(key, buffer, mimeType, { tier = false } = {}) {
      const StorageClass = tier && buffer.length >= 128 * 1024 ? 'INTELLIGENT_TIERING' : undefined;
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeType, StorageClass }));
    },
    // A file too big to hold in memory (a background zip), uploaded in parts as it's made
    async saveStream(key, stream, mimeType) {
      await new Upload({ client, params: { Bucket: bucket, Key: key, Body: stream, ContentType: mimeType }, queueSize: 2, partSize: 8 * 1024 * 1024 }).done();
    },
    async send(res, key, mimeType, { filename } = {}) {
      // Through CloudFront when it's set up (a signed link, also good for an hour); else straight from S3
      const url = useCdn && !filename
        ? cloudFrontUrl({ url: `https://${cdn.domain}/${key.split('/').map(encodeURIComponent).join('/')}`, keyPairId: cdn.keyPairId, privateKey: cdn.privateKey, dateLessThan: new Date(Date.now() + LINK_SECONDS * 1000).toISOString() })
        : await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key, ...(filename && { ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"` }) }), { expiresIn: LINK_SECONDS });
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
    // Deletes many files at once: up to 1,000 per request (S3 DeleteObjects) instead of one request per file
    async removeMany(keys) {
      for (let i = 0; i < keys.length; i += 1000) {
        const out = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } }));
        if (out.Errors?.length) throw new Error(`${out.Errors.length} files could not be deleted (first: ${out.Errors[0].Code})`);
      }
    },
    // The folder names right under a prefix (e.g. "backups/" → ["backups/day-Mon/", ...])
    async folders(prefix) {
      const out = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: '/' }));
      return (out.CommonPrefixes || []).map((p) => p.Prefix);
    },
    // ---- Direct uploads (audit B3): the browser puts the file straight into the bucket ----
    // A signed PUT link for one file, good for `seconds`. S3 itself checks the file's SHA-256 (the signed
    // x-amz-checksum-sha256 header, which the browser must send as given), so what arrives is exactly the file the
    // server was told about, and the server never has to read it to know its fingerprint. The exact size is signed
    // too (Content-Length, which the browser sets from the file), so a link can't be used to store anything bigger.
    async presignPut(key, { sha256Base64, size }, seconds = 900) {
      if (!Number.isInteger(size) || size <= 0) throw new Error('presignPut needs the file size');
      const headers = { 'Content-Type': 'application/octet-stream', 'x-amz-checksum-sha256': sha256Base64 };
      const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: headers['Content-Type'], ContentLength: size, ChecksumSHA256: sha256Base64 }),
        { expiresIn: seconds, unhoistableHeaders: new Set(['x-amz-checksum-sha256']), signableHeaders: new Set(['content-type', 'content-length', 'x-amz-checksum-sha256']) });
      return { url, method: 'PUT', headers };
    },
    // What's stored under a key: { size, sha256Base64 } (the checksum S3 checked on upload), or null when it isn't there
    async head(key) {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: 'ENABLED' }));
        return { size: out.ContentLength, sha256Base64: out.ChecksumSHA256 || null };
      } catch (err) {
        if (err.$metadata?.httpStatusCode === 404 || err.name === 'NotFound') return null;
        throw err;
      }
    },
    // Deletes every file under a prefix
    async removePrefix(prefix) {
      let token;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        const keys = (page.Contents || []).map((o) => ({ Key: o.Key }));
        if (keys.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    },
  };
}
