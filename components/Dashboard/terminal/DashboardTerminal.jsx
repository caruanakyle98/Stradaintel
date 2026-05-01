'use client';
// Strada Intelligence — Trading Terminal dashboard (Variant C).
// Dense, monospaced, multi-pane grid. Ticker tape header, every signal visible at once.
// Sourced from the design handoff (kyle-caruana-website / Dashboard Variations.html, Variant C).

import { SI_DATA } from './data.js';
import {
  T, D,
  trendCol, glowFor, pillarTone, verdictTone,
  useIsMobile,
  Pane, ScoreBar, Spark, MixDonut, AreaRow,
  Tripwire, TripwireMobile, BookmarkGrid,
  TopNav, SIFooter,
} from './primitives.jsx';

// ── BigCell ───────────────────────────────────────────────────
function BigCell({ label, value, delta, sub, color }) {
  const c = color || T.goldCore;
  return (
    <div style={{ padding: '10px 12px', borderRight: '1px solid rgba(201,168,76,0.10)' }}>
      <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '1.5px', color: T.tm, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Montserrat',serif", fontSize: 22, fontWeight: 800, color: c, lineHeight: 1.1, textShadow: glowFor(c), marginTop: 4 }}>{value}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 4 }}>
        {delta && <span style={{ fontFamily: 'monospace', fontSize: 10, color: c, fontWeight: 700 }}>{delta}</span>}
        {sub && <span style={{ fontFamily: 'monospace', fontSize: 9, color: T.tm }}>{sub}</span>}
      </div>
    </div>
  );
}

// ── Pillar matrix ─────────────────────────────────────────────
function PillarMatrix({ pillars }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%,140px),1fr))',
      gap: 1, background: 'rgba(201,168,76,0.10)', padding: 1,
    }}>
      {pillars.map((p, i) => {
        const c = pillarTone(p.score);
        return (
          <div key={p.id} style={{ background: T.bg, padding: '10px 12px' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: T.tm, marginBottom: 4 }}>P{String(i + 1).padStart(2, '0')}</div>
            <div style={{ fontSize: 10, color: T.t2, lineHeight: 1.3, minHeight: 26, marginBottom: 6 }}>{p.title}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
              <span style={{ fontFamily: "'Montserrat',serif", fontSize: 18, fontWeight: 800, color: c, textShadow: glowFor(c) }}>{p.score.toFixed(1)}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 9, color: T.tm }}>/5</span>
            </div>
            <ScoreBar score={p.score} color={c} h={3} />
          </div>
        );
      })}
    </div>
  );
}

// ── Verdict bar ───────────────────────────────────────────────
function TerminalVerdict({ verdict }) {
  const v = verdictTone(verdict.score);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto auto minmax(0,1fr) auto',
      gap: 14, alignItems: 'center',
      background: `linear-gradient(90deg, ${v.c}15, rgba(11,18,32,0.85))`,
      border: `1px solid ${v.c}30`,
      borderRadius: 8, padding: '10px 14px',
    }}>
      <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '2px', color: T.gold, textTransform: 'uppercase' }}>VERDICT</span>
      <span style={{ fontFamily: "'Montserrat',serif", fontSize: 32, fontWeight: 800, color: v.c, lineHeight: 1, textShadow: glowFor(v.c) }}>
        {verdict.score.toFixed(1)}<span style={{ fontSize: 14, color: T.tm, marginLeft: 4 }}>/5</span>
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "'Montserrat',serif", fontSize: 13, fontWeight: 800, color: v.c }}>{verdict.label}</div>
        <div style={{ fontSize: 10, color: T.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{verdict.sub}</div>
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 9, color: T.tm, whiteSpace: 'nowrap' }}>{verdict.asOf.toUpperCase()}</span>
    </div>
  );
}

// ── Ticker tape ───────────────────────────────────────────────
function Ticker({ rows }) {
  const items = rows.concat(rows);
  return (
    <div style={{
      overflow: 'hidden',
      background: 'rgba(11,18,32,0.85)',
      border: '1px solid rgba(201,168,76,0.16)',
      borderRadius: 8, padding: '8px 0', position: 'relative',
    }}>
      <div style={{
        display: 'flex', gap: 32,
        animation: 'si-ticker 60s linear infinite',
        whiteSpace: 'nowrap', willChange: 'transform',
      }}>
        {items.map((r, i) => {
          const up = r.delta.startsWith('+');
          const dn = r.delta.startsWith('−');
          const c = up ? T.goldCore : dn ? T.red : T.t2;
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, fontFamily: 'monospace', fontSize: 11 }}>
              <span style={{ color: T.tm, textTransform: 'uppercase', letterSpacing: '1px', fontSize: 9 }}>{r.label}</span>
              <span style={{ color: T.t1, fontWeight: 700 }}>{r.value}</span>
              <span style={{ color: c }}>{r.delta}</span>
              <span style={{ color: 'rgba(201,168,76,0.30)' }}>·</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Dense sales table ─────────────────────────────────────────
function DenseSales({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: 11 }}>
      <thead>
        <tr style={{ background: 'rgba(11,18,32,0.85)', borderBottom: '1px solid rgba(201,168,76,0.16)' }}>
          {['DATE', 'AREA', 'BUILDING', 'TYPE', 'PRICE', 'PSF'].map((h, i) => (
            <th key={h} style={{ padding: '6px 10px', textAlign: i >= 4 ? 'right' : 'left', fontSize: 9, color: T.tm, fontWeight: 700, letterSpacing: '1px' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: '1px solid rgba(201,168,76,0.06)' }}>
            <td style={{ padding: '6px 10px', color: T.tm }}>{r.date}</td>
            <td style={{ padding: '6px 10px', color: T.t1 }}>{r.area}</td>
            <td style={{ padding: '6px 10px', color: T.t2 }}>{r.bldg}</td>
            <td style={{ padding: '6px 10px', color: T.t2 }}>{r.type}</td>
            <td style={{ padding: '6px 10px', color: T.goldB, textAlign: 'right', fontWeight: 700 }}>{r.price}</td>
            <td style={{ padding: '6px 10px', color: T.t1, textAlign: 'right' }}>{r.psf}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Yield bars ────────────────────────────────────────────────
function YieldBars({ yields }) {
  return (
    <div style={{ padding: '10px 12px', display: 'grid', gap: 6 }}>
      {yields.map((y) => {
        const pct = (y.gross / 8) * 100;
        const c = y.gross >= 7 ? T.goldCore : y.gross >= 5 ? T.goldB : y.gross >= 4 ? T.amber : T.red;
        return (
          <div key={y.label} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 50px', gap: 8, alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: T.t1 }}>{y.label}</span>
            <div style={{ height: 6, background: 'rgba(201,168,76,0.10)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${c}, ${c}cc)` }} />
            </div>
            <span style={{ fontFamily: "'Montserrat',serif", fontSize: 13, fontWeight: 700, color: c, textAlign: 'right', textShadow: glowFor(c) }}>{y.gross.toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Chart row ─────────────────────────────────────────────────
function ChartRow({ data }) {
  const charts = [
    { title: 'AVG PSF · 9MO', d: data.s03.charts.psf, c: T.goldCore, latest: 'AED 1,982' },
    { title: 'VOLUME · 9MO',  d: data.s03.charts.vol, c: T.metric,   latest: '1,842' },
    { title: 'YIELD · 9MO',   d: data.s03.charts.yld, c: T.green,    latest: '6.8%' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'rgba(201,168,76,0.10)' }}>
      {charts.map((ch) => (
        <div key={ch.title} style={{ background: T.bg, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '1.5px', color: T.tm }}>{ch.title}</span>
            <span style={{ fontFamily: "'Montserrat',serif", fontSize: 13, fontWeight: 800, color: ch.c, textShadow: glowFor(ch.c) }}>{ch.latest}</span>
          </div>
          <Spark data={ch.d} color={ch.c} h={36} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 8, color: T.tm }}>{data.s03.charts.labels[0]}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 8, color: T.tm }}>{data.s03.charts.labels[data.s03.charts.labels.length - 1]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export function DashboardTerminal({ data = SI_DATA, density = 'compact' }) {
  const mobile = useIsMobile(820);
  const padX = mobile ? 12 : 'clamp(14px,2vw,24px)';
  const tickerRows = data.s05.rows;

  const kpis = data.s01.kpis.map((k) => ({
    label: k.label, value: k.value, delta: k.delta,
    sub: k.deltaLabel, color: trendCol(k.trend),
  }));

  const areaMax = Math.max(...data.s03.areas.map((x) => x.vol));
  const padXcss = typeof padX === 'string' ? padX : `${padX}px`;
  const colSpan = (n) => (mobile ? '1' : `span ${n}`);

  return (
    <div style={{
      background: T.bg, color: T.t1,
      fontFamily: "'Poppins',sans-serif",
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @keyframes si-ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes si-pulse  { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        .si-terminal *, .si-terminal *::before, .si-terminal *::after { box-sizing: border-box; }
        .si-terminal ::-webkit-scrollbar { width: 10px; height: 10px; }
        .si-terminal ::-webkit-scrollbar-track { background: rgba(7,11,20,0.6); }
        .si-terminal ::-webkit-scrollbar-thumb { background: rgba(201,168,76,0.18); border-radius: 5px; }
        .si-terminal ::-webkit-scrollbar-thumb:hover { background: rgba(201,168,76,0.32); }
      `}</style>

      <div className="si-terminal" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <TopNav data={data} mobile={mobile} />

        <div style={{ padding: `8px ${padXcss} 0` }}>
          <Ticker rows={tickerRows} />
        </div>

        <div style={{ flex: 1, padding: `10px ${padXcss} 40px` }}>
          <div style={{ marginBottom: 8 }}>
            <TerminalVerdict verdict={data.verdict} />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4, 1fr)',
            gap: 1, background: 'rgba(201,168,76,0.16)',
            border: '1px solid rgba(201,168,76,0.16)', borderRadius: 8,
            overflow: 'hidden', marginBottom: 10,
          }}>
            {kpis.map((k, i) => (
              <div key={i} style={{ background: T.bg }}>
                <BigCell label={k.label} value={k.value} delta={k.delta} sub={k.sub} color={k.color} />
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(12, 1fr)', gap: 8 }}>
            <div style={{ gridColumn: colSpan(8) }}>
              <Pane no="02" title="Macro Pillars · 7-factor matrix" status={data.s02.no}>
                <PillarMatrix pillars={data.s02.pillars} />
                <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(201,168,76,0.10)', fontSize: 11, color: T.t2, lineHeight: 1.5 }}>{data.s02.desc}</div>
              </Pane>
            </div>
            <div style={{ gridColumn: colSpan(4) }}>
              <Pane no="01.M" title="Property mix">
                <div style={{ padding: '14px 16px' }}>
                  <MixDonut rows={data.s01.mix} />
                </div>
              </Pane>
            </div>

            <div style={{ gridColumn: colSpan(7) }}>
              <Pane no="03.C" title="9-month series" status="PSF · VOL · YLD">
                <ChartRow data={data} />
              </Pane>
            </div>
            <div style={{ gridColumn: colSpan(5) }}>
              <Pane no="01.P" title={data.s01.psfTitle}>
                <div style={{ padding: '10px 12px', display: 'grid', gap: 6 }}>
                  {data.s01.psfRows.map((r) => (
                    <div key={r.label} style={{
                      display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'baseline',
                      padding: '8px 10px',
                      background: 'rgba(11,18,32,0.6)', border: '1px solid rgba(201,168,76,0.10)', borderRadius: 6,
                    }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: T.t1 }}>{r.label}</span>
                      <span style={{ fontFamily: "'Montserrat',serif", fontSize: 14, fontWeight: 700, color: T.goldB }}>{r.value}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 10, color: T.goldCore }}>{r.delta}</span>
                    </div>
                  ))}
                </div>
              </Pane>
            </div>

            <div style={{ gridColumn: colSpan(7) }}>
              <Pane no="03.A" title="Transaction volume by area" status="LAST 7D" scroll mh={300}>
                {data.s03.areas.map((a) => <AreaRow key={a.rank} a={a} max={areaMax} />)}
              </Pane>
            </div>
            <div style={{ gridColumn: colSpan(5) }}>
              <Pane no="03.Y" title="Rental yield by type" status="GROSS ANNUAL">
                <YieldBars yields={data.s03.yields} />
              </Pane>
            </div>

            <div style={{ gridColumn: colSpan(8) }}>
              <Pane no="01.T" title={data.s01.recentTitle} status={data.s01.recentSub} scroll mh={mobile ? 320 : 280}>
                <DenseSales rows={data.s01.recent} />
              </Pane>
            </div>
            <div style={{ gridColumn: colSpan(4) }}>
              <Pane no="05" title={data.s05.title} status="REFS" scroll mh={mobile ? 320 : 280}>
                <div style={{ padding: '8px 12px', display: 'grid', gap: 5 }}>
                  {data.s05.rows.map((r) => (
                    <div key={r.label} style={{
                      display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'baseline',
                      fontFamily: 'monospace', fontSize: 11,
                      padding: '5px 8px', borderBottom: '1px dashed rgba(201,168,76,0.10)',
                    }}>
                      <span style={{ color: T.tm, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase' }}>{r.label}</span>
                      <span style={{ color: T.t1, fontWeight: 700 }}>{r.value}</span>
                      <span style={{ color: r.delta.startsWith('+') ? T.goldCore : r.delta.startsWith('−') ? T.red : T.tm }}>{r.delta}</span>
                    </div>
                  ))}
                </div>
              </Pane>
            </div>

            <div style={{ gridColumn: colSpan(12) }}>
              <Pane no="04" title={data.s04.title} status="TRIPWIRES" scroll>
                {!mobile && (
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'auto minmax(0,2fr) auto minmax(0,2fr)', gap: 14,
                    padding: '8px 14px', borderBottom: '1px solid rgba(201,168,76,0.16)',
                    background: 'rgba(11,18,32,0.6)',
                  }}>
                    <span style={{ width: 8 }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '1.5px', color: T.tm, textTransform: 'uppercase' }}>What to Watch For</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '1.5px', color: T.tm, textTransform: 'uppercase' }}>Urgency</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '1.5px', color: T.tm, textTransform: 'uppercase' }}>What to Do</span>
                  </div>
                )}
                {data.s04.rows.map((r, i) => mobile ? <TripwireMobile key={i} row={r} /> : <Tripwire key={i} row={r} />)}
              </Pane>
            </div>

            <div style={{ gridColumn: colSpan(12) }}>
              <Pane no="06" title={data.s06.title} status="DAILY">
                <div style={{ padding: '10px 12px' }}>
                  <BookmarkGrid groups={data.s06.groups} />
                </div>
              </Pane>
            </div>
          </div>

          <SIFooter data={data} />
        </div>
      </div>
    </div>
  );
}

// Density consumed via prop (currently informational; reserved for spacing tweaks).
DashboardTerminal.densityTokens = D;
