/* ══════════════════════════════════════════════════════════════
   App shell — login, sidebar, topbar, filters, refresh, export
   ══════════════════════════════════════════════════════════════ */
const { useState: useS, useEffect: useE, useMemo: useM, useRef: useR } = React;

/* ── PARALLAX COSMOS BACKDROP ──────────────────────────────────── */
function Cosmos() {
  const s1 = useR(null), s2 = useR(null);
  useE(() => {
    let raf = 0;
    const onMove = (e) => {
      const x = (e.clientX / window.innerWidth - 0.5);
      const y = (e.clientY / window.innerHeight - 0.5);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (s1.current) s1.current.style.transform = `translate(${x * -22}px, ${y * -22}px)`;
        if (s2.current) s2.current.style.transform = `translate(${x * -42}px, ${y * -42}px)`;
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="cosmos">
      <div className="stars s1" ref={s1} />
      <div className="stars s2" ref={s2} />
      <div className="grid" />
      <div className="vignette" />
    </div>
  );
}

/* ── LOGIN SCREEN ──────────────────────────────────────────────── */
function Login({ onSignIn, onDemo, error }) {
  const ref = useR(null);
  const onMove = (e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--ry', ((px - 0.5) * 14).toFixed(2) + 'deg');
    el.style.setProperty('--rx', (-(py - 0.5) * 14).toFixed(2) + 'deg');
    el.style.setProperty('--lift', '20px');
    el.style.setProperty('--mx', (px * 100) + '%'); el.style.setProperty('--my', (py * 100) + '%');
  };
  const reset = () => { const el = ref.current; if (!el) return;
    el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); el.style.setProperty('--lift', '0px'); };
  return (
    <div className="login-stage">
      <div ref={ref} className="login-card tilt mount-in" onMouseMove={onMove} onMouseLeave={reset}>
        <div className="edge-glow" /><div className="sheen" />
        <div className="login-logo"><img src="assets/amzprep_logo.jpeg" alt="AMZ Prep" /></div>
        <div className="login-title">Pricing Intelligence</div>
        <div className="login-sub">AMZ Prep · Request Tracker<br />Sign in with your authorized Google account</div>
        <button className="btn-google" onClick={onSignIn}>
          <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
          Sign in with Google
        </button>
        {error && <div style={{ color: 'var(--red)', fontSize: 11, fontFamily: 'var(--mono)', marginTop: 14, lineHeight: 1.5 }}>{error}</div>}
        <div className="login-foot">🔒 Restricted to amzprep.com accounts</div>
        <button onClick={onDemo} style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>Preview with sample data</button>
      </div>
    </div>
  );
}

/* ── TOAST ─────────────────────────────────────────────────────── */
function useToast() {
  const [toast, setToast] = useS(null);
  const show = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };
  const node = toast ? (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 600,
      background: 'var(--glass-hi)', border: '1px solid var(--edge-2)', color: 'var(--text)',
      padding: '12px 22px', borderRadius: 12, fontSize: 13, fontFamily: 'var(--font)',
      boxShadow: '0 16px 50px rgba(0,0,0,0.6), 0 0 30px rgba(225,255,125,0.18)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', gap: 9
    }} className="mount-in">
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
      {toast}
    </div>
  ) : null;
  return [node, show];
}

/* ── WEEKLY REPORT HTML GENERATOR ─────────────────────────────── */
function generateWeeklyReportHTML(rows, weekLabel) {
  const total = rows.length;
  const replied = rows.filter(r => r.responseHrs != null);
  const avg = replied.length ? replied.reduce((s, r) => s + r.responseHrs, 0) / replied.length : 0;
  const onTime = rows.filter(r => r.status === 'on-time' || r.status === 'resolved').length;
  const sla = total ? Math.round((onTime / total) * 100) : 0;
  const pending = rows.filter(r => r.status === 'pending').length;
  const overdue = rows.filter(r => r.status === 'overdue').length;
  const counts = { 'on-time': 0, delayed: 0, overdue: 0, pending: 0, resolved: 0 };
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });

  const fmtH = v => v == null ? '—' : v < 1 ? Math.round(v * 60) + 'm' : v.toFixed(1) + 'h';
  const maxCount = Math.max(...Object.values(counts), 1);

  const SCOL = { 'on-time': '#22c55e', delayed: '#f59e0b', overdue: '#f43f5e', pending: '#38bdf8', resolved: '#2dd4bf' };
  const SBG  = { 'on-time': '#061510', delayed: '#130f06', overdue: '#130509', pending: '#051422', resolved: '#051614' };
  const SLBL = { 'on-time': 'On Time', delayed: 'Delayed', overdue: 'Overdue', pending: 'Pending', resolved: 'Resolved' };

  const breakdownRows = ['resolved', 'on-time', 'pending', 'delayed', 'overdue']
    .filter(k => counts[k] > 0)
    .map(k => {
      const pct = Math.round(counts[k] / maxCount * 100);
      return `<tr>
        <td width="80" style="padding:5px 12px 5px 0;font-size:11px;color:#8ea2cc;font-family:monospace;text-align:right;white-space:nowrap;">${SLBL[k]}</td>
        <td style="padding:5px 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="${pct}%" style="background:${SCOL[k]};height:22px;border-radius:4px 0 0 4px;"></td>
            <td style="background:#0a1430;height:22px;border-radius:0 4px 4px 0;"></td>
          </tr></table>
        </td>
        <td width="38" style="padding:5px 0 5px 12px;font-size:13px;font-weight:700;color:${SCOL[k]};font-family:monospace;text-align:right;">${counts[k]}</td>
      </tr>`;
    }).join('');

  const requestRows = rows.map(r => `<tr>
    <td style="padding:11px 16px;font-size:12px;color:#eaf1ff;font-weight:500;border-bottom:1px solid #0e1936;">${r.client || '—'}</td>
    <td style="padding:11px 16px;font-size:11px;color:#8ea2cc;font-family:monospace;border-bottom:1px solid #0e1936;white-space:nowrap;">${r.received || '—'}</td>
    <td style="padding:11px 16px;font-size:11px;color:${r.responseHrs == null ? '#4f617f' : '#eaf1ff'};font-family:monospace;border-bottom:1px solid #0e1936;">${fmtH(r.responseHrs)}</td>
    <td style="padding:11px 16px;border-bottom:1px solid #0e1936;"><span style="display:inline-block;font-size:10px;font-family:monospace;font-weight:600;padding:4px 10px;border-radius:999px;background:${SBG[r.status]};color:${SCOL[r.status]};border:1px solid ${SCOL[r.status]}55;white-space:nowrap;">${SLBL[r.status] || r.status}</span></td>
    <td style="padding:11px 16px;font-size:12px;color:#8ea2cc;border-bottom:1px solid #0e1936;">${r.requestedBy || '—'}</td>
  </tr>`).join('');

  const stats = [
    { col: '#38bdf8', border: '#0a2030', label: 'TOTAL REQUESTS', value: String(total),        sub: replied.length + ' replied · ' + (total - replied.length) + ' awaiting' },
    { col: '#f59e0b', border: '#26180a', label: 'AVG RESPONSE',   value: fmtH(avg),             sub: 'across replied threads' },
    { col: '#22c55e', border: '#0a2015', label: 'SLA HIT RATE',   value: sla + '%',             sub: 'on-time + resolved' },
    { col: '#f43f5e', border: '#260810', label: 'NEEDS ACTION',   value: String(pending + overdue), sub: pending + ' pending · ' + overdue + ' overdue' },
  ];

  const statCards = stats.map(s => `
    <td width="25%" style="padding:0 6px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${s.border};border-radius:14px;overflow:hidden;">
        <tr><td style="background:${s.col};height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="background:#0a1430;padding:18px 16px;">
          <div style="font-size:9px;font-family:monospace;color:#4f617f;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:10px;">${s.label}</div>
          <div style="font-size:30px;font-weight:800;color:${s.col};letter-spacing:-0.04em;line-height:1;">${s.value}</div>
          <div style="font-size:10px;color:#4f617f;margin-top:8px;font-family:monospace;line-height:1.5;">${s.sub}</div>
        </td></tr>
      </table>
    </td>`).join('');

  const generated = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>AMZ Prep · Weekly Pricing Report · ${weekLabel}</title>
</head>
<body style="margin:0;padding:0;background:#04081c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;">
<div style="max-width:700px;margin:0 auto;padding:28px 16px 56px;">

  <!-- HEADER -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #1c2a55;border-radius:16px;overflow:hidden;">
    <tr><td style="background:linear-gradient(90deg,#E1FF7D,#b8d94f);height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr>
      <td style="background:#060b24;padding:28px 32px 26px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td>
            <div style="font-size:21px;font-weight:800;color:#eaf1ff;letter-spacing:-0.03em;">AMZ Prep · Pricing Intelligence</div>
            <div style="font-size:11px;color:#8ea2cc;margin-top:7px;font-family:monospace;letter-spacing:0.06em;">WEEKLY REPORT &nbsp;·&nbsp; ${weekLabel.toUpperCase()}</div>
          </td>
          <td style="text-align:right;vertical-align:middle;">
            <span style="display:inline-block;font-size:9px;font-family:monospace;letter-spacing:0.1em;padding:5px 13px;border-radius:999px;background:rgba(225,255,125,0.12);color:#E1FF7D;border:1px solid rgba(225,255,125,0.35);">● LIVE DATA</span>
          </td>
        </tr></table>
      </td>
    </tr>
  </table>

  <!-- STAT CARDS -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 -6px 20px;">
    <tr>${statCards}</tr>
  </table>

  <!-- STATUS BREAKDOWN -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060b24;border:1px solid #1c2a55;border-radius:14px;margin-bottom:20px;">
    <tr>
      <td style="padding:20px 24px 18px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr>
          <td style="font-size:13px;font-weight:600;color:#eaf1ff;">Status Breakdown</td>
          <td style="text-align:right;font-size:10px;font-family:monospace;color:#4f617f;letter-spacing:0.05em;">${total} REQUESTS</td>
        </tr></table>
        <table width="100%" cellpadding="0" cellspacing="0">${breakdownRows}</table>
      </td>
    </tr>
  </table>

  <!-- REQUEST LOG -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060b24;border:1px solid #1c2a55;border-radius:14px;margin-bottom:24px;">
    <tr>
      <td style="padding:18px 22px 14px;border-bottom:1px solid #101c40;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:13px;font-weight:600;color:#eaf1ff;">Request Log</td>
          <td style="text-align:right;font-size:10px;font-family:monospace;color:#4f617f;letter-spacing:0.05em;">${rows.length} ENTRIES</td>
        </tr></table>
      </td>
    </tr>
    <tr>
      <td>
        <table width="100%" cellpadding="0" cellspacing="0">
          <thead><tr style="background:#02040a;">
            <th style="padding:10px 16px;text-align:left;font-size:9px;font-family:monospace;color:#4f617f;text-transform:uppercase;letter-spacing:0.1em;font-weight:500;border-bottom:1px solid #101c40;">Client</th>
            <th style="padding:10px 16px;text-align:left;font-size:9px;font-family:monospace;color:#4f617f;text-transform:uppercase;letter-spacing:0.1em;font-weight:500;border-bottom:1px solid #101c40;">Received</th>
            <th style="padding:10px 16px;text-align:left;font-size:9px;font-family:monospace;color:#4f617f;text-transform:uppercase;letter-spacing:0.1em;font-weight:500;border-bottom:1px solid #101c40;">Response</th>
            <th style="padding:10px 16px;text-align:left;font-size:9px;font-family:monospace;color:#4f617f;text-transform:uppercase;letter-spacing:0.1em;font-weight:500;border-bottom:1px solid #101c40;">Status</th>
            <th style="padding:10px 16px;text-align:left;font-size:9px;font-family:monospace;color:#4f617f;text-transform:uppercase;letter-spacing:0.1em;font-weight:500;border-bottom:1px solid #101c40;">Requested By</th>
          </tr></thead>
          <tbody>${requestRows}</tbody>
        </table>
      </td>
    </tr>
  </table>

  <!-- FOOTER -->
  <div style="text-align:center;font-size:9px;font-family:monospace;color:#2d3d52;letter-spacing:0.08em;margin-top:8px;">
    GENERATED ${generated} &nbsp;·&nbsp; AMZ PREP PRICING INTELLIGENCE
  </div>

</div>
</body>
</html>`;
}

/* ── APP ───────────────────────────────────────────────────────── */
const REFRESH_SECONDS = 300; // 5-minute live poll, matches the original dashboard

function App() {
  const [user, setUser] = useS(null);            // {email,name,photo} | null
  const [demo, setDemo] = useS(new URLSearchParams(location.search).has('demo'));
  const [authError, setAuthError] = useS('');
  const [tab, setTab] = useS('overview');
  const [statusFilter, setStatusFilter] = useS('all');
  const [refreshKey, setRefreshKey] = useS(0);     // bump to re-trigger count-ups
  const [countdown, setCountdown] = useS(REFRESH_SECONDS);
  const [toastNode, toast] = useToast();

  // live data state
  const [rows, setRows] = useS([]);
  const [loading, setLoading] = useS(false);
  const [dataError, setDataError] = useS('');

  // filters
  const [client, setClient] = useS('');
  const [requester, setRequester] = useS('');
  const [from, setFrom] = useS('');
  const [to, setTo] = useS('');

  const signedIn = !!user || demo;
  const allData = rows;

  // ── wire Firebase auth on mount ──────────────────────────────
  useE(() => {
    if (!window.LiveAuth) return;
    window.LiveAuth.init((u, err) => {
      if (u) { setUser(u); setDemo(false); setAuthError(''); }
      else { setUser(null); if (err) setAuthError(err); }
    });
  }, []);

  // ── load data whenever we become signed in ───────────────────
  const loadData = React.useCallback(async () => {
    if (demo) { setRows(window.MOCK_DATA); setRefreshKey(k => k + 1); setCountdown(REFRESH_SECONDS); return; }
    if (!window.LiveData) return;
    setLoading(true); setDataError('');
    try {
      const data = await window.LiveData.load();
      setRows(data);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setDataError(e.message || 'Could not load live data.');
      if (rows.length === 0) setRows(window.MOCK_DATA); // keep UI populated
    } finally {
      setLoading(false);
      setCountdown(REFRESH_SECONDS);
    }
  }, [demo, rows.length]);

  useE(() => {
    if (signedIn) loadData();
    // eslint-disable-next-line
  }, [signedIn, demo]);

  // auto-refresh countdown (mirrors the live dashboard's 5-min poll)
  useE(() => {
    if (!signedIn) return;
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { loadData(); return REFRESH_SECONDS; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [signedIn, loadData]);

  const clients = useM(() => [...new Set(allData.map(r => r.client))].sort(), [allData]);
  const requesters = useM(() => [...new Set(allData.map(r => r.requestedBy))].sort(), [allData]);

  const filtered = useM(() => allData.filter(r => {
    if (client && r.client !== client) return false;
    if (requester && r.requestedBy !== requester) return false;
    if (from && r.received.slice(0, 10) < from) return false;
    if (to && r.received.slice(0, 10) > to) return false;
    return true;
  }), [allData, client, requester, from, to]);

  const hasFilter = client || requester || from || to;
  const clearFilters = () => { setClient(''); setRequester(''); setFrom(''); setTo(''); };

  const doRefresh = () => { loadData(); toast('Syncing from Google Sheets…'); };

  const doExport = () => {
    const cols = ['client', 'received', 'replied', 'responseHrs', 'status', 'requestedBy'];
    const csv = [cols.join(',')].concat(filtered.map(r =>
      cols.map(c => '"' + (r[c] == null ? '' : String(r[c]).replace(/"/g, '""')) + '"').join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'pricing-requests.csv'; a.click();
    toast('Exported ' + filtered.length + ' rows to CSV');
  };

  const doReport = () => {
    // Determine previous week Mon–Sun
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun…6=Sat
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(now); thisMonday.setDate(now.getDate() - daysSinceMonday); thisMonday.setHours(0,0,0,0);
    const prevMonday = new Date(thisMonday); prevMonday.setDate(thisMonday.getDate() - 7);
    const prevSunday = new Date(thisMonday); prevSunday.setDate(thisMonday.getDate() - 1); prevSunday.setHours(23,59,59,999);

    const fmt = d => d.toISOString().slice(0, 10);
    const weekStart = fmt(prevMonday);
    const weekEnd   = fmt(prevSunday);
    const weekLabel = weekStart + ' → ' + weekEnd;

    const weekRows = allData.filter(r => {
      const d = r.received ? r.received.slice(0, 10) : '';
      return d >= weekStart && d <= weekEnd;
    });

    if (weekRows.length === 0 && !window.confirm('No requests found for ' + weekLabel + '. Generate empty report anyway?')) return;

    const html = generateWeeklyReportHTML(weekRows, weekLabel);
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pricing-report-' + weekStart + '.html';
    a.click();
    toast('Report downloaded — ' + weekRows.length + ' requests for ' + weekLabel);
  };

  const signOut = () => {
    if (window.LiveAuth) window.LiveAuth.signOut();
    setUser(null); setDemo(false); setRows([]); setTab('overview'); clearFilters();
  };

  const startSignIn = () => {
    setAuthError('');
    if (!window.LiveAuth) { setAuthError('Auth unavailable.'); return; }
    window.LiveAuth.signIn().catch(e => setAuthError(e.message || 'Sign-in failed.'));
  };

  if (!signedIn) return (<><Cosmos /><Login onSignIn={startSignIn} onDemo={() => setDemo(true)} error={authError} /></>);

  const navItems = [
    { id: 'overview', icon: 'grid', tip: 'Overview' },
    { id: 'requester', icon: 'users', tip: 'By Requester' },
  ];

  return (
    <>
      <Cosmos />
      {/* SIDEBAR */}
      <nav className="sidebar">
        <div className="sidebar-logo"><img src="assets/amzprep_logo.jpeg" alt="AMZ Prep" /></div>
        {navItems.map(n => (
          <button key={n.id} className={'nav-btn' + (tab === n.id ? ' active' : '')}
            data-tip={n.tip} onClick={() => { setTab(n.id); }}>
            <Icon name={n.icon} />
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="sidebar-sep" />
          <button className="nav-btn" data-tip="Refresh" onClick={doRefresh}><Icon name="refresh" /></button>
          <button className="nav-btn" data-tip="Sign out" onClick={signOut}><Icon name="logout" /></button>
        </div>
      </nav>

      {/* TOPBAR */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">Pricing Intelligence</span>
          <span className="live-pill"><span className="live-dot" />LIVE</span>
          <span className="refresh-ind">{loading ? '↻ syncing…' : '↻ refresh in ' + (countdown >= 60 ? Math.floor(countdown / 60) + 'm' : countdown + 's')}</span>
        </div>
        <div className="topbar-right">
          <button className="btn blue" onClick={doExport}><Icon name="download" />Export</button>
          <button className="btn green" onClick={doReport}><Icon name="report" />Weekly Report</button>
          <div className="user-info">
            {user && user.photo
              ? <img className="user-avatar" src={user.photo} alt="" referrerPolicy="no-referrer" style={{ objectFit: 'cover' }} />
              : <div className="user-avatar">{(user ? user.name : 'Demo').charAt(0).toUpperCase()}</div>}
            <span className="user-name">{user ? user.email : 'sample data'}</span>
          </div>
          <button className="btn-signout-sm" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {/* SHELL */}
      <main className="shell">
        <div className="stage" key={tab + '-' + refreshKey}>
          {dataError && (
            <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: 'var(--red)', padding: '11px 16px', borderRadius: 11, fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 18, lineHeight: 1.5 }}>
              ⚠ {dataError}{' '}<span style={{ color: 'var(--text-3)' }}>Showing sample data as a fallback.</span>
            </div>
          )}
          {loading && allData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '90px 0', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 13 }}>
              <div style={{ width: 34, height: 34, margin: '0 auto 18px', border: '3px solid rgba(225,255,125,0.18)', borderTopColor: 'var(--lime)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Syncing from Google Sheets…
            </div>
          ) : (
          <>
          {tab === 'overview' && (
            <>
              <div className="page-header">
                <div className="page-title">Overview</div>
                <div className="page-sub">Showing <b>{filtered.length}</b> of {allData.length} pricing requests{hasFilter ? ' · filtered' : ''}</div>
              </div>
              {/* FILTERS */}
              <div className="filters">
                <div className="edge-glow" style={{ '--ring': 'rgba(225,255,125,0.3)' }} />
                <div className="fgroup">
                  <label className="flabel">Client</label>
                  <select className="finput" value={client} onChange={e => setClient(e.target.value)}>
                    <option value="">All clients</option>
                    {clients.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="fgroup">
                  <label className="flabel">Requested By</label>
                  <select className="finput" value={requester} onChange={e => setRequester(e.target.value)}>
                    <option value="">All requesters</option>
                    {requesters.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="fgroup">
                  <label className="flabel">From</label>
                  <input type="date" className="finput" value={from} onChange={e => setFrom(e.target.value)} style={{ minWidth: 130 }} />
                </div>
                <span className="fsep">→</span>
                <div className="fgroup">
                  <label className="flabel">To</label>
                  <input type="date" className="finput" value={to} onChange={e => setTo(e.target.value)} style={{ minWidth: 130 }} />
                </div>
                {hasFilter && <button className="btn-clear" onClick={clearFilters}>Clear filters</button>}
              </div>
              <OverviewTab rows={filtered} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
            </>
          )}
          {tab === 'requester' && <RequesterTab rows={filtered} />}
          </>
          )}
        </div>
      </main>
      {toastNode}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
