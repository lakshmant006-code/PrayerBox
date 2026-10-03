// Shared helpers for the email functions in /api (Vercel serverless functions).
//
// Settings come from Vercel environment variables (Project > Settings > Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT  the whole JSON key of a Firebase service account
//   RESEND_API_KEY            API key from resend.com
//   EMAIL_FROM                e.g. "Prayer Box <hello@prayerbox.site>" (a verified Resend domain)
//   UNSUBSCRIBE_SECRET        any long random string; signs the unsubscribe links
//   CRON_SECRET               any long random string; Vercel sends it to /api/digest
const crypto = require('crypto');
const admin = require('firebase-admin');

const SITE = 'https://www.prayerbox.site';

// Reads the service-account JSON from FIREBASE_SERVICE_ACCOUNT. Forgiving about how it was
// pasted: missing outer { } (easy to drop when copying), or base64-encoded.
function serviceAccount() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  const attempts = [raw, '{' + raw.replace(/^,|,$/g, '') + '}'];
  if (!raw.includes('"')) {
    try { attempts.push(Buffer.from(raw, 'base64').toString('utf8')); } catch (e) {}
  }
  for (const text of attempts) {
    try {
      const key = JSON.parse(text);
      if (key && key.private_key && key.client_email) return key;
    } catch (e) {}
  }
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not the full JSON key file. Paste the whole file, from { to }.');
}

function firebase() {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount()) });
  }
  return admin;
}

// ---- Signed values -------------------------------------------------------------------------
// HMAC-signs a value for one purpose, so a link can't be forged or reused for something else.
function sign(purpose, value) {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET is not set');
  return crypto.createHmac('sha256', secret).update(purpose + ':' + value).digest('hex').slice(0, 40);
}

function validSignature(purpose, value, signature) {
  if (typeof value !== 'string' || typeof signature !== 'string' || signature.length !== 40) return false;
  const expected = Buffer.from(sign(purpose, value));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

// ---- Who's an admin --------------------------------------------------------------------
// ADMIN_EMAILS (Vercel env): comma-separated emails allowed to use the admin page.
// The sign-in must have a verified email (Google sign-ins always do).
function isAdmin(decodedToken) {
  const list = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(function (e) { return e.trim(); }).filter(Boolean);
  const email = (decodedToken && decodedToken.email || '').toLowerCase();
  return !!email && decodedToken.email_verified === true && list.indexOf(email) !== -1;
}

// ---- Unsubscribe links -------------------------------------------------------------------

function unsubscribeToken(uid) {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET is not set');
  return crypto.createHmac('sha256', secret).update(uid).digest('hex').slice(0, 32);
}

function validUnsubscribeToken(uid, token) {
  if (typeof uid !== 'string' || typeof token !== 'string' || token.length !== 32) return false;
  const expected = Buffer.from(unsubscribeToken(uid));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function unsubscribeUrl(uid) {
  return SITE + '/api/unsubscribe?u=' + encodeURIComponent(uid) + '&t=' + unsubscribeToken(uid);
}

// ---- Email ------------------------------------------------------------------------------

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- Email layout ----------------------------------------------------------------------
// Clean and centred: the Prayer Box title, the hand-drawn letter, a big heading, a short
// line of text, the message itself, one black button, and a small grey footer. Built with
// tables and inline styles, which is what Gmail, Apple Mail and Outlook all display reliably.

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

function layout(email, uid) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">' +
    '<title>' + escapeHtml(email.heading) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#ffffff;">' +
    // Hidden preview line shown next to the subject in the inbox list.
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' + escapeHtml(email.preview || email.intro) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">' +
    '<tr><td align="center" style="padding:40px 20px 32px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">' +

    // Title
    '<tr><td align="center" style="padding:0 0 36px;">' +
    '<img src="' + SITE + '/img/title-1.png" width="150" alt="Prayer Box" style="display:block;width:150px;height:auto;border:0;">' +
    '</td></tr>' +

    // Hand-drawn letter
    '<tr><td align="center" style="padding:0 0 30px;">' +
    '<img src="' + SITE + '/img/letter-1.png" width="92" alt="" style="display:block;width:92px;height:auto;border:0;">' +
    '</td></tr>' +

    // Heading + intro
    '<tr><td align="center" style="padding:0 0 14px;font-family:' + SANS + ';font-size:28px;line-height:1.25;font-weight:700;color:#111111;">' +
    escapeHtml(email.heading) + '</td></tr>' +
    '<tr><td align="center" style="padding:0 12px 26px;font-family:' + SANS + ';font-size:18px;line-height:1.5;color:#222222;">' +
    escapeHtml(email.intro) + '</td></tr>' +

    // The message itself (a reply, or the list of prayers)
    (email.bodyHtml ? '<tr><td style="padding:0 0 28px;">' + email.bodyHtml + '</td></tr>' : '') +

    // Buttons: the first is solid black, any others are outlined, stacked below it.
    buttons(email) +

    // Footer
    '<tr><td align="center" style="padding:0 16px;font-family:' + SANS + ';font-size:13px;line-height:1.6;color:#8a8a8a;">' +
    (email.footer
      ? escapeHtml(email.footer)
      : 'You\u2019re getting this because you turned on email updates at Prayer Box.<br>' +
        '<a href="' + SITE + '/dashboard.html" style="color:#8a8a8a;">Email settings</a>' +
        ' &nbsp;·&nbsp; <a href="' + unsubscribeUrl(uid) + '" style="color:#8a8a8a;">Unsubscribe</a>') +
    '</td></tr>' +

    '</table></td></tr></table></body></html>';
}

function buttons(email) {
  const list = email.buttons || [{ href: email.buttonHref, label: email.buttonLabel }];
  return list.map(function (b, i) {
    const solid = i === 0;
    return '<tr><td align="center" style="padding:0 0 ' + (i === list.length - 1 ? 40 : 12) + 'px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td align="center" bgcolor="' + (solid ? '#111111' : '#ffffff') + '" style="border-radius:10px;' +
      (solid ? '' : 'border:1.5px solid #111111;') + '">' +
      '<a href="' + b.href + '" style="display:inline-block;padding:15px 38px;font-family:' + SANS +
      ';font-size:18px;font-weight:700;color:' + (solid ? '#ffffff' : '#111111') +
      ';text-decoration:none;border-radius:10px;">' + escapeHtml(b.label) + '</a></td></tr></table></td></tr>';
  }).join('');
}

// A soft grey card holding someone's words (a reply, or a prayer request).
function card(innerHtml) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr><td style="padding:18px 20px;background:#f5f5f2;border-radius:12px;font-family:' + SERIF +
    ';font-size:17px;line-height:1.55;color:#111111;">' + innerHtml + '</td></tr></table>';
}

function words(text) {
  return '<span style="white-space:pre-wrap;">' + escapeHtml(text) + '</span>';
}

function byline(text) {
  return '<div style="margin:0 0 6px;font-family:' + SANS + ';font-size:13px;color:#777777;">' + escapeHtml(text) + '</div>';
}

// An email that isn't a subscription (e.g. a reply to an email someone sent us): no
// unsubscribe link, just a plain footer line.
// email: { subject, heading, intro, preview?, bodyHtml, buttons: [{href, label}], footer, text }
function notice(to, email) {
  return {
    from: process.env.EMAIL_FROM,
    to: [to],
    subject: email.subject,
    html: layout(email, null),
    text: email.text
  };
}

// One email object for Resend; `headers` adds one-click unsubscribe for mail apps.
// email: { subject, heading, intro, preview?, bodyHtml, buttonHref, buttonLabel, text }
function message(to, uid, email) {
  const unsub = unsubscribeUrl(uid);
  return {
    from: process.env.EMAIL_FROM,
    to: [to],
    subject: email.subject,
    html: layout(email, uid),
    text: email.text + '\n\n—\nEmail settings: ' + SITE + '/dashboard.html\nUnsubscribe: ' + unsub,
    headers: {
      'List-Unsubscribe': '<' + unsub + '>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }
  };
}

async function resend(path, payload) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  if (!process.env.EMAIL_FROM) throw new Error('EMAIL_FROM is not set');
  const res = await fetch('https://api.resend.com' + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Resend ' + res.status + ': ' + (await res.text()));
  return res.json();
}

async function resendGet(path) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch('https://api.resend.com' + path, { headers: { Authorization: 'Bearer ' + key } });
  if (!res.ok) throw new Error('Resend ' + res.status + ': ' + (await res.text()));
  return res.json();
}

function sendOne(msg) {
  return resend('/emails', msg);
}

// Resend takes up to 100 emails per batch call.
async function sendMany(msgs) {
  for (let i = 0; i < msgs.length; i += 100) {
    await resend('/emails/batch', msgs.slice(i, i + 100));
  }
}

module.exports = {
  SITE, firebase, escapeHtml, card, words, byline, message, notice, sendOne, sendMany, resendGet,
  unsubscribeUrl, validUnsubscribeToken, sign, validSignature, isAdmin
};
