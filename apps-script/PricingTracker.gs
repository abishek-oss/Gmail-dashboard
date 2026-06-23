// ============================================================
// Pricing Request Tracker — AMZ Prep
// Tracks ONLY emails with "Pricing Request" in the subject
// For: abishek@amzprep.com
// ============================================================

var MY_EMAIL         = "abishek@amzprep.com";
var RESPONDERS       = ["abishek@amzprep.com", "goku@amzprep.com"];
var NUDGE_RECIPIENTS = ["abishek@amzprep.com", "goku@amzprep.com"];
var RESOLVED_LABEL   = "✅ Resolved";
var NUDGE_LABEL      = "⏰ Follow Up Now";
var PRICING_LABEL    = "💰 Pricing Request";
var SHEET_NAME       = "Pricing Response Tracker";
var NUDGE_INTERVAL   = 2;
var WORK_START       = 9;
var WORK_END         = 17;
// ── DIGEST_HOUR removed — morning digest is gone

// ── RATES TAG: pricing leads whose replies count as a "rates sent" resolution.
//    A thread is tagged when any of these people reply with a Google Sheets
//    rates link or an Excel sheet (link or attachment). Matched on email.
var RATES_SENDERS = [
  "abishek@amzprep.com",
  "goku@amzprep.com",
  "omar@amzprep.com",
  "henna@amzprep.com",
  "alia@amzprep.com"
];

var NUDGE_RULES = [
  { keyword: "pricing request - fulfilment", hours: 8  },
  { keyword: "pricing request - shipping",   hours: 16 },
  { keyword: "pricing request - combined",   hours: 16 },
  { keyword: "pricing request",              hours: 8  }
];

var ABANDON_DAYS = 6.5;

// ============================================================
// SECURITY — endpoint authorization
// ============================================================
// The web app is deployed "Execute as: me", so every request runs with
// full access to THIS Gmail account. It must therefore authenticate the
// caller. Two gates are used:
//
//  • doPost (sends email as you): requires a Firebase ID token, which is
//    verified server-side against Google Identity Toolkit. Only a signed-in,
//    email-verified @amzprep.com user can pass — an outsider cannot forge one.
//
//  • doGet (resolve / sendWeekly links clicked from internal emails):
//    requires a shared token (?t=...) stored in Script Properties, since a
//    Firebase token can't be embedded in an email link.
//
// SET THESE ONCE: Project Settings → Script Properties
//    WEBAPP_TOKEN = <a long random string>
// (FIREBASE_API_KEY below is a public Firebase web key — safe to inline.)
var FIREBASE_API_KEY = 'AIzaSyBTrhx2cB93AA54ie9BYdGm3llJRf3Ect0';
var ALLOWED_DOMAIN   = 'amzprep.com';

// Verify a Firebase ID token via Identity Toolkit. Returns the caller's
// email if the token is valid, email-verified, and on the allowed domain;
// otherwise null. An attacker without an @amzprep.com Firebase account
// cannot produce a token that passes.
function verifyFirebaseUser_(idToken) {
  if (!idToken) return null;
  try {
    var res = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY,
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ idToken: idToken }),
        muteHttpExceptions: true
      }
    );
    if (res.getResponseCode() !== 200) return null;
    var users = (JSON.parse(res.getContentText()) || {}).users || [];
    var u = users[0];
    if (!u || !u.email || u.emailVerified !== true) return null;
    if (String(u.email).split('@')[1] !== ALLOWED_DOMAIN) return null;
    return u.email;
  } catch (err) {
    return null;
  }
}

// TEMPORARY DIAGNOSTIC — same checks as verifyFirebaseUser_ but returns the
// reason it failed so we can see why a token is rejected. Delete once fixed.
function verifyFirebaseUserVerbose_(idToken) {
  if (!idToken) return { reason: 'no idToken received by server' };
  try {
    var res = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY,
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ idToken: idToken }),
        muteHttpExceptions: true
      }
    );
    var code = res.getResponseCode();
    var txt  = res.getContentText();
    if (code !== 200) return { reason: 'lookup HTTP ' + code + ' :: ' + txt.slice(0, 300) +
                                         ' (idToken len=' + idToken.length + ')' };
    var users = (JSON.parse(txt) || {}).users || [];
    var u = users[0];
    if (!u)            return { reason: 'lookup ok but no user returned' };
    if (!u.email)      return { reason: 'user has no email' };
    if (u.emailVerified !== true) return { reason: 'emailVerified=' + u.emailVerified };
    if (String(u.email).split('@')[1] !== ALLOWED_DOMAIN) return { reason: 'wrong domain: ' + u.email };
    return { email: u.email };
  } catch (err) {
    return { reason: 'exception: ' + err.message };
  }
}

function getWebAppToken_() {
  return PropertiesService.getScriptProperties().getProperty('WEBAPP_TOKEN') || '';
}

// Constant-time-ish comparison for the doGet shared token.
function tokenOk_(provided) {
  var expected = getWebAppToken_();
  return !!expected && provided === expected;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function unauthorizedPage_() {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;max-width:460px;margin:4rem auto;text-align:center;padding:2rem;">' +
    '<div style="font-size:44px;margin-bottom:12px;">🔒</div>' +
    '<h2 style="color:#dc2626;margin-bottom:8px;">Not authorized</h2>' +
    '<p style="color:#64748b;font-size:14px;">This link is missing a valid access token.</p>' +
    '</div>'
  );
}

// ============================================================
// WEB APP
// ── Default page shows a "Send Previous Week Report" button
// ============================================================
function doGet(e) {
  var params     = (e && e.parameter) || {};
  var threadId   = params.resolve;
  var sendWeekly = params.sendWeekly;

  // Dashboard data feed — authenticated PER USER via a Firebase ID token.
  // This is what lets the Google Sheet stay PRIVATE: the script runs as the
  // owner and only hands rows to a verified @amzprep.com caller. The browser
  // no longer reads the sheet directly, so there is no public CSV to scrape.
  if (params.action === 'getData') {
    var v = verifyFirebaseUserVerbose_(params.idToken);
    if (!v.email) {
      // TEMPORARY: `reason` explains why verification failed. Remove `reason`
      // (and verifyFirebaseUserVerbose_) once the data feed is confirmed working.
      return jsonOut_({ status: 'error', error: 'Unauthorized', reason: v.reason });
    }
    return jsonOut_({ status: 'ok', rows: getTrackerRows_() });
  }

  // Every other GET action is gated by the shared token (?t=...). Without it,
  // resolve/sendWeekly and the landing page are all refused.
  if (!tokenOk_(params.t)) return unauthorizedPage_();

  if (threadId)   return resolveThread(threadId);
  if (sendWeekly) return triggerWeeklyReport();

  // Default landing page — dashboard with send-report button
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>AMZ Prep Pricing Tracker</title></head>' +
    '<body style="font-family:sans-serif;background:#f8fafc;min-height:100vh;' +
    'display:flex;align-items:center;justify-content:center;margin:0;">' +
    '<div style="background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,0.08);' +
    'padding:2.5rem;max-width:440px;width:90%;text-align:center;">' +
    '<div style="font-size:44px;margin-bottom:12px;">📊</div>' +
    '<h2 style="color:#0f1e3c;margin:0 0 8px;font-size:22px;">AMZ Prep Pricing Tracker</h2>' +
    '<p style="color:#64748b;font-size:14px;margin-bottom:28px;line-height:1.6;">' +
    'Send last week\'s pricing performance report to the team.</p>' +
    '<a href="?sendWeekly=1&t=' + encodeURIComponent(params.t) + '" style="display:inline-block;background:#0f1e3c;color:#fff;' +
    'padding:13px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">' +
    '📨 Send Previous Week Report</a>' +
    '<p style="color:#94a3b8;font-size:12px;margin-top:20px;">' +
    'Sends to: abishek, goku, blair &amp; imtiaz</p>' +
    '</div></body></html>'
  ).setTitle('AMZ Prep Pricing Tracker');
}

// ── Handles the button click — calls sendWeeklyReport() and shows result
function triggerWeeklyReport() {
  try {
    sendWeeklyReport();
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;max-width:500px;margin:4rem auto;text-align:center;padding:2rem;">' +
      '<div style="font-size:48px;margin-bottom:16px;">✅</div>' +
      '<h2 style="color:#0f1e3c;margin-bottom:8px;">Report Sent!</h2>' +
      '<p style="color:#64748b;font-size:14px;">The previous week\'s pricing report has been sent to all recipients.</p>' +
      '<a href="' + getWebAppUrl() + '?t=' + encodeURIComponent(getWebAppToken_()) + '" style="display:inline-block;margin-top:24px;background:#0f1e3c;' +
      'color:#fff;padding:10px 24px;border-radius:7px;text-decoration:none;font-size:14px;font-weight:600;">' +
      '← Back to Dashboard</a>' +
      '</div>'
    );
  } catch(err) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;max-width:500px;margin:4rem auto;text-align:center;padding:2rem;">' +
      '<h2 style="color:#dc2626;">Failed to Send Report</h2>' +
      '<p style="color:#64748b;font-size:14px;">' + err.message + '</p>' +
      '</div>'
    );
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // AUTH: every POST sends mail as this account, so the caller must prove
    // they are a signed-in, verified @amzprep.com user. No valid token → refused.
    var caller = verifyFirebaseUser_(data.idToken);
    if (!caller) return jsonOut_({ status: 'error', error: 'Unauthorized' });

    if (data.action === 'sendRequesterLog') {
      // Only the account owner may dispatch a requester log. The mail is always
      // sent FROM this account (the script executes as the owner); this gate
      // makes sure ONLY the owner — not just any signed-in @amzprep.com user —
      // can trigger it to a recipient.
      if (caller !== MY_EMAIL) return jsonOut_({ status: 'error', error: 'Forbidden' });
      if (!data.to) throw new Error('Missing recipient');
      GmailApp.sendEmail(data.to, data.subject, data.plainBody || '',
        { htmlBody: data.htmlBody, name: 'AMZ Prep Pricing' });
      return jsonOut_({ status: 'ok' });
    }

    if (data.action === 'sendWeekly') {
      sendWeeklyReport();
      return jsonOut_({ status: 'ok' });
    }

    return jsonOut_({ status: 'error', error: 'Unknown action' });
  } catch (err) {
    return jsonOut_({ status: 'error', error: err.message });
  }
}

function resolveThread(threadId) {
  try {
    var thread = GmailApp.getThreadById(threadId);
    if (!thread) throw new Error("Thread not found");

    var nudgeLabel    = getOrCreateLabel(NUDGE_LABEL);
    var resolvedLabel = getOrCreateLabel(RESOLVED_LABEL);

    thread.removeLabel(nudgeLabel);
    thread.addLabel(resolvedLabel);
    markResolvedInSheet(threadId);

    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;max-width:500px;margin:4rem auto;text-align:center;padding:2rem;">' +
      '<div style="font-size:48px;margin-bottom:16px;">✅</div>' +
      '<h2 style="color:#0f1e3c;margin-bottom:8px;">Marked as Resolved</h2>' +
      '<p style="color:#64748b;font-size:14px;">This pricing request has been resolved. No more nudges will be sent.</p>' +
      '<a href="https://mail.google.com/mail/u/0/#inbox/' + threadId + '" style="display:inline-block;margin-top:24px;' +
      'background:#2563eb;color:#fff;padding:10px 20px;border-radius:7px;text-decoration:none;font-size:14px;font-weight:600;">' +
      'View thread in Gmail →</a>' +
      '</div>'
    );
  } catch(err) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;max-width:500px;margin:4rem auto;text-align:center;padding:2rem;">' +
      '<h2 style="color:#dc2626;">Something went wrong</h2>' +
      '<p style="color:#64748b;font-size:14px;">' + err.message + '</p>' +
      '</div>'
    );
  }
}

function markResolvedInSheet(threadId) {
  var sheet = getOrCreateSheet();
  var data  = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (data[r][0] === threadId) {
      sheet.getRange(r + 1, 8).setValue("✅ Resolved");
      var thread   = GmailApp.getThreadById(threadId);
      var messages = thread ? thread.getMessages() : [];
      // stamps Resolved At (I) + Resolution Time biz hrs (M) + Resolved By (N) + Rates Resolved (O)
      stampResolution(sheet, r + 1, messages, new Date());
      return;
    }
  }
}

// ============================================================
// NUDGE — checks every 2 hours, Mon–Fri 9AM–5PM only
// ── nudge table includes "SENT AT" column
// ============================================================
function checkForOverdueEmails() {
  var now = new Date();
  var day = now.getDay();
  if (day === 0 || day === 6) { Logger.log("Weekend — skipping."); return; }

  var hour = now.getHours();
  if (hour < WORK_START || hour >= WORK_END) { Logger.log("Outside work hours — skipping."); return; }

  var webAppUrl  = getWebAppUrl();
  var nudgeLabel = getOrCreateLabel(NUDGE_LABEL);
  var overdue    = [];

  var threads = GmailApp.search(
    'subject:"pricing request" in:inbox -label:"' + RESOLVED_LABEL +
    '" -subject:"past SLA" -subject:"Morning Digest" -subject:"Reopened"'
  );

  threads.forEach(function(thread) {
    var messages  = thread.getMessages();
    var firstMsg  = messages[0];
    var lastMsg   = messages[messages.length - 1];
    var subject   = thread.getFirstMessageSubject();
    var threadId  = thread.getId();

    var rule = getNudgeRule(subject);
    if (!rule) rule = { keyword: "pricing request", hours: 8 };

    var hoursOpen = getBusinessHours(firstMsg.getDate(), now);
    if (hoursOpen < rule.hours) return;

    var labels = thread.getLabels().map(function(l){ return l.getName(); });
    if (labels.indexOf(RESOLVED_LABEL) !== -1) {
      thread.removeLabel(nudgeLabel);
      return;
    }

    var businessHoursSinceLastMsg = getBusinessHours(lastMsg.getDate(), now);
    if (businessHoursSinceLastMsg >= ABANDON_DAYS * (WORK_END - WORK_START)) {
      var responseHrs   = Math.round(getBusinessHours(firstMsg.getDate(), lastMsg.getDate()) * 10) / 10;
      var resolvedLabel = getOrCreateLabel(RESOLVED_LABEL);
      thread.removeLabel(nudgeLabel);
      thread.addLabel(resolvedLabel);
      var sheet = getOrCreateSheet();
      var data  = sheet.getDataRange().getValues();
      for (var sr = 1; sr < data.length; sr++) {
        if (data[sr][0] === threadId) {
          sheet.getRange(sr + 1, 8).setValue("✅ Resolved");
          if (!data[sr][6]) sheet.getRange(sr + 1, 7).setValue(responseHrs);
          // resolved by inactivity → resolved-at is the last message date
          stampResolution(sheet, sr + 1, messages, lastMsg.getDate());
          break;
        }
      }
      Logger.log("Auto-resolved (inactive " + Math.round(businessHoursSinceLastMsg) + " business hrs): " + subject);
      return;
    }

    var lastSender = lastMsg.getFrom();
    var youReplied = RESPONDERS.some(function(r){ return lastSender.indexOf(r) !== -1; });

    thread.addLabel(nudgeLabel);
    trackPricingRequest(thread, messages);

    overdue.push({
      subject:   subject,
      sender:    firstMsg.getFrom(),
      sentTime:  Utilities.formatDate(firstMsg.getDate(), Session.getScriptTimeZone(), "MMM d, yyyy h:mm a"),
      hoursOpen: Math.floor(hoursOpen),
      link:      "https://mail.google.com/mail/u/0/#inbox/" + threadId,
      threadId:  threadId,
      replied:   youReplied,
      slaHours:  rule.hours
    });
  });

  if (overdue.length === 0) return;

  var nudgeRows = "";
  var plainNudge = "";

  overdue.forEach(function(e) {
    var resolveBtn = webAppUrl
      ? ' <a href="' + webAppUrl + '?resolve=' + e.threadId + '&t=' + encodeURIComponent(getWebAppToken_()) +
        '" style="display:inline-block;background:#16a34a;color:#fff;font-size:11px;' +
        'font-weight:600;padding:3px 10px;border-radius:4px;text-decoration:none;margin-left:8px;">Mark as Resolved</a>'
      : '';
    var repliedBadge = e.replied
      ? ' <span style="background:#dcfce7;color:#16a34a;font-size:11px;padding:2px 6px;border-radius:4px;font-weight:500;">Replied ✓</span>'
      : '';
    var slaBadge =
      '<span style="background:#e0e7ff;color:#3730a3;font-size:11px;padding:2px 6px;' +
      'border-radius:4px;font-weight:500;margin-left:4px;">SLA: ' + e.slaHours + 'h</span>';

    nudgeRows +=
      '<tr style="border-bottom:1px solid #eee;">' +
      '<td style="padding:12px 8px;font-size:13px;color:#111;">' + e.sender + '</td>' +
      '<td style="padding:12px 8px;font-size:12px;color:#64748b;white-space:nowrap;">' + e.sentTime + '</td>' +
      '<td style="padding:12px 8px;font-size:14px;">' +
        '<a href="' + e.link + '" style="color:#1a73e8;text-decoration:none;font-weight:500;">' + e.subject + '</a>' +
        slaBadge + repliedBadge + resolveBtn +
      '</td>' +
      '<td style="padding:12px 8px;font-size:12px;white-space:nowrap;color:#c5221f;font-weight:500;">' + e.hoursOpen + 'h open</td>' +
      '</tr>';

    plainNudge += "• " + e.subject + " (" + e.hoursOpen + "h open, SLA: " + e.slaHours + "h)" +
      "\n  Sent: " + e.sentTime + "\n  From: " + e.sender + "\n  " + e.link + "\n\n";
  });

  var nudgeHtml =
    '<div style="font-family:sans-serif;max-width:720px;margin:0 auto;">' +
    '<div style="background:#e37400;padding:20px 24px;border-radius:8px 8px 0 0;">' +
    '<h2 style="color:#fff;margin:0;font-size:20px;">' + overdue.length + ' pricing request(s) past SLA</h2>' +
    '<p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px;">Nudges fire Mon–Fri 9AM–5PM until marked as resolved</p></div>' +
    '<table style="width:100%;border-collapse:collapse;background:#fff;">' +
    '<thead><tr style="background:#f1f3f4;">' +
    '<th style="padding:10px 8px;text-align:left;font-size:12px;color:#444;width:22%;">FROM</th>' +
    '<th style="padding:10px 8px;text-align:left;font-size:12px;color:#444;width:18%;">SENT AT</th>' +
    '<th style="padding:10px 8px;text-align:left;font-size:12px;color:#444;">SUBJECT</th>' +
    '<th style="padding:10px 8px;text-align:left;font-size:12px;color:#444;width:10%;">OPEN FOR</th>' +
    '</tr></thead><tbody>' + nudgeRows + '</tbody></table>' +
    '<div style="padding:16px 24px;background:#fff7e6;border-radius:0 0 8px 8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
    '<a href="https://mail.google.com/mail/u/0/#label/' + encodeURIComponent(NUDGE_LABEL) +
    '" style="background:#e37400;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:14px;font-weight:500;">View all in Gmail</a>' +
    '<span style="font-size:12px;color:#92400e;">Click “Mark as Resolved” to stop nudges</span>' +
    '</div></div>';

  NUDGE_RECIPIENTS.forEach(function(recipient) {
    GmailApp.sendEmail(
      recipient,
      overdue.length + " pricing request(s) past SLA - " +
        now.toLocaleDateString("en-CA", {weekday:"short", month:"short", day:"numeric"}),
      "These pricing requests need to be resolved:\n\n" + plainNudge,
      {htmlBody: nudgeHtml, name: "Pricing Nudge"}
    );
  });
}

// ============================================================
// PRICING TRACKER — logs to Google Sheet
// ============================================================
function trackPricingRequest(thread, messages) {
  var subjectCheck = thread.getFirstMessageSubject().toLowerCase();
  var systemKeywords = ["past sla", "morning digest", "reopened:", "nudge —", "need resolution", "historical pricing"];
  for (var k = 0; k < systemKeywords.length; k++) {
    if (subjectCheck.indexOf(systemKeywords[k]) !== -1) return;
  }

  var sheet    = getOrCreateSheet();
  var threadId = thread.getId();
  var data     = sheet.getDataRange().getValues();

  for (var r = 1; r < data.length; r++) {
    if (data[r][0] === threadId) {
      if (!data[r][5] && isRepliedByMe(messages)) {
        var replyMsg = getMyFirstReply(messages);
        if (replyMsg) {
          var hrs    = Math.round(getBusinessHours(new Date(data[r][2]), replyMsg.getDate()) * 10) / 10;
          var status = hrs <= 4 ? "✅ On Time" : hrs <= 24 ? "⚠️ Delayed" : "❌ Overdue";
          sheet.getRange(r+1, 6).setValue(Utilities.formatDate(replyMsg.getDate(), Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm"));
          sheet.getRange(r+1, 7).setValue(hrs);
          sheet.getRange(r+1, 8).setValue(status);
        }
      }
      return;
    }
  }

  var firstMsg     = messages[0];
  var subject      = thread.getFirstMessageSubject();
  var parts        = subject.replace(/re:\s*/i, "").split(" - ");
  var clientName   = parts.length >= 2 ? parts[1].trim() : firstMsg.getFrom();
  var receivedDate = firstMsg.getDate();
  var replyDate    = "";
  var responseHrs  = "";
  var status       = "⏳ Pending";

  var rawSender   = firstMsg.getFrom();
  var requestedBy = rawSender.indexOf("<") !== -1
    ? rawSender.substring(0, rawSender.indexOf("<")).trim().replace(/"/g, "")
    : rawSender.trim();
  var requesterEmail = extractEmail(rawSender);

  if (isRepliedByMe(messages)) {
    var replyMsg = getMyFirstReply(messages);
    if (replyMsg) {
      replyDate   = Utilities.formatDate(replyMsg.getDate(), Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm");
      responseHrs = Math.round(getBusinessHours(receivedDate, replyMsg.getDate()) * 10) / 10;
      status      = responseHrs <= 4 ? "✅ On Time" : responseHrs <= 24 ? "⚠️ Delayed" : "❌ Overdue";
    }
  }

  // Cols A–J; K (Reopened At), L (Reopen Resolution Time), M (Resolution Time),
  // N (Resolved By), O (Rates Resolved) start empty
  sheet.appendRow([
    threadId, clientName,
    Utilities.formatDate(receivedDate, Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm"),
    subject,
    "https://mail.google.com/mail/u/0/#inbox/" + threadId,
    replyDate, responseHrs, status, "", requestedBy
  ]);
  setRequesterEmail(sheet, sheet.getLastRow(), requesterEmail);
}

// Pull the bare address out of a "Name <email@domain>" From header.
function extractEmail(from) {
  var m = (from || '').match(/<([^>]+)>/);
  if (m) return m[1].trim();
  return /\S+@\S+/.test(from) ? (from || '').trim() : '';
}

// Write the requester email into the "Requester Email" column, creating it if absent.
function setRequesterEmail(sheet, row, email) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var col = headers.indexOf('Requester Email');
  if (col === -1) {
    col = lastCol;                                  // append a new column at the end
    sheet.getRange(1, col + 1).setValue('Requester Email');
  }
  sheet.getRange(row, col + 1).setValue(email || '');
}

function backfillPricingRequests() {
  var threads = GmailApp.search('subject:"pricing request"', 0, 100);
  threads.forEach(function(t) { trackPricingRequest(t, t.getMessages()); Utilities.sleep(100); });
  Logger.log("Backfill done — " + threads.length + " threads processed.");
}

// ============================================================
// LABEL & TRACK
// ============================================================
function labelAndTrackNewEmails() {
  var threads = GmailApp.search('subject:"pricing request" in:inbox -label:"' + RESOLVED_LABEL + '"');
  var pricingLabel = getOrCreateLabel(PRICING_LABEL);
  var tracked = 0;

  threads.forEach(function(thread) {
    var labels = thread.getLabels().map(function(l) { return l.getName(); });
    if (labels.indexOf(PRICING_LABEL) === -1) thread.addLabel(pricingLabel);
    trackPricingRequest(thread, thread.getMessages());
    tracked++;
  });

  Logger.log("Label & track pass: " + tracked + " thread(s) checked.");
}

// ============================================================
// SYNC — runs every 30 mins
// ── writes Reopened At (K), Reopen Resolution Time (L),
//    Resolution Time (M), Resolved By (N), Rates Resolved (O)
// ============================================================
function syncLabelsToSheet() {
  labelAndTrackNewEmails();

  var sheet         = getOrCreateSheet();
  var data          = sheet.getDataRange().getValues();
  var needsLabel    = getOrCreateLabel(PRICING_LABEL);
  var resolvedLabel = getOrCreateLabel(RESOLVED_LABEL);
  var nudgeLabel    = getOrCreateLabel(NUDGE_LABEL);
  var synced        = 0;

  for (var r = 1; r < data.length; r++) {
    var threadId      = data[r][0];
    var currentStatus = (data[r][7] || "").toString();
    var resolvedAt    = data[r][8] ? new Date(data[r][8]) : null;
    if (!threadId) continue;

    try {
      var thread = GmailApp.getThreadById(threadId);
      if (!thread) continue;

      var labels      = thread.getLabels().map(function(l){ return l.getName(); });
      var isResolved  = labels.indexOf(RESOLVED_LABEL) !== -1;
      var messages    = thread.getMessages();
      var lastMsg     = messages[messages.length - 1];
      var lastMsgDate = lastMsg.getDate();

      // CHECK: resolved thread received a new reply — reopen it
      if (currentStatus === "✅ Resolved" && resolvedAt) {
        if (lastMsgDate > resolvedAt) {
          thread.removeLabel(resolvedLabel);
          thread.addLabel(needsLabel);
          sheet.getRange(r + 1, 8).setValue("⏳ Pending");
          sheet.getRange(r + 1, 9).setValue("");        // clear Resolved At
          sheet.getRange(r + 1, 13).setValue("");       // clear Resolution Time
          // stamp Reopened At (col K = 11)
          sheet.getRange(r + 1, 11).setValue(
            Utilities.formatDate(lastMsgDate, Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm")
          );
          synced++;
          Logger.log("Reopened (new reply after resolve): " + data[r][3]);
          continue;
        }
      }

      // CHECK: manually labeled resolved in Gmail — sync to sheet
      if (isResolved && currentStatus !== "✅ Resolved") {
        sheet.getRange(r + 1, 8).setValue("✅ Resolved");
        // stamps Resolved At (I) + Resolution Time biz hrs (M) + Resolved By (N) + Rates Resolved (O)
        stampResolution(sheet, r + 1, messages, new Date());
        // if thread was previously reopened, record resolution time since reopen (col L = 12)
        var reopenedAt = data[r][10] ? new Date(data[r][10]) : null;
        if (reopenedAt) {
          var reopenResolutionHrs = Math.round(getBusinessHours(reopenedAt, new Date()) * 10) / 10;
          sheet.getRange(r + 1, 12).setValue(reopenResolutionHrs);
        }
        synced++;
        Logger.log("Synced resolved: " + data[r][3]);
      }

      // CHECK: resolved label manually removed in Gmail — revert to pending
      if (!isResolved && currentStatus === "✅ Resolved" && !resolvedAt) {
        sheet.getRange(r + 1, 8).setValue("⏳ Pending");
        sheet.getRange(r + 1, 9).setValue("");
        sheet.getRange(r + 1, 13).setValue("");
        synced++;
        Logger.log("Reverted to pending: " + data[r][3]);
      }

      Utilities.sleep(50);
    } catch(e) {
      Logger.log("Error syncing thread " + threadId + ": " + e.message);
    }
  }

  Logger.log("Sync complete — " + synced + " row(s) updated.");
  updateBlairInvolvement();
}

// ============================================================
// RESOLUTION STAMP + RATES DETECTION
// ── Resolution Time uses business hours (Mon–Fri 9–5), measured from
//    the first reply (col F) to when the thread was resolved — consistent
//    with how Response Time is calculated.
// ── A thread is tagged "rates sent" when any RATES_SENDERS reply carries
//    a Google Sheets link or an Excel sheet (link or attachment).
// ============================================================
function stampResolution(sheet, rowIndex, messages, resolvedDate) {
  if (!resolvedDate || isNaN(resolvedDate.getTime())) resolvedDate = new Date();

  // Resolved At (col I = 9)
  sheet.getRange(rowIndex, 9).setValue(
    Utilities.formatDate(resolvedDate, Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm")
  );

  // Resolution Time in business hours: first reply (col F = index 6) → resolved
  var repliedRaw = sheet.getRange(rowIndex, 6).getValue();
  var resolutionHrs = "";
  if (repliedRaw) {
    var repliedDate = (repliedRaw instanceof Date) ? repliedRaw : new Date(String(repliedRaw));
    if (!isNaN(repliedDate.getTime()) && resolvedDate > repliedDate) {
      resolutionHrs = Math.round(getBusinessHours(repliedDate, resolvedDate) * 10) / 10;
    }
  }
  sheet.getRange(rowIndex, 13).setValue(resolutionHrs); // M

  // Rates detection
  var rates = detectRatesInThread(messages || []);
  sheet.getRange(rowIndex, 14).setValue(rates.resolvedBy);          // N Resolved By
  sheet.getRange(rowIndex, 15).setValue(rates.found ? "TRUE" : "FALSE"); // O Rates Resolved
}

function detectRatesInThread(messages) {
  if (!messages || !messages.length) return { found: false, resolvedBy: "" };
  for (var i = 0; i < messages.length; i++) {
    var msg  = messages[i];
    var from = (msg.getFrom() || "").toLowerCase();
    var isSender = RATES_SENDERS.some(function(s){ return from.indexOf(s) !== -1; });
    if (!isSender) continue;

    var body = ((msg.getBody() || "") + " " + (msg.getPlainBody() || "")).toLowerCase();
    var hasSheetLink = body.indexOf("docs.google.com/spreadsheets") !== -1; // Google Sheets rates link
    var hasExcelLink = /\.xlsx?(?:[\s"'?#)\]]|$)/.test(body);               // .xls / .xlsx referenced in body

    var hasExcelAttach = false;
    try {
      var attachments = msg.getAttachments();
      for (var a = 0; a < attachments.length; a++) {
        var nm = (attachments[a].getName() || "").toLowerCase();
        if (/\.xlsx?$/.test(nm)) { hasExcelAttach = true; break; }
      }
    } catch (e) { /* attachments unavailable — ignore */ }

    if (hasSheetLink || hasExcelLink || hasExcelAttach) {
      var raw  = msg.getFrom();
      var name = raw.indexOf("<") !== -1
        ? raw.substring(0, raw.indexOf("<")).trim().replace(/"/g, "")
        : raw.trim();
      return { found: true, resolvedBy: name };
    }
  }
  return { found: false, resolvedBy: "" };
}

// One-time backfill: stamp Resolution Time + Resolved By + Rates Resolved
// onto existing resolved rows. Run manually once after deploying.
function backfillResolutionAndRates() {
  var sheet = getOrCreateSheet();
  var data  = sheet.getDataRange().getValues();
  var count = 0;

  for (var r = 1; r < data.length; r++) {
    var threadId    = data[r][0];
    var repliedRaw  = data[r][5];
    var resolvedRaw = data[r][8];
    if (!threadId) continue;

    try {
      var thread   = GmailApp.getThreadById(threadId);
      var messages = thread ? thread.getMessages() : [];

      // Resolution Time (business hours) only when both reply + resolved exist
      if (repliedRaw && resolvedRaw) {
        var rep = new Date(String(repliedRaw)), res = new Date(String(resolvedRaw));
        if (!isNaN(rep.getTime()) && !isNaN(res.getTime()) && res > rep) {
          sheet.getRange(r + 1, 13).setValue(Math.round(getBusinessHours(rep, res) * 10) / 10);
        }
      }

      var rates = detectRatesInThread(messages);
      sheet.getRange(r + 1, 14).setValue(rates.resolvedBy);
      sheet.getRange(r + 1, 15).setValue(rates.found ? "TRUE" : "FALSE");

      count++;
      Utilities.sleep(60);
    } catch (e) {
      Logger.log("Backfill error on thread " + threadId + ": " + e.message);
    }
  }

  Logger.log("Backfill resolution/rates done — " + count + " row(s) processed.");
}

// ============================================================
// REQUESTER EMAIL BACKFILL — one-time fill for existing rows
// ── reads each thread's first-message sender and writes the
//    bare address into the "Requester Email" column
// ============================================================
function backfillRequesterEmails() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;

  var ss    = SpreadsheetApp.openById('13_1g-Iej0YNbR-6YY2rLoM3-R5uHWpfqdrSh2FLct44');
  var sheet = ss.getSheetByName('Tracker');
  var data  = sheet.getDataRange().getValues();
  var headers = data[0];

  var emailCol = headers.indexOf('Requester Email');
  if (emailCol === -1) {
    emailCol = headers.length;
    sheet.getRange(1, emailCol + 1).setValue('Requester Email');
  }

  var threadIdCol = headers.indexOf('Thread ID');
  if (threadIdCol === -1) { lock.releaseLock(); return; }

  var results = [];
  for (var i = 1; i < data.length; i++) {
    var existing = data[i][emailCol];
    if (existing) { results.push([existing]); continue; }   // keep what's already there
    var threadId = data[i][threadIdCol];
    if (!threadId) { results.push(['']); continue; }
    try {
      var thread = GmailApp.getThreadById(threadId);
      var msgs   = thread ? thread.getMessages() : null;
      results.push([msgs && msgs.length ? extractEmail(msgs[0].getFrom()) : '']);
    } catch (e) {
      results.push(['']);
    }
  }

  if (results.length > 0) {
    sheet.getRange(2, emailCol + 1, results.length, 1).setValues(results);
  }
  lock.releaseLock();
  Logger.log('Requester email backfill done — ' + results.length + ' row(s).');
}

// ============================================================
// BLAIR FORREST INVOLVEMENT TRACKER
// ============================================================
function updateBlairInvolvement() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;

  var BLAIR_NAMES = ['@blair', '@blair forrest'];
  var ss    = SpreadsheetApp.openById('13_1g-Iej0YNbR-6YY2rLoM3-R5uHWpfqdrSh2FLct44');
  var sheet = ss.getSheetByName('Tracker');
  var data  = sheet.getDataRange().getValues();
  var headers = data[0];

  var blairCol = headers.indexOf('Blair Involved');
  if (blairCol === -1) {
    blairCol = headers.length;
    sheet.getRange(1, blairCol + 1).setValue('Blair Involved');
  }

  var threadIdCol = headers.indexOf('Thread ID');
  if (threadIdCol === -1) { lock.releaseLock(); return; }

  var cutoffStart = new Date('2026-02-01');
  var cutoffEnd   = new Date();
  var results     = [];

  for (var i = 1; i < data.length; i++) {
    var threadId = data[i][threadIdCol];
    if (!threadId) { results.push(['FALSE']); continue; }

    try {
      var thread = GmailApp.getThreadById(threadId);
      if (!thread) { results.push(['FALSE']); continue; }

      var messages = thread.getMessages();
      var involved = false;

      for (var j = 0; j < messages.length && !involved; j++) {
        var msgDate = messages[j].getDate();
        if (msgDate < cutoffStart || msgDate > cutoffEnd) continue;
        var body = (messages[j].getPlainBody() || '').toLowerCase();
        for (var k = 0; k < BLAIR_NAMES.length; k++) {
          if (body.indexOf(BLAIR_NAMES[k]) !== -1) { involved = true; break; }
        }
      }

      results.push([involved ? 'TRUE' : 'FALSE']);
    } catch (e) {
      results.push(['FALSE']);
    }
  }

  if (results.length > 0) {
    sheet.getRange(2, blairCol + 1, results.length, 1).setValues(results);
  }

  lock.releaseLock();
}

// ============================================================
// WEEKLY REPORT
// ── Structure: metrics + summary, Pending last week, Past SLA, Resolved last week
// ── No automatic Friday trigger — send manually via web app button
// ============================================================
function sendWeeklyReport() {
  var RECIPIENTS = [
    'abishek@amzprep.com',
    'goku@amzprep.com',
    'blair@amzprep.com',
    'imtiaz@eshipper.com'
  ];

  var ss    = SpreadsheetApp.openById('13_1g-Iej0YNbR-6YY2rLoM3-R5uHWpfqdrSh2FLct44');
  var sheet = ss.getSheetByName('Tracker');
  var data  = sheet.getDataRange().getValues();
  var headers = data[0];

  var statusCol      = headers.indexOf('Status');
  var clientCol      = headers.indexOf('Client');
  var subjectCol     = headers.indexOf('Subject');
  var receivedCol    = headers.indexOf('Received');
  var repliedCol     = headers.indexOf('Replied At');
  var responseCol    = headers.indexOf('Response Time (hrs)');
  var resolvedAtCol  = headers.indexOf('Resolved At');
  var resolutionCol  = headers.indexOf('Resolution Time (hrs)');
  var ratesCol       = headers.indexOf('Rates Resolved');
  var linkCol        = headers.indexOf('Gmail Link');
  var requestedByCol = headers.indexOf('Requested By');

  var now = new Date();

  // Previous week Mon–Fri (go back to last Monday + 7 more days)
  var dayOfWeek      = now.getDay(); // 0=Sun … 6=Sat
  var daysToMonday   = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
  var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMonday - 7, 0, 0, 0);
  var friday = new Date(monday.getTime() + 4 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000 + 59 * 60 * 1000);

  var weekLabel = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' +
    friday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  var receivedThisWeek = [];
  var repliedThisWeek  = [];
  var resolvedThisWeek = [];
  var reopenedThisWeek = [];
  var slaBreach        = [];
  var allOpen          = [];
  var allReplied       = [];

  for (var i = 1; i < data.length; i++) {
    var row        = data[i];
    var status     = (row[statusCol] || '').toString();
    var statusLower = status.toLowerCase();
    var client     = row[clientCol] || '?';
    var subject    = row[subjectCol] || '';
    var received   = row[receivedCol] instanceof Date ? row[receivedCol] : new Date(String(row[receivedCol]));
    var replied    = row[repliedCol] instanceof Date ? row[repliedCol] : (row[repliedCol] ? new Date(String(row[repliedCol])) : null);
    var responseHrs = row[responseCol] !== '' && row[responseCol] !== null ? parseFloat(row[responseCol]) : null;
    var resolvedAt = row[resolvedAtCol] instanceof Date ? row[resolvedAtCol] : (row[resolvedAtCol] ? new Date(String(row[resolvedAtCol])) : null);
    var resolutionHrs = (resolutionCol !== -1 && row[resolutionCol] !== '' && row[resolutionCol] !== null) ? parseFloat(row[resolutionCol]) : null;
    var ratesResolved = (ratesCol !== -1) && (row[ratesCol] || '').toString().toUpperCase() === 'TRUE';
    var link       = row[linkCol] || '';
    var requestedBy = row[requestedByCol] || '';

    var entry = {
      client: client, subject: subject, received: received, replied: replied,
      responseHrs: responseHrs, status: status, statusLower: statusLower,
      resolvedAt: resolvedAt, resolutionHrs: resolutionHrs, ratesResolved: ratesResolved,
      link: link, requestedBy: requestedBy
    };

    if (responseHrs !== null) allReplied.push(entry);

    if (!isNaN(received.getTime()) && received >= monday && received <= friday)
      receivedThisWeek.push(entry);

    if (replied && !isNaN(replied.getTime()) && replied >= monday && replied <= friday)
      repliedThisWeek.push(entry);

    if (statusLower.indexOf('resolved') !== -1 && resolvedAt &&
        !isNaN(resolvedAt.getTime()) && resolvedAt >= monday && resolvedAt <= friday)
      resolvedThisWeek.push(entry);

    if (resolvedAt && statusLower.indexOf('resolved') === -1)
      reopenedThisWeek.push(entry);

    if (statusLower.indexOf('resolved') === -1) {
      allOpen.push(entry);

      if (statusLower.indexOf('pending') !== -1 || statusLower.indexOf('overdue') !== -1) {
        var slaHrs = 8;
        if (subject.toLowerCase().indexOf('shipping') !== -1) slaHrs = 16;
        if (subject.toLowerCase().indexOf('combined') !== -1) slaHrs = 16;
        var hoursOpen = (now - received) / (1000 * 60 * 60);
        if (hoursOpen > slaHrs) {
          entry.hoursOpen = Math.round(hoursOpen * 10) / 10;
          entry.slaHrs    = slaHrs;
          slaBreach.push(entry);
        }
      }
    }
  }

  // received last week AND still unresolved
  var pendingFromLastWeek = receivedThisWeek.filter(function(e){
    return e.statusLower.indexOf('resolved') === -1;
  });

  var weekReplied = receivedThisWeek.filter(function(e) { return e.responseHrs !== null; });
  var avgWeekHrs  = weekReplied.length
    ? Math.round(weekReplied.reduce(function(s,e){ return s + e.responseHrs; }, 0) / weekReplied.length * 10) / 10
    : null;

  var avgAllHrs = allReplied.length
    ? Math.round(allReplied.reduce(function(s,e){ return s + e.responseHrs; }, 0) / allReplied.length * 10) / 10
    : null;

  var summaryItems = [
    receivedThisWeek.length + ' new pricing request' + (receivedThisWeek.length !== 1 ? 's' : '') + ' received last week.',
    repliedThisWeek.length  + ' email'               + (repliedThisWeek.length  !== 1 ? 's' : '') + ' replied to.',
    resolvedThisWeek.length + ' request'             + (resolvedThisWeek.length !== 1 ? 's' : '') + ' resolved.'
  ];
  if (reopenedThisWeek.length) summaryItems.push(reopenedThisWeek.length + ' thread' + (reopenedThisWeek.length !== 1 ? 's' : '') + ' reopened.');
  if (slaBreach.length)        summaryItems.push(slaBreach.length + ' request' + (slaBreach.length !== 1 ? 's' : '') + ' currently past SLA.');
  summaryItems.push(allOpen.length + ' total open request' + (allOpen.length !== 1 ? 's' : '') + ' across all time.');
  if (avgWeekHrs !== null) summaryItems.push('Average turnaround last week: ' + avgWeekHrs + 'h.');
  if (avgAllHrs  !== null) summaryItems.push('Average turnaround all-time: '  + avgAllHrs  + 'h.');

  var html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>' +
    '<body style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:2rem;color:#1e293b;background:#fff;">' +
    '<h1 style="font-size:22px;margin:0 0 4px;">Weekly Pricing Report</h1>' +
    '<p style="color:#64748b;font-size:14px;margin-bottom:24px;">' + weekLabel + '</p>' +
    '<div style="display:flex;gap:12px;margin-bottom:24px;">' +
    mBox('#2563eb', avgWeekHrs !== null ? avgWeekHrs + 'h' : '--', 'Avg Response (Week)') +
    mBox('#7c3aed', avgAllHrs  !== null ? avgAllHrs  + 'h' : '--', 'Avg Response (All)')  +
    mBox('#16a34a', String(resolvedThisWeek.length), 'Resolved This Week') +
    mBox('#ea580c', String(slaBreach.length),        'SLA Breached')       +
    mBox('#2563eb', String(allOpen.length),           'Open / Pending')     +
    '</div>' +

    '<h2 style="font-size:16px;margin:24px 0 10px;padding-top:16px;border-top:1px solid #e5e7eb;">Executive Summary</h2>' +
    '<ul style="font-size:13px;line-height:1.8;color:#334155;">' +
    summaryItems.map(function(s){ return '<li>' + s + '</li>'; }).join('') + '</ul>' +

    '<h2 style="font-size:16px;margin:24px 0 10px;padding-top:16px;border-top:1px solid #e5e7eb;">Pending From Last Week (' + pendingFromLastWeek.length + ')</h2>' +
    '<p style="color:#94a3b8;font-size:12px;margin-bottom:8px;">Received last week and not yet resolved</p>' +
    (pendingFromLastWeek.length
      ? tbl(['Client','Subject','Received','First Response','Status'],
          pendingFromLastWeek.sort(function(a,b){ return a.received - b.received; }).map(function(e){
            return [esc2(e.client), lnk(e.link,e.subject), fmtDate(e.received),
              e.responseHrs !== null ? e.responseHrs+'h' : '--', bdg(e.statusLower,e.status)];
          }))
      : '<p style="color:#16a34a;font-size:13px;">Nothing pending from last week. All caught up!</p>') +

    '<h2 style="font-size:16px;margin:24px 0 10px;padding-top:16px;border-top:1px solid #e5e7eb;">Past SLA – Open Requests (' + slaBreach.length + ')</h2>' +
    (slaBreach.length
      ? tbl(['Client','Subject','SLA','Hours Open','Requested By'],
          slaBreach.sort(function(a,b){ return b.hoursOpen - a.hoursOpen; }).map(function(e){
            return [esc2(e.client), lnk(e.link,e.subject), e.slaHrs+'h',
              '<strong style="color:#dc2626;">' + e.hoursOpen + 'h</strong>', esc2(e.requestedBy)];
          }))
      : '<p style="color:#16a34a;font-size:13px;">No requests past SLA. Great work!</p>') +

    '<h2 style="font-size:16px;margin:24px 0 10px;padding-top:16px;border-top:1px solid #e5e7eb;">Resolved Last Week (' + resolvedThisWeek.length + ')</h2>' +
    (resolvedThisWeek.length
      ? tbl(['Client','Subject','First Response','Resolution','Resolved At'],
          resolvedThisWeek.map(function(e){
            return [esc2(e.client), lnk(e.link,e.subject),
              e.responseHrs !== null ? e.responseHrs+'h' : '--',
              (e.resolutionHrs !== null ? e.resolutionHrs+'h' : '--') + (e.ratesResolved ? ratesPill() : ''),
              fmtDate(e.resolvedAt)];
          }))
      : '<p style="color:#94a3b8;font-size:13px;">No requests resolved last week.</p>') +

    '<p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">' +
    'Generated automatically by AMZ Prep Pricing Tracker</p>' +
    '</body></html>';

  GmailApp.sendEmail(RECIPIENTS.join(','), 'Weekly Pricing Report – ' + weekLabel, '', { htmlBody: html });
  Logger.log('Weekly report sent to: ' + RECIPIENTS.join(', '));
}

// ============================================================
// WEEKLY REPORT — CURRENT WEEK (one-time / manual run)
// Same structure as sendWeeklyReport() but for the week we're in
// ============================================================
function sendWeeklyReportCurrentWeek() {
  var RECIPIENTS = [
    'abishek@amzprep.com',
    'goku@amzprep.com',
    'blair@amzprep.com',
    'imtiaz@eshipper.com'
  ];

  var ss    = SpreadsheetApp.openById('13_1g-Iej0YNbR-6YY2rLoM3-R5uHWpfqdrSh2FLct44');
  var sheet = ss.getSheetByName('Tracker');
  var data  = sheet.getDataRange().getValues();
  var headers = data[0];

  var statusCol      = headers.indexOf('Status');
  var clientCol      = headers.indexOf('Client');
  var subjectCol     = headers.indexOf('Subject');
  var receivedCol    = headers.indexOf('Received');
  var repliedCol     = headers.indexOf('Replied At');
  var responseCol    = headers.indexOf('Response Time (hrs)');
  var resolvedAtCol  = headers.indexOf('Resolved At');
  var resolutionCol  = headers.indexOf('Resolution Time (hrs)');
  var ratesCol       = headers.indexOf('Rates Resolved');
  var linkCol        = headers.indexOf('Gmail Link');
  var requestedByCol = headers.indexOf('Requested By');

  var now = new Date();

  // ── CURRENT week Mon–Fri (this week's Monday, no -7 offset)
  var dayOfWeek    = now.getDay(); // 0=Sun … 6=Sat
  var daysToMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
  var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMonday, 0, 0, 0);
  var friday = new Date(monday.getTime() + 4 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000 + 59 * 60 * 1000);

  var weekLabel = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' +
    friday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  var receivedThisWeek = [];
  var repliedThisWeek  = [];
  var resolvedThisWeek = [];
  var reopenedThisWeek = [];
  var slaBreach        = [];
  var allOpen          = [];
  var allReplied       = [];

  for (var i = 1; i < data.length; i++) {
    var row        = data[i];
    var status     = (row[statusCol] || '').toString();
    var statusLower = status.toLowerCase();
    var client     = row[clientCol] || '?';
    var subject    = row[subjectCol] || '';
    var received   = row[receivedCol] instanceof Date ? row[receivedCol] : new Date(String(row[receivedCol]));
    var replied    = row[repliedCol] instanceof Date ? row[repliedCol] : (row[repliedCol] ? new Date(String(row[repliedCol])) : null);
    var responseHrs = row[responseCol] !== '' && row[responseCol] !== null ? parseFloat(row[responseCol]) : null;
    var resolvedAt = row[resolvedAtCol] instanceof Date ? row[resolvedAtCol] : (row[resolvedAtCol] ? new Date(String(row[resolvedAtCol])) : null);
    var resolutionHrs = (resolutionCol !== -1 && row[resolutionCol] !== '' && row[resolutionCol] !== null) ? parseFloat(row[resolutionCol]) : null;
    var ratesResolved = (ratesCol !== -1) && (row[ratesCol] || '').toString().toUpperCase() === 'TRUE';
    var link       = row[linkCol] || '';
    var requestedBy = row[requestedByCol] || '';

    var entry = {
      client: client, subject: subject, received: received, replied: replied,
      responseHrs: responseHrs, status: status, statusLower: statusLower,
      resolvedAt: resolvedAt, resolutionHrs: resolutionHrs, ratesResolved: ratesResolved,
      link: link, requestedBy: requestedBy
    };

    if (responseHrs !== null) allReplied.push(entry);

    if (!isNaN(received.getTime()) && received >= monday && received <= friday)
      receivedThisWeek.push(entry);

    if (replied && !isNaN(replied.getTime()) && replied >= monday && replied <= friday)
      repliedThisWeek.push(entry);

    if (statusLower.indexOf('resolved') !== -1 && resolvedAt &&
        !isNaN(resolvedAt.getTime()) && resolvedAt >= monday && resolvedAt <= friday)
      resolvedThisWeek.push(entry);

    if (resolvedAt && statusLower.indexOf('resolved') === -1)
      reopenedThisWeek.push(entry);

    if (statusLower.indexOf('resolved') === -1) {
      allOpen.push(entry);

      if (statusLower.indexOf('pending') !== -1 || statusLower.indexOf('overdue') !== -1) {
        var slaHrs = 8;
        if (subject.toLowerCase().indexOf('shipping') !== -1) slaHrs = 16;
        if (subject.toLowerCase().indexOf('combined') !== -1) slaHrs = 16;
        var hoursOpen = (now - received) / (1000 * 60 * 60);
        if (hoursOpen > slaHrs) {
          entry.hoursOpen = Math.round(hoursOpen * 10) / 10;
          entry.slaHrs    = slaHrs;
          slaBreach.push(entry);
        }
      }
    }
  }

  // Received this week AND still unresolved
  var pendingThisWeek = receivedThisWeek.filter(function(e){
    return e.statusLower.indexOf('resolved') === -1;
  });

  var weekReplied = receivedThisWeek.filter(function(e) { return e.responseHrs !== null; });
  var avgWeekHrs  = weekReplied.length
    ? Math.round(weekReplied.reduce(function(s,e){ return s + e.responseHrs; }, 0) / weekReplied.length * 10) / 10
    : null;

  var avgAllHrs = allReplied.length
    ? Math.round(allReplied.reduce(function(s,e){ return s + e.responseHrs; }, 0) / allReplied.length * 10) / 10
    : null;

  var summaryItems = [
    receivedThisWeek.length + ' new pricing request' + (receivedThisWeek.length !== 1 ? 's' : '') + ' received this week.',
    repliedThisWeek.length  + ' email'               + (repliedThisWeek.length  !== 1 ? 's' : '') + ' replied to.',
    resolvedThisWeek.length + ' request'             + (resolvedThisWeek.length !== 1 ? 's' : '') + ' resolved.'
  ];
  if (reopenedThisWeek.length) summaryItems.push(reopenedThisWeek.length + ' thread' + (reopenedThisWeek.length !== 1 ? 's' : '') + ' reopened.');
  if (slaBreach.length)        summaryItems.push(slaBreach.length + ' request' + (slaBreach.length !== 1 ? 's' : '') + ' currently past SLA.');
  summaryItems.push(allOpen.length + ' total open request' + (allOpen.length !== 1 ? 's' : '') + ' across all time.');
  if (avgWeekHrs !== null) summaryItems.push('Average turnaround this week: ' + avgWeekHrs + 'h.');
  if (avgAllHrs  !== null) summaryItems.push('Average turnaround all-time: '  + avgAllHrs  + 'h.');

  var html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>' +
    '<body style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:2rem;color:#1e293b;background:#fff;">' +
    '<h1 style="font-size:22px;margin:0 0 4px;">Weekly Pricing Report (Current Week)</h1>' +
    '<p style="color:#64748b;font-size:14px;margin-bottom:24px;">' + weekLabel + '</p>' +
    '<div style="display:flex;gap:12px;margin-bottom:24px;">' +
    mBox('#2563eb', avgWeekHrs !== null ? avgWeekHrs + 'h' : '--', 'Avg Response (Week)') +
    mBox('#7c3aed', avgAllHrs  !== null ? avgAllHrs  + 'h' : '--', 'Avg Response (All)')  +
    mBox('#16a34a', String(resolvedThisWeek.length), 'Resolved This Week') +
    mBox('#ea580c', String(slaBreach.length),        'SLA Breached')       +
    mBox('#2563eb', String(allOpen.length),           'Open / Pending')     +
    '</div>' +

    '<h2 style="font-size:16px;margin:24px 0 10px;padding-top:16px;border-top:1px solid #e5e7eb;">Executive Summary</h2>' +
    '<ul style="font-size:13px;line-height:1.8;color:#334155;">' +
    summaryItems.map(function(s){ return '<li>' + s + '</li>'; }).join('') + '</ul>' +

    '<h2 style="font-size:16px;margin:24px 0 10px;padding-top:16px;border-top:1px solid #e5e7eb;">Pending This Week (' + pendingThisWeek.length + ')</h2>' +
    '<p style="color:#94a3b8;font-size:12px;margin-bottom:8px;">Received this week and not yet resolved</p>' +
    (pendingThisWeek.length
      ? tbl(['Client','Subject','Received','First Response','Status'],
          pendingThisWeek.sort(function(a,b){ return a.received - b.received; }).map(function(e){
            return [esc2(e.client), lnk(e.link,e.subject), fmtDate(e.received),
              e.responseHrs !== null ? e.responseHrs+'h' : '--', bdg(e.statusLower,e.status)];
          }))
      : '<p style="color:#16a34a;font-size:13px;">Nothing pending this week. All caught up!</p>') +

    '<h2 style="font-size:16px;margin:24px 0 10px;padding-top:16px;border-top:1px solid #e5e7eb;">Past SLA – Open Requests (' + slaBreach.length + ')</h2>' +
    (slaBreach.length
      ? tbl(['Client','Subject','SLA','Hours Open','Requested By'],
          slaBreach.sort(function(a,b){ return b.hoursOpen - a.hoursOpen; }).map(function(e){
            return [esc2(e.client), lnk(e.link,e.subject), e.slaHrs+'h',
              '<strong style="color:#dc2626;">' + e.hoursOpen + 'h</strong>', esc2(e.requestedBy)];
          }))
      : '<p style="color:#16a34a;font-size:13px;">No requests past SLA. Great work!</p>') +

    '<h2 style="font-size:16px;margin:24px 0 10px;padding-top:16px;border-top:1px solid #e5e7eb;">Resolved This Week (' + resolvedThisWeek.length + ')</h2>' +
    (resolvedThisWeek.length
      ? tbl(['Client','Subject','First Response','Resolution','Resolved At'],
          resolvedThisWeek.map(function(e){
            return [esc2(e.client), lnk(e.link,e.subject),
              e.responseHrs !== null ? e.responseHrs+'h' : '--',
              (e.resolutionHrs !== null ? e.resolutionHrs+'h' : '--') + (e.ratesResolved ? ratesPill() : ''),
              fmtDate(e.resolvedAt)];
          }))
      : '<p style="color:#94a3b8;font-size:13px;">No requests resolved this week.</p>') +

    '<p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">' +
    'Generated automatically by AMZ Prep Pricing Tracker</p>' +
    '</body></html>';

  GmailApp.sendEmail(RECIPIENTS.join(','), 'Weekly Pricing Report (Current Week) – ' + weekLabel, '', { htmlBody: html });
  Logger.log('Current-week report sent to: ' + RECIPIENTS.join(', '));
}

// ============================================================
// WEEKLY REPORT HELPERS
// ============================================================
function mBox(color, val, label) {
  return '<div style="flex:1;padding:16px;border-radius:10px;border:1px solid #e5e7eb;text-align:center;">' +
    '<div style="font-size:28px;font-weight:800;color:' + color + ';margin-bottom:2px;">' + val + '</div>' +
    '<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">' + label + '</div></div>';
}

function ratesPill() {
  return '<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;font-size:10px;' +
    'font-weight:700;letter-spacing:0.04em;text-transform:uppercase;background:#ecfccb;color:#4d7c0f;' +
    'border:1px solid #bef264;">Rates</span>';
}

function tbl(headers, rows) {
  return '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px;">' +
    '<thead><tr>' + headers.map(function(h) {
      return '<th style="text-align:left;padding:8px 10px;background:#f8fafc;border-bottom:2px solid #e5e7eb;' +
        'font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">' + h + '</th>';
    }).join('') + '</tr></thead><tbody>' +
    rows.map(function(cols) {
      return '<tr>' + cols.map(function(c) {
        return '<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">' + c + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table>';
}

function bdg(statusLower, statusText) {
  var colors = {
    'on time':  ['#dcfce7','#16a34a'],
    'delayed':  ['#fef3c7','#d97706'],
    'overdue':  ['#fee2e2','#dc2626'],
    'pending':  ['#dbeafe','#2563eb'],
    'resolved': ['#dcfce7','#16a34a']
  };
  var key = statusLower.indexOf('on time')  !== -1 ? 'on time'  :
            statusLower.indexOf('delayed')  !== -1 ? 'delayed'  :
            statusLower.indexOf('overdue')  !== -1 ? 'overdue'  :
            statusLower.indexOf('resolved') !== -1 ? 'resolved' : 'pending';
  var c = colors[key] || ['#dbeafe','#2563eb'];
  return '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;' +
    'background:' + c[0] + ';color:' + c[1] + ';">' + (statusText || key) + '</span>';
}

function lnk(link, subject) {
  var short = subject.length > 50 ? subject.substring(0, 50) + '...' : subject;
  return link
    ? '<a href="' + esc2(link) + '" style="color:#2563eb;text-decoration:none;">' + esc2(short) + '</a>'
    : esc2(short);
}

function fmtDate(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
}

function esc2(s) {
  return (s || '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// HELPERS
// ============================================================
function getBusinessHours(start, end) {
  if (!start || !end) return 0;
  if (!(start instanceof Date)) start = new Date(start);
  if (!(end   instanceof Date)) end   = new Date(end);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  if (end <= start) return 0;
  var totalHours = 0;
  var day    = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  var endDay = new Date(end.getFullYear(),   end.getMonth(),   end.getDate());
  while (day <= endDay) {
    if (day.getDay() !== 0 && day.getDay() !== 6) {
      var dayStart = new Date(day); dayStart.setHours(WORK_START, 0, 0, 0);
      var dayEnd   = new Date(day); dayEnd.setHours(WORK_END,   0, 0, 0);
      var s = start > dayStart ? start : dayStart;
      var e = end   < dayEnd   ? end   : dayEnd;
      if (e > s) totalHours += (e - s) / (1000 * 60 * 60);
    }
    day.setDate(day.getDate() + 1);
  }
  return totalHours;
}

function getNudgeRule(subject) {
  var s = subject.toLowerCase();
  for (var i = 0; i < NUDGE_RULES.length; i++) {
    if (s.indexOf(NUDGE_RULES[i].keyword) !== -1) return NUDGE_RULES[i];
  }
  return null;
}

function isRepliedByMe(messages) {
  for (var i = 1; i < messages.length; i++) {
    var from = messages[i].getFrom();
    for (var r = 0; r < RESPONDERS.length; r++) {
      if (from.indexOf(RESPONDERS[r]) !== -1) return true;
    }
  }
  return false;
}

function getMyFirstReply(messages) {
  for (var i = 1; i < messages.length; i++) {
    var from = messages[i].getFrom();
    for (var r = 0; r < RESPONDERS.length; r++) {
      if (from.indexOf(RESPONDERS[r]) !== -1) return messages[i];
    }
  }
  return null;
}

function getOrCreateLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

// ── sheet now has 15 columns; auto-migrates existing sheets
function getOrCreateSheet() {
  var files = DriveApp.getFilesByName(SHEET_NAME);
  var ss    = files.hasNext() ? SpreadsheetApp.open(files.next()) : SpreadsheetApp.create(SHEET_NAME);
  var sheet = ss.getSheetByName("Tracker");

  if (!sheet) {
    sheet = ss.getActiveSheet().setName("Tracker");
    var h = [
      "Thread ID", "Client", "Received", "Subject", "Gmail Link",
      "Replied At", "Response Time (hrs)", "Status", "Resolved At", "Requested By",
      "Reopened At", "Reopen Resolution Time (hrs)",         // K, L
      "Resolution Time (hrs)", "Resolved By", "Rates Resolved" // M, N, O
    ];
    sheet.appendRow(h);
    sheet.getRange(1, 1, 1, 15).setFontWeight("bold").setBackground("#0f1e3c").setFontColor("#ffffff");
    sheet.setColumnWidth(4, 300);
    sheet.setFrozenRows(1);
  } else {
    // Auto-migrate existing sheets
    var lastCol  = sheet.getLastColumn();
    var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    if (existing.indexOf("Reopened At") === -1) {
      sheet.getRange(1, 11).setValue("Reopened At")
           .setFontWeight("bold").setBackground("#0f1e3c").setFontColor("#ffffff");
      sheet.getRange(1, 12).setValue("Reopen Resolution Time (hrs)")
           .setFontWeight("bold").setBackground("#0f1e3c").setFontColor("#ffffff");
      Logger.log("Sheet migrated: added Reopened At and Reopen Resolution Time columns.");
    }

    if (existing.indexOf("Resolution Time (hrs)") === -1) {
      sheet.getRange(1, 13).setValue("Resolution Time (hrs)")
           .setFontWeight("bold").setBackground("#0f1e3c").setFontColor("#ffffff");
      sheet.getRange(1, 14).setValue("Resolved By")
           .setFontWeight("bold").setBackground("#0f1e3c").setFontColor("#ffffff");
      sheet.getRange(1, 15).setValue("Rates Resolved")
           .setFontWeight("bold").setBackground("#0f1e3c").setFontColor("#ffffff");
      Logger.log("Sheet migrated: added Resolution Time, Resolved By, Rates Resolved columns.");
    }
  }
  return sheet;
}

function getWebAppUrl() {
  return "https://script.google.com/macros/s/AKfycbyeeXWOmJJE3mgl9hlZyvtBjM7XsNmo95BDQQsx-crPZlefc1oW4JCK328ixMTpJFUk/exec";
}

// Returns the Tracker sheet as a 2D array (header row + data) for the
// authenticated dashboard feed. Display values keep the same formatted
// strings the front-end already knows how to parse. Because this runs as
// the sheet owner, the sheet can be set to "Restricted" (private) in Drive.
function getTrackerRows_() {
  var ss    = SpreadsheetApp.openById('13_1g-Iej0YNbR-6YY2rLoM3-R5uHWpfqdrSh2FLct44');
  var sheet = ss.getSheetByName('Tracker');
  if (!sheet) return [];
  return sheet.getDataRange().getDisplayValues();
}

// ============================================================
// SETUP — run ONCE
// ── morning digest and auto Friday report triggers removed
// ============================================================
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (fn === "runMorningDigest"     ||
        fn === "checkForOverdueEmails" ||
        fn === "syncLabelsToSheet"     ||
        fn === "sendWeeklyReport") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("checkForOverdueEmails").timeBased().everyHours(NUDGE_INTERVAL).create();
  ScriptApp.newTrigger("syncLabelsToSheet").timeBased().everyMinutes(30).create();
  // No morning digest — removed.
  // No auto Friday report — send manually via web app button.

  Logger.log(
    "Done! Nudge every " + NUDGE_INTERVAL + "h, sync every 30 mins. " +
    "Send weekly report manually at: " + getWebAppUrl()
  );
}
