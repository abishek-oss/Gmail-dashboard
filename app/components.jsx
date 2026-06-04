/* ══════════════════════════════════════════════════════════════
   Shared components — 3D tilt, count-up metrics, icons, charts
   ══════════════════════════════════════════════════════════════ */
const { useState, useEffect, useRef, useCallback } = React;

/* ── ICONS (inline SVG, stroke-based) ──────────────────────────── */
const Icon = ({ name, ...p }) => {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    star: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>,
    refresh: <><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></>,
    report: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></>,
    inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
    check: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></>,
    alert: <><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></>,
    arrow: <path d="M5 12h14M12 5l7 7-7 7"/>,
    back: <path d="M19 12H5M12 19l-7-7 7-7"/>,
    ext: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/></>,
    up: <path d="M7 17L17 7M7 7h10v10"/>,
    down: <path d="M17 7L7 17M17 17H7V7"/>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...p}>{paths[name]}</svg>
  );
};

/* ── TILT WRAPPER (cursor-tracked 3D pop) ──────────────────────── */
function Tilt({ children, className = '', max = 9, lift = 26, style = {}, ...rest }) {
  const ref = useRef(null);
  const onMove = useCallback((e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;   // 0..1
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--ry', ((px - 0.5) * 2 * max).toFixed(2) + 'deg');
    el.style.setProperty('--rx', (-(py - 0.5) * 2 * max).toFixed(2) + 'deg');
    el.style.setProperty('--lift', lift + 'px');
    el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
  }, [max, lift]);
  const reset = useCallback(() => {
    const el = ref.current; if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--lift', '0px');
  }, []);
  return (
    <div ref={ref} className={'tilt ' + className} onMouseMove={onMove} onMouseLeave={reset} style={style} {...rest}>
      <div className="edge-glow" />
      <div className="sheen" />
      {children}
    </div>
  );
}

/* ── COUNT-UP NUMBER ───────────────────────────────────────────── */
function CountUp({ value, decimals = 0, duration = 1300, prefix = '', suffix = '', className }) {
  const [disp, setDisp] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const from = 0, to = Number(value) || 0;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      setDisp(from + (to - from) * ease(t));
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else setDisp(to);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  const formatted = decimals > 0
    ? disp.toFixed(decimals)
    : Math.round(disp).toLocaleString();
  return <span className={className}>{prefix}{formatted}{suffix}</span>;
}

/* ── STATUS CHIP ───────────────────────────────────────────────── */
function StatusChip({ status }) {
  const color = window.STATUS_COLORS[status] || '#888';
  const label = window.STATUS_LABELS[status] || status;
  return (
    <span className="chip" style={{
      color, background: color + '1e', border: '1px solid ' + color + '44'
    }}>
      <span className="chip-dot" />{label}
    </span>
  );
}

/* ── DONUT CHART (animated arcs) ───────────────────────────────── */
function Donut({ segments, centerBig, centerSmall, animate }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const R = 60, C = 2 * Math.PI * R;
  let offset = 0;
  const [grow, setGrow] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / 1100, 1);
      setGrow(1 - Math.pow(1 - t, 3));
      if (t < 1) requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [animate]);
  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg width="150" height="150" viewBox="0 0 150 150">
          <circle cx="75" cy="75" r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="16" />
          {segments.map((s, i) => {
            const frac = (s.value / total) * grow;
            const dash = frac * C;
            const el = (
              <circle key={i} cx="75" cy="75" r={R} fill="none" stroke={s.color} strokeWidth="16"
                strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset} strokeLinecap="butt"
                style={{ filter: `drop-shadow(0 0 6px ${s.color}aa)` }} />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div className="donut-center">
          <div className="big">{centerBig}</div>
          <div className="small">{centerSmall}</div>
        </div>
      </div>
      <div className="legend">
        {segments.map((s, i) => (
          <div className="legend-item" key={i}>
            <span className="legend-dot" style={{ background: s.color, color: s.color }} />
            <span className="legend-label">{s.label}</span>
            <span className="legend-val">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* helpers */
function fmtHrs(h) {
  if (h == null) return '—';
  if (h < 1) return Math.round(h * 60) + 'm';
  return (Math.round(h * 10) / 10) + 'h';
}
function initials(name) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

Object.assign(window, { Icon, Tilt, CountUp, StatusChip, Donut, fmtHrs, initials });
