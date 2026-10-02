// "My prayers" dashboard: the prayers the signed-in person has dropped, who replied, and
// which ones have been answered. Needs auth.js and db.js loaded first.
//
// The list comes from the person's private users/{uid}/prayers collection (see db.js and
// firestore.rules). Prayer and reply text is written by other people, so everything here is
// put on the page with textContent, never innerHTML.
(function () {
  var MAX_PRAYERS = 50;
  var ANSWER_NOTE_MAX = 280;

  var statusEl = document.getElementById('dash-status');
  var fatalEl = document.getElementById('dash-fatal');
  var bodyEl = document.getElementById('dash-body');
  var listEl = document.getElementById('dash-list');
  var emptyEl = document.getElementById('dash-empty');
  var emptyTitle = document.getElementById('dash-empty-title');
  var emptyText = document.getElementById('dash-empty-text');
  var emptyCta = document.getElementById('dash-empty-cta');
  var filterButtons = document.querySelectorAll('.dash-filter');

  var user = null;
  var cards = {};   // prayer id -> { id, li, link, prayer, prayerState, replies, repliesReady, ui, refs }
  var order = [];   // prayer ids, newest first
  var filter = 'all';
  var firstSnapshot = true;

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function unreadCount(rec) {
    return Math.max(0, rec.replies.length - rec.link.seenReplies);
  }

  // ---- One prayer card -----------------------------------------------------------------

  function createCard(id) {
    var li = make('li', 'dash-card');
    var rec = {
      id: id, li: li, link: null, prayer: null, prayerState: 'loading',
      replies: [], repliesReady: false, markingSeen: false,
      stopReplies: function () {}, ui: { repliesOpen: false, answering: false }, refs: {}
    };
    var r = rec.refs;

    var top = make('div', 'dash-card-top');
    r.date = make('span', 'dash-date');
    r.chip = make('span', 'dash-chip');
    r.badge = make('span', 'dash-badge');
    top.appendChild(r.date);
    top.appendChild(r.chip);
    top.appendChild(r.badge);

    r.request = make('p', 'dash-request');

    r.noteWrap = make('div', 'dash-note');
    r.noteWrap.appendChild(make('p', 'dash-label', 'HOW IT WAS ANSWERED'));
    r.note = make('p', 'dash-note-text');
    r.noteWrap.appendChild(r.note);

    var actions = make('div', 'dash-actions');
    r.repliesBtn = make('button', 'dash-btn');
    r.repliesBtn.type = 'button';
    r.repliesBtn.setAttribute('aria-expanded', 'false');
    r.repliesLabel = make('span', '', 'Replies');
    r.newDot = make('span', 'dash-new');
    r.repliesBtn.appendChild(r.repliesLabel);
    r.repliesBtn.appendChild(r.newDot);
    r.answerBtn = make('button', 'dash-btn dash-btn-strong');
    r.answerBtn.type = 'button';
    actions.appendChild(r.repliesBtn);
    actions.appendChild(r.answerBtn);

    r.form = make('form', 'dash-answer-form');
    r.form.hidden = true;
    var noteId = 'answer-note-' + id;
    var noteLabel = make('label', 'dash-label', 'HOW WAS IT ANSWERED? (OPTIONAL)');
    noteLabel.htmlFor = noteId;
    r.input = make('textarea', 'dash-textarea');
    r.input.id = noteId;
    r.input.rows = 3;
    r.input.maxLength = ANSWER_NOTE_MAX;
    r.input.placeholder = 'She got the job!';
    var formActions = make('div', 'dash-form-actions');
    r.save = make('button', 'dash-btn dash-btn-strong', 'Save as answered');
    r.save.type = 'submit';
    r.cancel = make('button', 'dash-btn', 'Cancel');
    r.cancel.type = 'button';
    formActions.appendChild(r.save);
    formActions.appendChild(r.cancel);
    r.form.appendChild(noteLabel);
    r.form.appendChild(r.input);
    r.form.appendChild(formActions);

    r.replies = make('section', 'dash-replies');
    r.replies.hidden = true;
    r.replyList = make('ul', 'dash-reply-list');
    r.replyEmpty = make('p', 'dash-reply-empty', 'No replies yet. Replies appear here as people pray along.');
    r.replies.appendChild(r.replyList);
    r.replies.appendChild(r.replyEmpty);

    r.error = make('p', 'dash-card-error');
    r.error.setAttribute('role', 'alert');
    r.error.hidden = true;

    li.appendChild(top);
    li.appendChild(r.request);
    li.appendChild(r.noteWrap);
    li.appendChild(actions);
    li.appendChild(r.form);
    li.appendChild(r.replies);
    li.appendChild(r.error);

    var repliesId = 'replies-' + id;
    r.replies.id = repliesId;
    r.repliesBtn.setAttribute('aria-controls', repliesId);

    r.repliesBtn.addEventListener('click', function () { toggleReplies(rec); });
    r.answerBtn.addEventListener('click', function () { onAnswerButton(rec); });
    r.cancel.addEventListener('click', function () { closeAnswerForm(rec); });
    r.form.addEventListener('submit', function (e) {
      e.preventDefault();
      saveAnswered(rec);
    });

    return rec;
  }

  function showCardError(rec, message) {
    rec.refs.error.textContent = message || '';
    rec.refs.error.hidden = !message;
  }

  function renderReplyList(rec) {
    var list = rec.refs.replyList;
    list.textContent = '';
    rec.replies.forEach(function (reply) {
      var li = make('li', 'dash-reply');
      li.appendChild(make('p', 'dash-reply-who', reply.name + ' · ' + formatDate(reply.createdAt)));
      li.appendChild(make('p', 'dash-reply-body', reply.text));
      list.appendChild(li);
    });
    rec.refs.replyEmpty.hidden = rec.replies.length > 0;
  }

  function updateCard(rec) {
    var r = rec.refs;
    var link = rec.link;
    var answered = link.answered;

    r.date.textContent = formatDate(link.createdAt);

    if (rec.prayerState === 'ready') {
      r.request.textContent = rec.prayer.request;
      r.request.classList.remove('is-muted');
      r.chip.textContent = rec.prayer.visibility === 'public' ? 'Public' : 'Anonymous';
      r.chip.hidden = false;
    } else {
      r.request.textContent = rec.prayerState === 'loading'
        ? 'Loading…'
        : rec.prayerState === 'missing'
          ? 'This prayer is no longer in the box.'
          : 'Couldn’t load this prayer. Reload to try again.';
      r.request.classList.add('is-muted');
      r.chip.hidden = true;
    }

    rec.li.classList.toggle('is-answered', answered);
    r.badge.hidden = !answered;
    if (answered) {
      r.badge.textContent = 'Answered' + (link.answeredAt ? ' · ' + formatDate(link.answeredAt) : '');
    }
    r.noteWrap.hidden = !(answered && link.answerNote);
    r.note.textContent = link.answerNote;

    r.answerBtn.textContent = answered ? 'Mark as still waiting' : 'Mark as answered';
    r.answerBtn.classList.toggle('dash-btn-strong', !answered);
    r.answerBtn.hidden = rec.ui.answering;

    var count = rec.replies.length;
    r.repliesLabel.textContent = 'Replies (' + count + ')';
    var unread = unreadCount(rec);
    r.newDot.textContent = unread + ' new';
    r.newDot.hidden = unread === 0;

    applyFilterToCard(rec);
  }

  // ---- Replies ---------------------------------------------------------------------------

  function toggleReplies(rec) {
    rec.ui.repliesOpen = !rec.ui.repliesOpen;
    rec.refs.replies.hidden = !rec.ui.repliesOpen;
    rec.refs.repliesBtn.setAttribute('aria-expanded', rec.ui.repliesOpen ? 'true' : 'false');
    markSeenIfOpen(rec);
  }

  // Opening the replies counts them as read, so the "new" flag clears across devices.
  function markSeenIfOpen(rec) {
    if (!rec.ui.repliesOpen || !rec.repliesReady || rec.markingSeen) return;
    if (rec.replies.length <= rec.link.seenReplies) return;
    rec.markingSeen = true;
    PrayerDB.markRepliesSeen(user.uid, rec.id, rec.replies.length).then(function () {
      rec.markingSeen = false;
    }, function (err) {
      rec.markingSeen = false;
      console.error('Could not save which replies you have read', err);
    });
  }

  // ---- Answered / waiting --------------------------------------------------------------------

  function onAnswerButton(rec) {
    showCardError(rec, '');
    if (rec.link.answered) {
      setBusy(rec, true);
      PrayerDB.setAnswered(user.uid, rec.id, false).then(function () {
        setBusy(rec, false);
      }, function (err) {
        setBusy(rec, false);
        showCardError(rec, PrayerDB.errorMessage(err));
      });
      return;
    }
    rec.ui.answering = true;
    rec.refs.form.hidden = false;
    rec.refs.answerBtn.hidden = true;
    rec.refs.input.focus();
  }

  function closeAnswerForm(rec) {
    rec.ui.answering = false;
    rec.refs.form.hidden = true;
    rec.refs.input.value = '';
    rec.refs.answerBtn.hidden = false;
    showCardError(rec, '');
    rec.refs.answerBtn.focus();
  }

  function saveAnswered(rec) {
    var note = rec.refs.input.value.trim();
    showCardError(rec, '');
    setBusy(rec, true);
    PrayerDB.setAnswered(user.uid, rec.id, true, note).then(function () {
      setBusy(rec, false);
      rec.ui.answering = false;
      rec.refs.form.hidden = true;
      rec.refs.input.value = '';
      updateCard(rec);
      rec.refs.answerBtn.focus();
    }, function (err) {
      setBusy(rec, false);
      showCardError(rec, PrayerDB.errorMessage(err));
    });
  }

  function setBusy(rec, busy) {
    rec.refs.answerBtn.disabled = busy;
    rec.refs.save.disabled = busy;
    rec.li.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  // ---- Filters, stats, empty states ------------------------------------------------------------

  function matchesFilter(rec) {
    if (filter === 'waiting') return !rec.link.answered;
    if (filter === 'answered') return rec.link.answered;
    if (filter === 'replied') return rec.replies.length > 0;
    return true;
  }

  function applyFilterToCard(rec) {
    rec.li.hidden = !matchesFilter(rec);
  }

  function refreshSummary() {
    var recs = order.map(function (id) { return cards[id]; });
    var answered = 0, replies = 0, fresh = 0, visible = 0;
    recs.forEach(function (rec) {
      if (rec.link.answered) answered++;
      replies += rec.replies.length;
      fresh += unreadCount(rec);
      if (matchesFilter(rec)) visible++;
    });

    document.getElementById('stat-total').textContent = String(recs.length);
    document.getElementById('stat-answered').textContent = String(answered);
    document.getElementById('stat-replies').textContent = String(replies);
    var newEl = document.getElementById('stat-new');
    newEl.textContent = fresh + ' new';
    newEl.hidden = fresh === 0;

    emptyEl.hidden = visible > 0;
    if (visible > 0) return;
    var none = recs.length === 0;
    emptyCta.hidden = !none;
    if (none) {
      emptyTitle.textContent = 'No prayers here yet.';
      emptyText.textContent = 'Prayers you drop from now on will appear here, so you can see who replied and mark them answered. ' +
        'Prayers dropped before this page existed can’t be linked to your account.';
    } else {
      emptyTitle.textContent = {
        waiting: 'Nothing is waiting.',
        answered: 'No answered prayers yet.',
        replied: 'No replies yet.'
      }[filter] || 'Nothing to show.';
      emptyText.textContent = filter === 'answered'
        ? 'When a prayer is answered, mark it here and it will be kept with a note.'
        : 'Try another view above.';
    }
  }

  Array.prototype.forEach.call(filterButtons, function (button) {
    button.addEventListener('click', function () {
      filter = button.getAttribute('data-filter');
      Array.prototype.forEach.call(filterButtons, function (b) {
        b.setAttribute('aria-pressed', b === button ? 'true' : 'false');
      });
      order.forEach(function (id) { applyFilterToCard(cards[id]); });
      refreshSummary();
    });
  });

  // ---- Data -------------------------------------------------------------------------------------

  function startCard(id) {
    var rec = createCard(id);
    cards[id] = rec;

    PrayerDB.getPrayer(id).then(function (prayer) {
      if (cards[id] !== rec) return;
      rec.prayer = prayer;
      rec.prayerState = prayer ? 'ready' : 'missing';
      if (rec.link) updateCard(rec);
    }, function (err) {
      console.error('Could not load prayer', id, err);
      if (cards[id] !== rec) return;
      rec.prayerState = 'error';
      if (rec.link) updateCard(rec);
    });

    rec.stopReplies = PrayerDB.watchReplies(id, function (items) {
      if (cards[id] !== rec) return;
      rec.replies = items;
      rec.repliesReady = true;
      if (!rec.link) return;
      renderReplyList(rec);
      updateCard(rec);
      refreshSummary();
      markSeenIfOpen(rec);
    });

    return rec;
  }

  function onMyPrayers(items) {
    if (firstSnapshot) {
      firstSnapshot = false;
      statusEl.hidden = true;
      bodyEl.hidden = false;
    }

    var ids = items.map(function (item) { return item.id; });

    Object.keys(cards).forEach(function (id) {
      if (ids.indexOf(id) !== -1) return;
      cards[id].stopReplies();
      if (cards[id].li.parentNode) cards[id].li.parentNode.removeChild(cards[id].li);
      delete cards[id];
    });

    items.forEach(function (item) {
      var rec = cards[item.id] || startCard(item.id);
      rec.link = item;
      updateCard(rec);
      markSeenIfOpen(rec);
    });

    // Walk from the bottom and only move a card that is out of place. Moving a card that
    // has focus drops the cursor, so a new prayer arriving mustn't shuffle the others.
    order = ids;
    var following = null;
    for (var i = ids.length - 1; i >= 0; i--) {
      var li = cards[ids[i]].li;
      if (li.parentNode !== listEl || li.nextElementSibling !== following) {
        listEl.insertBefore(li, following);
      }
      following = li;
    }

    refreshSummary();
  }

  function fail(message) {
    statusEl.hidden = true;
    bodyEl.hidden = true;
    fatalEl.textContent = message;
    fatalEl.hidden = false;
  }

  document.getElementById('log-out').addEventListener('click', function () {
    PrayerAuth.logOutAndGoHome();
  });

  PrayerAuth.currentUser().then(function (person) {
    if (!person) return location.replace('index.html?login&next=dashboard.html');
    if (!person.uid || !PrayerDB.available) {
      return fail('The dashboard needs the live prayer box, which isn’t connected right now.');
    }
    user = person;
    PrayerDB.watchMyPrayers(user.uid, MAX_PRAYERS, onMyPrayers, function (err) {
      var denied = err && err.code === 'permission-denied';
      fail(denied
        ? 'Your prayer list isn’t available yet. The site’s database rules may need updating.'
        : 'Couldn’t load your prayers. Check your connection and reload.');
    });
  });
})();
