/* ══════════════════════════════════════════════════════════════
   Views — Overview, By Requester
   ══════════════════════════════════════════════════════════════ */
const { useState: useStateV, useMemo: useMemoV } = React;

/* ── METRIC COMPUTATION ────────────────────────────────────────── */
function computeMetrics(rows) {
  const total = rows.length;
  const replied = rows.filter(r => r.responseHrs != null);
  const avg = replied.length
    ? replied.reduce((s, r) => s + r.responseHrs, 0) / replied.length : 0;
  const onTime = rows.filter(r => r.status === 'on-time' || r.status === 'resolved').length;
  const sla = total ? (onTime / total) * 100 : 0;
  const pending = rows.filter(r => r.status === 'pending').length;
  const overdue = rows.filter(r => r.status === 'overdue').length;
  const counts = { 'on-time': 0, delayed: 0, overdue: 0, pending: 0, resolved: 0 };
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  return { total, avg, sla, pending, overdue, counts, replied: replied.length };
}

/* ── STAT CARD ─────────────────────────────────────────────────── */
function StatCard({ kind, icon, label, value, decimals, suffix, sub, delta, deltaDir }) {
  return (
    <Tilt className={'stat-card ' + kind} max={11} lift={30}>
      <div className="accent-bar" />
      <div className="stat-icon"><Icon name={icon} /></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        <CountUp value={value} decimals={decimals} suffix={suffix || ''} />
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
      {delta != null && (
        <div className={'stat-delta ' + (deltaDir === 'down' ? 'down' : 'up')}>
          <Icon name={deltaDir === 'down' ? 'down' : 'up'} style={{ width: 11, height: 11 }} />
          {delta}
        </div>
      )}
    </Tilt>
  );
}

/* ── OVERVIEW TAB ──────────────────────────────────────────────── */
function OverviewTab({ rows, statusFilter, setStatusFilter }) {
  const m = useMemoV(() => computeMetrics(rows), [rows]);
  const [sortCol, setSortCol] = useStateV('received');
  const [sortDir, setSortDir] = useStateV(-1);

  // status breakdown bars
  const maxCount = Math.max(...Object.values(m.counts), 1);
  const order = ['resolved', 'on-time', 'pending', 'delayed', 'overdue'];

  // response time by client (top 7 by volume)
  const byClient = useMemoV(() => {
    const map = {};
    rows.forEach(r => {
      if (r.responseHrs == null) return;
      (map[r.client] = map[r.client] || []).push(r.responseHrs);
    });
    return Object.entries(map)
      .map(([client, arr]) => ({ client, avg: arr.reduce((a, b) => a + b, 0) / arr.length, n: arr.length }))
      .sort((a, b) => b.n - a.n).slice(0, 7);
  }, [rows]);
  const maxClientAvg = Math.max(...byClient.map(c => c.avg), 1);

  const donutSegs = order.map(k => ({
    label: window.STATUS_LABELS[k], value: m.counts[k], color: window.STATUS_COLORS[k]
  })).filter(s => s.value > 0);

  // table rows: filter by status then sort
  const tableRows = useMemoV(() => {
    const filtered = statusFilter === 'all' ? rows : rows.filter(r => r.status === statusFilter);
    const nl = sortDir === -1 ? Infinity : -Infinity;
    const ts = v => { const t = v ? new Date(v).getTime() : NaN; return isNaN(t) ? nl : t; };
    return [...filtered].sort((a, b) => {
      let av, bv;
      if      (sortCol === 'client')    { av = (a.client || '').toLowerCase();      bv = (b.client || '').toLowerCase(); }
      else if (sortCol === 'received')  { av = ts(a.received);                      bv = ts(b.received); }
      else if (sortCol === 'response')  { av = a.responseHrs ?? nl;                 bv = b.responseHrs ?? nl; }
      else if (sortCol === 'resolution'){ av = a.resolutionHrs ?? nl;               bv = b.resolutionHrs ?? nl; }
      else if (sortCol === 'status')    { av = a.status || '';                      bv = b.status || ''; }
      else if (sortCol === 'requester') { av = (a.requestedBy || '').toLowerCase(); bv = (b.requestedBy || '').toLowerCase(); }
      else if (sortCol === 'resolved')  { av = ts(a.resolvedAt);                    bv = ts(b.resolvedAt); }
      else                              { av = ts(a.received);                      bv = ts(b.received); }
      return av < bv ? sortDir : av > bv ? -sortDir : 0;
    });
  }, [rows, statusFilter, sortCol, sortDir]);

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => -d);
    else { setSortCol(col); setSortDir(-1); }
  };
  const si = col => sortCol === col ? (sortDir === -1 ? ' ↓' : ' ↑') : ' ↕';
  const thStyle = { cursor: 'pointer', userSelect: 'none' };

  const sfil = (key, label) => (
    <button className={'sfil' + (statusFilter === key ? ' active' : '')}
      onClick={() => setStatusFilter(key)}>{label}</button>
  );

  return (
    <>
      <div className="stats-grid stagger">
        <StatCard kind="primary" icon="inbox" label="Total Requests" value={m.total}
          sub={m.replied + ' replied · ' + (m.total - m.replied) + ' awaiting'} delta="+12% vs last mo" deltaDir="up" />
        <StatCard kind="warning" icon="clock" label="Avg Response" value={m.avg} decimals={1} suffix="h"
          sub="across replied threads" delta="−1.4h faster" deltaDir="up" />
        <StatCard kind="success" icon="check" label="SLA Hit Rate" value={m.sla} decimals={0} suffix="%"
          sub="on-time + resolved" delta="+4 pts" deltaDir="up" />
        <StatCard kind="danger" icon="alert" label="Needs Action" value={m.pending + m.overdue}
          sub={m.pending + ' pending · ' + m.overdue + ' overdue'} delta={m.overdue + ' overdue'} deltaDir="down" />
      </div>

      <div className="panels-grid">
        <Tilt className="panel" max={6} lift={18}>
          <div className="panel-head">
            <div className="panel-title">Status Breakdown</div>
            <div className="panel-meta">{m.total} REQUESTS</div>
          </div>
          {order.map(k => m.counts[k] > 0 && (
            <div className="bar-row" key={k}>
              <div className="bar-label">{window.STATUS_LABELS[k]}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{
                  width: (m.counts[k] / maxCount * 100) + '%',
                  background: window.STATUS_COLORS[k],
                  '--bar-glow': window.STATUS_GLOW[k]
                }} />
              </div>
              <div className="bar-val" style={{ color: window.STATUS_COLORS[k] }}>{m.counts[k]}</div>
            </div>
          ))}
        </Tilt>

        <Tilt className="panel" max={6} lift={18}>
          <div className="panel-head">
            <div className="panel-title">Resolution Mix</div>
            <div className="panel-meta">LIVE</div>
          </div>
          <Donut segments={donutSegs}
            centerBig={<CountUp value={m.sla} decimals={0} suffix="%" />}
            centerSmall="SLA RATE" animate={rows.length} />
        </Tilt>
      </div>

      <Tilt className="panel" max={5} lift={16} style={{ marginBottom: 22 }}>
        <div className="panel-head">
          <div className="panel-title">Response Time by Client</div>
          <div className="panel-meta">TOP {byClient.length} BY VOLUME</div>
        </div>
        {byClient.map(c => {
          const col = c.avg <= 8 ? window.STATUS_COLORS['on-time']
            : c.avg <= 16 ? window.STATUS_COLORS['delayed'] : window.STATUS_COLORS['overdue'];
          return (
            <div className="client-row" key={c.client}>
              <div className="client-name">{c.client}</div>
              <div className="client-track">
                <div className="client-fill" style={{
                  width: (c.avg / maxClientAvg * 100) + '%',
                  background: col, boxShadow: '0 0 12px ' + col + '99'
                }} />
              </div>
              <div className="client-val" style={{ color: col }}>{fmtHrs(c.avg)}</div>
            </div>
          );
        })}
      </Tilt>

      {/* TABLE — full list, no scroll cap, sortable headers */}
      <div className="table-panel">
        <div className="edge-glow" />
        <div className="table-head">
          <div className="panel-title">Request Log</div>
          <div className="status-filters">
            {sfil('all', 'All (' + rows.length + ')')}
            {sfil('on-time', 'On Time (' + m.counts['on-time'] + ')')}
            {sfil('resolved', 'Resolved (' + m.counts['resolved'] + ')')}
            {sfil('pending', 'Pending (' + m.counts['pending'] + ')')}
            {sfil('delayed', 'Delayed (' + m.counts['delayed'] + ')')}
            {sfil('overdue', 'Overdue (' + m.counts['overdue'] + ')')}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style={thStyle} onClick={() => toggleSort('client')}>Client{si('client')}</th>
              <th style={thStyle} onClick={() => toggleSort('received')}>Received{si('received')}</th>
              <th style={thStyle} onClick={() => toggleSort('response')}>First Response{si('response')}</th>
              <th style={thStyle} onClick={() => toggleSort('resolution')}>Resolution{si('resolution')}</th>
              <th style={thStyle} onClick={() => toggleSort('status')}>Status{si('status')}</th>
              <th style={thStyle} onClick={() => toggleSort('requester')}>Requested By{si('requester')}</th>
              <th style={thStyle} onClick={() => toggleSort('resolved')}>Resolved{si('resolved')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r, i) => (
              <tr key={i}>
                <td className="td-client">{r.client}</td>
                <td className="td-mono">{r.received}</td>
                <td className="td-mono" style={{ color: r.responseHrs == null ? 'var(--text-3)' : 'var(--text)' }}>{fmtHrs(r.responseHrs)}</td>
                <td className="td-mono" style={{ color: r.resolutionHrs == null ? 'var(--text-3)' : 'var(--text)' }}>
                  {fmtHrs(r.resolutionHrs)}
                  {r.ratesResolved && <span className="rates-tag" title={'Resolved with a rates sheet' + (r.resolvedBy ? ' from ' + r.resolvedBy : '')}>Rates</span>}
                </td>
                <td><StatusChip status={r.status} /></td>
                <td>{r.requestedBy}</td>
                <td className="td-mono" style={{ color: r.resolvedAt ? 'var(--text)' : 'var(--text-3)' }}>{r.resolvedAt || '—'}</td>
                <td><a className="link-icon" href={r.link} target="_blank" rel="noopener" title="Open in Gmail"><Icon name="ext" /></a></td>
              </tr>
            ))}
            {tableRows.length === 0 && (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>No requests match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── BY REQUESTER TAB ──────────────────────────────────────────── */
function RequesterTab({ rows, onToast }) {
  const [selected, setSelected] = useStateV(null);

  const groups = useMemoV(() => {
    const map = {};
    rows.forEach(r => { (map[r.requestedBy] = map[r.requestedBy] || []).push(r); });
    return Object.entries(map).map(([name, list]) => {
      const m = computeMetrics(list);
      const hrs = list.filter(r => r.responseHrs != null).map(r => r.responseHrs);
      const fastest = hrs.length ? Math.min(...hrs) : null;
      const slowest = hrs.length ? Math.max(...hrs) : null;
      return { name, list, total: m.total, avg: m.avg, sla: m.sla, fastest, slowest, counts: m.counts };
    }).sort((a, b) => b.total - a.total);
  }, [rows]);

  if (selected) {
    const g = groups.find(x => x.name === selected);
    if (g) return <RequesterDetail group={g} onBack={() => setSelected(null)} onToast={onToast} />;
  }

  const slaColor = sla => sla >= 80 ? 'var(--green)' : sla >= 50 ? 'var(--amber)' : 'var(--red)';
  const pill = (color, bg, border, label) => (
    <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color, background: bg, padding: '3px 8px', borderRadius: 999, border: '1px solid ' + border }}>{label}</span>
  );

  return (
    <>
      <div className="page-header">
        <div className="page-title">Requests by Requester</div>
        <div className="page-sub"><b>{groups.length}</b> team members · click a card to drill in</div>
      </div>
      <div className="req-grid stagger">
        {groups.map(g => (
          <Tilt key={g.name} className="req-card" max={12} lift={28} onClick={() => setSelected(g.name)}>
            <div className="edge-glow" />
            <div className="req-top">
              <div className="req-avatar">{initials(g.name)}</div>
              <div>
                <div className="req-name">{g.name}</div>
                <div className="req-role">{g.total} requests</div>
              </div>
            </div>
            <div className="req-stats" style={{ marginBottom: 14 }}>
              <div className="req-stat">
                <div className="v" style={{ color: 'var(--blue)' }}>{g.total}</div>
                <div className="l">Total</div>
              </div>
              <div className="req-stat">
                <div className="v" style={{ color: 'var(--amber)' }}>{g.avg ? fmtHrs(g.avg) : '—'}</div>
                <div className="l">Avg Resp</div>
              </div>
              <div className="req-stat">
                <div className="v" style={{ color: slaColor(g.sla) }}>{Math.round(g.sla)}%</div>
                <div className="l">SLA</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {g.counts['on-time']  > 0 && pill('var(--green)',    'rgba(34,197,94,0.1)',   'rgba(34,197,94,0.25)',   g.counts['on-time']  + ' on time')}
              {g.counts['delayed']  > 0 && pill('var(--amber)',    'rgba(245,158,11,0.1)',  'rgba(245,158,11,0.25)',  g.counts['delayed']  + ' delayed')}
              {g.counts['overdue']  > 0 && pill('var(--red)',      'rgba(244,63,94,0.1)',   'rgba(244,63,94,0.25)',   g.counts['overdue']  + ' overdue')}
              {g.counts['pending']  > 0 && pill('var(--blue)',     'rgba(56,189,248,0.1)',  'rgba(56,189,248,0.25)',  g.counts['pending']  + ' pending')}
              {g.counts['resolved'] > 0 && pill('#2dd4bf', 'rgba(45,212,191,0.1)', 'rgba(45,212,191,0.25)', g.counts['resolved'] + ' resolved')}
            </div>
          </Tilt>
        ))}
        {groups.length === 0 && (
          <div style={{ color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 13, padding: 40 }}>No data.</div>
        )}
      </div>
    </>
  );
}

/* Build a mailto: link with the requester's request log as a plain-text table. */
function buildRequesterMailto(group) {
  const m = group;
  const subject = 'Pricing Requests — ' + group.name;
  const head = group.name + ' — ' + m.total + ' requests · '
    + (m.avg ? fmtHrs(m.avg) : '—') + ' avg response · ' + Math.round(m.sla) + '% SLA';

  const cols = ['Client', 'Received', 'First Response', 'Resolution', 'Status', 'Resolved'];
  const rowsTxt = group.list.map(r => [
    r.client || '—',
    r.received || '—',
    fmtHrs(r.responseHrs),
    fmtHrs(r.resolutionHrs) + (r.ratesResolved ? ' (Rates)' : ''),
    (window.STATUS_LABELS && window.STATUS_LABELS[r.status]) || r.status || '—',
    r.resolvedAt || '—',
  ].join('  |  '));

  const body = [
    head,
    '',
    cols.join('  |  '),
    cols.map(() => '———').join('  |  '),
    ...rowsTxt,
    '',
    'Generated from AMZ Prep · Pricing Intelligence',
  ].join('\n');

  return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
}

function RequesterDetail({ group, onBack, onToast }) {
  const m = group;
  const order = ['resolved', 'on-time', 'pending', 'delayed', 'overdue'];
  const maxCount = Math.max(...Object.values(m.counts), 1);

  const sendLog = () => {
    window.location.href = buildRequesterMailto(group);
    if (onToast) onToast('Opening email draft for ' + group.name + ' — ' + group.list.length + ' requests');
  };
  return (
    <>
      <button className="back-link" onClick={onBack}><Icon name="back" />All requesters</button>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="req-avatar" style={{ width: 56, height: 56, fontSize: 20 }}>{initials(group.name)}</div>
        <div>
          <div className="page-title" style={{ marginBottom: 2 }}>{group.name}</div>
          <div className="page-sub"><b>{m.total}</b> requests · <b>{fmtHrs(m.avg)}</b> avg response · <b>{Math.round(m.sla)}%</b> SLA</div>
        </div>
      </div>
      <div className="stats-grid stagger">
        <StatCard kind="primary" icon="inbox" label="Total Requests" value={m.total} sub={m.replied + ' replied'} />
        <StatCard kind="warning" icon="clock" label="Avg Response" value={m.avg} decimals={1} suffix="h" sub="this requester" />
        <StatCard kind="success" icon="check" label="SLA Hit Rate" value={m.sla} decimals={0} suffix="%" sub="on-time + resolved" />
        <StatCard kind="danger" icon="alert" label="Needs Action" value={m.pending + m.overdue} sub={m.pending + ' pending · ' + m.overdue + ' overdue'} />
      </div>
      <Tilt className="panel" max={5} lift={16} style={{ marginBottom: 22 }}>
        <div className="panel-head"><div className="panel-title">Status Breakdown</div><div className="panel-meta">{m.total} REQUESTS</div></div>
        {order.map(k => m.counts[k] > 0 && (
          <div className="bar-row" key={k}>
            <div className="bar-label">{window.STATUS_LABELS[k]}</div>
            <div className="bar-track"><div className="bar-fill" style={{ width: (m.counts[k] / maxCount * 100) + '%', background: window.STATUS_COLORS[k], '--bar-glow': window.STATUS_GLOW[k] }} /></div>
            <div className="bar-val" style={{ color: window.STATUS_COLORS[k] }}>{m.counts[k]}</div>
          </div>
        ))}
      </Tilt>
      <div className="table-panel">
        <div className="edge-glow" />
        <div className="table-head">
          <div className="panel-title">Request Log</div>
          <button className="btn blue" onClick={sendLog} title={'Email ' + group.name + "'s request log"}>
            <Icon name="mail" />Send
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Client</th><th>Received</th><th>First Response</th><th>Resolution</th><th>Status</th><th>Resolved</th><th></th></tr></thead>
            <tbody>
              {group.list.map((r, i) => (
                <tr key={i}>
                  <td className="td-client">{r.client}</td>
                  <td className="td-mono">{r.received}</td>
                  <td className="td-mono">{fmtHrs(r.responseHrs)}</td>
                  <td className="td-mono">
                    {fmtHrs(r.resolutionHrs)}
                    {r.ratesResolved && <span className="rates-tag" title={'Resolved with a rates sheet' + (r.resolvedBy ? ' from ' + r.resolvedBy : '')}>Rates</span>}
                  </td>
                  <td><StatusChip status={r.status} /></td>
                  <td className="td-mono" style={{ color: r.resolvedAt ? 'var(--text)' : 'var(--text-3)' }}>{r.resolvedAt || '—'}</td>
                  <td><a className="link-icon" href={r.link} target="_blank" rel="noopener"><Icon name="ext" /></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { OverviewTab, RequesterTab, computeMetrics });
