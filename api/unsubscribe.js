// GET or POST /api/unsubscribe?u=<uid>&t=<token>
//
// The unsubscribe link in every email. Turns off both kinds of email for that person.
// GET shows a short confirmation page; POST is the "one-click" unsubscribe that mail apps
// (Gmail, Apple Mail) send from their own Unsubscribe button.
const { SITE, firebase, escapeHtml, validUnsubscribeToken } = require('./_lib/server');

function page(res, status, title, text) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escapeHtml(title) + '</title></head>' +
    '<body style="margin:0;padding:48px 16px;font-family:Georgia,serif;text-align:center;color:#000;">' +
    '<h1 style="font-weight:normal;font-size:26px;">' + escapeHtml(title) + '</h1>' +
    '<p style="color:#444;">' + escapeHtml(text) + '</p>' +
    '<p><a href="' + SITE + '/" style="color:#000;">Back to the Prayer Box</a></p></body></html>');
}

module.exports = async function (req, res) {
  const uid = req.query.u;
  const token = req.query.t;
  let valid = false;
  try {
    valid = validUnsubscribeToken(uid, token);
  } catch (err) {
    console.error(err.message);
  }
  if (!valid) {
    return page(res, 400, 'That link didn’t work',
      'You can turn email updates off on your My prayers page instead.');
  }

  try {
    const admin = firebase();
    await admin.firestore().doc('emailPrefs/' + uid).set({
      replies: false,
      digest: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('unsubscribe failed', err);
    return page(res, 500, 'Something went wrong', 'Please try the link again in a minute.');
  }

  if (req.method === 'POST') return res.status(200).json({ unsubscribed: true });
  return page(res, 200, 'You’re unsubscribed',
    'You won’t get any more emails from Prayer Box. You can turn them back on any time on your My prayers page.');
};
