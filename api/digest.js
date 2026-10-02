// GET /api/digest   (run by Vercel Cron once a day; see vercel.json)
//
// Every 48 hours, emails everyone who turned on "prayers to pray for" a short list of the
// prayer requests dropped since the last email (up to 10, newest first). If nothing new came
// in, nobody is emailed. Vercel's free plan runs scheduled jobs at most daily, so this runs
// every day and only sends when 48 hours (give or take an hour) have passed.
const { SITE, firebase, escapeHtml, button, message, sendMany } = require('./_lib/server');

const EVERY_MS = 47 * 60 * 60 * 1000; // 48 hours, with an hour of slack for cron timing
const MAX_PRAYERS = 10;

module.exports = async function (req, res) {
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; nobody else can trigger this.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== 'Bearer ' + secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const admin = firebase();
    const db = admin.firestore();
    const stateRef = db.doc('emailState/digest');
    const state = await stateRef.get();
    const lastSent = state.exists && state.get('lastRunAt') ? state.get('lastRunAt').toMillis() : 0;
    if (Date.now() - lastSent < EVERY_MS) return res.status(200).json({ sent: 0, reason: 'not yet 48 hours' });

    const since = lastSent || Date.now() - 48 * 60 * 60 * 1000;
    const prayersSnap = await db.collection('prayers')
      .where('createdAt', '>', admin.firestore.Timestamp.fromMillis(since))
      .orderBy('createdAt', 'desc').limit(MAX_PRAYERS).get();

    // Keep the 48-hour rhythm even when there's nothing new to send.
    await stateRef.set({ lastRunAt: admin.firestore.Timestamp.now() }, { merge: true });
    if (prayersSnap.empty) return res.status(200).json({ sent: 0, reason: 'no new prayers' });

    const prayers = prayersSnap.docs.map(function (doc) { return doc.data(); });

    const prefsSnap = await db.collection('emailPrefs').where('digest', '==', true).get();
    const uids = prefsSnap.docs.map(function (doc) { return doc.id; });
    if (!uids.length) return res.status(200).json({ sent: 0, reason: 'nobody signed up' });

    // Look up email addresses, 100 accounts at a time.
    const people = [];
    for (let i = 0; i < uids.length; i += 100) {
      const found = await admin.auth().getUsers(uids.slice(i, i + 100).map(function (uid) { return { uid: uid }; }));
      found.users.forEach(function (u) { if (u.email && !u.disabled) people.push(u); });
    }

    const count = prayers.length;
    const subject = count === 1 ? '1 new prayer to pray for' : count + ' new prayers to pray for';
    const listHtml = prayers.map(function (p) {
      const text = p.request.length > 220 ? p.request.slice(0, 220) + '…' : p.request;
      return '<li style="margin:0 0 14px;"><span style="font-size:13px;color:#666;">' + escapeHtml(p.name) + '</span><br>' +
        '<span style="white-space:pre-wrap;">' + escapeHtml(text) + '</span></li>';
    }).join('');
    const listText = prayers.map(function (p) { return '• ' + p.name + ': ' + p.request; }).join('\n\n');

    const messages = people.map(function (person) {
      const html =
        '<p style="margin:0 0 14px;">' + (count === 1 ? 'Someone has' : 'People have') +
        ' dropped new prayer requests in the box. Would you pray for them?</p>' +
        '<ul style="margin:0;padding-left:18px;">' + listHtml + '</ul>' +
        button(SITE + '/', 'Open the Prayer Box');
      const text = 'New prayer requests in the box. Would you pray for them?\n\n' + listText +
        '\n\nOpen the Prayer Box: ' + SITE + '/';
      return message(person.email, person.uid, subject, html, text);
    });

    await sendMany(messages);
    return res.status(200).json({ sent: messages.length, prayers: count });
  } catch (err) {
    console.error('digest failed', err);
    return res.status(500).json({ error: 'Digest failed' });
  }
};
