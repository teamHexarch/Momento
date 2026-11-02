import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { config } from '../config/env.js';

// Sends mail through Microsoft Graph as SENDER_EMAIL, using the Entra ID app's own credentials
// (client credentials flow). The app needs the Mail.Send *application* permission with admin
// consent, and SENDER_EMAIL must be a real mailbox in that tenant.

export class EmailError extends Error {}

export const isEmailConfigured = () => {
  const { tenantId, clientId, clientSecret, sender } = config.email;
  return Boolean(tenantId && clientId && clientSecret && sender);
};

let graph = null;
function graphClient() {
  if (!isEmailConfigured()) {
    throw new EmailError('Email isn’t set up: fill in MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and SENDER_EMAIL in .env.');
  }
  if (!graph) {
    const { tenantId, clientId, clientSecret } = config.email;
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const authProvider = new TokenCredentialAuthenticationProvider(credential, { scopes: ['https://graph.microsoft.com/.default'] });
    graph = Client.initWithMiddleware({ authProvider });
  }
  return graph;
}

// Graph and Entra errors are cryptic; this says what to fix
function explain(err) {
  const msg = String(err?.message || err);
  if (/AADSTS7000215|AADSTS7000222/.test(msg)) return 'MS_CLIENT_SECRET is wrong or has expired. Use the secret *Value*, not its ID.';
  if (/AADSTS700016/.test(msg)) return 'MS_CLIENT_ID isn’t an app registration in this tenant.';
  if (/AADSTS90002|AADSTS900023/.test(msg)) return 'MS_TENANT_ID isn’t a valid tenant (Directory) ID.';
  const status = err?.statusCode, code = err?.code || '';
  if (status === 401) return 'Microsoft rejected the app’s token. Check the tenant, client ID and secret.';
  if (status === 403 || code === 'ErrorAccessDenied') return 'The app may not send mail: give it the Mail.Send application permission and grant admin consent (or check any application access policy).';
  if (status === 404 || code === 'ResourceNotFound' || code === 'MailboxNotEnabledForRESTAPI' || code === 'ErrorInvalidUser') return `SENDER_EMAIL (${config.email.sender}) isn’t a mailbox in this tenant, or it has no Exchange Online licence.`;
  if (status === 429) return 'Microsoft is throttling sends. Try again shortly.';
  return `Microsoft Graph error${status ? ` ${status}` : ''}${code ? ` (${code})` : ''}: ${msg}`;
}

/**
 * Sends one email. `to` is an address or a list of them; `html` is the body.
 * Throws EmailError with a readable reason when Microsoft refuses.
 */
export async function sendEmail({ to, subject, html, replyTo }) {
  const recipients = [].concat(to).filter(Boolean);
  if (!recipients.length) throw new EmailError('No recipient given.');
  const message = {
    subject,
    body: { contentType: 'HTML', content: html },
    toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
    ...(replyTo && { replyTo: [{ emailAddress: { address: replyTo } }] }),
  };
  try {
    await graphClient()
      .api(`/users/${encodeURIComponent(config.email.sender)}/sendMail`)
      .post({ message, saveToSentItems: false });
  } catch (err) {
    if (err instanceof EmailError) throw err;
    throw new EmailError(explain(err), { cause: err });
  }
}
