import { S3Client } from '@aws-sdk/client-s3';
import { config } from '../../config/env.js';
import { objectStorage } from './objectStorage.js';

// Photos in a private Amazon S3 bucket (S3_BUCKET in AWS_REGION).
// Access comes from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (an IAM user allowed to use this
// bucket), which the AWS SDK reads by itself.
const store = objectStorage({
  name: 's3',
  label: 'Amazon S3',
  bucket: config.aws.s3Bucket,
  keyHint: 'give the IAM user in AWS_ACCESS_KEY_ID s3:GetObject, s3:PutObject, s3:DeleteObject and s3:ListBucket on this bucket',
  client: new S3Client({ region: config.aws.region }),
});

export const { name, init, save, send, open, remove } = store;
