'use client';
import React from 'react';
import { SI } from './colors';
import { Page, PageHeader } from './Pages';

// ────────────────────────────────────────────────────────────
// Generic table primitive
// ────────────────────────────────────────────────────────────
function DataTable({ headers, rows, colWidths, emptyLabel = 'No transactions in window.' }) {
  if (!rows?.length) {
    return (
      <div
        style={{
          border: `1px solid ${SI.gold}33`,
          borderRadius: 12,
          padding: '32px 18px',
          background: 'rgba(11,18,32,0.5)',
          textAlign: 'center',
          fontFamily: "'Poppins', sans-serif",
          fontSize: 12,
          color: SI.tm,
        }}
      >
        {emptyLabel}
      </div>
    );
  }
  return (
    <div
      style={{
        border: `1px solid ${SI.gold}33`,
        borderRadius: 12,
        overflow: 'hidden',
        background: 'rgba(11,18,32,0.5)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: colWidths,
          background: `linear-gradient(180deg, ${SI.gold}22, ${SI.gold}08)`,
          borderBottom: `1px solid ${SI.gold}44`,
        }}
      >
        {headers.map((h, i) => (
          <div
            key={i}
            style={{
              padding: '14px 12px',
              fontFamily: "'Montserrat', serif",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '2.2px',
              textTransform: 'uppercase',
              color: SI.goldL,
            }}
          >
            {h}
          </div>
        ))}
      </div>
      {rows.map((row, r) => (
        <div
          key={r}
          style={{
            display: 'grid',
            gridTemplateColumns: colWidths,
            borderBottom: r < rows.length - 1 ? `1px solid ${SI.gold}14` : 'none',
            background: r % 2 === 0 ? 'transparent' : 'rgba(201,168,76,0.025)',
          }}
        >
          {row.map((cell, c) => (
            <div
              key={c}
              style={{
                padding: '11px 12px',
                fontFamily: "'Poppins', sans-serif",
                fontSize: 10.5,
                color: c === row.length - 1 ? SI.goldL : SI.t1,
                fontWeight: c === row.length - 1 ? 600 : 400,
                letterSpacing: '0.01em',
                whiteSpace: 'normal',
                lineHeight: 1.3,
              }}
            >
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// 06 — SALES TRANSFERS TABLE
export function SalesTablePage({ idx, total, rows, tweaks }) {
  const building = tweaks?.building || 'this community';
  return (
    <Page idx={idx} total={total} label="06 Sales transfers" agentName={tweaks?.agentName}>
      <PageHeader
        eyebrow="Sales Performance"
        title="recent transfers"
        sub={`A list of recorded sales transfers in ${building} across the last reporting window.`}
      />
      <div style={{ padding: '32px 48px 0' }}>
        <DataTable
          headers={['Transfer Date', 'Tower', 'Unit', 'Beds', 'Type', 'Sale Price (AED)']}
          rows={rows}
          colWidths="1.1fr 1.7fr 0.7fr 0.6fr 0.9fr 1.1fr"
        />
      </div>
    </Page>
  );
}

// 07 — RENTAL CONTRACTS TABLE
export function RentalTablePage({ idx, total, rows, tweaks }) {
  const building = tweaks?.building || 'this community';
  return (
    <Page idx={idx} total={total} label="07 Rental transactions" agentName={tweaks?.agentName}>
      <PageHeader
        eyebrow="Rental Performance"
        title="recent transactions"
        sub={`Recorded contracts and renewals across ${building} for the reporting window.`}
      />
      <div style={{ padding: '32px 48px 0' }}>
        <DataTable
          headers={['Contract Date', 'Tower', 'Unit', 'Beds', 'Type', 'Rent (AED/yr)']}
          rows={rows}
          colWidths="1.1fr 1.7fr 0.7fr 0.6fr 0.9fr 1.1fr"
        />
      </div>
    </Page>
  );
}

// ────────────────────────────────────────────────────────────
// Chart primitives (vertical bar, horizontal bar, axis, grid, legend)
// ────────────────────────────────────────────────────────────
function VBar({ value, max, color, glow, format }) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
      <div style={{ position: 'relative', width: '100%', height: 220, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div
          style={{
            width: '70%',
            height: `${pct}%`,
            background: `linear-gradient(180deg, ${color} 0%, ${color}88 100%)`,
            borderRadius: '4px 4px 0 0',
            border: `1px solid ${color}`,
            borderBottom: 'none',
            boxShadow: glow,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -22,
              left: '50%',
              transform: 'translateX(-50%)',
              fontFamily: "'Montserrat', serif",
              fontSize: 11,
              fontWeight: 700,
              color: SI.t1,
              whiteSpace: 'nowrap',
            }}
          >
            {format(value)}
          </div>
        </div>
      </div>
    </div>
  );
}

function YAxis({ ticks, format, height = 220 }) {
  return (
    <div style={{ position: 'relative', height: height + 30, width: 50, paddingTop: 24 }}>
      {ticks.map((t, i) => {
        const pct = i / (ticks.length - 1);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              right: 4,
              bottom: 6 + pct * height,
              fontFamily: "'Poppins', sans-serif",
              fontSize: 9,
              color: SI.tm,
              transform: 'translateY(50%)',
            }}
          >
            {format(t)}
          </div>
        );
      })}
    </div>
  );
}

function GridBg({ ticks, height = 220 }) {
  return (
    <div style={{ position: 'absolute', inset: '24px 0 30px 0', pointerEvents: 'none' }}>
      {ticks.map((_, i) => {
        const pct = i / (ticks.length - 1);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: pct * height,
              height: 1,
              background: i === 0 ? `${SI.gold}33` : `${SI.gold}10`,
            }}
          />
        );
      })}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginBottom: 8 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: it.color, boxShadow: `0 0 8px ${it.color}` }} />
          <span style={{ fontFamily: "'Poppins', sans-serif", fontSize: 11, color: SI.t2 }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// Auto-tick generator for varying data magnitudes (stable round numbers).
function buildTicks(max, count = 8) {
  if (!max || max <= 0) return [0, 1, 2, 3, 4, 5, 6, 7];
  const step = niceStep(max / (count - 1));
  return Array.from({ length: count }, (_, i) => i * step);
}
function niceStep(raw) {
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / exp;
  let nice;
  if (norm < 1.5) nice = 1;
  else if (norm < 3) nice = 2;
  else if (norm < 7) nice = 5;
  else nice = 10;
  return nice * exp;
}

// 08 — LISTING PERFORMANCE
export function ListingPerfPage({ idx, total, listings, volume, tweaks }) {
  const data = listings || [];
  const allValues = data.flatMap((d) => [d.listing || 0, d.txn || 0]).filter((v) => v > 0);
  const max = allValues.length ? Math.max(...allValues) * 1.1 : 360000;
  const ticks = buildTicks(max);
  const fmt = (v) => v.toLocaleString();
  const building = tweaks?.building || 'this community';

  return (
    <Page idx={idx} total={total} label="08 Listing performance" agentName={tweaks?.agentName}>
      <PageHeader
        eyebrow="Listing Performance"
        title="listings vs transactions"
        sub={`Average listed price vs actual transacting price by unit configuration — ${building} (rent).`}
      />
      <div style={{ padding: '28px 48px 0' }}>
        <Legend
          items={[
            { label: 'Listing price', color: SI.goldB },
            { label: 'Transacting price', color: SI.gold },
          ]}
        />
        <div style={{ position: 'relative', display: 'flex', gap: 8, padding: '0 12px' }}>
          <YAxis ticks={ticks} format={fmt} height={220} />
          <div style={{ flex: 1, position: 'relative' }}>
            <GridBg ticks={ticks} height={220} />
            <div style={{ display: 'flex', gap: 24, height: 220 + 30, paddingTop: 24, position: 'relative' }}>
              {data.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <VBar value={d.listing} max={max} color={SI.goldB} glow={`0 0 14px ${SI.goldB}55`} format={fmt} />
                  <VBar value={d.txn} max={max} color={SI.gold} glow={`0 0 14px ${SI.gold}55`} format={fmt} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
              {data.map((d, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    fontFamily: "'Montserrat', serif",
                    fontSize: 11,
                    fontWeight: 700,
                    color: SI.t1,
                    letterSpacing: '0.02em',
                  }}
                >
                  {d.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 28 }}>
          <div
            style={{
              fontFamily: "'Poppins', sans-serif",
              fontSize: 13,
              color: SI.t2,
              textAlign: 'center',
              marginBottom: 16,
            }}
          >
            Volume of rental transactions by bedroom count
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end' }}>
            {(volume || []).map((d, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 2 }}>
                  {Array.from({ length: Math.max(1, d.beds || 1) }).map((_, k) => (
                    <div
                      key={k}
                      style={{
                        width: 14,
                        height: 22,
                        borderRadius: '7px 7px 3px 3px',
                        background: SI.goldL,
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          width: 14,
                          height: 9,
                          borderRadius: '50%',
                          background: SI.goldL,
                          position: 'absolute',
                          top: -7,
                          left: 0,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: '50%',
                    border: `2px solid ${SI.goldB}`,
                    boxShadow: `0 0 18px ${SI.gold}55`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'Montserrat', serif",
                    fontWeight: 800,
                    fontSize: 28,
                    color: SI.goldL,
                  }}
                >
                  {d.count ?? 0}
                </div>
                <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 10, color: SI.tm, fontWeight: 500 }}>
                  {d.beds} bed
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
}

function VBarStandalone({ label, value, max, color, fmt, height = 130 }) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
      <div style={{ width: '100%', height, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div
          style={{
            width: '60%',
            height: `${pct}%`,
            background: `linear-gradient(180deg, ${color} 0%, ${color}99 100%)`,
            border: `1px solid ${color}`,
            borderBottom: 'none',
            borderRadius: '4px 4px 0 0',
            boxShadow: `0 0 12px ${color}55`,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              fontFamily: "'Poppins', sans-serif",
              fontSize: 10,
              fontWeight: 600,
              color: '#06070a',
              whiteSpace: 'nowrap',
            }}
          >
            {fmt(value)}
          </div>
        </div>
      </div>
      <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 10, color: SI.t2, marginTop: 6 }}>{label}</div>
    </div>
  );
}

function MiniChart({ title, data, max, color, ticks, fmt }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "'Poppins', sans-serif",
          fontSize: 13,
          color: SI.t1,
          fontWeight: 500,
          textAlign: 'center',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
        <span style={{ fontFamily: "'Poppins', sans-serif", fontSize: 10, color: SI.t2 }}>avg price</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <YAxis ticks={ticks} format={fmt} height={130} />
        <div style={{ flex: 1, position: 'relative' }}>
          <GridBg ticks={ticks} height={130} />
          <div style={{ display: 'flex', gap: 14, height: 130 + 24, paddingTop: 24, position: 'relative' }}>
            {data.map((d, i) => (
              <VBarStandalone key={i} label={d.label} value={d.value} max={max} color={color} fmt={fmt} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 09 — SALES INDEX 6mo (single-chart fallback since view-type split isn't in API)
export function SalesIndex6Mo({ idx, total, bars, tweaks }) {
  const fmt = (v) => 'AED' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v.toLocaleString());
  const data = bars || [];
  const maxVal = Math.max(...data.map((d) => d.value || 0), 1);
  const max = niceStep(maxVal * 1.15);
  const ticks = buildTicks(max);
  const building = tweaks?.building || 'this community';

  return (
    <Page idx={idx} total={total} label="09 Sales index — 6 months" agentName={tweaks?.agentName}>
      <PageHeader
        eyebrow="Sales Performance Index"
        title="market performance — last 6 months"
        sub={`Average sale price by unit configuration. ${building}.`}
      />
      <div style={{ padding: '24px 48px 0' }}>
        <h3
          style={{
            fontFamily: "'Montserrat', serif",
            fontSize: 18,
            fontWeight: 700,
            color: SI.t1,
            textAlign: 'center',
            margin: '8px 0 18px',
            letterSpacing: '-0.01em',
          }}
        >
          average sale price by unit configuration
        </h3>
        <div
          style={{
            background: 'rgba(11,18,32,0.6)',
            border: `1px solid ${SI.gold}22`,
            borderRadius: 12,
            padding: 20,
          }}
        >
          <MiniChart title="all units" data={data} max={max} color={SI.goldB} ticks={ticks} fmt={fmt} />
        </div>
      </div>
    </Page>
  );
}

function HBar({ label, value, max, color, deltaLabel, deltaUp, fmt }) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <div
        style={{
          width: 50,
          fontFamily: "'Poppins', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          color: SI.t1,
          textAlign: 'right',
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, position: 'relative', height: 26 }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${color}, ${color}88)`,
            borderRadius: 3,
            border: `1px solid ${color}`,
            boxShadow: `0 0 10px ${color}44`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 8,
          }}
        >
          <span
            style={{
              fontFamily: "'Poppins', sans-serif",
              fontSize: 10,
              fontWeight: 600,
              color: '#06070a',
              whiteSpace: 'nowrap',
            }}
          >
            {fmt(value)}
          </span>
        </div>
      </div>
      <div
        style={{
          width: 70,
          fontFamily: "'Poppins', sans-serif",
          fontSize: 11,
          fontWeight: 700,
          color: deltaUp ? SI.goldL : SI.t2,
        }}
      >
        {deltaLabel ? `${deltaUp ? '↑' : '↓'} ${deltaLabel}` : '—'}
      </div>
    </div>
  );
}

// 10 — SALES INDEX 12mo
export function SalesIndex12Mo({ idx, total, bars, kpi, tweaks }) {
  const fmt = (v) => 'AED' + (v >= 1000000 ? (v / 1000000).toFixed(2) + 'M' : v.toLocaleString());
  const data = bars || [];
  const maxVal = Math.max(...data.map((d) => d.value || 0), 1);
  const max = niceStep(maxVal * 1.1);
  const palette = [SI.goldDim, SI.gold, SI.goldL, SI.goldB];
  const building = tweaks?.building || 'this community';
  const kpiCount = kpi?.count != null ? kpi.count.toLocaleString() : '—';
  const kpiPct = kpi?.chgPct;
  const kpiUp = kpiPct != null && kpiPct >= 0;
  const kpiPctLabel = kpiPct != null ? `${kpiPct >= 0 ? '+' : ''}${Number(kpiPct).toFixed(2)}%` : '—';

  return (
    <Page idx={idx} total={total} label="10 Sales index — 12 months" agentName={tweaks?.agentName}>
      <PageHeader
        eyebrow="Sales Performance Index"
        title="market performance — last 12 months"
        sub={`Average sale price by size and YoY change. ${building}.`}
      />
      <div style={{ padding: '28px 48px 0', display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 22 }}>
        <div
          style={{
            background: 'rgba(11,18,32,0.6)',
            border: `1px solid ${SI.gold}22`,
            borderRadius: 12,
            padding: '20px 18px',
          }}
        >
          <div
            style={{
              fontFamily: "'Poppins', sans-serif",
              fontSize: 12,
              color: SI.t2,
              marginBottom: 14,
              textAlign: 'center',
            }}
          >
            average sale price by size <span style={{ color: SI.tm }}>(last 12 months)</span>
          </div>
          {data.map((b, i) => (
            <HBar
              key={i}
              label={b.label}
              value={b.value}
              max={max}
              color={palette[i % palette.length]}
              deltaLabel={
                b.delta != null ? `${b.delta >= 0 ? '+' : ''}${Number(b.delta).toFixed(2)}%` : null
              }
              deltaUp={b.delta != null ? b.delta >= 0 : true}
              fmt={fmt}
            />
          ))}
        </div>
        <div
          style={{
            background: 'rgba(11,18,32,0.7)',
            border: `1px solid ${SI.gold}55`,
            borderRadius: 14,
            padding: '22px 18px',
            textAlign: 'center',
            boxShadow: `inset 0 0 30px ${SI.gold}15`,
          }}
        >
          <div
            style={{
              fontFamily: "'Montserrat', serif",
              fontSize: 18,
              fontWeight: 800,
              color: kpiUp ? SI.goldL : SI.t2,
              letterSpacing: '-0.01em',
            }}
          >
            {kpiPctLabel} {kpiUp ? '↑' : '↓'}
          </div>
          <div
            style={{
              fontFamily: "'Montserrat', serif",
              fontSize: 60,
              fontWeight: 900,
              color: SI.goldL,
              letterSpacing: '-0.04em',
              lineHeight: 1,
              margin: '8px 0',
              textShadow: `0 0 24px ${SI.goldCore}66`,
            }}
          >
            {kpiCount}
          </div>
          <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 12, color: SI.t1, fontWeight: 500, marginBottom: 14 }}>
            new transfers
          </div>
          <div style={{ height: 1, background: `${SI.gold}33`, marginBottom: 12 }} />
          <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 11, color: SI.t2, lineHeight: 1.55, margin: 0 }}>
            Total transactions{' '}
            <strong style={{ color: SI.t1 }}>{kpiUp ? 'up' : 'down'} {kpiPctLabel.replace(/^[+-]/, '')}</strong> compared to the
            same period last year.
          </p>
        </div>
      </div>
      <div style={{ padding: '28px 48px 0' }}>
        <div
          style={{
            background: `linear-gradient(135deg, rgba(201,168,76,0.08), rgba(11,18,32,0.6))`,
            border: `1px solid ${SI.gold}22`,
            borderRadius: 12,
            padding: '18px 22px',
          }}
        >
          <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 13, color: SI.t1, lineHeight: 1.6, margin: 0 }}>
            {summarisePriceMovement(data)}
          </p>
        </div>
      </div>
    </Page>
  );
}

function summarisePriceMovement(bars) {
  const ups = bars.filter((b) => (b.delta ?? 0) > 0).map((b) => b.label);
  const downs = bars.filter((b) => (b.delta ?? 0) < 0).map((b) => b.label);
  if (!ups.length && !downs.length) {
    return 'Insufficient data this period to determine bedroom-level price direction. See the dashboard for live trends.';
  }
  const parts = [];
  if (ups.length) parts.push(<React.Fragment key="u"><strong style={{ color: SI.goldB }}>{ups.join(', ')}</strong> {ups.length === 1 ? 'is' : 'are'} <strong style={{ color: SI.goldL }}>up</strong> compared to last year</React.Fragment>);
  if (downs.length) parts.push(<React.Fragment key="d">{ups.length ? '; ' : ''}<strong style={{ color: SI.goldL }}>{downs.join(', ')}</strong> {downs.length === 1 ? 'is' : 'are'} <strong style={{ color: SI.t2 }}>down</strong></React.Fragment>);
  parts.push(<React.Fragment key="end">.</React.Fragment>);
  return <>{parts}</>;
}

// 11 — RENTAL INDEX 3mo (single-chart fallback)
export function RentalIndex3Mo({ idx, total, bars, tweaks }) {
  const fmt = (v) => 'AED' + v.toLocaleString();
  const data = bars || [];
  const maxVal = Math.max(...data.map((d) => d.value || 0), 1);
  const max = niceStep(maxVal * 1.15);
  const ticks = buildTicks(max);
  const building = tweaks?.building || 'this community';

  return (
    <Page idx={idx} total={total} label="11 Rental index — 3 months" agentName={tweaks?.agentName}>
      <PageHeader
        eyebrow="Rental Performance Index"
        title="market performance — last 3 months"
        sub={`Average rental price by unit configuration. ${building}.`}
      />
      <div style={{ padding: '24px 48px 0' }}>
        <h3
          style={{
            fontFamily: "'Montserrat', serif",
            fontSize: 18,
            fontWeight: 700,
            color: SI.t1,
            textAlign: 'center',
            margin: '8px 0 18px',
            letterSpacing: '-0.01em',
          }}
        >
          average rental price by unit configuration
        </h3>
        <div
          style={{
            background: 'rgba(11,18,32,0.6)',
            border: `1px solid ${SI.gold}22`,
            borderRadius: 12,
            padding: 20,
          }}
        >
          <MiniChart title="all units" data={data} max={max} color={SI.goldB} ticks={ticks} fmt={fmt} />
        </div>
      </div>
    </Page>
  );
}

// 12 — RENTAL INDEX (current month)
export function RentalIndexJan({ idx, total, bars, kpi, tweaks }) {
  const fmt = (v) => v.toLocaleString();
  const data = bars || [];
  const maxVal = Math.max(...data.map((d) => d.value || 0), 1);
  const max = niceStep(maxVal * 1.1);
  const palette = [SI.goldB, SI.gold, SI.goldDim, SI.goldL];
  const month = tweaks?.month || 'this month';
  const kpiCount = kpi?.count != null ? kpi.count.toLocaleString() : '—';
  const kpiPct = kpi?.chgPct;
  const kpiUp = kpiPct != null && kpiPct >= 0;
  const kpiPctLabel = kpiPct != null ? `${kpiPct >= 0 ? '+' : ''}${Number(kpiPct).toFixed(2)}%` : '—';

  return (
    <Page idx={idx} total={total} label="12 Rental index — month" agentName={tweaks?.agentName}>
      <PageHeader
        eyebrow="Rental Performance Index"
        title={`market performance — ${month.split(' ')[0]}`}
        sub="Average rental price by size and month-over-month change."
      />
      <div style={{ padding: '36px 48px 0', display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 22 }}>
        <div
          style={{
            background: 'rgba(11,18,32,0.6)',
            border: `1px solid ${SI.gold}22`,
            borderRadius: 12,
            padding: '20px 18px',
          }}
        >
          <div
            style={{
              fontFamily: "'Poppins', sans-serif",
              fontSize: 12,
              color: SI.t2,
              marginBottom: 14,
              textAlign: 'center',
            }}
          >
            average rental price by size
          </div>
          {data.map((b, i) => (
            <HBar
              key={i}
              label={b.label}
              value={b.value}
              max={max}
              color={palette[i % palette.length]}
              deltaLabel={
                b.delta != null ? `${b.delta >= 0 ? '+' : ''}${Number(b.delta).toFixed(2)}%` : null
              }
              deltaUp={b.delta != null ? b.delta >= 0 : true}
              fmt={fmt}
            />
          ))}
        </div>
        <div
          style={{
            background: 'rgba(11,18,32,0.7)',
            border: `1px solid ${SI.gold}55`,
            borderRadius: 14,
            padding: '22px 18px',
            textAlign: 'center',
            boxShadow: `inset 0 0 30px ${SI.gold}15`,
          }}
        >
          <div
            style={{
              fontFamily: "'Montserrat', serif",
              fontSize: 18,
              fontWeight: 800,
              color: kpiUp ? SI.goldL : SI.t2,
              letterSpacing: '-0.01em',
            }}
          >
            {kpiPctLabel} {kpiUp ? '↑' : '↓'}
          </div>
          <div
            style={{
              fontFamily: "'Montserrat', serif",
              fontSize: 60,
              fontWeight: 900,
              color: SI.goldL,
              letterSpacing: '-0.04em',
              lineHeight: 1,
              margin: '8px 0',
              textShadow: `0 0 24px ${SI.goldCore}66`,
            }}
          >
            {kpiCount}
          </div>
          <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 12, color: SI.t1, fontWeight: 500, marginBottom: 14 }}>
            new contracts
          </div>
          <div style={{ height: 1, background: `${SI.gold}33`, marginBottom: 12 }} />
          <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 11, color: SI.t2, lineHeight: 1.55, margin: 0 }}>
            Total transactions{' '}
            <strong style={{ color: kpiUp ? SI.goldB : SI.t1 }}>{kpiUp ? 'up' : 'down'} {kpiPctLabel.replace(/^[+-]/, '')}</strong> week-on-week.
          </p>
        </div>
      </div>
      <div style={{ padding: '32px 48px 0' }}>
        <div
          style={{
            background: `linear-gradient(135deg, rgba(201,168,76,0.08), rgba(11,18,32,0.6))`,
            border: `1px solid ${SI.gold}22`,
            borderRadius: 12,
            padding: '18px 22px',
          }}
        >
          <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 13, color: SI.t1, lineHeight: 1.6, margin: 0 }}>
            {summariseRentMovement(data)}
          </p>
        </div>
      </div>
    </Page>
  );
}

function summariseRentMovement(bars) {
  const ups = bars.filter((b) => (b.delta ?? 0) > 0).map((b) => b.label);
  const downs = bars.filter((b) => (b.delta ?? 0) < 0).map((b) => b.label);
  if (!ups.length && !downs.length) {
    return 'Comparable monthly rent data is not yet available for this community. Live transactions will populate the comparison once enough data arrives.';
  }
  const parts = [];
  if (ups.length) parts.push(<React.Fragment key="u"><strong style={{ color: SI.goldL }}>{ups.join(', ')}</strong> {ups.length === 1 ? 'has' : 'have'} <strong style={{ color: SI.goldB }}>increased</strong> in average price</React.Fragment>);
  if (downs.length) parts.push(<React.Fragment key="d">{ups.length ? '; ' : ''}<strong style={{ color: SI.goldL }}>{downs.join(', ')}</strong> {downs.length === 1 ? 'has' : 'have'} <strong style={{ color: SI.t2 }}>decreased</strong></React.Fragment>);
  parts.push(<React.Fragment key="end"> versus the prior month.</React.Fragment>);
  return <>{parts}</>;
}
