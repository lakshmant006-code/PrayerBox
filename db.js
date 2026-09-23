// Prayers and replies, stored in Cloud Firestore and shared by everyone in real time.
// Needs the Firebase app + Firestore scripts and auth.js (which starts Firebase) loaded first.
// Security rules for this data live in firestore.rules.
var PrayerDB = (function () {
  var db = null;
  try {
    if (window.firebase && firebase.apps.length && firebase.firestore) db = firebase.firestore();
  } catch (e) {}

  function isoTime(value) {
    return value ? value.toDate().toISOString() : new Date().toISOString();
  }

  function toPrayer(doc) {
    // 'estimate' gives a just-posted prayer a time before the server confirms it.
    var d = doc.data({ serverTimestamps: 'estimate' });
    return { id: doc.id, name: d.name, request: d.request, visibility: d.visibility, createdAt: isoTime(d.createdAt) };
  }

  function toReply(doc) {
    var d = doc.data({ serverTimestamps: 'estimate' });
    return { id: doc.id, name: d.name, text: d.text, createdAt: isoTime(d.createdAt) };
  }

  function unavailable() {
    return Promise.reject({ code: 'db/unavailable' });
  }

  return {
    available: !!db,

    // Calls onInitial(prayers) once with the newest `limit` prayers, then onAdded(prayer)
    // and onRemoved(id) as the list changes. Returns a function that stops watching.
    watchPrayers: function (limit, handlers) {
      if (!db) {
        handlers.onInitial([]);
        return function () {};
      }
      var first = true;
      return db.collection('prayers').orderBy('createdAt', 'desc').limit(limit).onSnapshot(function (snap) {
        if (first) {
          first = false;
          handlers.onInitial(snap.docs.map(toPrayer));
          return;
        }
        snap.docChanges().forEach(function (change) {
          if (change.type === 'added') handlers.onAdded(toPrayer(change.doc));
          if (change.type === 'removed') handlers.onRemoved(change.doc.id);
        });
      }, function (err) {
        console.error('Could not load prayers', err);
        if (first) {
          first = false;
          handlers.onInitial([]);
        }
      });
    },

    addPrayer: function (prayer) {
      if (!db) return unavailable();
      return db.collection('prayers').add({
        name: prayer.name,
        request: prayer.request,
        visibility: prayer.visibility,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    },

    // Calls onChange(replies) now and whenever a reply is added. Returns a stop function.
    watchReplies: function (prayerId, onChange) {
      if (!db) {
        onChange([]);
        return function () {};
      }
      return db.collection('prayers').doc(prayerId).collection('replies').orderBy('createdAt')
        .onSnapshot(function (snap) {
          onChange(snap.docs.map(toReply));
        }, function (err) {
          console.error('Could not load replies', err);
          onChange([]);
        });
    },

    addReply: function (prayerId, reply) {
      if (!db) return unavailable();
      return db.collection('prayers').doc(prayerId).collection('replies').add({
        name: reply.name,
        text: reply.text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    },

    errorMessage: function (err) {
      if (err && err.code === 'permission-denied') return 'Please log in again and try once more.';
      if (err && err.code === 'unavailable') return 'You seem to be offline. Please check your connection.';
      return 'Something went wrong saving that. Please try again.';
    }
  };
})();
