// Login box shown when "Drop your prayer" is pressed, before the prayer request page.
// There is no server yet, so any email and password are accepted: this only
// remembers (for this browser tab) that the person signed in, and never stores the password.
(function () {
  var SIGNED_IN_KEY = 'signedInEmail';

  function isSignedIn() {
    try { return !!sessionStorage.getItem(SIGNED_IN_KEY); } catch (e) { return false; }
  }

  function signIn(email, next) {
    try { sessionStorage.setItem(SIGNED_IN_KEY, email || 'google'); } catch (e) {}
    location.href = next;
  }

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
  var next = 'prayer.html';

  function showError(message, field) {
    error.textContent = message;
    error.hidden = false;
    field.focus();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!email.value.trim() || !email.checkValidity()) {
      return showError('Please enter a valid email address.', email);
    }
    if (!password.value) {
      return showError('Please enter your password.', password);
    }
    signIn(email.value.trim(), next);
  });

  dialog.querySelector('[data-action="google"]').addEventListener('click', function () {
    signIn('', next);
  });

  dialog.querySelector('.login-close').addEventListener('click', function () { dialog.close(); });
  // Clicking outside the box closes it.
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', function () {
    form.reset();
    error.hidden = true;
  });

  document.querySelectorAll('a.drop-button').forEach(function (link) {
    link.addEventListener('click', function (e) {
      if (isSignedIn()) return;
      e.preventDefault();
      next = link.getAttribute('href');
      dialog.showModal();
      email.focus();
    });
  });
})();
