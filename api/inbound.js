// POST /api/inbound   (Resend webhook: email.received)
//
// "Email a prayer in": someone emails their prayer to the Prayer Box inbound address.
//  - If the sender's address belongs to a Prayer Box account, we email them back a link to
//    review and post it (publicly with their name, or anonymously). The "From" on an email
//    can be faked, so nothing is posted until the real inbox owner confirms.
//  - Otherwise we reply once a day at most, explaining how to create an account.
//
// Needs RESEND_WEBHOOK_SECRET (the signing secret of the Resend webhook, "whsec_...").
const crypto = require('crypto');
const { SITE, firebase, card, words, notice, sendOne, resendGet, sign } = require('./_lib/server');

const MAX_PRAYER = 2000;

// The signature has to be checked on the raw bytes. Vercel only parses req.body when it's
// read, so we read the request stream ourselves instead.
function readRaw(req) {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

// Resend signs webhooks the Svix way: HMAC-SHA256 of "<id>.<timestamp>.<body>", base64,
// with the secret after "whsec_" base64-decoded. Rejects anything older than 5 minutes.
function verifySignature(raw, headers, secret) {
  const id = headers['svix-id'], ts = headers['svix-timestamp'], sigs = headers['svix-signature'];
  if (!id || !ts || !sigs || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = Buffer.from(crypto.createHmac('sha256', key).update(id + '.' + ts + '.' + raw).digest('base64'));
  return String(sigs).split(' ').some(function (part) {
    const pieces = part.split(',');
    if (pieces[0] !== 'v1' || !pieces[1]) return false;
    const given = Buffer.from(pieces[1]);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

function senderAddress(from) {
  const match = String(from || '').match(/<([^>]+)>/);
  return (match ? match[1] : String(from || '')).trim().toLowerCase();
}

// The prayer is the email body, without quoted earlier messages or signatures.
function prayerFrom(email) {
  let text = email.text || '';
  if (!text && email.html) {
    text = email.html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  }
  const cutMarkers = [/\n-- ?\n/, /\nOn .{1,200}wrote:/, /\n>/, /\nSent from my /i, /\nGet Outlook for /i, /\n_{5,}/];
  cutMarkers.forEach(function (marker) {
    const m = text.match(marker);
    if (m) text = text.slice(0, m.index);
  });
  text = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!text && email.subject) text = email.subject.trim();
  return text.length > MAX_PRAYER ? text.slice(0, MAX_PRAYER - 1) + '…' : text;
}

function firstName(user) {
  if (user.displayName) return user.displayName.trim().split(/\s+/)[0].slice(0, 40);
  const local = (user.email || '').split('@')[0].split(/[._+-]/)[0];
  return local ? (local.charAt(0).toUpperCase() + local.slice(1)).slice(0, 40) : 'Friend';
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const raw = await readRaw(req);
  if (!verifySignature(raw, req.headers, process.env.RESEND_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Bad signature' });
  }

  let event;
  try { event = JSON.parse(raw); } catch (e) { return res.status(400).json({ error: 'Bad JSON' }); }
  if (event.type !== 'email.received' || !event.data || !event.data.email_id) {
    return res.status(200).json({ ignored: true });
  }

  try {
    const admin = firebase();
    const db = admin.firestore();
    const emailId = String(event.data.email_id);

    // Webhooks can be delivered more than once; handle each email once.
    try {
      await db.doc('emailState/inbox/seen/' + emailId.replace(/[^A-Za-z0-9-]/g, '')).create({ at: admin.firestore.Timestamp.now() });
    } catch (e) {
      return res.status(200).json({ duplicate: true });
    }

    const email = await resendGet('/emails/receiving/' + encodeURIComponent(emailId));
    const from = senderAddress(email.from || event.data.from);

    // Never answer ourselves or automatic mail (avoids email loops).
    const headers = email.headers || {};
    const auto = String(headers['auto-submitted'] || headers['Auto-Submitted'] || '').toLowerCase();
    if (!from || from.endsWith('prayerbox.site') || (auto && auto !== 'no') || /mailer-daemon|no-?reply/.test(from)) {
      return res.status(200).json({ ignored: 'automatic or own mail' });
    }

    let user = null;
    try { user = await admin.auth().getUserByEmail(from); } catch (e) { user = null; }

    if (!user || user.disabled) {
      // At most one "please sign up" note per address per day.
      const key = crypto.createHash('sha256').update(from).digest('hex').slice(0, 32);
      const noteRef = db.doc('emailState/inbox/noAccount/' + key);
      const last = await noteRef.get();
      if (last.exists && Date.now() - last.get('at').toMillis() < 24 * 60 * 60 * 1000) {
        return res.status(200).json({ ignored: 'no account, already told today' });
      }
      await noteRef.set({ at: admin.firestore.Timestamp.now() });
      await sendOne(notice(from, {
        subject: 'Make a Prayer Box account to email your prayers',
        heading: 'We couldn’t post that yet',
        intro: 'Emailed prayers are posted for people with a Prayer Box account. Sign up with this email address, then email your prayer again.',
        buttons: [{ href: SITE + '/?login', label: 'Create an account' }],
        footer: 'You’re getting this because this address emailed a prayer to Prayer Box.',
        text: 'Emailed prayers are posted for people with a Prayer Box account. Sign up with this email address at ' +
          SITE + ' then email your prayer again.'
      }));
      return res.status(200).json({ replied: 'no account' });
    }

    const request = prayerFrom(email);
    if (!request) {
      await sendOne(notice(from, {
        subject: 'We couldn’t find a prayer in your email',
        heading: 'Nothing to post',
        intro: 'Your email to Prayer Box looked empty. Write your prayer request in the body of the email and send it again.',
        buttons: [{ href: SITE + '/prayer.html', label: 'Or drop it on the site' }],
        footer: 'You’re getting this because you emailed a prayer to Prayer Box.',
        text: 'Your email to Prayer Box looked empty. Write your prayer request in the body and send it again, or use ' + SITE + '/prayer.html'
      }));
      return res.status(200).json({ replied: 'empty' });
    }

    // Hold it until they confirm; the link expires after 3 days.
    const id = crypto.randomBytes(12).toString('hex');
    await db.doc('emailState/inbox/pending/' + id).set({
      uid: user.uid,
      name: firstName(user),
      request: request,
      createdAt: admin.firestore.Timestamp.now()
    });

    const link = SITE + '/api/inbound-confirm?id=' + id + '&s=' + sign('post-prayer', id);
    await sendOne(notice(from, {
      subject: 'Ready to post your prayer?',
      heading: 'Ready to post your prayer?',
      intro: 'We got your email. Review your prayer and choose how to post it in the box.',
      preview: request.slice(0, 120),
      bodyHtml: card(words(request)),
      buttons: [{ href: link, label: 'Review and post' }],
      footer: 'You’re getting this because you emailed a prayer to Prayer Box. If that wasn’t you, ignore this email and nothing will be posted.',
      text: 'We got your email. Review your prayer and choose how to post it:\n\n' + request + '\n\n' + link +
        '\n\nIf that wasn\'t you, ignore this email and nothing will be posted.'
    }));
    return res.status(200).json({ replied: 'confirm' });
  } catch (err) {
    console.error('inbound failed', err);
    // 500 makes Resend retry later; the "seen" marker is only set once, so clear it on failure.
    try {
      await firebase().firestore().doc('emailState/inbox/seen/' + String(event.data.email_id).replace(/[^A-Za-z0-9-]/g, '')).delete();
    } catch (e) {}
    return res.status(500).json({ error: 'Could not handle the email' });
  }
};
