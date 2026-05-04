'use client';
import React from 'react';
import { SI, PAGE_W, PAGE_H } from './colors';

export function Page({ children, bg, idx, total, label, agentName }) {
  return (
    <section
      data-screen-label={label}
      className="report-page"
      style={{
        width: PAGE_W,
        height: PAGE_H,
        position: 'relative',
        background: bg || 'linear-gradient(180deg, #06070a 0%, #0b1220 55%, #06070a 100%)',
        color: SI.t1,
        overflow: 'hidden',
        fontFamily: "'Poppins', sans-serif",
        boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        borderRadius: 4,
      }}
    >
      {children}
      <PageFooter idx={idx} total={total} agentName={agentName} />
    </section>
  );
}

export function StradaWordmark({ size = 28, color }) {
  return (
    <div
      style={{
        fontFamily: "'Montserrat', serif",
        fontSize: size,
        fontWeight: 800,
        letterSpacing: '-0.04em',
        color: color || SI.white,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span
        style={{
          width: size * 0.32,
          height: size * 0.32,
          borderRadius: '50%',
          background: `radial-gradient(circle at 30% 30%, ${SI.goldB}, ${SI.goldDim})`,
          boxShadow: `0 0 ${size * 0.5}px ${SI.goldCore}`,
          flexShrink: 0,
        }}
      />
      strada
    </div>
  );
}

export function PageFooter({ idx, total, agentName }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 40,
        right: 40,
        bottom: 28,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 11, fontWeight: 500, color: 'rgba(248,246,242,0.7)' }}>
        {agentName || 'kyle caruana'}
      </div>
      <div
        style={{
          fontFamily: "'Montserrat', serif",
          fontSize: 9,
          letterSpacing: '3px',
          textTransform: 'uppercase',
          color: SI.gold,
          fontWeight: 700,
          opacity: 0.7,
        }}
      >
        {String(idx).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </div>
      <StradaWordmark size={20} />
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub }) {
  return (
    <div style={{ padding: '56px 48px 0' }}>
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
          {eyebrow}
        </span>
      </div>
      <h1
        style={{
          fontFamily: "'Montserrat', serif",
          fontSize: 44,
          fontWeight: 800,
          letterSpacing: '-0.025em',
          margin: 0,
          color: SI.t1,
          lineHeight: 1.0,
        }}
      >
        {title}
      </h1>
      {sub && (
        <p
          style={{
            fontFamily: "'Poppins', sans-serif",
            fontSize: 14,
            color: SI.t2,
            margin: '12px 0 0',
            lineHeight: 1.55,
            maxWidth: 540,
          }}
        >
          {sub}
        </p>
      )}
      <div
        style={{
          height: 1,
          marginTop: 22,
          background: `linear-gradient(90deg, ${SI.gold}88 0%, ${SI.gold}22 40%, transparent 100%)`,
        }}
      />
    </div>
  );
}

export function ImgPh({ label, w, h, style = {}, dim = 0.55 }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        position: 'relative',
        borderRadius: 8,
        background: `
          repeating-linear-gradient(135deg, rgba(201,168,76,0.04) 0 14px, transparent 14px 28px),
          linear-gradient(135deg, #0c1524 0%, #182236 50%, #0c1524 100%)
        `,
        border: `1px solid ${SI.gold}33`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: "'Montserrat', serif",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '2.8px',
          textTransform: 'uppercase',
          color: SI.gold,
          opacity: dim,
          textAlign: 'center',
          padding: 10,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 01 COVER
// ════════════════════════════════════════════════════════════
export function CoverPage({ idx, total, tweaks }) {
  const t = tweaks || {};
  const agent = t.agentName || 'kyle caruana';
  const role = t.agentRole || 'leasing associate';
  const phone = t.agentPhone || '+971 58 579 2599';
  const building = t.building || 'VIDA residences';
  const month = t.month || 'january 2026';
  const initials = agent
    .split(' ')
    .map((s) => s[0]?.toUpperCase())
    .slice(0, 2)
    .join('');

  return (
    <section
      data-screen-label="01 Cover"
      className="report-page"
      style={{
        width: PAGE_W,
        height: PAGE_H,
        position: 'relative',
        overflow: 'hidden',
        background: '#06070a',
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>
        <ImgPh label="dubai marina hero photo" w={PAGE_W} h={PAGE_H} style={{ borderRadius: 0, border: 'none' }} dim={0.35} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '58%',
          background: 'linear-gradient(90deg, #06070a 0%, #06070a 70%, rgba(6,7,10,0) 100%)',
        }}
      />

      <div style={{ position: 'absolute', top: 64, left: 56 }}>
        <StradaWordmark size={36} />
      </div>

      <div style={{ position: 'absolute', top: 280, left: 56, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 2, background: `linear-gradient(90deg, ${SI.gold}, transparent)` }} />
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
          Market Intelligence Briefing
        </span>
      </div>

      <div style={{ position: 'absolute', top: 320, left: 56, right: 320 }}>
        <div
          style={{
            fontFamily: "'Poppins', sans-serif",
            fontSize: 26,
            fontWeight: 300,
            color: SI.white,
            letterSpacing: '-0.01em',
            marginBottom: 8,
          }}
        >
          {building}
        </div>
        <h1
          style={{
            fontFamily: "'Montserrat', serif",
            fontSize: 78,
            fontWeight: 800,
            letterSpacing: '-0.035em',
            margin: 0,
            color: SI.t1,
            lineHeight: 0.92,
          }}
        >
          monthly
          <br />
          report
        </h1>
        <div
          style={{
            fontFamily: "'Poppins', sans-serif",
            fontSize: 24,
            fontWeight: 300,
            color: SI.goldL,
            letterSpacing: '-0.01em',
            marginTop: 18,
          }}
        >
          {month}
        </div>
      </div>

      <div style={{ position: 'absolute', left: 56, bottom: 96, display: 'flex', alignItems: 'center', gap: 0 }}>
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${SI.gold}, ${SI.goldDim})`,
            border: `2px solid ${SI.goldB}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#06070a',
            fontFamily: "'Montserrat', serif",
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: '0.04em',
            boxShadow: `0 0 24px ${SI.goldCore}55`,
            zIndex: 2,
          }}
        >
          {initials}
        </div>
        <div
          style={{
            marginLeft: -18,
            padding: '14px 22px 14px 32px',
            background: `linear-gradient(90deg, ${SI.gold}cc, ${SI.goldDim}aa)`,
            borderRadius: 14,
            color: '#06070a',
            fontFamily: "'Poppins', sans-serif",
            minWidth: 200,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.1, letterSpacing: '-0.01em' }}>{agent}</div>
          <div style={{ fontWeight: 400, fontSize: 12, opacity: 0.85, marginTop: 2 }}>{role}</div>
          <div style={{ fontWeight: 500, fontSize: 12, marginTop: 2 }}>{phone}</div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 32,
          right: 56,
          fontFamily: "'Montserrat', serif",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '3px',
          textTransform: 'uppercase',
          color: SI.gold,
          opacity: 0.7,
        }}
      >
        {String(idx).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════
// 02 + 03 — WHAT TO EXPECT
// ════════════════════════════════════════════════════════════
export function ExpectPageA({ idx, total, tweaks }) {
  return (
    <Page idx={idx} total={total} label="02 What to expect — reach" agentName={tweaks?.agentName}>
      <PageHeader
        eyebrow="What To Expect"
        title="when collaborating with a strada agent"
        sub="A network built for visibility — your property is exposed to a curated audience across video, social, and editorial channels."
      />
      <div style={{ padding: '32px 48px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <ImgPh label="youtube channel — strada library" w={'100%'} h={220} />
        <ImgPh label="instagram — stradauae reels" w={'100%'} h={220} />
      </div>

      <div style={{ padding: '32px 48px 0' }}>
        {[
          ['Round-the-clock attention', 'given to every listed property — not a queue, not a back-burner.'],
          ['Strict marketing standards', 'so every property is represented to the highest standard, every time.'],
          ['Recognised brand', 'representing your home with a company recognised industry-wide for excellence.'],
        ].map(([title, body], i) => (
          <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                marginTop: 8,
                background: SI.goldB,
                boxShadow: `0 0 10px ${SI.goldCore}`,
                flexShrink: 0,
              }}
            />
            <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 14, color: SI.t1, lineHeight: 1.55 }}>
              <strong style={{ color: SI.goldL, fontWeight: 600 }}>{title}</strong>{' '}
              <span style={{ color: SI.t2 }}>— {body}</span>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 48,
          right: 48,
          bottom: 110,
          background: 'linear-gradient(90deg, rgba(11,18,32,0.9), rgba(15,22,38,0.9))',
          border: `1px solid ${SI.gold}33`,
          borderRadius: 14,
          padding: '18px 22px',
          display: 'flex',
          alignItems: 'center',
          gap: 22,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${SI.goldDim}, ${SI.gold})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Montserrat', serif",
            fontWeight: 800,
            fontSize: 11,
            color: '#06070a',
            textAlign: 'center',
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}
        >
          BAYUT
          <br />
          AWARDS
          <br />
          2024
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: "'Montserrat', serif",
              fontWeight: 800,
              fontSize: 22,
              color: SI.t1,
              letterSpacing: '-0.01em',
            }}
          >
            agency of the year
          </div>
          <div
            style={{
              fontFamily: "'Montserrat', serif",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '2.5px',
              textTransform: 'uppercase',
              color: SI.gold,
              marginTop: 4,
            }}
          >
            Premium · Bayut Recognition · 2024
          </div>
        </div>
      </div>
    </Page>
  );
}

export function ExpectPageB({ idx, total, tweaks }) {
  return (
    <Page idx={idx} total={total} label="03 What to expect — reporting" agentName={tweaks?.agentName}>
      <PageHeader
        eyebrow="What To Expect"
        title="data-driven listing intelligence"
        sub="Every property gets a step-by-step marketing plan, comprehensive listing reports, and frequent performance updates."
      />

      <div style={{ padding: '28px 48px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <ImgPh label="strada listing report — one-page summary" w={'100%'} h={300} />
        <ImgPh label="campaign performance dashboard view" w={'100%'} h={300} />
      </div>

      <div style={{ padding: '24px 48px 0' }}>
        {[
          ['Step-by-step strategy', 'Results-based marketing plan tailored to rent or sell.'],
          ['Comprehensive listing report', 'Full transparency on enquiries, viewings, offers, days on market.'],
          ['Frequent performance updates', 'You see exactly what is working — and what isn’t.'],
          ['Bespoke market insights', 'Building-level data tailored to your asset, on request.'],
        ].map(([title, body], i) => (
          <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: 999, marginTop: 8, background: SI.goldB, flexShrink: 0 }} />
            <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 13, color: SI.t1, lineHeight: 1.5 }}>
              <strong style={{ color: SI.goldL, fontWeight: 600 }}>{title}</strong>{' '}
              <span style={{ color: SI.t2 }}>— {body}</span>
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}

// ════════════════════════════════════════════════════════════
// 04 + 05 — COMMUNITY UPDATES
// ════════════════════════════════════════════════════════════
export function CommunityA({ idx, total, tweaks }) {
  return (
    <Page idx={idx} total={total} label="04 Community — story 1" agentName={tweaks?.agentName}>
      <ImgPh label="story 1 — banner" w={'100%'} h={260} style={{ borderRadius: 0, border: 'none' }} dim={0.4} />
      <div style={{ padding: '38px 48px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 36, height: 2, background: `linear-gradient(90deg, ${SI.gold}, transparent)` }} />
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
            Community Updates
          </span>
        </div>
        <h1
          style={{
            fontFamily: "'Montserrat', serif",
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            margin: 0,
            color: SI.t1,
            lineHeight: 1.05,
          }}
        >
          RTA completes 65% of the bridge development to Dubai Harbour.
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 24 }}>
          <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 12.5, color: SI.t2, lineHeight: 1.65, margin: 0 }}>
            Dubai’s Roads and Transport Authority (RTA) has completed 65% of construction works on a 1,500-metre
            bridge featuring two lanes in each direction, providing direct access between Sheikh Zayed Road and Dubai
            Harbour — a landmark waterfront destination home to the largest yacht marinas in the Middle East.
          </p>
          <ImgPh label="story 1 — image A" w={'100%'} h={170} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, marginTop: 18 }}>
          <ImgPh label="story 1 — image B" w={'100%'} h={180} />
          <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 12.5, color: SI.t2, lineHeight: 1.65, margin: 0 }}>
            The bridge spans 1,500m across two lanes per direction, with capacity of ~6,000 vehicles per hour. The
            project includes at-grade improvements at four key intersections — Interchange 5, Al Falak / Al Naseem,
            King Salman bin Abdulaziz Al Saud / Al Naseem, and Dubai Harbour Street. Once complete, travel time across
            the corridor drops from 12 to 3 minutes.
          </p>
        </div>
      </div>
    </Page>
  );
}

export function CommunityB({ idx, total, tweaks }) {
  return (
    <Page idx={idx} total={total} label="05 Community — story 2" agentName={tweaks?.agentName}>
      <ImgPh label="story 2 — banner" w={'100%'} h={260} style={{ borderRadius: 0, border: 'none' }} dim={0.4} />
      <div style={{ padding: '38px 48px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 36, height: 2, background: `linear-gradient(90deg, ${SI.gold}, transparent)` }} />
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
            Community Updates
          </span>
        </div>
        <h1
          style={{
            fontFamily: "'Montserrat', serif",
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            margin: 0,
            color: SI.t1,
            lineHeight: 1.05,
          }}
        >
          Ciel Dubai Marina — the world’s tallest hotel opens.
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20, marginTop: 24 }}>
          <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 12.5, color: SI.t2, lineHeight: 1.65, margin: 0 }}>
            Dubai is set to break another world record as Ciel Dubai Marina, Vignette Collection, opens its doors.
            Soaring 377 metres, the property replaces the Gevora Hotel as the world’s tallest hotel. InterContinental
            Hotels Group has confirmed the opening with reservations now live.
          </p>
          <ImgPh label="story 2 — image A" w={'100%'} h={180} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 20, marginTop: 18 }}>
          <ImgPh label="story 2 — image B" w={'100%'} h={210} />
          <p style={{ fontFamily: "'Poppins', sans-serif", fontSize: 12.5, color: SI.t2, lineHeight: 1.6, margin: 0 }}>
            The hotel towers over Dubai Marina with 1,004 rooms across 82 floors, managed by The First Group
            Hospitality. Guests get immediate access to the Marina’s shopping, beaches, and waterfront attractions.
            Rooms priced from AED 1,552 up to AED 4,305 for a three-person bedroom suite with high-floor lounge access.
          </p>
        </div>
      </div>
    </Page>
  );
}
