// POST /api/notify-reply  { prayerId, replyId }   (Authorization: Bearer <Firebase ID token>)
//
// Called by the site right after someone posts a reply. Emails the prayer's author, if they
// turned on reply emails. Checks that the caller really wrote that reply, sends at most one
// email per reply, never emails people about their own replies, and sends at most one email
// per prayer every 15 minutes so a burst of replies doesn't flood anyone's inbox.
const { SITE, firebase, escapeHtml, quote, button, message, sendOne } = require('./_lib/server');

const FRESH_MS = 10 * 60 * 1000;      // only replies posted in the last 10 minutes
const PER_PRAYER_MS = 15 * 60 * 1000; // at most one email per prayer every 15 minutes
const ID = /^[A-Za-z0-9]{1,64}$/;

module.exports = async function (req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let admin;
  try {
    admin = firebase();
  } catch (err) {
    console.error(err.message);
    return res.status(503).json({ error: 'Email is not set up yet' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  let caller;
  try {
    caller = await admin.auth().verifyIdToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Please sign in' });
  }

  const body = req.body || {};
  const prayerId = body.prayerId, replyId = body.replyId;
  if (!ID.test(prayerId || '') || !ID.test(replyId || '')) {
    return res.status(400).json({ error: 'Bad request' });
  }

  const db = admin.firestore();
  const key = prayerId + '_' + replyId;
  const skip = function (reason) { return res.status(200).json({ sent: false, reason: reason }); };

  try {
    // The caller must be the reply's author (their private link to it proves it).
    const [link, replyDoc, prayerDoc, ownerDoc] = await Promise.all([
      db.doc('users/' + caller.uid + '/replies/' + key).get(),
      db.doc('prayers/' + prayerId + '/replies/' + replyId).get(),
      db.doc('prayers/' + prayerId).get(),
      db.doc('owners/' + prayerId).get()
    ]);
    if (!link.exists) return res.status(403).json({ error: 'Not your reply' });
    if (!replyDoc.exists || !prayerDoc.exists) return skip('deleted');
    if (Date.now() - replyDoc.createTime.toMillis() > FRESH_MS) return skip('old reply');
    if (!ownerDoc.exists) return skip('prayer has no known author');

    const ownerUid = ownerDoc.get('uid');
    if (ownerUid === caller.uid) return skip('own prayer');

    const prefs = await db.doc('emailPrefs/' + ownerUid).get();
    if (!prefs.exists || prefs.get('replies') !== true) return skip('author has reply emails off');

    // Once per reply: creating the marker fails if it's already there.
    try {
      await db.doc('emailState/replies/sent/' + key).create({ at: admin.firestore.FieldValue.serverTimestamp() });
    } catch (err) {
      return skip('already handled');
    }

    // At most one email per prayer every 15 minutes.
    const throttleRef = db.doc('emailState/replies/lastEmail/' + prayerId);
    const allowed = await db.runTransaction(async function (t) {
      const last = await t.get(throttleRef);
      const lastAt = last.exists ? last.get('at').toMillis() : 0;
      if (Date.now() - lastAt < PER_PRAYER_MS) return false;
      t.set(throttleRef, { at: admin.firestore.Timestamp.now() });
      return true;
    });
    if (!allowed) return skip('emailed about this prayer recently');

    const owner = await admin.auth().getUser(ownerUid);
    if (!owner.email || owner.disabled) return skip('author has no email');

    const reply = replyDoc.data();
    const prayer = prayerDoc.data();
    const who = reply.name === 'Anonymous' ? 'Someone' : reply.name;
    const excerpt = prayer.request.length > 160 ? prayer.request.slice(0, 160) + '…' : prayer.request;

    const html =
      '<p style="margin:0 0 6px;"><strong>' + escapeHtml(who) + '</strong> replied to your prayer:</p>' +
      quote(reply.text) +
      '<p style="margin:16px 0 0;font-size:14px;color:#555;">Your prayer: “' + escapeHtml(excerpt) + '”</p>' +
      button(SITE + '/dashboard.html', 'See it in My prayers');
    const text = who + ' replied to your prayer:\n\n' + reply.text + '\n\nYour prayer: "' + excerpt +
      '"\n\nSee it in My prayers: ' + SITE + '/dashboard.html';

    await sendOne(message(owner.email, ownerUid, who + ' replied to your prayer', html, text));
    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('notify-reply failed', err);
    return res.status(500).json({ error: 'Could not send the email' });
  }
};
