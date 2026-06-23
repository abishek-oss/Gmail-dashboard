/* ══════════════════════════════════════════════════════════════
   LIVE DATA LAYER — Firebase Auth + Google Sheets feed
   Ported verbatim from the original AMZ Prep dashboard so the
   React UI talks to the exact same backend.
   Exposes:
     window.LiveAuth.init(onChange)   → fires onChange(user|null)
     window.LiveAuth.signIn()         → Google popup
     window.LiveAuth.signOut()
     window.LiveData.load()           → Promise<rows[]>  (parsed)
     window.LiveData.sendWeekly()     → Promise (triggers Apps Script)
   ════════════════════════════════════════════════════════════ */
(function () {
  // ── CONFIG (from original index.html) ───────────────────────
  var firebaseConfig = {
    apiKey: "AIzaSyBTrhx2cB93AA54ie9BYdGm3llJRf3Ect0",
    authDomain: "dashboard-4ebfe.firebaseapp.com",
    projectId: "dashboard-4ebfe",
    storageBucket: "dashboard-4ebfe.firebasestorage.app",
    messagingSenderId: "1062255919328",
    appId: "1:1062255919328:web:c09fcf5244f4f34f269085",
    measurementId: "G-837MTMN2VW"
  };
  var ALLOWED_DOMAIN = 'amzprep.com';
  var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwj0cBbxCF3Pff0J_dvA4bnPG9KaEoykWyv7oCdW2R0GFa4NDZe07eZVP9shsnX5E4N/exec';

  firebase.initializeApp(firebaseConfig);
  var provider = new firebase.auth.GoogleAuthProvider();

  window.LiveAuth = {
    init: function (onChange) {
      firebase.auth().onAuthStateChanged(function (user) {
        if (user) {
          var email = user.email || '';
          if (email.split('@')[1] !== ALLOWED_DOMAIN) {
            firebase.auth().signOut();
            onChange(null, 'Access restricted to @' + ALLOWED_DOMAIN + ' accounts.');
            return;
          }
          onChange({
            email: email,
            name: user.displayName || email,
            photo: user.photoURL || ''
          });
        } else {
          onChange(null);
        }
      });
    },
    signIn: function () {
      return firebase.auth().signInWithPopup(provider);
    },
    signOut: function () { firebase.auth().signOut(); }
  };

  window.LiveData = {
    // Pull the tracker rows from the authenticated Apps Script feed. The
    // sheet is private; only a signed-in @amzprep.com user (whose Firebase
    // ID token is verified server-side) gets data back. There is no longer
    // a public CSV that anyone could scrape from this page's source.
    load: async function () {
      var token = await this.idToken();
      var res = await fetch(WEBAPP_URL + '?action=getData&idToken=' + encodeURIComponent(token));
      if (!res.ok) throw new Error('Cannot reach data feed (HTTP ' + res.status + ').');
      var payload = await res.json();
      if (!payload || payload.status !== 'ok') {
        throw new Error((payload && payload.error) || 'Data feed refused the request.');
      }
      var rows = payload.rows || [];
      if (rows.length < 2) throw new Error('No tracker data yet — run backfillPricingRequests() first.');

      // tolerant header → index mapping
      var col = {};
      rows[0].forEach(function (h, i) {
        var key = (h || '').replace(/"/g, '').trim();
        var norm1 = key.toLowerCase();
        var norm2 = norm1.replace(/\s+/g, '');
        col[key] = i; col[norm1] = i; col[norm2] = i;
      });
      function getIdx(names) {
        for (var j = 0; j < names.length; j++) { if (names[j] in col) return col[names[j]]; }
        return undefined;
      }
      var idxClient = getIdx(['Client', 'client']);
      var idxReceived = getIdx(['Received', 'received']);
      var idxSubject = getIdx(['Subject', 'subject']);
      var idxLink = getIdx(['Gmail Link', 'GmailLink', 'Link']);
      var idxReplied = getIdx(['Replied At', 'RepliedAt', 'Replied']);
      var idxResponseHrs = getIdx(['Response Time (hrs)', 'ResponseTime(hrs)', 'ResponseTime']);
      var idxStatus = getIdx(['Status', 'status']);
      var idxResolvedAt = getIdx(['Resolved At', 'ResolvedAt', 'Resolved']);
      var idxRequestedBy = getIdx(['Requested By', 'RequestedBy', 'Requested']);
      var idxRequesterEmail = getIdx(['Requester Email', 'RequesterEmail', 'Requester Email Address', 'Email']);
      var idxReopenedAt = getIdx(['Reopened At', 'ReopenedAt', 'Reopened']);
      var idxReopenHrs = getIdx(['Reopen Resolution Time (hrs)', 'ReopenResolutionTime']);
      var idxBlair = getIdx(['Blair Involved', 'BlairInvolved', 'Blair']);
      var idxResolvedBy = getIdx(['Resolved By', 'ResolvedBy', 'Resolver']);
      var idxResolutionLinks = getIdx(['Resolution Links', 'ResolutionLinks', 'Rates Link', 'RatesLink', 'Resolution Attachments', 'Attachments', 'Resolution Body', 'ResolutionBody']);
      var idxRatesResolved = getIdx(['Rates Resolved', 'RatesResolved', 'Rates Sheet', 'RatesSheet', 'Has Rates']);
      var idxResolutionHrs = getIdx(['Resolution Time (hrs)', 'ResolutionTime(hrs)', 'ResolutionTime']);

      var out = [];
      for (var i = 1; i < rows.length; i++) {
        var r = rows[i];
        if (!r[idxClient]) continue;
        var hrs = idxResponseHrs !== undefined && r[idxResponseHrs] !== '' ? parseFloat(r[idxResponseHrs]) : null;
        var reopenHrs = idxReopenHrs !== undefined && r[idxReopenHrs] !== '' ? parseFloat(r[idxReopenHrs]) : null;

        var raw = (idxStatus !== undefined ? (r[idxStatus] || '') : '').toString().toLowerCase();
        var s = raw.indexOf('resolved') !== -1 ? 'resolved'
              : raw.indexOf('on time') !== -1 ? 'on-time'
              : raw.indexOf('delayed') !== -1 ? 'delayed'
              : raw.indexOf('overdue') !== -1 ? 'overdue' : 'pending';

        var receivedVal = idxReceived !== undefined ? (r[idxReceived] || '') : '';
        var repliedVal = idxReplied !== undefined ? (r[idxReplied] || '') : '';
        var resolvedVal = idxResolvedAt !== undefined ? (r[idxResolvedAt] || '') : '';
        var resolvedByVal = idxResolvedBy !== undefined ? (r[idxResolvedBy] || '') : '';
        var resolutionLinksVal = idxResolutionLinks !== undefined ? (r[idxResolutionLinks] || '') : '';

        if ((hrs === null || isNaN(hrs)) && receivedVal) {
          try {
            var recvDate = new Date(receivedVal);
            if (repliedVal) {
              var repDate = new Date(repliedVal);
              if (!isNaN(recvDate) && !isNaN(repDate)) hrs = Math.round((repDate - recvDate) / 36e5 * 10) / 10;
            }
            if ((hrs === null || isNaN(hrs)) && resolvedVal) {
              var resDate = new Date(resolvedVal);
              if (!isNaN(recvDate) && !isNaN(resDate)) hrs = Math.round((resDate - recvDate) / 36e5 * 10) / 10;
            }
          } catch (e) { /* keep hrs */ }
        }

        // time from first response → resolved.
        // Prefer the sheet's business-hours value (Mon–Fri 9–5, matching
        // Response Time); fall back to raw wall-clock for pre-migration sheets.
        var resolutionHrs = idxResolutionHrs !== undefined && r[idxResolutionHrs] !== ''
          ? parseFloat(r[idxResolutionHrs]) : null;
        if (resolutionHrs === null || isNaN(resolutionHrs)) {
          resolutionHrs = null;
          if (repliedVal && resolvedVal) {
            var rd = new Date(repliedVal), sd = new Date(resolvedVal);
            if (!isNaN(rd) && !isNaN(sd) && sd >= rd) resolutionHrs = Math.round((sd - rd) / 36e5 * 10) / 10;
          }
        }
        var ratesFlag = idxRatesResolved !== undefined && (r[idxRatesResolved] || '').toUpperCase() === 'TRUE';

        var row = {
          client: r[idxClient] || '?',
          received: receivedVal || '',
          subject: idxSubject !== undefined ? (r[idxSubject] || '') : '',
          link: idxLink !== undefined ? (r[idxLink] || '') : '',
          replied: repliedVal || null,
          responseHrs: (hrs === null || isNaN(hrs)) ? null : hrs,
          resolutionHrs: resolutionHrs,
          status: s,
          resolvedAt: resolvedVal || '',
          resolvedBy: resolvedByVal || '',
          resolutionLinks: resolutionLinksVal || '',
          ratesResolved: ratesFlag,
          requestedBy: idxRequestedBy !== undefined ? (r[idxRequestedBy] || '') : '',
          requesterEmail: idxRequesterEmail !== undefined ? (r[idxRequesterEmail] || '') : '',
          reopenedAt: idxReopenedAt !== undefined ? (r[idxReopenedAt] || '') : '',
          reopenResolutionHrs: reopenHrs,
          blairInvolved: idxBlair !== undefined ? (r[idxBlair] || '').toUpperCase() === 'TRUE' : false
        };
        row.ratesResolved = window.detectRatesResolution ? window.detectRatesResolution(row) : ratesFlag;
        out.push(row);
      }
      return out;
    },
    // Grab a fresh Firebase ID token for the signed-in user. The web app
    // verifies this server-side before doing anything, so anonymous callers
    // (who don't have an @amzprep.com Firebase session) are rejected.
    idToken: async function () {
      var user = firebase.auth().currentUser;
      if (!user) throw new Error('Not signed in.');
      return user.getIdToken();
    },
    sendWeekly: async function () {
      var token = await this.idToken();
      return fetch(WEBAPP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'sendWeekly', idToken: token })
      });
    },
    // Fire-and-forget POST to the web app; text/plain body avoids a CORS
    // preflight, mode:no-cors matches the sheet/sendWeekly pattern. The
    // idToken authenticates the caller to the Apps Script backend.
    sendRequesterLog: async function (payload) {
      var token = await this.idToken();
      return fetch(WEBAPP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: 'sendRequesterLog', idToken: token }, payload))
      });
    }
  };
})();
