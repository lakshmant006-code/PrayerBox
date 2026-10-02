// POST /api/test-email   { "to": "someone@example.com", "kind": "reply" | "digest" }
// Authorization: Bearer <CRON_SECRET>
//
// For the site owner: sends one sample email, so you can check that email is set up and see
// how it looks. Protected by CRON_SECRET, so nobody else can use it to send mail.
const { SITE, firebase, card, words, byline, message, sendOne } = require('./_lib/server');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function (req, res) {
  const secret = process.env.CRON_SECRET;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!secret || req.headers.authorization !== 'Bearer ' + secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const to = String(body.to || '');
  if (!EMAIL.test(to)) return res.status(400).json({ error: 'Give a valid "to" address' });

  try {
    firebase(); // checks FIREBASE_SERVICE_ACCOUNT is readable too
  } catch (err) {
    return res.status(503).json({ error: 'Firebase key problem: ' + err.message });
  }

  const gap = '<div style="height:12px;line-height:12px;">&nbsp;</div>';
  const email = body.kind === 'digest'
    ? {
      subject: '[Test] 2 new prayers to pray for',
      heading: '2 new prayers to pray for',
      intro: 'People have dropped prayer requests in the box. Would you pray for them?',
      bodyHtml: card(byline('Anonymous') + words('Please pray for my exams next week.')) + gap +
        card(byline('Daniel') + words('My dad starts treatment on Monday. Praying for strength for our family.')),
      buttonHref: SITE + '/',
      buttonLabel: 'Open the Prayer Box',
      text: 'This is a test of the 48-hour Prayer Box email.\n\n• Anonymous: Please pray for my exams next week.\n' +
        '• Daniel: My dad starts treatment on Monday.\n\nOpen the Prayer Box: ' + SITE + '/'
    }
    : {
      subject: '[Test] Grace replied to your prayer',
      heading: 'Grace is praying with you',
      intro: 'You have a new reply to your prayer.',
      bodyHtml: card(byline('Grace replied') + words('Praying for your grandmother and your whole family tonight.')) + gap +
        card(byline('Your prayer') + words('Please pray for my grandmother who is undergoing surgery tomorrow morning.')),
      buttonHref: SITE + '/dashboard.html',
      buttonLabel: 'See your prayers',
      text: 'This is a test of the Prayer Box reply email.\n\nGrace replied: Praying for your grandmother and your ' +
        'whole family tonight.\n\nSee your prayers: ' + SITE + '/dashboard.html'
    };

  try {
    const sent = await sendOne(message(to, 'test', email));
    return res.status(200).json({ sent: true, id: sent.id });
  } catch (err) {
    console.error('test-email failed', err);
    return res.status(502).json({ error: String(err.message || err) });
  }
};
