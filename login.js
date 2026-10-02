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
        '<button class="login-btn login-btn-google" type="button" data-action="google">' +
          // Google's four-colour "G" mark
          '<svg class="google-logo" viewBox="0 0 48 48" aria-hidden="true">' +
            '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
            '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
            '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
            '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
          '</svg>' +
          '<span>Continue with Google</span>' +
        '</button>' +
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

  // ?login&next=dashboard.html sends the person there after signing in. Only our own
  // pages are accepted, so this can't be used to bounce someone to another site.
  var requestedNext = new URLSearchParams(location.search).get('next');
  if (requestedNext === 'dashboard.html' || requestedNext === 'prayer.html') next = requestedNext;

  function showError(message, field) {
    error.textContent = message;
    error.hidden = false;
    if (field) field.focus();
  }

  function setBusy(busy) {
    Array.prototype.forEach.call(buttons, function (b) { b.disabled = busy; });
    form.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  // `method` and `isNew` only describe the sign-in for analytics (see analytics.js).
  function attempt(signIn, method, isNew) {
    error.hidden = true;
    setBusy(true);
    signIn.then(function () {
      PrayerAnalytics.eventThen(isNew ? 'sign_up' : 'login', { method: method }, function () {
        location.href = next;
      });
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
      : PrayerAuth.logIn(email.value.trim(), password.value), 'email', register);
  });

  dialog.querySelector('[data-action="google"]').addEventListener('click', function () {
    attempt(PrayerAuth.google(next), 'google', false);
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

  // Signed-in visitors get "My prayers" and Log out buttons in the corner of the page.
  var cornerNav = document.createElement('nav');
  cornerNav.className = 'corner-nav';
  cornerNav.setAttribute('aria-label', 'Your account');
  cornerNav.hidden = true;

  var dashboardLink = document.createElement('a');
  dashboardLink.className = 'corner-pill';
  dashboardLink.href = 'dashboard.html';
  dashboardLink.textContent = 'My prayers';

  var logOutButton = document.createElement('button');
  logOutButton.type = 'button';
  logOutButton.className = 'corner-pill corner-log-out';
  logOutButton.textContent = 'Log out';
  logOutButton.addEventListener('click', function () {
    logOutButton.disabled = true;
    PrayerAuth.logOutAndGoHome();
  });

  cornerNav.appendChild(dashboardLink);
  cornerNav.appendChild(logOutButton);
  document.body.appendChild(cornerNav);
  PrayerAuth.currentUser().then(function (user) {
    cornerNav.hidden = !user;
  });

  // Lets other parts of the page ask for a sign-in, then come back to `returnTo`.
  window.PrayerLogin = {
    open: function (returnTo) {
      next = returnTo;
      openLogin();
    }
  };
})();
