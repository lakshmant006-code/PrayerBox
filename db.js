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

    // Saves the prayer and, in the same write, a private link to it under the signed-in
    // person's own account (users/{uid}/prayers). The public prayer carries no account id,
    // so anonymous prayers stay anonymous; the link is what lets the owner find it again.
    addPrayer: function (prayer) {
      if (!db) return unavailable();
      var user = firebase.auth().currentUser;
      var prayerRef = db.collection('prayers').doc();
      var batch = db.batch();
      var now = firebase.firestore.FieldValue.serverTimestamp();
      batch.set(prayerRef, {
        name: prayer.name,
        request: prayer.request,
        visibility: prayer.visibility,
        createdAt: now
      });
      if (user) {
        batch.set(db.collection('users').doc(user.uid).collection('prayers').doc(prayerRef.id), {
          createdAt: now,
          answered: false,
          seenReplies: 0
        });
      }
      return batch.commit();
    },

    // Calls onChange(items) with the signed-in person's own prayers, newest first, now and on
    // every change. Each item is { id, createdAt, answered, answeredAt, answerNote, seenReplies }.
    // Returns a stop function.
    watchMyPrayers: function (uid, limit, onChange, onError) {
      if (!db) {
        onChange([]);
        return function () {};
      }
      return db.collection('users').doc(uid).collection('prayers')
        .orderBy('createdAt', 'desc').limit(limit)
        .onSnapshot(function (snap) {
          onChange(snap.docs.map(function (doc) {
            var d = doc.data({ serverTimestamps: 'estimate' });
            return {
              id: doc.id,
              createdAt: isoTime(d.createdAt),
              answered: d.answered === true,
              answeredAt: d.answeredAt ? isoTime(d.answeredAt) : null,
              answerNote: d.answerNote || '',
              seenReplies: d.seenReplies || 0
            };
          }));
        }, function (err) {
          console.error('Could not load your prayers', err);
          if (onError) onError(err);
        });
    },

    // Reads one public prayer once. Resolves with null if it no longer exists.
    getPrayer: function (id) {
      if (!db) return unavailable();
      return db.collection('prayers').doc(id).get().then(function (doc) {
        return doc.exists ? toPrayer(doc) : null;
      });
    },

    // Marks one of your prayers answered (with an optional note), or back to waiting.
    setAnswered: function (uid, prayerId, answered, note) {
      if (!db) return unavailable();
      var ref = db.collection('users').doc(uid).collection('prayers').doc(prayerId);
      if (!answered) {
        return ref.update({
          answered: false,
          answeredAt: firebase.firestore.FieldValue.delete(),
          answerNote: firebase.firestore.FieldValue.delete()
        });
      }
      var data = { answered: true, answeredAt: firebase.firestore.FieldValue.serverTimestamp() };
      if (note) data.answerNote = note;
      else data.answerNote = firebase.firestore.FieldValue.delete();
      return ref.update(data);
    },

    // Remembers how many replies you have read on a prayer, so new ones can be flagged.
    markRepliesSeen: function (uid, prayerId, count) {
      if (!db) return unavailable();
      return db.collection('users').doc(uid).collection('prayers').doc(prayerId)
        .update({ seenReplies: count });
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
