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
      boxShadow: '0 16px 50px rgba(0,0,0,0.6), 0 0 30px rgba(139,92,246,0.3)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', gap: 9
    }} className="mount-in">
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
      {toast}
    </div>
  ) : null;
  return [node, show];
}

/* ── APP ───────────────────────────────────────────────────────── */
const REFRESH_SECONDS = 300; // 5-minute live poll, matches the original dashboard

function App() {
  const [user, setUser] = useS(null);            // {email,name,photo} | null
  const [demo, setDemo] = useS(false);
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
    const cols = ['client', 'received', 'replied', 'responseHrs', 'status', 'requestedBy', 'blairInvolved'];
    const csv = [cols.join(',')].concat(filtered.map(r =>
      cols.map(c => '"' + (r[c] == null ? '' : String(r[c]).replace(/"/g, '""')) + '"').join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'pricing-requests.csv'; a.click();
    toast('Exported ' + filtered.length + ' rows to CSV');
  };

  const doReport = () => {
    if (demo) { toast('Demo mode — weekly report not sent'); return; }
    if (!window.confirm("Send previous week's pricing report to abishek, goku, blair & imtiaz?")) return;
    window.LiveData.sendWeekly()
      .then(() => toast('✅ Weekly report sent'))
      .catch(() => toast('⚠ Could not trigger weekly report'));
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
    { id: 'blair', icon: 'star', tip: 'Blair Forrest' },
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
              <div style={{ width: 34, height: 34, margin: '0 auto 18px', border: '3px solid rgba(47,107,255,0.2)', borderTopColor: 'var(--violet)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
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
                <div className="edge-glow" style={{ '--ring': 'rgba(139,92,246,0.3)' }} />
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
          {tab === 'blair' && <BlairTab rows={filtered} />}
          </>
          )}
        </div>
      </main>
      {toastNode}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
