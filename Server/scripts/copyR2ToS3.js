// One-time move of every photo from Cloudflare R2 to Amazon S3, keeping the same names, so the
// photo records in MongoDB keep working unchanged. Safe to run again: files already in S3 are skipped.
//
// Needs the R2_* settings (the source), S3_BUCKET + AWS_REGION (the destination) and AWS keys
// that may write to the bucket (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, or an AWS profile).
//   npm run aws:copy-photos            copies
//   npm run aws:copy-photos -- --dry   only counts what would be copied
import { S3Client, ListObjectsV2Command, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const env = process.env;
const dry = process.argv.includes('--dry');
for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'S3_BUCKET']) {
  if (!env[k]) { console.error(`${k} is not set.`); process.exit(1); }
}
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});
const s3 = new S3Client({ region: env.AWS_REGION || 'ap-southeast-2' });
const from = env.R2_BUCKET, to = env.S3_BUCKET;

async function inS3(key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: to, Key: key })); return true; }
  catch (err) { if (err.$metadata?.httpStatusCode === 404) return false; throw err; }
}

let seen = 0, copied = 0, skipped = 0, bytes = 0;
let token;
do {
  const page = await r2.send(new ListObjectsV2Command({ Bucket: from, ContinuationToken: token }));
  for (const obj of page.Contents || []) {
    seen++;
    if (await inS3(obj.Key)) { skipped++; continue; }
    if (!dry) {
      const got = await r2.send(new GetObjectCommand({ Bucket: from, Key: obj.Key }));
      const body = Buffer.from(await got.Body.transformToByteArray());
      await s3.send(new PutObjectCommand({ Bucket: to, Key: obj.Key, Body: body, ContentType: got.ContentType }));
    }
    copied++; bytes += obj.Size || 0;
    if (copied % 50 === 0) console.log(`…${copied} ${dry ? 'to copy' : 'copied'}`);
  }
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);

console.log(`${dry ? 'Dry run: ' : ''}${seen} files in R2 "${from}". ${dry ? 'Would copy' : 'Copied'} ${copied} (${(bytes / 1048576).toFixed(1)} MB) to S3 "${to}", ${skipped} already there.`);
