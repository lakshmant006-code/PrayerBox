// Home page: every prayer is a letter in the box. Letters fall with gravity, new prayers
// drop in live as people post them, and tapping a letter opens it to read and reply.
(function () {
  var list = document.getElementById('letters');
  var template = document.getElementById('letter-template');

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }

  // ---- The opened letter -------------------------------------------------------------

  var note = document.getElementById('note');
  var replies = document.getElementById('replies');
  var sampleNotice = document.getElementById('note-sample');
  var replyForm = document.getElementById('reply-form');
  var replyText = document.getElementById('reply-text');
  var replyName = document.getElementById('reply-name');
  var replyError = document.getElementById('reply-error');
  var replySend = replyForm.querySelector('.reply-send');
  var replyLogin = document.getElementById('reply-login');
  var currentPrayer = null;
  var stopReplies = function () {};

  function renderReplies(items) {
    var replyList = document.getElementById('reply-list');
    replyList.textContent = '';
    items.forEach(function (reply) {
      var li = document.createElement('li');
      li.className = 'reply';
      var who = document.createElement('p');
      who.className = 'reply-who';
      who.textContent = reply.name + ' · ' + formatDate(reply.createdAt);
      var body = document.createElement('p');
      body.className = 'reply-body';
      body.textContent = reply.text;
      li.appendChild(who);
      li.appendChild(body);
      replyList.appendChild(li);
    });
    document.getElementById('reply-empty').hidden = items.length > 0;
  }

  function syncReplyAs() {
    var anonymous = replyForm.elements.as.value === 'anonymous';
    replyName.hidden = anonymous;
    replyName.required = !anonymous;
  }
  replyForm.addEventListener('change', syncReplyAs);

  // Sample letters aren't in the database, so replies to them are kept on this device only.
  var LOCAL_REPLIES = 'sampleReplies';
  function sampleKey(prayer) {
    return prayer.createdAt + '|' + prayer.name + '|' + prayer.request.slice(0, 40);
  }
  function loadSampleReplies(prayer) {
    try { return JSON.parse(localStorage.getItem(LOCAL_REPLIES) || '{}')[sampleKey(prayer)] || []; }
    catch (e) { return []; }
  }
  function addSampleReply(prayer, reply) {
    try {
      var all = JSON.parse(localStorage.getItem(LOCAL_REPLIES) || '{}');
      var key = sampleKey(prayer);
      (all[key] = all[key] || []).push({ name: reply.name, text: reply.text, createdAt: new Date().toISOString() });
      localStorage.setItem(LOCAL_REPLIES, JSON.stringify(all));
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  replyForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = replyText.value.trim();
    if (!text) return replyText.focus();
    var anonymous = replyForm.elements.as.value === 'anonymous';
    var name = replyName.value.trim();
    if (!anonymous && !name) return replyName.focus();
    replyError.hidden = true;
    replySend.disabled = true;
    var reply = { name: anonymous ? 'Anonymous' : name, text: text };
    var prayer = currentPrayer;
    var saved = prayer.sample ? addSampleReply(prayer, reply) : PrayerDB.addReply(prayer.id, reply);
    saved.then(function () {
      replySend.disabled = false;
      replyText.value = '';
      // Real prayers update through the live listener; sample replies are re-read here.
      if (prayer.sample) renderReplies(loadSampleReplies(prayer));
      if (!anonymous) {
        try { localStorage.setItem('replyName', name); } catch (err) {}
      }
    }, function (err) {
      replySend.disabled = false;
      replyError.textContent = PrayerDB.errorMessage(err);
      replyError.hidden = false;
    });
  });

  replyLogin.addEventListener('click', function () {
    note.close();
    PrayerLogin.open(location.pathname);
  });

  // Replying needs an account; reading doesn't.
  function showReplyFormFor(user) {
    replyForm.hidden = !user;
    replyLogin.hidden = !!user;
    if (!user || replyName.value) return;
    try { replyName.value = localStorage.getItem('replyName') || ''; } catch (e) {}
    if (!replyName.value && user.displayName) replyName.value = user.displayName.split(' ')[0];
  }

  function openNote(prayer) {
    currentPrayer = prayer;
    document.getElementById('note-name').textContent = prayer.name;
    document.getElementById('note-request').textContent = prayer.request;
    document.getElementById('note-date').textContent = prayer.createdAt ? formatDate(prayer.createdAt) : '';
    replyText.value = '';
    replyError.hidden = true;
    stopReplies();

    // Sample letters only fill out the box: they say so, and their replies stay on this device.
    sampleNotice.hidden = !prayer.sample;
    if (prayer.sample) {
      renderReplies(loadSampleReplies(prayer));
    } else {
      renderReplies([]);
      stopReplies = PrayerDB.watchReplies(prayer.id, renderReplies);
    }
    PrayerAuth.currentUser().then(showReplyFormFor);
    syncReplyAs();
    note.showModal();
  }

  note.addEventListener('close', function () {
    stopReplies();
    stopReplies = function () {};
  });
  note.querySelector('.note-close').addEventListener('click', function () { note.close(); });
  // Clicking the dimmed backdrop (outside the note) closes it too.
  note.addEventListener('click', function (e) {
    if (e.target !== note) return;
    var r = note.getBoundingClientRect();
    var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) note.close();
  });

  // ---- Letters -------------------------------------------------------------------------

  function makeLetter(prayer) {
    var item = template.content.firstElementChild.cloneNode(true);
    var button = item.querySelector('.letter-open');
    item.querySelector('.text-wrapper').textContent = prayer.name;
    button.setAttribute('aria-label', 'Read prayer from ' + prayer.name);
    // Keyboard, and mouse when gravity is off. With gravity on, taps are picked up by the physics.
    button.addEventListener('click', function () { openNote(prayer); });
    item.prayer = prayer;
    list.appendChild(item);
    return item;
  }

  // How many letters fit on this screen, from the size a letter actually renders at
  // (smaller on tablets and phones, see box.css).
  function screenCapacity() {
    var probe = makeLetter({ name: 'Anonymous', request: '' });
    probe.style.visibility = 'hidden';
    var area = probe.offsetWidth * probe.offsetHeight || 60 * 64;
    probe.remove();
    var FILL = 0.8; // piles leave gaps; more than this spills off the top of the screen
    return Math.max(12, Math.floor((window.innerWidth * window.innerHeight) / area * FILL));
  }

  // ---- Gravity -------------------------------------------------------------------------

  // Starts the physics for the letters already in the box. Returns add/remove for letters
  // that arrive or leave later. Without Matter.js, or with reduced motion on, the letters
  // stay in a still, wrapped layout.
  function startGravity() {
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!window.Matter || reduceMotion) {
      return {
        add: function () {},
        remove: function (el) { el.remove(); }
      };
    }

    var Engine = Matter.Engine, Runner = Matter.Runner, Bodies = Matter.Bodies,
        Composite = Matter.Composite, Mouse = Matter.Mouse, MouseConstraint = Matter.MouseConstraint,
        Events = Matter.Events, Body = Matter.Body;

    var box = list;
    var items = Array.prototype.slice.call(box.children);
    box.classList.add('has-physics');

    var engine = Engine.create();
    engine.gravity.y = 1;
    var world = engine.world;

    var WALL = 200;
    var walls = [];
    // The title and the button are solid, so letters pile around them instead of covering them.
    var obstacles = document.querySelectorAll('.desktop > .frame > .div, .desktop > .frame > .drop-button');
    function buildWalls() {
      Composite.remove(world, walls);
      var w = box.clientWidth, h = box.clientHeight, tall = h * 6;
      walls = [
        // Floor sits a few px above the edge so settling letters never poke below it.
        Bodies.rectangle(w / 2, h - 4 + WALL / 2, w + WALL * 2, WALL, { isStatic: true }),
        Bodies.rectangle(-WALL / 2, h - tall / 2, WALL, tall, { isStatic: true }),
        Bodies.rectangle(w + WALL / 2, h - tall / 2, WALL, tall, { isStatic: true })
      ];
      var boxRect = box.getBoundingClientRect();
      Array.prototype.forEach.call(obstacles, function (el) {
        var r = el.getBoundingClientRect(), pad = 10;
        walls.push(Bodies.rectangle(
          r.left - boxRect.left + r.width / 2, r.top - boxRect.top + r.height / 2,
          r.width + pad * 2, r.height + pad * 2,
          { isStatic: true, chamfer: { radius: 12 } }
        ));
      });
      Composite.add(world, walls);
    }
    buildWalls();

    var letters = [];
    function addBody(el, y) {
      var w = el.offsetWidth, h = el.offsetHeight;
      var x = w / 2 + Math.random() * Math.max(1, box.clientWidth - w);
      var body = Bodies.rectangle(x, y, w, h, {
        restitution: 0.35,
        friction: 0.4,
        frictionAir: 0.015,
        density: 0.002,
        chamfer: { radius: 6 },
        angle: (Math.random() - 0.5) * 0.8
      });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.1);
      Composite.add(world, body);
      letters.push({ el: el, body: body, w: w, h: h });
    }

    // Oldest first, so the newest prayer lands on top of the pile.
    // They drop in rows, several side by side, so a full box fills quickly.
    var first = items[0];
    var perRow = first ? Math.max(1, Math.floor(box.clientWidth / (first.offsetWidth * 1.8))) : 1;
    items.slice().reverse().forEach(function (el, i) {
      var h = el.offsetHeight;
      addBody(el, -h - Math.floor(i / perRow) * h * 1.1 - Math.random() * h);
    });

    var mouse = Mouse.create(box);
    // Let the page keep scrolling with the wheel.
    mouse.element.removeEventListener('wheel', mouse.mousewheel);
    mouse.element.removeEventListener('mousewheel', mouse.mousewheel);
    mouse.element.removeEventListener('DOMMouseScroll', mouse.mousewheel);
    // Matter only hears a release inside the box; let go of the letter anywhere.
    window.addEventListener('mouseup', mouse.mouseup);
    window.addEventListener('touchend', mouse.mouseup);
    var drag = MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: { stiffness: 0.2, render: { visible: false } }
    });
    Composite.add(world, drag);
    Events.on(drag, 'startdrag', function () { box.classList.add('is-dragging'); });
    Events.on(drag, 'enddrag', function () { box.classList.remove('is-dragging'); });

    // A quick tap on a letter (not a drag) opens its prayer.
    var press = null;
    Events.on(drag, 'mousedown', function () {
      var hit = Matter.Query.point(letters.map(function (l) { return l.body; }), mouse.position)[0];
      press = hit && { body: hit, x: mouse.position.x, y: mouse.position.y, t: Date.now() };
    });
    Events.on(drag, 'mouseup', function () {
      if (!press) return;
      var moved = Math.hypot(mouse.position.x - press.x, mouse.position.y - press.y);
      var quick = Date.now() - press.t < 400;
      var letter = letters.find(function (l) { return l.body === press.body; });
      press = null;
      if (moved < 8 && quick && letter) openNote(letter.el.prayer);
    });

    Events.on(engine, 'afterUpdate', function () {
      letters.forEach(function (l) {
        var p = l.body.position;
        l.el.style.transform =
          'translate(' + (p.x - l.w / 2) + 'px,' + (p.y - l.h / 2) + 'px) rotate(' + l.body.angle + 'rad)';
      });
    });

    Runner.run(Runner.create(), engine);

    // Keep the walls on the box's edges when it changes size (window resize, rotating a
    // phone or tablet), and pull back any letter left outside them.
    var resizeTimer;
    var lastWidth = box.clientWidth, lastHeight = box.clientHeight;
    new ResizeObserver(function () {
      if (box.clientWidth === lastWidth && box.clientHeight === lastHeight) return;
      lastWidth = box.clientWidth;
      lastHeight = box.clientHeight;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        buildWalls();
        letters.forEach(function (l) {
          var x = Math.min(Math.max(l.body.position.x, l.w / 2), box.clientWidth - l.w / 2);
          if (x !== l.body.position.x) Body.setPosition(l.body, { x: x, y: -l.h });
        });
      }, 100);
    }).observe(box);

    return {
      // A new letter drops in from above the screen.
      add: function (el) {
        addBody(el, -el.offsetHeight - Math.random() * 40);
      },
      remove: function (el) {
        var i = letters.findIndex(function (l) { return l.el === el; });
        if (i >= 0) {
          Composite.remove(world, letters[i].body);
          letters.splice(i, 1);
        }
        el.remove();
      }
    };
  }

  // ---- Live prayers --------------------------------------------------------------------

  var gravity = null;
  var byId = {};
  var sampleItems = [];

  function addLive(prayer) {
    if (byId[prayer.id]) return;
    var el = byId[prayer.id] = makeLetter(prayer);
    gravity.add(el);
    // Keep the box about as full as before: a real prayer takes a sample letter's place.
    var sample = sampleItems.shift();
    if (sample) gravity.remove(sample);
  }

  function removeLive(id) {
    var el = byId[id];
    if (!el) return;
    delete byId[id];
    gravity.remove(el);
  }

  function start() {
    var capacity = screenCapacity();
    PrayerDB.watchPrayers(capacity, {
      onInitial: function (prayers) {
        // Newest first, so the newest prayer lands on top of the pile.
        prayers.forEach(function (prayer) { byId[prayer.id] = makeLetter(prayer); });
        // Sample letters fill whatever space real prayers don't (samples.js).
        var samples = window.SamplePrayers ? SamplePrayers.get(Math.max(0, capacity - prayers.length)) : [];
        samples.forEach(function (prayer) { sampleItems.push(makeLetter(prayer)); });
        // Remove samples oldest-first: they sit at the end of the list, at the bottom of the pile.
        sampleItems.reverse();
        gravity = startGravity();
      },
      onAdded: addLive,
      onRemoved: removeLive
    });
  }

  // Wait for the letter images so their sizes are known before measuring.
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
