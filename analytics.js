// Google Analytics 4: the stream linked to the PrayerBox Firebase project.
// Records page views (including the utm_ tags on the link someone arrived from; see
// marketing/utm-links.md) and a few actions: sign-up, log-in, prayer posted, reply sent.
// It never sends the text of a prayer or reply, or anyone's name.
(function () {
  var MEASUREMENT_ID = 'G-2YL5KPT2BX';

  // Keep local testing out of the real numbers.
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
    window.PrayerAnalytics = {
      event: function () {},
      eventThen: function (name, params, done) { done(); }
    };
    return;
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID);

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
  document.head.appendChild(script);

  window.PrayerAnalytics = {
    event: function (name, params) {
      gtag('event', name, params || {});
    },

    // For actions that leave the page right after: send the event, then call done() once
    // it has gone (or after half a second at most, so nobody is ever kept waiting).
    eventThen: function (name, params, done) {
      var called = false;
      function once() {
        if (called) return;
        called = true;
        done();
      }
      var withCallback = {};
      for (var key in params || {}) withCallback[key] = params[key];
      withCallback.event_callback = once;
      withCallback.event_timeout = 500;
      gtag('event', name, withCallback);
      setTimeout(once, 600);
    }
  };
})();
