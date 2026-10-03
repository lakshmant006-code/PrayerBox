// GET  /api/inbound-confirm?id=..&s=..   shows the emailed prayer with two buttons
// POST /api/inbound-confirm               id, s, as=public|anonymous  -> posts it
//
// The second step of "email a prayer in" (see inbound.js). Opening the link only shows the
// prayer; it's posted when the person presses a button. Some email systems open links
// automatically to scan them, and that mustn't post anything.
const { SITE, firebase, escapeHtml, validSignature } = require('./_lib/server');

const EXPIRES_MS = 3 * 24 * 60 * 60 * 1000;

function page(res, status, title, bodyHtml) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escapeHtml(title) + ' · Prayer Box</title>' +
    '<style>' +
    'body{margin:0;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#111;text-align:center;background:#fff}' +
    '.wrap{max-width:460px;margin:0 auto}' +
    '.logo{width:150px;height:auto}.letter{width:80px;height:auto;margin:28px 0 22px}' +
    'h1{font-size:28px;margin:0 0 12px}p{font-size:17px;line-height:1.5;color:#333;margin:0 0 22px}' +
    '.card{text-align:left;padding:18px 20px;background:#f5f5f2;border-radius:12px;font-family:Georgia,serif;font-size:17px;line-height:1.55;white-space:pre-wrap;margin:0 0 26px}' +
    'form{margin:0 0 12px}button,.btn{display:block;width:100%;box-sizing:border-box;padding:15px 20px;border-radius:10px;font:700 17px/1.2 inherit;cursor:pointer;text-decoration:none}' +
    '.solid{background:#111;color:#fff;border:1.5px solid #111}.outline{background:#fff;color:#111;border:1.5px solid #111}' +
    '</style></head><body><div class="wrap">' +
    '<a href="' + SITE + '/"><img class="logo" src="' + SITE + '/img/title-1.png" alt="Prayer Box"></a><br>' +
    '<img class="letter" src="' + SITE + '/img/letter-1.png" alt="">' +
    '<h1>' + escapeHtml(title) + '</h1>' + bodyHtml + '</div></body></html>');
}

function readForm(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise(function (resolve) {
    let data = '';
    req.on('data', function (c) { data += c; });
    req.on('end', function () { resolve(Object.fromEntries(new URLSearchParams(data))); });
  });
}

module.exports = async function (req, res) {
  const input = req.method === 'POST' ? await readForm(req) : req.query;
  const id = String(input.id || '');
  const s = String(input.s || '');
  if (!/^[a-f0-9]{24}$/.test(id) || !validSignature('post-prayer', id, s)) {
    return page(res, 400, 'That link didn’t work', '<p>Email your prayer again and we’ll send a fresh link.</p>');
  }

  let admin, db, ref, pending;
  try {
    admin = firebase();
    db = admin.firestore();
    ref = db.doc('emailState/inbox/pending/' + id);
    pending = await ref.get();
  } catch (err) {
    console.error('inbound-confirm failed', err);
    return page(res, 500, 'Something went wrong', '<p>Please try the link again in a minute.</p>');
  }

  if (!pending.exists) {
    return page(res, 410, 'Already posted', '<p>This prayer has already been posted, or the link was used.</p>' +
      '<a class="btn solid" href="' + SITE + '/">Open the Prayer Box</a>');
  }
  const p = pending.data();
  if (Date.now() - p.createdAt.toMillis() > EXPIRES_MS) {
    await ref.delete().catch(function () {});
    return page(res, 410, 'This link has expired', '<p>Links last 3 days. Email your prayer again and we’ll send a fresh one.</p>');
  }

  if (req.method !== 'POST') {
    const form = function (as, label, style) {
      return '<form method="post" action="/api/inbound-confirm">' +
        '<input type="hidden" name="id" value="' + id + '"><input type="hidden" name="s" value="' + s + '">' +
        '<input type="hidden" name="as" value="' + as + '"><button class="' + style + '" type="submit">' + escapeHtml(label) + '</button></form>';
    };
    return page(res, 200, 'Post your prayer', '<p>Here’s the prayer from your email. How would you like to post it?</p>' +
      '<div class="card">' + escapeHtml(p.request) + '</div>' +
      form('public', 'Post as ' + p.name, 'solid') + form('anonymous', 'Post anonymously', 'outline'));
  }

  const anonymous = input.as === 'anonymous';
  try {
    const prayerRef = db.collection('prayers').doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.runTransaction(async function (t) {
      const again = await t.get(ref);
      if (!again.exists) throw new Error('already used');
      t.set(prayerRef, {
        name: anonymous ? 'Anonymous' : p.name,
        request: p.request,
        visibility: anonymous ? 'anonymous' : 'public',
        createdAt: now
      });
      t.set(db.doc('users/' + p.uid + '/prayers/' + prayerRef.id), { createdAt: now, answered: false, seenReplies: 0 });
      t.set(db.doc('owners/' + prayerRef.id), { uid: p.uid });
      t.delete(ref);
    });
  } catch (err) {
    if (String(err.message) === 'already used') {
      return page(res, 410, 'Already posted', '<p>This prayer has already been posted.</p><a class="btn solid" href="' + SITE + '/">Open the Prayer Box</a>');
    }
    console.error('inbound-confirm post failed', err);
    return page(res, 500, 'Something went wrong', '<p>Your prayer wasn’t posted. Please try again in a minute.</p>');
  }

  return page(res, 200, 'Your prayer is in the box', '<p>' + (anonymous ? 'It’s posted anonymously.' : 'It’s posted as ' + escapeHtml(p.name) + '.') +
    ' People can now pray along and reply.</p>' +
    '<form><a class="btn solid" href="' + SITE + '/">See it in the box</a></form>' +
    '<a class="btn outline" href="' + SITE + '/dashboard.html">My prayers</a>');
};
