// Sends a sample "confirm your email" message through Amazon SES, to check the email settings without
// signing anyone up. The button is a dummy link.
//
//   npm run email:test -- you@example.com
import { config } from '../src/config/env.js';
import { sendEmail, isEmailConfigured, EmailError, emailProviderName, emailFrom } from '../src/services/emailService.js';
import { verificationHtml } from '../src/services/emailTemplates.js';

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('Give the address to send to:  npm run email:test -- you@example.com');
  process.exit(1);
}
if (!isEmailConfigured()) {
  console.error('Email isn’t set up. Fill in EMAIL_FROM, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Server/.env.');
  process.exit(1);
}

console.log(`Sending a test confirm email through ${emailProviderName} from ${emailFrom} to ${to}…`);
try {
  await sendEmail({
    to,
    subject: 'Test: confirm your email for Momento',
    html: verificationHtml({ name: 'Test' }, `${config.publicUrl}/?verified=test`),
  });
  console.log('Sent. Check the inbox (and the junk folder, the first time).');
} catch (err) {
  console.error(`Not sent: ${err instanceof EmailError ? err.message : err}`);
  if (err.cause) console.error(`Details: ${err.cause.message || err.cause}`);
  process.exit(1);
}
