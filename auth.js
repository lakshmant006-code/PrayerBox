// Sign-in for Prayer Box, backed by Firebase Authentication.
// Needs the Firebase SDK scripts and firebase-config.js loaded first.
// With no config filled in, it falls back to demo mode, which accepts anyone.
var PrayerAuth = (function () {
  var config = window.FIREBASE_CONFIG;
  var demo = !config;
  var auth = null;

  if (!demo && window.firebase) {
    if (!firebase.apps.length) firebase.initializeApp(config);
    auth = firebase.auth();
  }

  var DEMO_KEY = 'signedInEmail';
  var RETURN_KEY = 'afterGoogleSignIn';

  function demoSignIn(email) {
    try { sessionStorage.setItem(DEMO_KEY, email || 'demo@prayerbox'); } catch (e) {}
    return Promise.resolve({ email: email, displayName: null });
  }

  function requireAuth() {
    if (auth) return null;
    return Promise.reject({ code: 'app/unavailable' });
  }

  var MESSAGES = {
    'auth/invalid-email': 'That email address doesn\'t look right.',
    'auth/missing-password': 'Please enter your password.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account with that email. Press Register to create one.',
    'auth/email-already-in-use': 'An account with that email already exists. Press Log in instead.',
    'auth/weak-password': 'Please choose a password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
    'auth/cancelled-popup-request': 'The Google window was closed before signing in.',
    'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
    'auth/unauthorized-domain': 'Sign-in isn\'t allowed on this address yet. Add it under Authorized domains in Firebase.',
    'auth/operation-not-allowed': 'This sign-in method isn\'t turned on in Firebase yet.',
    'auth/network-request-failed': 'Couldn\'t reach the sign-in service. Check your connection.',
    'app/unavailable': 'Couldn\'t load the sign-in service. Check your connection and reload.'
  };

  return {
    isDemo: demo,

    // Resolves with the signed-in user, or null.
    currentUser: function () {
      if (demo) {
        var email = null;
        try { email = sessionStorage.getItem(DEMO_KEY); } catch (e) {}
        return Promise.resolve(email ? { email: email, displayName: null } : null);
      }
      if (!auth) return Promise.resolve(null);
      return new Promise(function (resolve) {
        var stop = auth.onAuthStateChanged(function (user) {
          stop();
          resolve(user);
        });
      });
    },

    logIn: function (email, password) {
      if (demo) return demoSignIn(email);
      return requireAuth() || auth.signInWithEmailAndPassword(email, password);
    },

    register: function (email, password) {
      if (demo) return demoSignIn(email);
      return requireAuth() || auth.createUserWithEmailAndPassword(email, password);
    },

    // Must be called straight from a click, or the browser blocks the Google pop-up.
    // Where pop-ups can't open (some phone browsers and in-app browsers), it switches to a
    // full-page redirect and comes back to `returnTo` afterwards (see finishRedirect).
    google: function (returnTo) {
      if (demo) return demoSignIn('');
      if (!auth) return requireAuth();
      var provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return auth.signInWithPopup(provider).catch(function (err) {
        var popupFailed = err && (err.code === 'auth/popup-blocked' ||
          err.code === 'auth/operation-not-supported-in-this-environment');
        if (!popupFailed) throw err;
        try { sessionStorage.setItem(RETURN_KEY, returnTo || location.pathname); } catch (e) {}
        return auth.signInWithRedirect(provider).then(function () {
          return new Promise(function () {}); // the page is leaving for Google
        });
      });
    },

    // After a redirect sign-in, resolves with where to go next (or null if there was none).
    finishRedirect: function () {
      var returnTo = null;
      try { returnTo = sessionStorage.getItem(RETURN_KEY); } catch (e) {}
      if (!returnTo || !auth) return Promise.resolve(null);
      try { sessionStorage.removeItem(RETURN_KEY); } catch (e) {}
      return auth.getRedirectResult().then(function (result) {
        return result && result.user ? returnTo : null;
      }, function () { return null; });
    },

    logOut: function () {
      if (demo) {
        try { sessionStorage.removeItem(DEMO_KEY); } catch (e) {}
        return Promise.resolve();
      }
      return auth ? auth.signOut() : Promise.resolve();
    },

    // Every "Log out" button uses this: sign out, then land on the home page. It replaces
    // the current page in history, so Back can't return to a page that needs sign-in.
    logOutAndGoHome: function () {
      var goHome = function () { location.replace('/'); };
      return this.logOut().then(goHome, goHome);
    },

    errorMessage: function (err) {
      return MESSAGES[err && err.code] || 'Something went wrong signing in. Please try again.';
    }
  };
})();
