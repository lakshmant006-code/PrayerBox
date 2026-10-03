// POST /api/admin   (Authorization: Bearer <Firebase ID token>)
//
// Behind the admin page (admin.html). Only accounts listed in ADMIN_EMAILS can use it.
//   { action: "check" }  -> { admin, recipients }   recipients = people with prayer emails on
//   { action: "send", prayerIds: [...], subject?, note?, testOnly? }
//        Emails the chosen prayers to everyone who turned on "prayers to pray for"
//        (or only to you, with testOnly). Each email has its own unsubscribe link.
const { SITE, firebase, card, words, byline, message, sendMany, isAdmin } = require('./_lib/server');

const MAX_PRAYERS = 20;
const ID = /^[A-Za-z0-9]{1,64}$/;

async function optedIn(admin) {
  const prefs = await admin.firestore().collection('emailPrefs').where('digest', '==', true).get();
  const uids = prefs.docs.map(function (d) { return d.id; });
  const people = [];
  for (let i = 0; i < uids.length; i += 100) {
    const found = await admin.auth().getUsers(uids.slice(i, i + 100).map(function (uid) { return { uid: uid }; }));
    found.users.forEach(function (u) { if (u.email && !u.disabled) people.push(u); });
  }
  return people;
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let admin;
  try {
    admin = firebase();
  } catch (err) {
    return res.status(503).json({ error: 'Email is not set up yet' });
  }

  let me;
  try {
    me = await admin.auth().verifyIdToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  } catch (err) {
    return res.status(401).json({ error: 'Please sign in' });
  }
  if (!isAdmin(me)) return res.status(403).json({ admin: false, error: 'Not an admin account' });

  const body = req.body || {};
  try {
    if (body.action === 'check') {
      const people = await optedIn(admin);
      return res.status(200).json({ admin: true, recipients: people.length });
    }

    if (body.action !== 'send') return res.status(400).json({ error: 'Unknown action' });

    const ids = Array.isArray(body.prayerIds) ? body.prayerIds.filter(function (id) { return ID.test(id); }) : [];
    if (!ids.length) return res.status(400).json({ error: 'Choose at least one prayer' });
    if (ids.length > MAX_PRAYERS) return res.status(400).json({ error: 'Choose at most ' + MAX_PRAYERS + ' prayers' });

    const db = admin.firestore();
    const docs = await db.getAll.apply(db, ids.map(function (id) { return db.doc('prayers/' + id); }));
    const prayers = docs.filter(function (d) { return d.exists; }).map(function (d) { return d.data(); });
    if (!prayers.length) return res.status(400).json({ error: 'Those prayers no longer exist' });

    const subject = String(body.subject || '').trim().slice(0, 120) ||
      (prayers.length === 1 ? 'A prayer to pray for' : prayers.length + ' prayers to pray for');
    const note = String(body.note || '').trim().slice(0, 600) ||
      'Would you take a moment to pray for ' + (prayers.length === 1 ? 'this request' : 'these requests') + ' from the Prayer Box?';

    const listHtml = prayers.map(function (p) {
      const text = p.request.length > 400 ? p.request.slice(0, 400) + '…' : p.request;
      return card(byline(p.name) + words(text));
    }).join('<div style="height:12px;line-height:12px;">&nbsp;</div>');
    const listText = prayers.map(function (p) { return '• ' + p.name + ': ' + p.request; }).join('\n\n');

    let people;
    if (body.testOnly) {
      people = [{ email: me.email, uid: me.uid }];
    } else {
      people = await optedIn(admin);
    }
    if (!people.length) return res.status(200).json({ sent: 0, reason: 'Nobody has prayer emails turned on yet' });

    const messages = people.map(function (person) {
      return message(person.email, person.uid, {
        subject: (body.testOnly ? '[Test] ' : '') + subject,
        heading: subject,
        intro: note,
        preview: prayers[0].request.slice(0, 120),
        bodyHtml: listHtml,
        buttonHref: SITE + '/',
        buttonLabel: 'Open the Prayer Box',
        text: note + '\n\n' + listText + '\n\nOpen the Prayer Box: ' + SITE + '/'
      });
    });
    await sendMany(messages);

    if (!body.testOnly) {
      await db.collection('emailState').doc('adminSends').collection('log').add({
        by: me.email, prayerIds: ids, subject: subject, recipients: messages.length,
        at: admin.firestore.Timestamp.now()
      });
    }
    return res.status(200).json({ sent: messages.length });
  } catch (err) {
    console.error('admin failed', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
};
