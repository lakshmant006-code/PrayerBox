// Prayers and replies, stored in Cloud Firestore and shared by everyone in real time.
// Needs the Firebase app + Firestore scripts and auth.js (which starts Firebase) loaded first.
// Security rules for this data live in firestore.rules.
var PrayerDB = (function () {
  var db = null;
  try {
    if (window.firebase && firebase.apps.length && firebase.firestore) db = firebase.firestore();
  } catch (e) {}

  function now() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function isoTime(value) {
    return value ? value.toDate().toISOString() : new Date().toISOString();
  }

  function toPrayer(doc) {
    // 'estimate' gives a just-posted prayer a time before the server confirms it.
    var d = doc.data({ serverTimestamps: 'estimate' });
    return {
      id: doc.id, name: d.name, request: d.request, visibility: d.visibility,
      createdAt: isoTime(d.createdAt), edited: !!d.editedAt
    };
  }

  function toReply(doc) {
    var d = doc.data({ serverTimestamps: 'estimate' });
    return { id: doc.id, name: d.name, text: d.text, createdAt: isoTime(d.createdAt), edited: !!d.editedAt };
  }

  function unavailable() {
    return Promise.reject({ code: 'db/unavailable' });
  }

  function signedOut() {
    return Promise.reject({ code: 'permission-denied' });
  }

  function prayerRef(id) {
    return db.collection('prayers').doc(id);
  }

  function replyRef(prayerId, replyId) {
    return prayerRef(prayerId).collection('replies').doc(replyId);
  }

  // The signed-in person's private area: users/{uid}/prayers and users/{uid}/replies.
  function myPrayerLink(uid, prayerId) {
    return db.collection('users').doc(uid).collection('prayers').doc(prayerId);
  }

  function myReplyLink(uid, prayerId, replyId) {
    return db.collection('users').doc(uid).collection('replies').doc(prayerId + '_' + replyId);
  }

  // Asks the email server (api/notify-reply.js) to tell the prayer's author about a new
  // reply. Best effort: the reply is already saved, so a failure here is only logged.
  function notifyAuthor(user, prayerId, replyId) {
    user.getIdToken().then(function (token) {
      return fetch('/api/notify-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ prayerId: prayerId, replyId: replyId }),
        keepalive: true
      });
    }).catch(function (err) {
      console.warn('Could not ask for a reply email', err);
    });
  }

  return {
    available: !!db,

    // Calls onInitial(prayers) once with the newest `limit` prayers, then onAdded(prayer),
    // onChanged(prayer) and onRemoved(id) as the list changes. Returns a stop function.
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
          if (change.type === 'modified' && handlers.onChanged) handlers.onChanged(toPrayer(change.doc));
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

    // Saves the prayer together with a private link to it under the signed-in person's own
    // account (users/{uid}/prayers). The public prayer carries no account id, so anonymous
    // prayers stay anonymous; the link is what lets the owner find it on their dashboard and
    // edit or delete it. Both are written in one batch: the rules only accept a link that is
    // created along with its prayer, so nobody can claim someone else's.
    addPrayer: function (prayer) {
      if (!db) return unavailable();
      var user = firebase.auth().currentUser;
      if (!user) return signedOut();
      var ref = db.collection('prayers').doc();
      var batch = db.batch();
      batch.set(ref, { name: prayer.name, request: prayer.request, visibility: prayer.visibility, createdAt: now() });
      batch.set(myPrayerLink(user.uid, ref.id), { createdAt: now(), answered: false, seenReplies: 0 });
      // Lets the email server tell the author about replies. Nobody can read it from the site.
      batch.set(db.collection('owners').doc(ref.id), { uid: user.uid });
      return batch.commit().then(function () { return ref; });
    },

    // Edits one of your prayers. Its letter in the box updates for everyone.
    updatePrayer: function (prayerId, prayer) {
      if (!db) return unavailable();
      return prayerRef(prayerId).update({
        name: prayer.name, request: prayer.request, visibility: prayer.visibility, editedAt: now()
      });
    },

    // Deletes one of your prayers, the replies on it, and your link to it.
    deletePrayer: function (uid, prayerId) {
      if (!db) return unavailable();
      return prayerRef(prayerId).collection('replies').get().then(function (snap) {
        var batch = db.batch();
        snap.docs.forEach(function (doc) { batch.delete(doc.ref); });
        batch.delete(prayerRef(prayerId));
        batch.delete(myPrayerLink(uid, prayerId));
        batch.delete(db.collection('owners').doc(prayerId));
        return batch.commit();
      });
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

    // Saves the reply together with a private link to it (users/{uid}/replies), so the
    // author can find, edit and delete it later.
    addReply: function (prayerId, reply) {
      if (!db) return unavailable();
      var user = firebase.auth().currentUser;
      if (!user) return signedOut();
      var ref = prayerRef(prayerId).collection('replies').doc();
      var batch = db.batch();
      batch.set(ref, { name: reply.name, text: reply.text, createdAt: now() });
      batch.set(myReplyLink(user.uid, prayerId, ref.id), { prayerId: prayerId, replyId: ref.id, createdAt: now() });
      return batch.commit().then(function () {
        notifyAuthor(user, prayerId, ref.id);
      });
    },

    // Email settings: { replies, digest }, both off until the person turns them on.
    getEmailPrefs: function (uid) {
      if (!db) return unavailable();
      return db.collection('emailPrefs').doc(uid).get().then(function (doc) {
        var d = doc.exists ? doc.data() : {};
        return { replies: d.replies === true, digest: d.digest === true };
      });
    },

    setEmailPrefs: function (uid, prefs) {
      if (!db) return unavailable();
      return db.collection('emailPrefs').doc(uid).set({
        replies: !!prefs.replies, digest: !!prefs.digest, updatedAt: now()
      });
    },

    updateReply: function (prayerId, replyId, reply) {
      if (!db) return unavailable();
      return replyRef(prayerId, replyId).update({ name: reply.name, text: reply.text, editedAt: now() });
    },

    deleteReply: function (uid, prayerId, replyId) {
      if (!db) return unavailable();
      var batch = db.batch();
      batch.delete(replyRef(prayerId, replyId));
      batch.delete(myReplyLink(uid, prayerId, replyId));
      return batch.commit();
    },

    // The replies you've written, newest first, each with the prayer it answers. Replies
    // whose prayer (or the reply itself) was since deleted are skipped and tidied away.
    myReplies: function (uid) {
      if (!db) return unavailable();
      return db.collection('users').doc(uid).collection('replies').orderBy('createdAt', 'desc').get()
        .then(function (links) {
          return Promise.all(links.docs.map(function (link) {
            var l = link.data();
            return Promise.all([replyRef(l.prayerId, l.replyId).get(), prayerRef(l.prayerId).get()])
              .then(function (docs) {
                if (!docs[0].exists || !docs[1].exists) {
                  link.ref.delete().catch(function () {});
                  return null;
                }
                var reply = toReply(docs[0]);
                reply.prayerId = l.prayerId;
                reply.prayer = toPrayer(docs[1]);
                return reply;
              });
          }));
        })
        .then(function (replies) { return replies.filter(Boolean); });
    },

    errorMessage: function (err) {
      if (err && err.code === 'permission-denied') return 'Please log in again and try once more.';
      if (err && err.code === 'unavailable') return 'You seem to be offline. Please check your connection.';
      return 'Something went wrong saving that. Please try again.';
    }
  };
})();
