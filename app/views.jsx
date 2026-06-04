/* ══════════════════════════════════════════════════════════════
   Views — Overview, By Requester, Blair Forrest
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
                <th>Requested By</th><th>Escalation</th><th></th>
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
                  <td>{r.blairInvolved
                    ? <span className="blair-badge"><Icon name="star" style={{ width: 11, height: 11 }} />Blair</span>
                    : <span style={{ color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 11 }}>—</span>}</td>
                  <td><a className="link-icon" href={r.link} target="_blank" rel="noopener" title="Open in Gmail"><Icon name="ext" /></a></td>
                </tr>
              ))}
              {tableRows.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>No requests match this filter.</td></tr>
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
  const groups = useMemoV(() => {
    const map = {};
    rows.forEach(r => { (map[r.requestedBy] = map[r.requestedBy] || []).push(r); });
    return Object.entries(map).map(([name, list]) => {
      const m = computeMetrics(list);
      return { name, list, ...m };
    }).sort((a, b) => b.total - a.total);
  }, [rows]);

  if (selected) {
    const g = groups.find(x => x.name === selected);
    if (g) return <RequesterDetail group={g} onBack={() => setSelected(null)} />;
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">Requests by Requester</div>
        <div className="page-sub"><b>{groups.length}</b> team members · click a card to drill in</div>
      </div>
      <div className="req-grid stagger">
        {groups.map(g => (
          <Tilt className="req-card" max={10} lift={26} key={g.name} onClick={() => setSelected(g.name)}>
            <div className="req-top">
              <div className="req-avatar">{initials(g.name)}</div>
              <div>
                <div className="req-name">{g.name}</div>
                <div className="req-role">Account Manager</div>
              </div>
            </div>
            <div className="req-stats">
              <div className="req-stat"><div className="v"><CountUp value={g.total} /></div><div className="l">Requests</div></div>
              <div className="req-stat"><div className="v" style={{ color: 'var(--amber)' }}><CountUp value={g.avg} decimals={1} suffix="h" /></div><div className="l">Avg Resp</div></div>
              <div className="req-stat"><div className="v" style={{ color: 'var(--green)' }}><CountUp value={g.sla} decimals={0} suffix="%" /></div><div className="l">SLA</div></div>
            </div>
          </Tilt>
        ))}
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
            <thead><tr><th>Client</th><th>Received</th><th>Response</th><th>Status</th><th>Escalation</th><th></th></tr></thead>
            <tbody>
              {group.list.map((r, i) => (
                <tr key={i}>
                  <td className="td-client">{r.client}</td>
                  <td className="td-mono">{r.received}</td>
                  <td className="td-mono">{fmtHrs(r.responseHrs)}</td>
                  <td><StatusChip status={r.status} /></td>
                  <td>{r.blairInvolved ? <span className="blair-badge"><Icon name="star" style={{ width: 11, height: 11 }} />Blair</span> : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
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

/* ── BLAIR FORREST TAB ─────────────────────────────────────────── */
function BlairTab({ rows }) {
  const blairRows = useMemoV(() => rows.filter(r => r.blairInvolved), [rows]);
  const m = useMemoV(() => computeMetrics(blairRows), [blairRows]);
  const pctOfAll = rows.length ? (blairRows.length / rows.length) * 100 : 0;
  const order = ['resolved', 'on-time', 'pending', 'delayed', 'overdue'];
  const maxCount = Math.max(...Object.values(m.counts), 1);

  return (
    <>
      <div className="page-header">
        <div className="page-title">Blair Forrest · Escalations</div>
        <div className="page-sub"><b>{blairRows.length}</b> escalated threads · <b>{Math.round(pctOfAll)}%</b> of all requests required intervention</div>
      </div>
      <div className="stats-grid stagger">
        <StatCard kind="violet" icon="star" label="Escalated" value={blairRows.length} sub={Math.round(pctOfAll) + '% of all requests'} />
        <StatCard kind="warning" icon="clock" label="Avg Response" value={m.avg} decimals={1} suffix="h" sub="on escalated threads" />
        <StatCard kind="success" icon="check" label="Resolved" value={m.counts['resolved']} sub="closed after escalation" />
        <StatCard kind="danger" icon="alert" label="Still Open" value={m.pending + m.overdue + m.counts['delayed']} sub="pending / delayed / overdue" />
      </div>
      <Tilt className="panel" max={5} lift={16} style={{ marginBottom: 22 }}>
        <div className="panel-head"><div className="panel-title">Escalation Outcomes</div><div className="panel-meta">{blairRows.length} THREADS</div></div>
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
        <div className="table-head"><div className="panel-title">Escalated Threads</div></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Client</th><th>Received</th><th>Response</th><th>Status</th><th>Requested By</th><th></th></tr></thead>
            <tbody>
              {blairRows.map((r, i) => (
                <tr key={i}>
                  <td className="td-client">{r.client}</td>
                  <td className="td-mono">{r.received}</td>
                  <td className="td-mono">{fmtHrs(r.responseHrs)}</td>
                  <td><StatusChip status={r.status} /></td>
                  <td>{r.requestedBy}</td>
                  <td><a className="link-icon" href={r.link} target="_blank" rel="noopener"><Icon name="ext" /></a></td>
                </tr>
              ))}
              {blairRows.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>No escalations.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { OverviewTab, RequesterTab, BlairTab, computeMetrics });
