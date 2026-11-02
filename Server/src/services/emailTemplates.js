// Momento's emails share one simple layout: inline styles and tables, because many mail apps
// ignore <style> blocks and modern CSS.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const firstName = (user) => (user?.name || '').trim().split(/\s+/)[0];

/**
 * heading and paragraphs are plain text (escaped here). With a button, the link is
 * also printed underneath for mail apps that block buttons.
 */
function layout({ heading, paragraphs, button, footer }) {
  const para = (t) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#5C596B">${esc(t)}</p>`;
  return `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#F8F7FA;font-family:-apple-system,'Segoe UI',Inter,Arial,sans-serif;color:#2E2C3A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:24px;padding:36px 32px">
      <tr><td>
        <p style="margin:0 0 24px;font-size:20px;font-weight:700;letter-spacing:-0.02em">Momento</p>
        <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;letter-spacing:-0.03em">${esc(heading)}</h1>
        ${paragraphs.map(para).join('\n        ')}
        ${button ? `<a href="${esc(button.href)}" style="display:inline-block;margin-top:12px;padding:14px 28px;border-radius:100px;background:#2E2C3A;color:#F8F7FA;font-size:15px;font-weight:600;text-decoration:none">${esc(button.label)}</a>` : ''}
        ${footer ? `<p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#8A8697">${esc(footer)}</p>` : ''}
        ${button ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#8A8697;word-break:break-all">Button not working? Paste this into your browser:<br>${esc(button.href)}</p>` : ''}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function verificationHtml(user, link, hours = 24) {
  const first = firstName(user);
  return layout({
    heading: `${first ? `${first}, confirm` : 'Confirm'} your email`,
    paragraphs: ['Tap the button to confirm this is your address. It keeps your account safe and lets us help if you forget your password.'],
    button: { href: link, label: 'Confirm my email' },
    footer: `The link works for ${hours} hours. If you didn’t create a Momento account, you can ignore this email.`,
  });
}

export function resetHtml(user, link, minutes = 60) {
  const first = firstName(user);
  return layout({
    heading: 'Choose a new password',
    paragraphs: [`${first ? `Hi ${first}, someone` : 'Someone'} asked to reset the password for your Momento account. If it was you, tap the button to choose a new one.`],
    button: { href: link, label: 'Choose a new password' },
    footer: `The link works once, for ${minutes} minutes. If you didn’t ask for this, ignore this email: your password stays the same.`,
  });
}

export function passwordChangedHtml(user) {
  const first = firstName(user);
  return layout({
    heading: 'Your password was changed',
    paragraphs: [
      `${first ? `Hi ${first}, the` : 'The'} password for your Momento account was just changed, and every other device was logged out.`,
      'If this was you, there’s nothing else to do.',
    ],
    footer: 'If it wasn’t you, use “Forgot your password?” on the Momento log in screen straight away to take your account back, and reply to this email so we can help.',
  });
}
