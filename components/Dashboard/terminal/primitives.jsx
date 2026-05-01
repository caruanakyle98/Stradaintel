'use client';
// Strada Intelligence — Trading Terminal · shared primitives.
// Pure presentational building blocks: pane, ticker, score bar, sparkline,
// donut, area row, tripwire, top-nav, footer. No data fetching.

import { useEffect, useState } from 'react';
import { C } from '../../../lib/theme.js';

// ── Palette helpers ──────────────────────────────────────────
// Map terminal-flavoured tokens onto the project's central palette (lib/theme.js).
export const T = {
  bg: C.bg,
  t1: C.t1,
  t2: C.t2,
  tm: C.tm,
  td: C.td,
  gold: C.g,
  goldCore: C.g,
  goldB: C.ga,
  goldDim: C.gm,
  amber: C.am,
  amberL: C.amL,
  red: C.red,
  green: '#22c55e',
  greenL: '#4ade80',
  metric: C.metric,
  border: C.border,
};

export const trendCol = (t) => (t === 'up' ? T.goldCore : t === 'down' ? T.red : T.t2);
export const trendArrow = (t) => (t === 'up' ? '↑' : t === 'down' ? '↓' : '→');

export const glowFor = (col) => {
  if (col === T.goldCore || col === T.goldB || col === T.gold) return '0 0 16px rgba(212,175,55,0.48)';
  if (col === T.red) return '0 0 14px rgba(239,68,68,0.45)';
  if (col === T.amber || col === T.amberL) return '0 0 16px rgba(245,158,11,0.50)';
  if (col === T.green || col === T.greenL) return '0 0 14px rgba(34,197,94,0.45)';
  return '0 0 12px rgba(183,211,255,0.35)';
};

export const pillarTone = (s) => (s >= 3.5 ? T.goldCore : s >= 2.5 ? T.amber : T.red);

export const verdictTone = (s) =>
  s >= 4.3 ? { c: T.goldB } :
  s >= 3.3 ? { c: T.goldCore } :
  s >= 2.2 ? { c: T.amber } :
             { c: T.red };

export const urgencyCol = (l) =>
  l === 'red' ? T.red :
  l === 'amber' ? T.amber :
  l === 'green' ? T.greenL :
  T.t2;

// ── Density tokens ────────────────────────────────────────────
export const D = {
  compact:     { gap: 8,  padCardX: 12, padCardY: 10 },
  comfortable: { gap: 12, padCardX: 14, padCardY: 12 },
  spacious:    { gap: 16, padCardX: 18, padCardY: 14 },
};

// ── Hooks ─────────────────────────────────────────────────────
export function useIsMobile(breakpoint = 768) {
  const [is, setIs] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIs(m.matches);
    update();
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  }, [breakpoint]);
  return is;
}

// ── Pane ──────────────────────────────────────────────────────
export function Pane({ no, title, status, children, scroll, mh }) {
  return (
    <div style={{
      background: 'rgba(8,12,20,0.85)',
      border: '1px solid rgba(201,168,76,0.16)',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px',
        borderBottom: '1px solid rgba(201,168,76,0.16)',
        background: 'rgba(11,18,32,0.85)',
      }}>
        {no && <span style={{ fontFamily: 'monospace', fontSize: 9, color: T.gold, opacity: 0.7 }}>[{no}]</span>}
        <span style={{
          fontFamily: "'Montserrat',serif", fontSize: 9, fontWeight: 700,
          letterSpacing: '1.8px', color: T.t1, textTransform: 'uppercase',
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</span>
        {status && <span style={{ fontFamily: 'monospace', fontSize: 9, color: T.tm }}>{status}</span>}
      </div>
      <div style={{ flex: 1, minHeight: mh || 0, overflow: scroll ? 'auto' : 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

// ── Score bar ─────────────────────────────────────────────────
export function ScoreBar({ score, color, h = 4 }) {
  const col = color || pillarTone(score);
  const pct = Math.round(((Math.min(Math.max(score, 1), 5) - 1) / 4) * 100);
  return (
    <div style={{ height: h, background: 'rgba(201,168,76,0.10)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${col}, ${col}cc)`, borderRadius: 4 }} />
    </div>
  );
}

// ── Sparkline ─────────────────────────────────────────────────
export function Spark({ data, color = T.goldCore, h = 36, area = true }) {
  const W = 200, H = h, pad = 4;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return [x, y];
  });
  const line = pts.map((p) => p.join(',')).join(' ');
  const fill = `${pts[0][0]},${H} ${line} ${pts[pts.length - 1][0]},${H}`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', height: h }}>
      {area && <polygon points={fill} fill={color} opacity={0.10} />}
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Mix donut (CSS conic) ─────────────────────────────────────
export function MixDonut({ rows }) {
  const colors = [T.goldCore, T.amber, T.goldDim, T.metric];
  let acc = 0;
  const stops = rows.map((r, i) => {
    const start = acc;
    acc += r.pct;
    return `${colors[i % colors.length]} ${start}% ${acc}%`;
  }).join(', ');
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ width: 90, height: 90, borderRadius: '50%', background: `conic-gradient(${stops})`, position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: 14, borderRadius: '50%', background: T.bg, border: `1px solid ${T.border}` }} />
      </div>
      <div style={{ flex: 1, minWidth: 120 }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length] }} />
            <span style={{ fontSize: 11, color: T.t1, flex: 1 }}>{r.label}</span>
            <span style={{ fontFamily: "'Montserrat',serif", fontSize: 12, fontWeight: 700, color: T.t1 }}>{r.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Area row ──────────────────────────────────────────────────
export function AreaRow({ a, max }) {
  const tc = trendCol(a.trend);
  const pct = Math.round((a.vol / max) * 100);
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(201,168,76,0.08)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontFamily: "'Montserrat',serif", fontSize: 10, color: T.tm, width: 18, flexShrink: 0 }}>{a.rank}</span>
          <span style={{ fontSize: 13, color: T.t1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.area}</span>
          <span style={{ fontSize: 11, color: tc }}>{trendArrow(a.trend)}</span>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 10, color: T.tm }}>{a.vol} deals</span>
          <span style={{ fontFamily: "'Montserrat',serif", fontSize: 13, fontWeight: 700, color: tc }}>AED {a.psf}/sqft</span>
        </div>
      </div>
      <div style={{ height: 3, background: 'rgba(201,168,76,0.10)', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: `${tc}80`, borderRadius: 2 }} />
      </div>
    </div>
  );
}

// ── Tripwire (warning row) ────────────────────────────────────
export function Tripwire({ row }) {
  const c = urgencyCol(row.level);
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'auto minmax(0,2fr) auto minmax(0,2fr)', gap: 14,
      alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(201,168,76,0.08)',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, boxShadow: `0 0 10px ${c}` }} />
      <span style={{ fontSize: 12, color: T.t1, lineHeight: 1.5 }}>{row.watch}</span>
      <span style={{
        fontFamily: "'Montserrat',serif", fontSize: 9, fontWeight: 700, letterSpacing: '1.5px',
        color: c, textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}>{row.urgency}</span>
      <span style={{ fontSize: 11, color: T.t2, lineHeight: 1.5 }}>{row.action}</span>
    </div>
  );
}

export function TripwireMobile({ row }) {
  const c = urgencyCol(row.level);
  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(201,168,76,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, boxShadow: `0 0 10px ${c}` }} />
        <span style={{ fontFamily: "'Montserrat',serif", fontSize: 9, fontWeight: 700, letterSpacing: '1.5px', color: c, textTransform: 'uppercase' }}>{row.urgency}</span>
      </div>
      <div style={{ fontSize: 12, color: T.t1, marginBottom: 6, lineHeight: 1.5 }}>{row.watch}</div>
      <div style={{ fontSize: 11, color: T.t2, lineHeight: 1.5 }}>{row.action}</div>
    </div>
  );
}

// ── Bookmark grid ─────────────────────────────────────────────
export function BookmarkGrid({ groups }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,260px),1fr))', gap: 12 }}>
      {groups.map((g) => (
        <div key={g.group} style={{
          background: 'rgba(8,12,20,0.40)', border: '1px solid rgba(201,168,76,0.14)',
          borderRadius: 14, padding: '14px 16px',
        }}>
          <div style={{
            fontFamily: "'Montserrat',serif", fontSize: 10, fontWeight: 700,
            letterSpacing: '2px', color: T.gold, textTransform: 'uppercase', marginBottom: 10,
          }}>{g.group}</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {g.items.map((it) => (
              <a key={it.label} href={it.href} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: 8,
                background: 'rgba(11,18,32,0.6)', border: '1px solid rgba(201,168,76,0.08)',
                color: T.t1, fontSize: 12, textDecoration: 'none', transition: 'all .2s',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(201,168,76,0.10)'; e.currentTarget.style.borderColor = 'rgba(201,168,76,0.30)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(11,18,32,0.6)'; e.currentTarget.style.borderColor = 'rgba(201,168,76,0.08)'; }}>
                <span>{it.label}</span>
                <span style={{ fontSize: 10, color: T.gold }}>↗</span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Top nav ───────────────────────────────────────────────────
const selStyle = {
  background: 'rgba(8,12,20,0.8)', border: `1px solid ${T.border}`, color: T.t1,
  fontSize: 11, padding: '6px 10px', borderRadius: 8,
  fontFamily: "'Poppins',sans-serif", outline: 'none', cursor: 'pointer',
};
const rangeBtn = (active) => ({
  background: active ? 'rgba(201,168,76,0.16)' : 'transparent',
  color: active ? T.goldB : T.t2,
  fontFamily: "'Montserrat',serif", fontSize: 10, fontWeight: 700, letterSpacing: '1.5px',
  padding: '6px 12px', border: 'none', cursor: 'pointer',
});

export function TopNav({ data, mobile = false }) {
  const f = data.filters;
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(7,8,12,0.86)', backdropFilter: 'blur(14px)',
      borderBottom: `1px solid ${T.border}`,
      padding: mobile ? '12px 16px' : '14px clamp(20px,3vw,40px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            border: `1px solid ${T.gold}55`,
            background: 'linear-gradient(135deg, rgba(201,168,76,0.16), rgba(201,168,76,0.04))',
            display: 'grid', placeItems: 'center',
            fontFamily: "'Montserrat',serif", fontSize: 14, fontWeight: 800, color: T.goldB,
          }}>S</div>
          <div>
            <div style={{ fontFamily: "'Montserrat',serif", fontSize: 13, fontWeight: 800, color: T.t1, letterSpacing: '0.04em', lineHeight: 1 }}>{data.brand.name}</div>
            <div style={{ fontFamily: "'Montserrat',serif", fontSize: 9, fontWeight: 600, letterSpacing: '2px', color: T.gold, marginTop: 3 }}>{data.brand.tagline}</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 999,
          background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: T.green,
            boxShadow: '0 0 8px rgba(34,197,94,0.7)', animation: 'si-pulse 1.6s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: "'Montserrat',serif", fontSize: 9, fontWeight: 700, letterSpacing: '2px', color: T.greenL }}>LIVE</span>
        </div>
        {!mobile && (
          <>
            <select defaultValue={f.areas[0]} style={selStyle}>
              {f.areas.map((a) => <option key={a}>{a}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 0, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
              {f.ranges.map((r, i) => (
                <button key={r} type="button" style={{ ...rangeBtn(i === 0), borderLeft: i ? `1px solid ${T.border}` : 'none' }}>{r}</button>
              ))}
            </div>
          </>
        )}
        <div style={{ fontFamily: "'Montserrat',serif", fontSize: 9, fontWeight: 600, letterSpacing: '1.5px', color: T.tm, textTransform: 'uppercase' }}>{data.brand.user}</div>
      </div>
      {mobile && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <select defaultValue={f.areas[0]} style={{ ...selStyle, flex: 1 }}>
            {f.areas.map((a) => <option key={a}>{a}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 0, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {f.ranges.map((r, i) => (
              <button key={r} type="button" style={{ ...rangeBtn(i === 0), borderLeft: i ? `1px solid ${T.border}` : 'none' }}>{r}</button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

// ── Footer ────────────────────────────────────────────────────
export function SIFooter({ data }) {
  return (
    <footer style={{ marginTop: 40, padding: '24px 0', borderTop: '1px solid rgba(201,168,76,0.16)', textAlign: 'center' }}>
      <div style={{ fontFamily: "'Montserrat',serif", fontSize: 11, fontWeight: 700, color: T.gold, letterSpacing: '2px', marginBottom: 6 }}>{data.footer.line1}</div>
      <div style={{ fontSize: 11, color: T.t2 }}>{data.footer.line2}</div>
      <div style={{ fontSize: 11, color: T.tm, marginTop: 4 }}>{data.footer.contact}</div>
    </footer>
  );
}
