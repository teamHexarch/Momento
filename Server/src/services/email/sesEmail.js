import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { config } from '../../config/env.js';
import { EmailError } from './emailError.js';

// Sends mail through Amazon SES from EMAIL_FROM (e.g. "Momento <no-reply@hexarch.org>").
// Used when EMAIL_FROM and the AWS keys are set. The hexarch.org domain must be verified in SES (in AWS_REGION),
// and the account moved out of the SES sandbox, or only verified addresses receive mail.
// Access comes from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (an IAM user allowed ses:SendEmail).

export const name = 'ses';

export const isConfigured = () => Boolean(config.email.from && config.aws.hasKeys);

let client = null;

function explain(err) {
  const msg = err?.message || String(err);
  if (err?.name === 'MessageRejected' && /not verified/i.test(msg)) {
    return `Amazon SES refused the email: ${msg} Verify hexarch.org in SES > Identities, and while the account is in the SES sandbox the recipient must be verified too (request production access to send to anyone).`;
  }
  if (err?.name === 'AccessDeniedException' || err?.$metadata?.httpStatusCode === 403) {
    return 'Amazon SES refused access. Give the IAM user in AWS_ACCESS_KEY_ID permission for ses:SendEmail.';
  }
  if (err?.name === 'CredentialsProviderError') {
    return 'Amazon SES: no AWS access found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.';
  }
  if (err?.name === 'TooManyRequestsException' || err?.name === 'LimitExceededException') {
    return 'Amazon SES is limiting how fast emails are sent. Try again shortly.';
  }
  return `Amazon SES error: ${msg}`;
}

export async function send({ to, subject, html, replyTo }) {
  client ||= new SESv2Client({ region: config.aws.region });
  try {
    await client.send(new SendEmailCommand({
      FromEmailAddress: config.email.from,
      Destination: { ToAddresses: to },
      ...(replyTo && { ReplyToAddresses: [replyTo] }),
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: { Html: { Data: html, Charset: 'UTF-8' } },
        },
      },
    }));
  } catch (err) {
    throw new EmailError(explain(err), { cause: err });
  }
}
