// Admin page: every prayer request, searchable and exportable, and a way to email chosen
// prayers to everyone who turned on prayer emails. Access is checked by the server
// (api/admin.js, ADMIN_EMAILS); prayers themselves are public, so they're read directly.
// It never shows who wrote a prayer. All text goes on the page with textContent.
(function () {
  var statusEl = document.getElementById('adm-status');
  var bodyEl = document.getElementById('adm-body');
  var rowsEl = document.getElementById('adm-rows');
  var countEl = document.getElementById('adm-count');
  var searchEl = document.getElementById('adm-search');
  var filterEl = document.getElementById('adm-filter');
  var selectAll = document.getElementById('adm-select-all');
  var sendBtn = document.getElementById('adm-send');
  var testBtn = document.getElementById('adm-test');
  var errorEl = document.getElementById('adm-error');
  var doneEl = document.getElementById('adm-done');

  var db = firebase.firestore();
  var prayers = [];       // { id, name, request, visibility, createdAt, edited, replies, row, checkbox }
  var selected = {};      // id -> true
  var recipients = 0;
  var MAX_SELECT = 20;

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function api(body) {
    return firebase.auth().currentUser.getIdToken().then(function (token) {
      return fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(body)
      });
    }).then(function (res) {
      return res.json().then(function (data) { data.status = res.status; return data; });
    });
  }

  // ---- Table -------------------------------------------------------------------------

  function matches(p) {
    var q = searchEl.value.trim().toLowerCase();
    if (q && (p.request + ' ' + p.name).toLowerCase().indexOf(q) === -1) return false;
    var f = filterEl.value;
    if (f === 'public') return p.visibility === 'public';
    if (f === 'anonymous') return p.visibility === 'anonymous';
    if (f === 'replied') return p.replies > 0;
    if (f === 'unreplied') return p.replies === 0;
    return true;
  }

  function visible() {
    return prayers.filter(matches);
  }

  function buildRow(p) {
    var tr = make('tr');
    var tdCheck = make('td', 'adm-col-check');
    var box = make('input');
    box.type = 'checkbox';
    box.setAttribute('aria-label', 'Select prayer from ' + p.name);
    box.addEventListener('change', function () { toggle(p, box.checked); });
    tdCheck.appendChild(box);
    tr.appendChild(tdCheck);
    tr.appendChild(make('td', 'adm-date', formatDate(p.createdAt)));
    var who = make('td', 'adm-who');
    who.appendChild(make('span', '', p.name));
    if (p.visibility === 'public') who.appendChild(make('span', 'adm-chip', 'Public'));
    tr.appendChild(who);
    var text = make('td', 'adm-request', p.request);
    if (p.edited) text.appendChild(make('span', 'adm-edited', ' (edited)'));
    tr.appendChild(text);
    p.repliesCell = make('td', 'adm-col-num', p.replies === null ? '…' : String(p.replies));
    tr.appendChild(p.repliesCell);
    p.row = tr;
    p.checkbox = box;
    return tr;
  }

  function render() {
    var shown = visible();
    prayers.forEach(function (p) { p.row.hidden = shown.indexOf(p) === -1; });
    var count = Object.keys(selected).length;
    countEl.textContent = shown.length + ' of ' + prayers.length + ' prayers shown' +
      (count ? ' · ' + count + ' selected' : '');
    selectAll.checked = shown.length > 0 && shown.every(function (p) { return selected[p.id]; });
    sendBtn.textContent = count
      ? 'Email ' + count + ' prayer' + (count === 1 ? '' : 's') + ' to ' + recipients + ' ' + (recipients === 1 ? 'person' : 'people')
      : 'Email selected prayers';
    sendBtn.disabled = testBtn.disabled = count === 0;
  }

  function toggle(p, on) {
    if (on && !selected[p.id] && Object.keys(selected).length >= MAX_SELECT) {
      p.checkbox.checked = false;
      showError('You can email up to ' + MAX_SELECT + ' prayers at a time.');
      return;
    }
    if (on) selected[p.id] = true;
    else delete selected[p.id];
    p.checkbox.checked = on;
    render();
  }

  selectAll.addEventListener('change', function () {
    visible().forEach(function (p) { toggle(p, selectAll.checked); });
    render();
  });
  searchEl.addEventListener('input', render);
  filterEl.addEventListener('change', render);

  // ---- Export ------------------------------------------------------------------------

  document.getElementById('adm-export').addEventListener('click', function () {
    function cell(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }
    var lines = [['Date', 'Name', 'Visibility', 'Prayer request', 'Replies', 'Edited'].map(cell).join(',')];
    visible().forEach(function (p) {
      lines.push([p.createdAt.slice(0, 10), p.name, p.visibility, p.request, p.replies === null ? '' : p.replies, p.edited ? 'yes' : '']
        .map(cell).join(','));
    });
    // The BOM makes Excel open accented letters correctly.
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'prayer-box-prayers-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  });

  // ---- Sending -----------------------------------------------------------------------

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = !message;
    if (message) doneEl.hidden = true;
  }

  function send(testOnly) {
    var ids = Object.keys(selected);
    if (!ids.length) return;
    if (!testOnly && !window.confirm('Email ' + ids.length + ' prayer' + (ids.length === 1 ? '' : 's') + ' to ' +
        recipients + ' ' + (recipients === 1 ? 'person' : 'people') + ' now?')) return;
    showError('');
    doneEl.hidden = true;
    sendBtn.disabled = testBtn.disabled = true;
    api({
      action: 'send',
      prayerIds: ids,
      subject: document.getElementById('adm-subject').value,
      note: document.getElementById('adm-note').value,
      testOnly: testOnly
    }).then(function (data) {
      if (data.status !== 200) throw new Error(data.error || 'Sending failed');
      doneEl.textContent = testOnly
        ? 'Test sent to your inbox.'
        : data.sent ? 'Sent to ' + data.sent + ' ' + (data.sent === 1 ? 'person' : 'people') + '.' : (data.reason || 'Nothing was sent.');
      doneEl.hidden = false;
    }).catch(function (err) {
      showError(err.message || 'Sending failed. Please try again.');
    }).then(render);
  }
  sendBtn.addEventListener('click', function () { send(false); });
  testBtn.addEventListener('click', function () { send(true); });

  // ---- Load --------------------------------------------------------------------------

  function loadPrayers() {
    return db.collection('prayers').orderBy('createdAt', 'desc').limit(2000).get().then(function (snap) {
      prayers = snap.docs.map(function (doc) {
        var d = doc.data({ serverTimestamps: 'estimate' });
        return {
          id: doc.id, name: d.name, request: d.request, visibility: d.visibility,
          createdAt: d.createdAt ? d.createdAt.toDate().toISOString() : new Date().toISOString(),
          edited: !!d.editedAt, replies: null
        };
      });
      prayers.forEach(function (p) { rowsEl.appendChild(buildRow(p)); });
      render();
      // Reply counts fill in as they arrive.
      prayers.forEach(function (p) {
        db.collection('prayers').doc(p.id).collection('replies').get().then(function (r) {
          p.replies = r.size;
          p.repliesCell.textContent = String(r.size);
          render();
        }, function () { p.repliesCell.textContent = '?'; });
      });
    });
  }

  document.getElementById('log-out').addEventListener('click', function () { PrayerAuth.logOutAndGoHome(); });

  PrayerAuth.currentUser().then(function (user) {
    if (!user) {
      statusEl.textContent = 'Please log in with your admin account.';
      var link = make('a', 'adm-login', 'Log in');
      link.href = '/?login&next=admin.html';
      statusEl.appendChild(document.createTextNode(' '));
      statusEl.appendChild(link);
      return;
    }
    return api({ action: 'check' }).then(function (data) {
      if (!data.admin) {
        statusEl.textContent = data.status === 503
          ? 'The admin tools need the email setup on the server.'
          : 'This page is only for the Prayer Box admin.';
        return;
      }
      recipients = data.recipients || 0;
      document.getElementById('adm-recipients').textContent = recipients
        ? 'Goes to the ' + recipients + ' ' + (recipients === 1 ? 'person' : 'people') + ' who turned on prayer emails, each with their own unsubscribe link.'
        : 'Nobody has turned on prayer emails yet. You can still send yourself a test.';
      statusEl.hidden = true;
      bodyEl.hidden = false;
      return loadPrayers();
    });
  }).catch(function (err) {
    console.error(err);
    statusEl.textContent = 'Couldn’t load the admin page. Check your connection and reload.';
  });
})();
