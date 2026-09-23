// Login box shown when "Drop your prayer" is pressed, before the prayer request page.
// Signing in goes through PrayerAuth (auth.js).
(function () {
  var dialog = document.createElement('dialog');
  dialog.className = 'login';
  dialog.setAttribute('aria-labelledby', 'login-title');
  dialog.innerHTML =
    '<form class="login-form" novalidate>' +
      '<div class="login-header">' +
        '<h2 class="login-title" id="login-title">Log in</h2>' +
        '<button class="login-close" type="button" aria-label="Close">&times;</button>' +
      '</div>' +
      '<p class="login-subtitle">Sign in to drop a prayer in the box.</p>' +
      '<label class="login-label" for="login-email">Email</label>' +
      '<input class="login-input" id="login-email" name="email" type="email" autocomplete="email" required />' +
      '<label class="login-label" for="login-password">Password</label>' +
      '<input class="login-input" id="login-password" name="password" type="password" autocomplete="current-password" required />' +
      '<p class="login-error" role="alert" hidden></p>' +
      '<div class="login-actions">' +
        '<button class="login-btn" type="button" data-action="google">Continue with Google</button>' +
        '<button class="login-btn" type="submit" data-action="register">Register</button>' +
        '<button class="login-btn login-btn-primary" type="submit" data-action="login">Log in</button>' +
      '</div>' +
    '</form>';
  document.body.appendChild(dialog);

  var form = dialog.querySelector('form');
  var email = dialog.querySelector('#login-email');
  var password = dialog.querySelector('#login-password');
  var error = dialog.querySelector('.login-error');
  var buttons = dialog.querySelectorAll('.login-actions .login-btn');
  var next = 'prayer.html';

  function showError(message, field) {
    error.textContent = message;
    error.hidden = false;
    if (field) field.focus();
  }

  function setBusy(busy) {
    Array.prototype.forEach.call(buttons, function (b) { b.disabled = busy; });
    form.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function attempt(signIn) {
    error.hidden = true;
    setBusy(true);
    signIn.then(function () {
      location.href = next;
    }, function (err) {
      setBusy(false);
      showError(PrayerAuth.errorMessage(err));
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!email.value.trim() || !email.checkValidity()) {
      return showError('Please enter a valid email address.', email);
    }
    if (!password.value) {
      return showError('Please enter your password.', password);
    }
    var register = e.submitter && e.submitter.getAttribute('data-action') === 'register';
    attempt(register
      ? PrayerAuth.register(email.value.trim(), password.value)
      : PrayerAuth.logIn(email.value.trim(), password.value));
  });

  dialog.querySelector('[data-action="google"]').addEventListener('click', function () {
    attempt(PrayerAuth.google(next));
  });

  dialog.querySelector('.login-close').addEventListener('click', function () { dialog.close(); });
  // Clicking outside the box closes it (a tap on the box's own padding doesn't).
  dialog.addEventListener('click', function (e) {
    if (e.target !== dialog) return;
    var r = dialog.getBoundingClientRect();
    var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dialog.close();
  });
  dialog.addEventListener('close', function () {
    form.reset();
    error.hidden = true;
    setBusy(false);
  });

  // On phones and tablets, don't jump straight into the email box: that pops up the
  // keyboard and hides the Google button.
  var touchScreen = window.matchMedia('(pointer: coarse)').matches;

  function openLogin() {
    dialog.showModal();
    if (!touchScreen) email.focus();
  }

  document.querySelectorAll('a.drop-button').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      next = link.getAttribute('href');
      PrayerAuth.currentUser().then(function (user) {
        if (user) location.href = next;
        else openLogin();
      });
    });
  });

  // The prayer page sends signed-out visitors here with ?login to sign in first.
  if (new URLSearchParams(location.search).has('login')) openLogin();

  // Coming back from a Google redirect sign-in: carry on to where the person was headed.
  PrayerAuth.finishRedirect().then(function (returnTo) {
    if (returnTo) location.href = returnTo;
  });

  // Lets other parts of the page ask for a sign-in, then come back to `returnTo`.
  window.PrayerLogin = {
    open: function (returnTo) {
      next = returnTo;
      openLogin();
    }
  };
})();
