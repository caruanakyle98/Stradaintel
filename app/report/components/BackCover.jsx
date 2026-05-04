'use client';
import React from 'react';
import { SI, PAGE_W, PAGE_H } from './colors';
import { StradaWordmark } from './Pages';

export function BackCoverPage({ idx, total, kpis, tweaks }) {
  const t = tweaks || {};
  const url = t.dashboardUrl || 'stradaintel.info/dashboard';
  const agent = t.agentName || 'kyle caruana';
  const role = t.agentRole || 'leasing associate';
  const phone = t.agentPhone || '+971 58 579 2599';
  const email = t.agentEmail || 'kyle@stradaintel.com';
  const initials = agent
    .split(' ')
    .map((s) => s[0]?.toUpperCase())
    .slice(0, 2)
    .join('');

  const tiles = (kpis && kpis.length === 3 ? kpis : [
    ['Live transfers', '—', SI.goldL],
    ['Index Δ', '—', SI.goldB],
    ['Active listings', '—', SI.t1],
  ]).map(([label, value, color]) => [label, value, typeof color === 'string' ? color : SI.t1]);

  return (
    <section
      data-screen-label="13 Back cover — dashboard"
      className="report-page"
      style={{
        width: PAGE_W,
        height: PAGE_H,
        position: 'relative',
        overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 30%, #0f1626 0%, #06070a 70%)',
        color: SI.t1,
      }}
    >
      <div style={{ position: 'absolute', top: 64, left: 56 }}>
        <StradaWordmark size={32} />
      </div>

      <div style={{ position: 'absolute', top: 150, left: 56, right: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 36, height: 2, background: `linear-gradient(90deg, transparent, ${SI.gold})` }} />
          <span
            style={{
              fontFamily: "'Montserrat', serif",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '3.5px',
              textTransform: 'uppercase',
              color: SI.gold,
            }}
          >
            Live Market Intelligence
          </span>
        </div>
        <h1
          style={{
            fontFamily: "'Montserrat', serif",
            fontSize: 56,
            fontWeight: 800,
            letterSpacing: '-0.035em',
            margin: 0,
            color: SI.t1,
            lineHeight: 0.95,
          }}
        >
          your market,
          <br />
          <span style={{ color: SI.goldL }}>updated daily.</span>
        </h1>
        <p
          style={{
            fontFamily: "'Poppins', sans-serif",
            fontSize: 14,
            color: SI.t2,
            lineHeight: 1.6,
            maxWidth: 480,
            marginTop: 18,
          }}
        >
          This report is a snapshot. The dashboard is the full picture — live transaction feeds, building-level
          indices, and bespoke filters across every Strada-tracked tower in Dubai.
        </p>
      </div>

      <div style={{ position: 'absolute', top: 410, left: 56, right: 56 }}>
        <div
          style={{
            width: '100%',
            height: 270,
            borderRadius: 10,
            border: `1px solid ${SI.gold}55`,
            background: 'linear-gradient(135deg, #0c1524 0%, #0f1626 100%)',
            boxShadow: `0 30px 60px rgba(0,0,0,0.55), 0 0 0 1px ${SI.gold}22`,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 14px',
              borderBottom: `1px solid ${SI.gold}22`,
              background: '#070b14',
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a4358' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a4358' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a4358' }} />
            <div
              style={{
                flex: 1,
                marginLeft: 14,
                height: 18,
                borderRadius: 4,
                background: 'rgba(201,168,76,0.06)',
                border: `1px solid ${SI.gold}22`,
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                fontFamily: "'Poppins', sans-serif",
                fontSize: 10,
                color: SI.gold,
                letterSpacing: '0.04em',
              }}
            >
              {url}
            </div>
          </div>
          <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {tiles.map(([l, v, c], i) => (
              <div
                key={i}
                style={{
                  border: `1px solid ${SI.gold}22`,
                  borderRadius: 8,
                  padding: 12,
                  background: 'rgba(201,168,76,0.04)',
                }}
              >
                <div
                  style={{
                    fontFamily: "'Montserrat', serif",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    color: SI.tm,
                  }}
                >
                  {l}
                </div>
                <div
                  style={{
                    fontFamily: "'Montserrat', serif",
                    fontSize: 22,
                    fontWeight: 800,
                    color: c,
                    marginTop: 6,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {v}
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '0 18px' }}>
            <svg width="100%" height="120" viewBox="0 0 600 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="lg" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={SI.goldB} stopOpacity="0.4" />
                  <stop offset="100%" stopColor={SI.goldB} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,80 L60,72 L120,78 L180,55 L240,60 L300,40 L360,48 L420,30 L480,38 L540,22 L600,28 L600,120 L0,120 Z"
                fill="url(#lg)"
              />
              <path
                d="M0,80 L60,72 L120,78 L180,55 L240,60 L300,40 L360,48 L420,30 L480,38 L540,22 L600,28"
                fill="none"
                stroke={SI.goldB}
                strokeWidth="2"
              />
              <g>
                {[80, 72, 78, 55, 60, 40, 48, 30, 38, 22, 28].map((y, i) => (
                  <circle key={i} cx={i * 60} cy={y} r="3" fill={SI.goldL} />
                ))}
              </g>
            </svg>
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 56,
          right: 56,
          bottom: 180,
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 18,
          alignItems: 'center',
          background: 'rgba(11,18,32,0.85)',
          border: `1px solid ${SI.gold}55`,
          borderRadius: 12,
          padding: '18px 22px',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Montserrat', serif",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: SI.gold,
              marginBottom: 6,
            }}
          >
            Visit the dashboard
          </div>
          <div
            style={{
              fontFamily: "'Montserrat', serif",
              fontSize: 22,
              fontWeight: 800,
              color: SI.t1,
              letterSpacing: '-0.02em',
            }}
          >
            {url}
          </div>
        </div>
        <div
          style={{
            padding: '12px 22px',
            borderRadius: 6,
            background: `linear-gradient(135deg, ${SI.gold}, ${SI.goldL})`,
            color: '#06070a',
            fontFamily: "'Montserrat', serif",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            boxShadow: `0 8px 28px ${SI.goldCore}55`,
          }}
        >
          open dashboard →
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 56,
          right: 56,
          bottom: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${SI.gold}, ${SI.goldDim})`,
            border: `2px solid ${SI.goldB}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#06070a',
            fontFamily: "'Montserrat', serif",
            fontWeight: 800,
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 16, fontWeight: 600, color: SI.t1 }}>
            {agent}
          </div>
          <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 12, color: SI.tm, marginTop: 2 }}>{role}</div>
          <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 12, color: SI.goldL, marginTop: 4 }}>
            {phone} · {email}
          </div>
        </div>
        <StradaWordmark size={20} />
      </div>
    </section>
  );
}
