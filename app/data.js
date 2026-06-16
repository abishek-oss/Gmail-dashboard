/* ──────────────────────────────────────────────────────────────
   Mock dataset for the AMZ Prep Pricing Intelligence dashboard.
   Mirrors the live Google Sheet schema exactly:
   client, received, subject, link, replied, responseHrs, status,
   resolvedAt, requestedBy, reopenedAt, reopenResolutionHrs, blairInvolved
   Deterministic (seeded) so the prototype is stable across reloads.
   ────────────────────────────────────────────────────────────── */
(function () {
  /* ── RATES-RESOLUTION DETECTOR (shared with the live feed) ─────────
     A thread is tagged "resolved with rates" when the resolving reply
     comes from one of our pricing leads AND carries either a Google
     Sheets rates link or an Excel sheet. Defined on window so both
     data.js (mock) and live.js (Google Sheet) share one rule.        */
  window.RATES_SENDERS = ['abishek', 'goku', 'omar', 'henna', 'alia'];
  window.isRatesResponse = function (text) {
    if (!text) return false;
    var t = String(text).toLowerCase();
    var sheetLink = t.indexOf('docs.google.com/spreadsheets') !== -1; // Google Sheets rates link
    var excel = /\.xlsx?(?:[\s"'?#)]|$)/.test(t);                     // .xls / .xlsx attachment
    return sheetLink || excel;
  };
  window.isRatesSender = function (name) {
    if (!name) return false;
    var n = String(name).toLowerCase();
    return window.RATES_SENDERS.some(function (s) { return n.indexOf(s) !== -1; });
  };
  window.detectRatesResolution = function (row) {
    if (row.ratesResolved === true) return true;          // explicit flag wins
    if (row.status !== 'resolved') return false;
    if (!window.isRatesSender(row.resolvedBy)) return false;
    return window.isRatesResponse(row.resolutionLinks || row.resolutionBody || '');
  };

  // tiny seeded RNG (mulberry32) → deterministic data
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = rng(20260529);
  var pick = function (arr) { return arr[Math.floor(rand() * arr.length)]; };

  var CLIENTS = [
    'Dupray', 'Nordic Naturals', 'Bloomscape', 'Caraway', 'Olipop',
    'Ridge Wallet', 'Hexclad', 'Magic Spoon', 'Liquid Death', 'Graza',
    'Jolie', 'Flamingo Estate', 'Ghia', 'Vuori', 'Snowe', 'Branch',
    'Maude', 'Cometeer', 'Bearaby', 'Hydrant'
  ];
  var REQUESTERS = [
    'Marcus Webb', 'Priya Nair', 'Sofia Marchetti', 'James Okafor',
    'Hana Kim', 'Diego Ramos', 'Eleanor Pope', 'Tomas Bauer',
    'Aaliyah Hassan', 'Liam Donovan'
  ];
  // pricing leads who close threads (first five trigger the rates tag)
  var RESOLVERS = ['Abishek', 'Goku', 'Omar', 'Henna', 'Alia', 'Blair Forrest', 'Sasha Lin'];
  var TYPES = [
    { suffix: 'Fulfilment', sla: 8 },
    { suffix: 'Shipping', sla: 16 },
    { suffix: 'Combined', sla: 16 },
    { suffix: 'Storage', sla: 8 },
    { suffix: 'Kitting', sla: 8 },
    { suffix: 'Returns', sla: 8 }
  ];

  function statusFromHrs(hrs, sla, replied) {
    if (!replied) return rand() < 0.55 ? 'pending' : 'overdue'; // unreplied → pending or overdue
    if (hrs <= sla) return 'on-time';
    if (hrs <= 24) return 'delayed';
    return 'overdue';
  }

  function fmtDate(d) {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }

  var NOW = new Date('2026-05-29T15:30:00');
  var data = [];
  var N = 46;
  for (var i = 0; i < N; i++) {
    var client = pick(CLIENTS);
    var type = pick(TYPES);
    var requestedBy = pick(REQUESTERS);

    // received: spread over the last ~60 days
    var daysAgo = rand() * 60;
    var received = new Date(NOW.getTime() - daysAgo * 864e5 - rand() * 864e5);

    // ~80% have been replied to
    var hasReply = rand() < 0.8;
    var responseHrs = null, replied = null, status, resolvedAt = '';
    var reopenedAt = '', reopenResolutionHrs = null;
    var resolvedBy = '', resolutionLinks = '';

    if (hasReply) {
      // response time: mostly fast, some long-tail
      var base = Math.pow(rand(), 2.2) * 40 + rand() * 4; // skew toward small
      responseHrs = Math.round(base * 10) / 10;
      replied = fmtDate(new Date(received.getTime() + responseHrs * 36e5));
      status = statusFromHrs(responseHrs, type.sla, true);
      // ~45% of replied are also resolved
      if (rand() < 0.45) {
        status = 'resolved';
        var resHrs = responseHrs + rand() * 120 + 12;
        resolvedAt = fmtDate(new Date(received.getTime() + resHrs * 36e5));
        resolvedBy = pick(RESOLVERS);
        // most resolutions ship a rates sheet (Google Sheets link or Excel)
        if (rand() < 0.62) resolutionLinks = 'https://docs.google.com/spreadsheets/d/1AbC' + i + 'Xyz/edit — Q3 rates';
        else if (rand() < 0.45) resolutionLinks = 'rates-' + client.toLowerCase().replace(/\s+/g, '-') + '.xlsx';
        // a few reopened threads
        if (rand() < 0.18) {
          reopenedAt = fmtDate(new Date(received.getTime() + (resHrs + 24) * 36e5));
          reopenResolutionHrs = Math.round((rand() * 30 + 2) * 10) / 10;
          status = rand() < 0.5 ? 'delayed' : 'pending'; // reopened → no longer resolved
        }
      }
    } else {
      status = statusFromHrs(null, type.sla, false);
    }

    // time from first response → resolved
    var resolutionHrs = null;
    if (replied && resolvedAt) {
      var rd = new Date(replied), sd = new Date(resolvedAt);
      if (!isNaN(rd) && !isNaN(sd) && sd >= rd) resolutionHrs = Math.round((sd - rd) / 36e5 * 10) / 10;
    }

    var row = {
      client: client,
      received: fmtDate(received),
      subject: 'Pricing Request - ' + type.suffix + ' — ' + client,
      link: 'https://mail.google.com/mail/u/0/#search/' + encodeURIComponent(client),
      replied: replied,
      responseHrs: responseHrs,
      resolutionHrs: resolutionHrs,
      status: status,
      resolvedAt: resolvedAt,
      resolvedBy: resolvedBy,
      resolutionLinks: resolutionLinks,
      requestedBy: requestedBy,
      requesterEmail: requestedBy.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com',
      reopenedAt: reopenedAt,
      reopenResolutionHrs: reopenResolutionHrs,
      blairInvolved: rand() < 0.3, // ~30% need Blair's intervention
      _sla: type.sla
    };
    row.ratesResolved = window.detectRatesResolution(row);
    data.push(row);
  }

  // sort newest first by received
  data.sort(function (a, b) { return new Date(b.received) - new Date(a.received); });

  window.MOCK_DATA = data;

  // shared constants (match original dashboard)
  window.STATUS_COLORS = {
    'on-time': '#22c55e',
    'delayed': '#f59e0b',
    'overdue': '#f43f5e',
    'pending': '#60a5fa',
    'resolved': '#2dd4bf'
  };
  window.STATUS_GLOW = {
    'on-time': 'rgba(34,197,94,0.55)',
    'delayed': 'rgba(245,158,11,0.55)',
    'overdue': 'rgba(244,63,94,0.6)',
    'pending': 'rgba(96,165,250,0.55)',
    'resolved': 'rgba(45,212,191,0.55)'
  };
  window.STATUS_LABELS = {
    'on-time': 'On Time', 'delayed': 'Delayed', 'overdue': 'Overdue',
    'pending': 'Pending', 'resolved': 'Resolved'
  };
})();
