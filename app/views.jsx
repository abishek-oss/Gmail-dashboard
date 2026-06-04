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

  // table rows respect status filter
  const tableRows = statusFilter === 'all' ? rows : rows.filter(r => r.status === statusFilter);

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

      {/* TABLE */}
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
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Client</th><th>Received</th><th>Response</th><th>Status</th>
                <th>Requested By</th><th></th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, i) => (
                <tr key={i}>
                  <td className="td-client">{r.client}</td>
                  <td className="td-mono">{r.received}</td>
                  <td className="td-mono" style={{ color: r.responseHrs == null ? 'var(--text-3)' : 'var(--text)' }}>{fmtHrs(r.responseHrs)}</td>
                  <td><StatusChip status={r.status} /></td>
                  <td>{r.requestedBy}</td>
                  <td><a className="link-icon" href={r.link} target="_blank" rel="noopener" title="Open in Gmail"><Icon name="ext" /></a></td>
                </tr>
              ))}
              {tableRows.length === 0 && (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>No requests match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ── BY REQUESTER TAB ──────────────────────────────────────────── */
function RequesterTab({ rows }) {
  const [selected, setSelected] = useStateV(null);
  const [sortCol, setSortCol] = useStateV('total');
  const [sortDir, setSortDir] = useStateV(-1);

  const groups = useMemoV(() => {
    const map = {};
    rows.forEach(r => { (map[r.requestedBy] = map[r.requestedBy] || []).push(r); });
    return Object.entries(map).map(([name, list]) => {
      const m = computeMetrics(list);
      const hrs = list.filter(r => r.responseHrs != null).map(r => r.responseHrs);
      const fastest = hrs.length ? Math.min(...hrs) : null;
      const slowest = hrs.length ? Math.max(...hrs) : null;
      return { name, list, total: m.total, avg: m.avg, sla: m.sla, fastest, slowest, counts: m.counts };
    });
  }, [rows]);

  const sorted = useMemoV(() => {
    return [...groups].sort((a, b) => {
      const nl = sortDir === -1 ? Infinity : -Infinity;
      let av, bv;
      if      (sortCol === 'name')    { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (sortCol === 'total')   { av = a.total;              bv = b.total; }
      else if (sortCol === 'avg')     { av = a.avg     ?? nl;      bv = b.avg     ?? nl; }
      else if (sortCol === 'fastest') { av = a.fastest ?? nl;      bv = b.fastest ?? nl; }
      else if (sortCol === 'slowest') { av = a.slowest ?? nl;      bv = b.slowest ?? nl; }
      else if (sortCol === 'sla')     { av = a.sla     ?? nl;      bv = b.sla     ?? nl; }
      else                            { av = a.total;              bv = b.total; }
      return av < bv ? sortDir : av > bv ? -sortDir : 0;
    });
  }, [groups, sortCol, sortDir]);

  if (selected) {
    const g = groups.find(x => x.name === selected);
    if (g) return <RequesterDetail group={g} onBack={() => setSelected(null)} />;
  }

  const toggleSort = col => {
    if (sortCol === col) setSortDir(d => -d);
    else { setSortCol(col); setSortDir(-1); }
  };
  const si = col => sortCol === col ? (sortDir === -1 ? ' ↓' : ' ↑') : ' ↕';
  const slaColor = sla => sla >= 80 ? 'var(--green)' : sla >= 50 ? 'var(--amber)' : 'var(--red)';

  return (
    <>
      <div className="page-header">
        <div className="page-title">Requests by Requester</div>
        <div className="page-sub"><b>{groups.length}</b> team members · click a row to drill in</div>
      </div>
      <div className="table-panel">
        <div className="edge-glow" />
        <div className="table-head"><div className="panel-title">Requester Summary</div></div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th onClick={() => toggleSort('name')} style={{ cursor: 'pointer' }}>Requester{si('name')}</th>
                <th onClick={() => toggleSort('total')} style={{ cursor: 'pointer', textAlign: 'center' }}>Total{si('total')}</th>
                <th onClick={() => toggleSort('avg')} style={{ cursor: 'pointer', textAlign: 'center' }}>Avg Response{si('avg')}</th>
                <th onClick={() => toggleSort('fastest')} style={{ cursor: 'pointer', textAlign: 'center' }}>Fastest{si('fastest')}</th>
                <th onClick={() => toggleSort('slowest')} style={{ cursor: 'pointer', textAlign: 'center' }}>Slowest{si('slowest')}</th>
                <th onClick={() => toggleSort('sla')} style={{ cursor: 'pointer', textAlign: 'center' }}>SLA Rate{si('sla')}</th>
                <th>Breakdown</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(g => (
                <tr key={g.name} style={{ cursor: 'pointer' }} onClick={() => setSelected(g.name)}>
                  <td className="td-client">{g.name}</td>
                  <td className="td-mono" style={{ textAlign: 'center' }}>{g.total}</td>
                  <td className="td-mono" style={{ textAlign: 'center' }}>{g.avg ? fmtHrs(g.avg) : '—'}</td>
                  <td className="td-mono" style={{ textAlign: 'center', color: 'var(--green)' }}>{g.fastest != null ? fmtHrs(g.fastest) : '—'}</td>
                  <td className="td-mono" style={{ textAlign: 'center', color: 'var(--red)' }}>{g.slowest != null ? fmtHrs(g.slowest) : '—'}</td>
                  <td className="td-mono" style={{ textAlign: 'center', color: slaColor(g.sla), fontWeight: 700 }}>{Math.round(g.sla)}%</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, fontFamily: 'var(--mono)' }}>
                      {g.counts['on-time']  > 0 && <span style={{ color: 'var(--green)' }}>{g.counts['on-time']} on time</span>}
                      {g.counts['delayed']  > 0 && <span style={{ color: 'var(--amber)' }}>{g.counts['delayed']} delayed</span>}
                      {g.counts['overdue']  > 0 && <span style={{ color: 'var(--red)' }}>{g.counts['overdue']} overdue</span>}
                      {g.counts['pending']  > 0 && <span style={{ color: 'var(--blue)' }}>{g.counts['pending']} pending</span>}
                      {g.counts['resolved'] > 0 && <span style={{ color: 'var(--violet-l)' }}>{g.counts['resolved']} resolved</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function RequesterDetail({ group, onBack }) {
  const m = group;
  const order = ['resolved', 'on-time', 'pending', 'delayed', 'overdue'];
  const maxCount = Math.max(...Object.values(m.counts), 1);
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
        <div className="table-head"><div className="panel-title">Request Log</div></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Client</th><th>Received</th><th>Response</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {group.list.map((r, i) => (
                <tr key={i}>
                  <td className="td-client">{r.client}</td>
                  <td className="td-mono">{r.received}</td>
                  <td className="td-mono">{fmtHrs(r.responseHrs)}</td>
                  <td><StatusChip status={r.status} /></td>
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
