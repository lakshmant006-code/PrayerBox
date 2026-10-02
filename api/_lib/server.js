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

function firebase() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin;
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

// Wraps the body of an email in the Prayer Box layout, with the unsubscribe footer.
function layout(bodyHtml, uid) {
  return '<!DOCTYPE html><html><body style="margin:0;padding:24px 12px;background:#f6f5f0;">' +
    '<div style="max-width:520px;margin:0 auto;padding:28px 24px;background:#fff;border:1.5px solid #000;border-radius:12px;' +
    'font-family:Georgia,\'Times New Roman\',serif;color:#000;font-size:16px;line-height:1.55;">' +
    '<p style="margin:0 0 18px;font-size:20px;">Prayer Box</p>' +
    bodyHtml +
    '<p style="margin:28px 0 0;padding-top:14px;border-top:1px solid #ddd;font-size:12px;color:#666;">' +
    'You get this because you turned on email updates at Prayer Box. ' +
    '<a href="' + SITE + '/dashboard.html" style="color:#666;">Change email settings</a> · ' +
    '<a href="' + unsubscribeUrl(uid) + '" style="color:#666;">Unsubscribe</a></p>' +
    '</div></body></html>';
}

function button(href, label) {
  return '<p style="margin:22px 0 0;"><a href="' + href + '" style="display:inline-block;padding:10px 18px;' +
    'background:#000;color:#fff;border-radius:10px;text-decoration:none;">' + escapeHtml(label) + '</a></p>';
}

function quote(text) {
  return '<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #000;background:#f6f6f6;' +
    'border-radius:0 8px 8px 0;white-space:pre-wrap;">' + escapeHtml(text) + '</blockquote>';
}

// One email object for Resend; `headers` adds one-click unsubscribe for mail apps.
function message(to, uid, subject, bodyHtml, bodyText) {
  const unsub = unsubscribeUrl(uid);
  return {
    from: process.env.EMAIL_FROM,
    to: [to],
    subject: subject,
    html: layout(bodyHtml, uid),
    text: bodyText + '\n\n—\nChange email settings: ' + SITE + '/dashboard.html\nUnsubscribe: ' + unsub,
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
  SITE, firebase, escapeHtml, quote, button, message, sendOne, sendMany,
  unsubscribeUrl, validUnsubscribeToken
};
