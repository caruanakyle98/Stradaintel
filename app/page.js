'use client';
import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { buildPayloadFromCsvText } from '../lib/salesCsvPayload.js';
import { C } from '../lib/theme.js';

const glowFor = (col) => (col === C.g || col === C.ga) ? C.glowG : col === C.red ? C.glowRed : col === C.am ? C.glowAm : C.glowMetric;

// ── Helpers ─────────────────────────────────────────────────
const str = v => {
  if (v===null||v===undefined) return null;
  if (typeof v==='object') { if (v.value!==undefined) return String(v.value); if (v.price!==undefined) return String(v.price); return null; }
  return String(v);
};
const na = v => { const s=str(v); return (!s||s==='N/A'||s==='null'||s==='undefined')?'—':s; };

/** Merge rental-related fields from a full /api/property body (used after a sales-only fast path). */
function mergeRentalSliceFromFetch(prev, d) {
  if (!prev || !d) return prev || d;
  return {
    ...prev,
    rental: d.rental ?? prev.rental,
    rental_charts_30d: d.rental_charts_30d ?? prev.rental_charts_30d,
    rental_top_areas: d.rental_top_areas ?? prev.rental_top_areas,
    rental_top_areas_mode: d.rental_top_areas_mode ?? prev.rental_top_areas_mode,
    recent_rental_transactions: d.recent_rental_transactions ?? prev.recent_rental_transactions,
    rental_owner_briefing: d.rental_owner_briefing ?? prev.rental_owner_briefing,
    yields: d.yields ?? prev.yields,
    weekly: d.weekly ?? prev.weekly,
    sources_used: d.sources_used ?? prev.sources_used,
  };
}
const sanitizeRawGithubLinks = (t) => {
  if (t == null) return t;
  const s = typeof t === 'string' ? t : String(t);
  if (!s) return s;

  // Common pattern in our data: "Self-hosted CSV (https://raw.githubusercontent.com/...)".
  // Replace with the label only (no raw URL).
  let out = s.replace(
    /Self-hosted CSV\s*\(\s*https?:\/\/raw\.githubusercontent\.com\/[^)]*\s*\)/gi,
    'Self-hosted CSV'
  );

  // Redact any remaining raw GitHub URLs.
  out = out.replace(
    /https?:\/\/raw\.githubusercontent\.com\/[^\s)]+/gi,
    '[redacted raw data URL]'
  );

  // If we introduced empty parentheses, remove them.
  out = out.replace(/\(\s*\[redacted raw data URL\]\s*\)/gi, '');
  return out;
};
const trendCol   = t => t==='up'?C.g : t==='down'?C.red : C.t2;
const trendArrow = t => t==='up'?'↑' : t==='down'?'↓' : '→';
const barPct     = s => s ? Math.round(((Math.min(Math.max(s,1),5)-1)/4)*100) : 0;

// ── Plain-English pillar definitions ─────────────────────────
const PILLARS = {
  security:     { icon:'🌍', title:'Is the Region Stable?',            q:'Are conflicts or instability affecting investor confidence?' },
  oil:          { icon:'🛢️', title:'Gulf Oil Wealth',                   q:'Do Gulf states have money to invest in Dubai property?' },
  equities:     { icon:'🏗️', title:'Dubai Company Health',             q:'Are Dubai\'s biggest property companies doing well?' },
  macro:        { icon:'💰', title:'Are Mortgages Affordable?',         q:'Are global interest rates and borrowing costs working for or against buyers?' },
  buyer_demand: { icon:'🌏', title:'Foreign Buyer Appetite',            q:'Are buyers from India, China and abroad still active in the market?' },
  aviation:     { icon:'✈️', title:'Tourism & People Moving to Dubai',  q:'Is Dubai still growing as a place to live and invest?' },
  property:     { icon:'🏠', title:'Dubai Property Market Mood',        q:'How are buyers and sellers feeling about the market right now?' },
};

// ── Score → plain-English overall verdict ────────────────────
const VERDICT = s =>
  s>=4.3 ? { label:'Exceptional Conditions',   sub:'Rare buying window — nearly every signal is positive',                          col:C.ga }:
  s>=3.8 ? { label:'Strong Market',             sub:'Most signals are healthy — a good time to hold and invest in Dubai',            col:C.g  }:
  s>=3.3 ? { label:'Stable & Steady',           sub:'Market is in good shape — hold what you have and be selective with new buys',   col:C.g  }:
  s>=2.8 ? { label:'Mixed Signals — Caution',   sub:'Some warning signs emerging — slow down on new commitments',                    col:C.am }:
  s>=2.2 ? { label:'Market Under Pressure',     sub:'Multiple concerns — pause new purchases and protect your existing properties',  col:C.am }:
  s>=1.6 ? { label:'Significant Risk',          sub:'Conditions are deteriorating — focus on protecting what you own',              col:C.red}:
           { label:'Defensive Mode',             sub:'Serious risk conditions — hold cash, do not buy anything right now',           col:C.red};

// ── Per-pillar verdict ────────────────────────────────────────
const PILLAR_VERDICT = (sig, score) =>
  sig==='positive'||score>=4 ? { label:'Supporting your property value', col:C.g,  dot:'●' }:
  sig==='negative'||score<=2 ? { label:'Adding pressure on the market',  col:C.red,dot:'●' }:
                                { label:'No major impact right now',      col:C.t2, dot:'●' };

const css = `
  /* ─── CSS VARIABLES (landing-page design system) ───────────── */
  :root {
    --navy:       #070b14;
    --navy-mid:   #0c1220;
    --gold:       #c9a84c;
    --gold-light: #e8c96d;
    --gold-pale:  #f0d98a;
    --gold-dim:   rgba(201,168,76,0.15);
    --gold-glow:  rgba(201,168,76,0.35);
    --white:      #f8f6f2;
    --muted:      rgba(248,246,242,0.55);
    --lp-border:  rgba(201,168,76,0.18);
    --card-bg:    rgba(11,18,32,0.90);
    --radius:     14px;
    --trans:      0.4s cubic-bezier(0.22,1,0.36,1);
  }

  /* ─── KEYFRAMES ─────────────────────────────────────────────── */
  @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.4} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  @keyframes fade    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
  @keyframes shimmer { 0%{background-position:-600px 0} 100%{background-position:600px 0} }
  @keyframes pillarCardIn { from{opacity:0;transform:translateX(14px)} to{opacity:1;transform:none} }

  /* ─── RESET ──────────────────────────────────────────────────── */
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html { -webkit-text-size-adjust:100%; text-size-adjust:100%; }
  html, body { max-width:100%; overflow-x:clip; }
  body { background:var(--navy); }
  a { color:var(--gold-light); text-decoration:none; }
  a:hover { color:var(--gold-pale); }

  /* ─── SCROLLBAR ──────────────────────────────────────────────── */
  ::-webkit-scrollbar { width:4px; }
  ::-webkit-scrollbar-track { background:var(--navy); }
  ::-webkit-scrollbar-thumb { background:var(--gold); border-radius:2px; }

  /* ─── TYPOGRAPHY ─────────────────────────────────────────────── */
  .dashboard-root * { font-family:var(--font-poppins,'Poppins',-apple-system,"Segoe UI",sans-serif) !important; }
  .dashboard-root h1,.dashboard-root h2,.dashboard-root h3 { font-family:var(--font-montserrat,'Montserrat',Georgia,serif) !important; }
  .dashboard-root svg text { font-family:var(--font-montserrat,'Montserrat',Georgia,serif) !important; }

  /* ─── CARD ───────────────────────────────────────────────────── */
  .lp-card {
    background:var(--card-bg);
    border:1px solid var(--lp-border);
    border-radius:var(--radius);
    backdrop-filter:blur(12px);
    -webkit-backdrop-filter:blur(12px);
    transition:transform var(--trans), box-shadow var(--trans), border-color var(--trans), background var(--trans);
  }
  .lp-card:hover {
    transform:translateY(-2px);
    border-color:var(--gold-glow);
    box-shadow:0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px var(--gold-dim);
    background:rgba(11,18,32,0.96);
  }

  /* ─── SKELETON ───────────────────────────────────────────────── */
  .lp-skel {
    background:linear-gradient(90deg, rgba(201,168,76,0.04) 0%, rgba(201,168,76,0.12) 50%, rgba(201,168,76,0.04) 100%);
    background-size:600px 100%;
    animation:shimmer 1.8s ease-in-out infinite;
    border-radius:8px;
  }

  /* ─── BUTTONS ────────────────────────────────────────────────── */
  .lp-btn {
    display:inline-flex; align-items:center; gap:8px;
    font-family:var(--font-montserrat,'Montserrat',Georgia,serif) !important;
    font-size:10px; font-weight:700;
    letter-spacing:1.8px; text-transform:uppercase;
    padding:10px 20px; border-radius:6px;
    cursor:pointer; border:none; outline:none;
    transition:all 0.3s cubic-bezier(0.22,1,0.36,1);
    white-space:nowrap; text-decoration:none;
  }
  .lp-btn-gold {
    background:linear-gradient(135deg, var(--gold), var(--gold-light));
    color:var(--navy);
    border:1px solid rgba(255,220,100,0.35) !important;
  }
  .lp-btn-gold:hover { box-shadow:0 8px 32px var(--gold-glow); transform:translateY(-1px); }
  .lp-btn-gold:disabled { opacity:0.6; cursor:wait; transform:none; }
  .lp-btn-outline {
    background:transparent; color:var(--white);
    border:1px solid rgba(248,246,242,0.22) !important;
  }
  .lp-btn-outline:hover { border-color:var(--gold) !important; color:var(--gold-light); }
  .lp-btn-ghost {
    background:transparent; color:var(--muted);
    border:1px solid var(--lp-border) !important;
  }
  .lp-btn-ghost:hover { border-color:var(--gold-glow) !important; color:var(--gold-light); }
  .lp-btn-ghost:disabled { opacity:0.5; cursor:wait; }
  .lp-btn-accent { color:var(--gold-light) !important; }

  /* ─── STICKY NAV ─────────────────────────────────────────────── */
  .dash-nav {
    position:sticky; top:0; z-index:100;
    background:rgba(7,11,20,0.92);
    backdrop-filter:blur(20px);
    -webkit-backdrop-filter:blur(20px);
    border-bottom:1px solid var(--lp-border);
  }
  .dash-nav-inner {
    display:flex; align-items:center; justify-content:space-between;
    gap:12px; padding:14px clamp(16px,5vw,48px);
    flex-wrap:wrap;
  }
  .dash-brand { display:flex; align-items:center; gap:10px; }
  .dash-brand-dot {
    width:9px; height:9px; border-radius:50%;
    background:var(--gold-light);
    box-shadow:0 0 20px var(--gold-glow);
    animation:pulse 2s ease-in-out infinite;
    flex-shrink:0;
  }
  .dash-brand-name {
    font-family:var(--font-montserrat,'Montserrat',Georgia,serif) !important;
    font-weight:800; font-size:15px; letter-spacing:0.06em; color:var(--white);
  }
  .dash-brand-name span { color:var(--gold); }
  .dash-brand-sub {
    font-size:9px; color:var(--muted);
    letter-spacing:0.18em; text-transform:uppercase; margin-top:2px;
  }
  .dash-nav-actions {
    display:flex; align-items:center; gap:8px;
    flex-wrap:wrap; justify-content:flex-end; flex:1;
  }
  .dash-nav-row2 {
    display:flex; align-items:center; gap:8px;
    flex-wrap:wrap; justify-content:flex-end; width:100%;
  }
  /* On desktop: right-aligned meta strip as part of the flex row */
  .dash-nav-meta {
    display:flex; flex-direction:column; align-items:flex-end; gap:3px;
  }

  /* ─── SECTION HEADER ─────────────────────────────────────────── */
  .lp-sh { margin-bottom:28px; }
  .lp-sh-eyebrow { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
  .lp-sh-eyebrow::before {
    content:''; width:28px; height:2px;
    background:linear-gradient(90deg, transparent, var(--gold));
    border-radius:2px; flex-shrink:0;
  }
  .lp-sh-eyebrow span {
    font-family:var(--font-montserrat,'Montserrat',Georgia,serif) !important;
    font-size:9px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:var(--gold);
  }
  .lp-sh-title {
    font-family:var(--font-montserrat,'Montserrat',Georgia,serif) !important;
    font-size:clamp(18px,2.2vw,26px); font-weight:800;
    color:var(--white); letter-spacing:-0.02em; line-height:1.1; margin-bottom:10px;
  }
  .lp-sh-divider {
    height:1px; margin-bottom:12px;
    background:linear-gradient(90deg, rgba(201,168,76,0.5), rgba(201,168,76,0.0));
  }
  .lp-sh-desc { font-size:13px; color:var(--muted); line-height:1.75; max-width:640px; }

  /* ─── FOOTER ─────────────────────────────────────────────────── */
  .dash-footer {
    border-top:1px solid var(--lp-border);
    padding:22px clamp(16px,5vw,48px);
    display:flex; justify-content:space-between; align-items:center;
    flex-wrap:wrap; gap:12px;
    background:rgba(7,11,20,0.5);
    backdrop-filter:blur(10px);
  }

  /* ─── SCROLL REVEAL (matches landing page) ─────────────────── */
  .reveal {
    opacity:0; transform:translateY(32px);
    transition:opacity 0.85s cubic-bezier(0.22,1,0.36,1), transform 0.85s cubic-bezier(0.22,1,0.36,1);
  }
  .reveal.visible { opacity:1; transform:translateY(0); }
  .reveal-d1 { transition-delay:0.10s; }
  .reveal-d2 { transition-delay:0.20s; }
  .reveal-d3 { transition-delay:0.30s; }
  .reveal-d4 { transition-delay:0.42s; }
  .reveal-d5 { transition-delay:0.54s; }

  /* ─── PILLAR CARD SWITCHER ───────────────────────────────────── */
  /* Desktop: standard auto-fit grid, all cards visible */
  .pillar-desktop-grid {
    display:grid;
    grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    gap:10px;
  }
  /* Mobile carousel hidden on desktop */
  .pillar-mobile-nav { display:none; }

  @media (max-width:720px) {
    /* Desktop grid hidden on mobile */
    .pillar-desktop-grid { display:none !important; }

    /* Mobile: single card with slide-in animation keyed on active index */
    .pillar-mobile-nav { display:block; }
    .pillar-card-stage {
      animation:pillarCardIn 0.32s cubic-bezier(0.22,1,0.36,1);
    }

    /* Navigation row: ← dots → */
    .pillar-nav-row {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      margin-top:0;
      margin-bottom:4px;
    }
    .pillar-nav-btn {
      width:36px; height:36px; border-radius:50%;
      border:1px solid rgba(201,168,76,0.2);
      background:rgba(11,18,32,0.6);
      color:var(--gold);
      display:flex; align-items:center; justify-content:center;
      cursor:pointer; flex-shrink:0;
      transition:all 0.2s ease;
    }
    .pillar-nav-btn:disabled { opacity:0.28; cursor:not-allowed; }
    .pillar-nav-btn:not(:disabled):active {
      border-color:var(--gold);
      background:rgba(201,168,76,0.1);
    }
    .pillar-dots {
      display:flex; align-items:center; justify-content:center;
      gap:5px; flex:1;
    }
    .pillar-dot {
      width:6px; height:6px; border-radius:50%;
      border:none; padding:0; cursor:pointer;
      background:rgba(201,168,76,0.2);
      transition:all 0.3s cubic-bezier(0.22,1,0.36,1);
      flex-shrink:0;
    }
    .pillar-dot.active {
      width:22px; border-radius:3px;
      background:var(--gold);
      box-shadow:0 0 8px rgba(201,168,76,0.4);
    }
    .pillar-counter {
      text-align:center; font-size:9px;
      color:var(--muted); margin-top:8px; letter-spacing:1.5px;
    }
  }

  /* ─── UTILS ──────────────────────────────────────────────────── */
  .fade-in { animation:fade 0.5s ease; }
  .no-print { }
  .print-only { display:none; }
  .dashboard-root .print-keep-together { border-radius:var(--radius) !important; }
  .dashboard-root .print-avoid-break   { border-radius:var(--radius) !important; }
  .dashboard-root .print-section       { border-radius:var(--radius) !important; }

  /* ─── MOBILE ─────────────────────────────────────────────────── */
  @media (max-width:720px) {
    .mob-stack-2  { display:grid !important; grid-template-columns:1fr !important; }
    .mob-alert-grid { display:grid !important; grid-template-columns:1fr !important; gap:8px !important; align-items:start !important; }
    .mob-alert-grid > span { padding-left:0 !important; padding-right:0 !important; min-width:0 !important; overflow-wrap:break-word; }
    .mob-card-min { min-width:0 !important; flex:1 1 100% !important; max-width:100% !important; }
    .dashboard-root .print-keep-together { min-width:0; overflow-wrap:break-word; word-break:break-word; }
    /* Recent tx tables: reset inherited break-word from .print-keep-together so nowrap + horizontal scroll work */
    .dashboard-root .tx-scroll-wrap,
    .dashboard-root .tx-scroll-wrap table,
    .dashboard-root .tx-scroll-wrap thead,
    .dashboard-root .tx-scroll-wrap tbody,
    .dashboard-root .tx-scroll-wrap tr,
    .dashboard-root .tx-scroll-wrap th,
    .dashboard-root .tx-scroll-wrap td {
      word-break: normal !important;
      overflow-wrap: normal !important;
    }
    .dash-header-actions { align-items:stretch !important; width:100% !important; max-width:100% !important; }
    .dash-header-actions button { max-width:100%; }
    .dash-header-actions label { display:flex; flex-wrap:wrap; gap:8px; max-width:100%; }

    /* ── Mobile header: brand-left / area-right on row 1, meta full-width row 2 ── */
    .dash-nav-inner {
      flex-wrap:wrap !important;
      align-items:center !important;
      padding:10px 16px 0 !important;
      gap:0 8px !important;
    }
    /* Actions (area selector only on client view): stay right, no wrapping */
    .dash-nav-actions {
      flex-direction:row !important;
      flex-wrap:nowrap !important;
      align-items:center !important;
      justify-content:flex-end !important;
      gap:6px !important;
    }
    /* Area row: keep label + select on one compact line */
    .dash-nav-row2 {
      width:auto !important;
      flex-wrap:nowrap !important;
      gap:6px !important;
    }
    /* Cap select so brand(192) + gap(8) + AREA-label(~40) + gap(8) + select(≤110) ≤ 358px content width */
    .dash-nav-row2 select { max-width:110px !important; min-width:0 !important; }
    /* Meta row: direct child of nav-inner with width:100% forces its own row */
    .dash-nav-meta {
      width:100% !important;
      flex-direction:row !important;
      align-items:center !important;
      justify-content:space-between !important;
      flex-wrap:wrap !important;
      gap:2px 10px !important;
      padding:6px 0 10px !important;
      margin-top:6px !important;
      border-top:1px solid rgba(201,168,76,0.1) !important;
    }
  }

  /* ─── PRINT ──────────────────────────────────────────────────── */
  @media print {
    @page { margin:12mm 14mm; size:A4 portrait; }
    html,body { background:${C.bg} !important; color:${C.t1} !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    .no-print { display:none !important; }
    .print-only { display:block !important; }
    a { color:${C.g} !important; text-decoration:none !important; }
    a[href]:after { content:none !important; }
    * { animation:none !important; }
    .print-avoid-break { break-inside:avoid; page-break-inside:avoid; }
    .print-keep-together { break-inside:avoid; page-break-inside:avoid; }
    [data-client-section]:not([data-client-section="header"]) { page-break-before:always; }
    [data-client-section="header"] { page-break-before:avoid; }
    svg { overflow:visible !important; max-width:100% !important; height:auto !important; }
    .print-exclude-section { display:none !important; }
    .client-pack-print [style*="gridTemplateColumns"] { print-color-adjust:exact !important; -webkit-print-color-adjust:exact !important; }
    .dash-nav { position:static !important; }
    .reveal { opacity:1 !important; transform:none !important; }
  }
`;

// ── Primitives ───────────────────────────────────────────────
function Bar({ score, color, style={} }) {
  const col = color || (score>=3.5?C.g:score>=2.5?C.am:C.red);
  return (
    <div style={{ height:4, background:'rgba(201,168,76,0.12)', borderRadius:4, overflow:'hidden', ...style }}>
      <div style={{ width:`${barPct(score)}%`, height:'100%', background:`linear-gradient(90deg,${col},${col}cc)`, borderRadius:4, transition:'width 1.4s ease' }}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Landing page (/): luxury marketing UI (adminToken-gated)
// ─────────────────────────────────────────────────────────────
const landingCss = `
  @keyframes floaty { 0%,100%{transform:translate3d(0,0,0)} 50%{transform:translate3d(0,-10px,0)} }
  @keyframes shimmer { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  .landing-root{min-height:100vh;background:linear-gradient(180deg,#06070a 0%, #0b1220 40%, #06070a 100%);color:${C.t1};position:relative;overflow-x:hidden}
  .landing-root *{box-sizing:border-box}
  .landing-glow{
    position:absolute;inset:-200px -200px auto -200px;height:520px;pointer-events:none;
    background:radial-gradient(circle at 30% 30%, rgba(244,211,94,0.20), transparent 55%),
      radial-gradient(circle at 70% 15%, rgba(245,158,11,0.16), transparent 50%),
      radial-gradient(circle at 20% 80%, rgba(45,107,45,0.16), transparent 55%);
    filter: blur(8px);
    animation: floaty 7s ease-in-out infinite;
  }
  .landing-topbar{position:sticky;top:0;z-index:30;backdrop-filter: blur(10px);background:rgba(3,4,8,0.35);border-bottom:1px solid rgba(244,211,94,0.12)}
  .landing-container{max-width:1120px;margin:0 auto;padding:0 max(clamp(16px,4vw,32px),env(safe-area-inset-right,0px))}
  .landing-nav{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0}
  .brand-mark{display:flex;align-items:center;gap:10px;min-width:0}
  .brand-dot{width:10px;height:10px;border-radius:999px;background:${C.ga};box-shadow:${C.glowGa}}
  .brand-name{font-family:var(--font-montserrat, Georgia,serif);font-weight:700;color:${C.ga};letter-spacing:.06em;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .brand-sub{font-family:var(--font-poppins,-apple-system,"Segoe UI",sans-serif);font-size:9px;color:${C.tm};letter-spacing:.16em;margin-top:2px;text-transform:uppercase}
  .landing-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
  .btn-gold{
    background:linear-gradient(90deg, ${C.gm} 0%, ${C.ga} 45%, ${C.amL} 100%);
    color:#061006;border:1px solid rgba(255,210,90,0.35);
    border-radius:10px;padding:12px 16px;font-family:var(--font-montserrat,Georgia,serif);font-size:11px;letter-spacing:.12em;text-transform:uppercase;
    box-shadow:0 0 24px rgba(244,211,94,0.12);transition:transform .18s ease, box-shadow .18s ease, filter .18s ease;
  }
  .btn-gold:hover{transform:translate3d(0,-1px,0);box-shadow:0 0 36px rgba(244,211,94,0.22);filter:saturate(1.05)}
  .btn-ghost{
    background:transparent;color:${C.t1};border:1px solid rgba(160,210,160,0.22);
    border-radius:10px;padding:12px 16px;font-family:var(--font-montserrat,Georgia,serif);font-size:11px;letter-spacing:.12em;text-transform:uppercase;
    transition:transform .18s ease,border-color .18s ease, background .18s ease;
  }
  .btn-ghost:hover{transform:translate3d(0,-1px,0);border-color:rgba(244,211,94,0.55);background:rgba(244,211,94,0.05)}
  .hero{padding:64px 0 28px}
  .hero-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:22px;align-items:center}
  .hero-kicker{font-family:var(--font-montserrat,Georgia,serif);color:${C.ga};letter-spacing:.22em;font-size:10px;text-transform:uppercase;margin-bottom:10px}
  .hero-title{font-family:var(--font-montserrat, Georgia,serif);font-size:clamp(30px,4vw,56px);line-height:1.02;letter-spacing:-.02em;font-weight:800}
  .hero-sub{font-family:var(--font-poppins,-apple-system,"Segoe UI",sans-serif);font-size:14px;color:${C.t2};line-height:1.6;margin-top:14px;max-width:560px}
  .hero-cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}
  .hero-metrics{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}
  .metric-tile{padding:16px;border:1px solid rgba(244,211,94,0.14);background:rgba(10,16,26,0.45);border-radius:16px}
  .metric-label{font-family:var(--font-montserrat,Georgia,serif);font-size:10px;color:${C.tm};letter-spacing:.12em;text-transform:uppercase}
  .metric-value{margin-top:8px;font-family:var(--font-montserrat, Georgia,serif);font-size:24px;color:${C.t1};font-weight:700}
  .metric-value.gold{color:${C.amL}}
  .hero-backplate{position:relative;padding:18px;border-radius:18px;border:1px solid rgba(244,211,94,0.18);background:rgba(8,12,20,0.35);overflow:hidden;min-height:260px}
  .hero-backplate::before{
    content:"";position:absolute;inset:-80px -80px auto -80px;height:280px;
    background:radial-gradient(circle at 40% 20%, rgba(245,158,11,0.20), transparent 60%),
    radial-gradient(circle at 70% 60%, rgba(212,175,55,0.16), transparent 55%);
    filter: blur(10px);
    animation: shimmer 10s ease-in-out infinite;
  }
  .hero-lineart{position:absolute;inset:0;opacity:.65;pointer-events:none}
  .section{padding:34px 0}
  .section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}
  .section-title{font-family:var(--font-montserrat, Georgia,serif);font-size:22px;color:${C.ga};letter-spacing:-.01em;font-weight:800}
  .section-sub{font-family:var(--font-poppins,-apple-system,"Segoe UI",sans-serif);font-size:11px;color:${C.t2};line-height:1.6;max-width:580px}
  .cards-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .cards-3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .card{
    border-radius:18px;border:1px solid rgba(244,211,94,0.14);
    background:rgba(8,12,20,0.40);
    box-shadow:0 0 0 rgba(0,0,0,0);
    transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease;
  }
  .card:hover{
    transform:translate3d(0,-2px,0);
    border-color:rgba(244,211,94,0.30);
    background:rgba(8,12,20,0.52);
    box-shadow:0 0 28px rgba(244,211,94,0.10);
  }
  .card-pad{padding:18px}
  .tag-k{font-family:var(--font-montserrat,Georgia,serif);font-size:10px;color:${C.tm};letter-spacing:.18em;text-transform:uppercase}
  .big-num{font-family:var(--font-montserrat, Georgia,serif);font-size:34px;color:${C.ga};font-weight:800;margin-top:10px}
  .divider{height:1px;background:linear-gradient(90deg, rgba(244,211,94,0.0), rgba(245,158,11,0.35), rgba(244,211,94,0.0));margin:14px 0}
  .featured-rail{display:flex;gap:14px;overflow-x:auto;padding-bottom:10px;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}
  .featured-rail::-webkit-scrollbar{height:6px}
  .featured-rail::-webkit-scrollbar-thumb{background:rgba(244,211,94,0.25);border-radius:999px}
  .prop-card{min-width:280px;scroll-snap-align:start;position:relative}
  .prop-img{
    height:128px;border-radius:14px;border:1px solid rgba(244,211,94,0.14);
    background:linear-gradient(135deg, rgba(245,158,11,0.22), rgba(212,175,55,0.10), rgba(8,12,20,0.55));
    position:relative;overflow:hidden;
  }
  .prop-img::after{
    content:"";position:absolute;inset:-30px -30px auto -30px;height:160px;
    background:radial-gradient(circle at 30% 40%, rgba(245,158,11,0.35), transparent 65%);
    filter:blur(8px);
    opacity:.7;
  }
  .prop-body{margin-top:14px}
  .prop-price{font-family:var(--font-montserrat,Georgia,serif);font-size:10px;color:${C.tm};letter-spacing:.18em;text-transform:uppercase}
  .prop-type{font-family:var(--font-montserrat, Georgia,serif);font-size:18px;color:${C.t1};font-weight:800;margin-top:8px}
  .prop-metrics{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
  .pill{
    padding:8px 10px;border-radius:999px;border:1px solid rgba(244,211,94,0.18);
    background:rgba(8,12,20,0.35);font-family:var(--font-montserrat,Georgia,serif);font-size:10px;color:${C.t2}
  }
  .strategy-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
  .step-list{display:flex;flex-direction:column;gap:10px}
  .step{
    padding:14px 14px;border-radius:16px;border:1px solid rgba(244,211,94,0.14);background:rgba(8,12,20,0.40);
    display:flex;gap:12px;align-items:flex-start
  }
  .step-dot{width:26px;height:26px;border-radius:999px;background:rgba(245,158,11,0.22);border:1px solid rgba(245,158,11,0.35);box-shadow:0 0 18px rgba(245,158,11,0.14);display:flex;align-items:center;justify-content:center;font-family:var(--font-montserrat,Georgia,serif);font-size:11px;color:${C.amL}}
  .step-title{font-family:var(--font-montserrat, Georgia,serif);font-size:14px;color:${C.t1};font-weight:800}
  .step-sub{font-family:var(--font-poppins,-apple-system,"Segoe UI",sans-serif);font-size:10px;color:${C.t2};margin-top:6px;line-height:1.6}
  .perf-block{padding:22px;border-radius:22px;border:1px solid rgba(244,211,94,0.14);background:linear-gradient(180deg, rgba(245,158,11,0.08), rgba(8,12,20,0.40))}
  .perf-copy{font-family:var(--font-montserrat, Georgia,serif);font-size:24px;color:${C.ga};font-weight:800;line-height:1.2}
  .pulse-ring{width:140px;height:140px;border-radius:999px;border:1px solid rgba(245,158,11,0.35);position:relative;display:flex;align-items:center;justify-content:center}
  .pulse-ring::before{
    content:"";position:absolute;inset:-10px;border-radius:999px;border:1px solid rgba(245,158,11,0.20);
    animation: floaty 3.8s ease-in-out infinite;
  }
  .results-carousel{position:relative}
  .quote{font-family:var(--font-montserrat, Georgia,serif);font-size:16px;color:${C.t1};line-height:1.7}
  .carousel-fade{transition:opacity .35s ease, transform .35s ease}
  .carousel-fade[data-state="out"]{opacity:0;transform:translate3d(0,10px,0)}
  .carousel-fade[data-state="in"]{opacity:1;transform:translate3d(0,0,0)}
  .cta-block{
    padding:26px;border-radius:24px;border:1px solid rgba(244,211,94,0.18);
    background:linear-gradient(135deg, rgba(244,211,94,0.12), rgba(245,158,11,0.10), rgba(8,12,20,0.55));
  }
  .cta-title{font-family:var(--font-montserrat, Georgia,serif);font-size:24px;color:${C.ga};font-weight:800;line-height:1.2}
  .cta-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}
  .sticky-cta{
    position:fixed;left:0;right:0;bottom:0;z-index:60;
    padding:12px max(clamp(16px,4vw,32px),env(safe-area-inset-right,0px)) 12px max(clamp(16px,4vw,32px),env(safe-area-inset-left,0px));
    background:rgba(3,4,8,0.65);backdrop-filter: blur(10px);border-top:1px solid rgba(244,211,94,0.16);
    display:none;
  }
  @media (max-width:900px){
    .hero-grid{grid-template-columns:1fr;gap:14px}
    .cards-3{grid-template-columns:1fr}
    .cards-2{grid-template-columns:1fr}
    .strategy-grid{grid-template-columns:1fr}
  }
  @media (max-width:720px){
    .sticky-cta{display:block}
    .hero{padding:44px 0 18px}
    .prop-card{min-width:250px}
  }
`;

function MobileStickyCTA({ dashboardHref }) {
  return (
    <div className="sticky-cta">
      <a className="btn-gold" href={dashboardHref} style={{ display: 'block', textAlign: 'center', width: '100%' }}>
        View Off-Market Deals
      </a>
    </div>
  );
}

function LineChartMini({ value = 0 }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <svg viewBox="0 0 220 60" width="100%" height="60" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="gld" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={C.amL} stopOpacity="0.15" />
          <stop offset="50%" stopColor={C.ga} stopOpacity="0.65" />
          <stop offset="100%" stopColor={C.amL} stopOpacity="0.20" />
        </linearGradient>
      </defs>
      <path
        d={`M 0 52 C 40 ${52 - pct * 0.28}, 80 ${52 - pct * 0.18}, 110 ${52 - pct * 0.35} S 180 ${52 - pct * 0.22}, 220 ${52 - pct * 0.30}`}
        fill="none"
        stroke="url(#gld)"
        strokeWidth="2"
        opacity="0.95"
      />
      <path
        d={`M 0 52 C 40 ${52 - pct * 0.28}, 80 ${52 - pct * 0.18}, 110 ${52 - pct * 0.35} S 180 ${52 - pct * 0.22}, 220 ${52 - pct * 0.30}`}
        fill="none"
        stroke={C.border}
        strokeWidth="6"
        opacity="0.15"
      />
    </svg>
  );
}

function useInView(threshold = 0.2) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); io.unobserve(el); }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [inView, threshold]);
  return [ref, inView];
}

function CountUp({ to = 0, suffix = '', durationMs = 1400, decimals = 0 }) {
  const [ref, inView] = useInView(0.2);
  const [val, setVal] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;
    let raf = 0;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setVal(to);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, durationMs]);
  const n = Number.isFinite(val) ? val : 0;
  const formatted = decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString('en-US');
  return <span ref={ref}>{formatted}{suffix}</span>;
}

export default function Page() {
  const [adminToken, setAdminToken] = useState('');
  const iframeRef = useRef(null);

  const contactTel = '+971585792599';
  const whatsappUrl = 'https://wa.me/message/7XKXFQ6XBQ2KF1';
  const adminLandingHref = adminToken ? `/?adminToken=${encodeURIComponent(adminToken)}` : '/';
  const dashboardHref = adminToken ? `/dashboard?adminToken=${encodeURIComponent(adminToken)}` : '/dashboard';
  const adminEmail = 'kyle.c@stradauae.com';

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const token = (u.searchParams.get('adminToken') || '').trim();
      setAdminToken(token);
    } catch {
      setAdminToken('');
    }
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const apply = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) {
          return;
        }

        // Logo should keep admin token (so nav stays in the correct mode).
        const logo = doc.querySelector('a.nav-logo[href="#"]');
        if (logo) logo.setAttribute('href', adminLandingHref);

        // Primary CTA buttons inside the CTA section.
        const cta = doc.querySelector('#cta');
        let ctaHasBook = false;
        let ctaHasDeals = false;
        let ctaHasDashboard = false;
        if (cta) {
          const book = cta.querySelector('a.btn.btn-gold[href="#"]');
          if (book) { book.setAttribute('href', `tel:${contactTel}`); ctaHasBook = true; }

          const deals = cta.querySelector('a.btn.btn-outline[href="#"]');
          if (deals) { deals.setAttribute('href', dashboardHref); deals.setAttribute('target', '_top'); ctaHasDeals = true; }

          const dashBtn = cta.querySelector('#view-dashboard-btn');
          if (dashBtn) { dashBtn.setAttribute('href', dashboardHref); dashBtn.setAttribute('target', '_top'); ctaHasDashboard = true; }
        }

        // Mobile sticky CTA: “View Deals” should go to the dashboard.
        const sticky = doc.querySelector('.sticky-cta');
        let stickyHasDeals = false;
        let stickyHasBook = false;
        if (sticky) {
          const viewDeals = sticky.querySelector('a.btn.btn-outline');
          if (viewDeals) { viewDeals.setAttribute('href', dashboardHref); viewDeals.setAttribute('target', '_top'); stickyHasDeals = true; }
          const bookNow = sticky.querySelector('a.btn.btn-gold');
          if (bookNow) { bookNow.setAttribute('href', `tel:${contactTel}`); stickyHasBook = true; }
        }

        // Nav “Book Consultation” button.
        const navCta = doc.querySelector('a.nav-cta');
        if (navCta) navCta.setAttribute('href', `tel:${contactTel}`);

        // Footer contact placeholders.
        const telLink = doc.querySelector('footer a[href^="tel:"]');
        let telLinkFound = false;
        if (telLink) { telLink.setAttribute('href', `tel:${contactTel}`); telLinkFound = true; }

        const mailLink = doc.querySelector('footer a[href^="mailto:"]');
        let mailLinkFound = false;
        if (mailLink) { mailLink.setAttribute('href', `mailto:${adminEmail}`); mailLinkFound = true; }

      } catch (e) {
        // silent — cross-origin or early load
      }
    };

    const onLoad = () => apply();
    iframe.addEventListener('load', onLoad, { once: true });

    // If it already loaded, apply immediately.
    try {
      if (iframe.contentDocument?.readyState === 'complete') apply();
    } catch {
      // ignore
    }

    return () => {};
  }, [adminToken, adminLandingHref, dashboardHref]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg }}>
      <iframe
        ref={iframeRef}
        src="/kyle-caruana-ui"
        title="Kyle Caruana landing page"
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
      />
    </div>
  );
}
function Skel({ w='100%', h=12, mb=0 }) {
  return <div className="lp-skel" style={{ width:w, height:h, marginBottom:mb }}/>;
}
function Tag({ children, color=C.gm }) {
  return (
    <div style={{
      display:'inline-flex', alignItems:'center',
      fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)",
      fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase',
      color, border:`1px solid ${color}40`,
      padding:'4px 12px', borderRadius:40,
      marginBottom:10, background:`${color}18`,
    }}>{children}</div>
  );
}
function SectionHead({ n, title, desc }) {
  return (
    <div className="lp-sh reveal">
      <div className="lp-sh-eyebrow"><span>{n}</span></div>
      <h2 className="lp-sh-title">{title}</h2>
      <div className="lp-sh-divider"/>
      {desc && <p className="lp-sh-desc">{desc}</p>}
    </div>
  );
}

// ── Property transaction card ─────────────────────────────────
function TxCard({ label, value, wowChg, yoyChg, trend, loading, period, source }) {
  const tc = trendCol(trend);
  const isMonthly = !!(period && /\b(month|months|monthly)\b/i.test(period));
  return (
    <div className="print-keep-together mob-card-min lp-card" style={{ flex:1, minWidth:'min(160px, 100%)', borderLeft:`3px solid ${tc}`, padding:'20px 22px' }}>
      <div style={{ display:'inline-flex', alignItems:'center', fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:C.tm, border:`1px solid ${C.tm}40`, padding:'3px 10px', borderRadius:40, marginBottom:12, background:`${C.tm}12` }}>{label}</div>
      {loading?<><Skel h={32} mb={6}/><Skel w="70%" h={9}/></>:<>
        <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:30, fontWeight:800, color:value&&value!=='—'?tc:'var(--muted)', lineHeight:1.1, marginBottom:6, textShadow:value&&value!=='—'?glowFor(tc):'none' }}>
          {na(value)} <span style={{fontSize:16}}>{trendArrow(trend)}</span>
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:4 }}>
          {wowChg&&wowChg!=='N/A'&&<span style={{ fontSize:10, color:'var(--muted)' }}>vs last week: <span style={{color:wowChg.startsWith('+')?C.g:C.red,fontWeight:600}}>{wowChg}</span></span>}
          {yoyChg&&yoyChg!=='N/A'&&<span style={{ fontSize:10, color:'var(--muted)' }}>vs last year: <span style={{color:yoyChg.startsWith('+')?C.g:C.red,fontWeight:600}}>{yoyChg}</span></span>}
        </div>
        {(period||(source&&!String(source).includes('Self-hosted CSV')))&&(
          <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid rgba(201,168,76,0.12)' }}>
            {period&&<div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:8, color:isMonthly?C.am:'var(--muted)' }}>{isMonthly?'⚠ Monthly figure (not weekly): ':''}{period}</div>}
            {source&&!String(source).includes('Self-hosted CSV')&&<div style={{ fontSize:7, color:'rgba(201,168,76,0.3)', marginTop:1 }}>{sanitizeRawGithubLinks(source)}</div>}
          </div>
        )}
      </>}
    </div>
  );
}

function StatRow({ label, value, sub, highlight, last, source }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:last?'none':'1px solid rgba(201,168,76,0.10)' }}>
      <div>
        <span style={{ fontSize:12, color:'var(--muted)' }}>{label}</span>
        {source&&!String(source).includes('Self-hosted CSV')&&<div style={{ fontSize:7, color:'rgba(201,168,76,0.3)', marginTop:1 }}>{sanitizeRawGithubLinks(source)}</div>}
      </div>
      <div style={{ textAlign:'right' }}>
        <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:13, fontWeight:700, color:highlight||'var(--white)' }}>{na(value)}</div>
        {sub&&<div style={{ fontSize:9, color:'var(--muted)', marginTop:1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function AreaRow({ rank, area, vol, psf, trend, maxVol, last, volLabel = 'deals', psfDisplay }) {
  const pct = maxVol?Math.round((parseInt(vol?.replace(/,/g,''))||0)/maxVol*100):0;
  const tc = trendCol(trend);
  return (
    <div style={{ padding:'12px 0', borderBottom:last?'none':'1px solid rgba(201,168,76,0.10)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', alignItems:'center', gap:8, marginBottom:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
          <span style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, color:'var(--muted)', width:18, flexShrink:0 }}>{rank}</span>
          <span style={{ fontSize:13, color:'var(--white)', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis' }} title={area}>{area}</span>
          <span style={{ fontSize:11, flexShrink:0 }}>{trendArrow(trend)}</span>
        </div>
        <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'nowrap', whiteSpace:'nowrap', flexShrink:0 }}>
          <span style={{ fontSize:10, color:'var(--muted)' }}>{na(vol)} {volLabel}</span>
          <span style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:13, color:tc, fontWeight:700 }}>{psfDisplay ?? `AED ${na(psf)}/sqft`}</span>
        </div>
      </div>
      <div style={{ height:3, background:'rgba(201,168,76,0.10)', borderRadius:2 }}>
        <div style={{ width:`${pct}%`, height:'100%', background:`${tc}60`, borderRadius:2, transition:'width 1.2s ease' }}/>
      </div>
    </div>
  );
}

function YieldGauge({ label, gross, loading }) {
  const g = parseFloat(gross)||0;
  const pct = Math.min((g/12)*100,100);
  const col = g>=7?C.g:g>=5?C.ga:g>=4?C.am:C.red;
  return (
    <div className="print-keep-together mob-card-min lp-card" style={{ flex:1, minWidth:'min(160px, 100%)', padding:'20px 22px', textAlign:'center' }}>
      <div style={{ display:'inline-flex', alignItems:'center', fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:C.tm, border:`1px solid ${C.tm}40`, padding:'3px 10px', borderRadius:40, marginBottom:12, background:`${C.tm}12` }}>{label}</div>
      {loading?<><Skel h={40} mb={6}/><Skel w="60%" h={10}/></>:<>
        <div style={{ position:'relative', width:80, height:40, margin:'10px auto 6px' }}>
          <svg width="80" height="40" viewBox="0 0 80 40">
            <path d="M 4 38 A 36 36 0 0 1 76 38" stroke="rgba(201,168,76,0.15)" strokeWidth="6" fill="none" strokeLinecap="round"/>
            <path d="M 4 38 A 36 36 0 0 1 76 38" stroke={col} strokeWidth="6" fill="none" strokeLinecap="round"
              strokeDasharray={`${pct*1.13} 113`} style={{ transition:'stroke-dasharray 1.4s ease' }}/>
          </svg>
          <div style={{ position:'absolute', bottom:0, left:0, right:0, textAlign:'center', fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:18, fontWeight:800, color:col, textShadow:g>0?glowFor(col):'none' }}>{g>0?<CountUp to={g} decimals={1} suffix="%" durationMs={1600}/>:'—'}</div>
        </div>
        <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--muted)', marginTop:4 }}>Annual Rental Return</div>
        <div style={{ fontSize:9, color:col, marginTop:4, fontWeight:600 }}>
          {g>=7?'Excellent return':g>=5?'Good return':g>=4?'Average return':g>0?'Low return':''}
        </div>
      </>}
    </div>
  );
}

function chartPath(series, n, padL, padT, innerW, innerH, yMin, yR) {
  return series
    .map((s, i) => {
      const v = s.value;
      if (v == null || !Number.isFinite(v)) return null;
      const x = padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
      const y = padT + innerH - ((v - yMin) / yR) * innerH;
      return { x, y, i };
    })
    .filter(Boolean)
    .map((pt, idx, arr) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
    .join(' ');
}

/** Daily (faint) + 7d MA (bold) on shared scale */
function TrendDualChart({ title, subtitle, daily, ma7, dailyColor, maColor, loading, yZero }) {
  const W = 620;
  const H = 248;
  const padL = 48;
  const padR = 16;
  const padT = 36;
  const padB = 44;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  if (loading) {
    return (
      <div className="print-keep-together lp-card" style={{ padding:'18px 22px', minHeight:H }}>
        <Tag color={C.gm}>{title}</Tag>
        <Skel h={H - 50} />
      </div>
    );
  }
  if (!daily?.length) return null;
  const vals = [...daily, ...ma7].map(s => s.value).filter(v => v != null && Number.isFinite(v));
  if (!vals.length) return null;
  let minY = Math.min(...vals);
  let maxY = Math.max(...vals);
  if (yZero) minY = Math.min(0, minY);
  const padY = Math.max((maxY - minY) * 0.08, maxY * 0.03 || 1);
  const yMin = Math.max(yZero ? 0 : minY - padY, 0);
  const yMax = maxY + padY;
  const yR = yMax - yMin || 1;
  const n = daily.length;
  const pathDaily = chartPath(daily, n, padL, padT, innerW, innerH, yMin, yR);
  const pathMa = chartPath(ma7, n, padL, padT, innerW, innerH, yMin, yR);
  const ticks = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  const yTicks = 4;
  return (
    <div className="print-keep-together lp-card" style={{ padding:'18px 22px' }}>
      <Tag color={C.gm}>{title}</Tag>
      {subtitle ? <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>{subtitle}</div> : null}
      <div style={{ fontSize:9, color:'var(--muted)', marginBottom:8 }}>
        <span style={{ color:dailyColor }}>■</span> daily &nbsp;
        <span style={{ color:maColor }}>■</span> 7-day moving avg
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display:'block' }}>
        <rect x={padL} y={padT} width={innerW} height={innerH} fill={C.surf} rx={2} />
        {[0, 1, 2, 3, 4].map(i => {
          const yy = padT + (i / 4) * innerH;
          return <line key={i} x1={padL} y1={yy} x2={padL + innerW} y2={yy} stroke={C.border} strokeWidth={0.5} opacity={0.6} />;
        })}
        <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke={C.gm} strokeWidth={1} />
        <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke={C.gm} strokeWidth={1} />
        {pathDaily ? <path d={pathDaily} fill="none" stroke={dailyColor} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" opacity={0.35} /> : null}
        {pathMa ? <path d={pathMa} fill="none" stroke={maColor} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {ticks.map(i => {
          const x = padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
          return (
            <text key={i} x={x} y={H - 10} textAnchor="middle" fill={C.t2} fontSize={8} fontFamily="monospace">
              {daily[i]?.label || ''}
            </text>
          );
        })}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const yy = padT + innerH - (i / yTicks) * innerH;
          const raw = yMin + (i / yTicks) * (yMax - yMin);
          const val = raw >= 100 ? Math.round(raw) : Number(raw.toFixed(1));
          return (
            <text key={i} x={padL - 6} y={yy + 3} textAnchor="end" fill={C.tm} fontSize={8} fontFamily="monospace">
              {val}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function SplitBar({ offplan, secondary, loading }) {
  const op = parseInt(offplan)||0;
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10, marginBottom:8 }}>
        <div>
          <span style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:C.g }}>NEW BUILDS (OFF-PLAN) · {op}%</span>
          <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>Buying directly from a developer before construction finishes</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <span style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'var(--muted)' }}>EXISTING PROPERTIES · {100-op}%</span>
          <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>Resale of already-built homes</div>
        </div>
      </div>
      {loading?<Skel h={8}/>:
        <div style={{ height:8, background:'rgba(201,168,76,0.10)', borderRadius:6, overflow:'hidden' }}>
          <div style={{ width:`${op}%`, height:'100%', background:`linear-gradient(90deg,${C.gm},${C.g})`, borderRadius:6, transition:'width 1.4s ease' }}/>
        </div>
      }
    </div>
  );
}

// ── One of the 7 factor cards ─────────────────────────────────
function PillarCarousel({ pillars, loading }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const valid = pillars.filter(Boolean);
  const count  = valid.length;
  const card   = valid[activeIdx] || null;

  const prev = () => setActiveIdx(i => Math.max(0, i - 1));
  const next = () => setActiveIdx(i => Math.min(count - 1, i + 1));

  return (
    <>
      {/* Desktop: all cards in the standard auto-fit grid */}
      <div className="pillar-desktop-grid">
        {pillars.map((p, i) => p
          ? <FactorCard key={i} data={p} loading={loading} revealDelay={i}/>
          : null
        )}
      </div>

      {/* Mobile: one card at a time, button-driven — no overflow:scroll so page scroll is unaffected */}
      <div className="pillar-mobile-nav">
        {/* Navigation sits above the card so users immediately see there are more to explore */}
        <div className="pillar-nav-row">
          <button className="pillar-nav-btn" onClick={prev} disabled={activeIdx === 0} aria-label="Previous card">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M15 18l-6-6 6-6"/></svg>
          </button>

          <div className="pillar-dots">
            {valid.map((_, i) => (
              <button
                key={i}
                className={`pillar-dot${i === activeIdx ? ' active' : ''}`}
                onClick={() => setActiveIdx(i)}
                aria-label={`Card ${i + 1}`}
              />
            ))}
          </div>

          <button className="pillar-nav-btn" onClick={next} disabled={activeIdx === count - 1} aria-label="Next card">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        <div className="pillar-counter" style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", marginBottom:12 }}>
          {activeIdx + 1} of {count}
        </div>

        {/* key forces re-mount → restarts the CSS slide-in animation on every card change */}
        <div className="pillar-card-stage" key={activeIdx}>
          {card && <FactorCard data={card} loading={loading} noReveal/>}
        </div>
      </div>
    </>
  );
}

function FactorCard({ data, loading, revealDelay = 0, noReveal = false }) {
  if (!data) return null;
  const meta    = PILLARS[data.key] || { icon:'📊', title:data.title, q:'' };
  const verdict = PILLAR_VERDICT(data.sig, data.score);
  const col     = verdict.col;
  const delayClass = revealDelay > 0 ? ` reveal-d${Math.min(revealDelay, 5)}` : '';
  const revealCls  = noReveal ? '' : `reveal${delayClass} `;

  return (
    <div className={`${revealCls}print-keep-together lp-card`} style={{ borderLeft:`3px solid ${col}`, padding:22 }}>

      {/* Header row */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12, marginBottom:12 }}>
        <div style={{ flex:'1 1 200px', minWidth:0, paddingRight:12 }}>
          <div style={{ fontSize:22, marginBottom:6 }}>{meta.icon}</div>
          <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:14, fontWeight:700, color:'var(--white)' }}>{meta.title}</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, fontStyle:'italic' }}>{meta.q}</div>
        </div>
        {data.score && (
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:28, fontWeight:800, color:col, lineHeight:1, textShadow:glowFor(col) }}><CountUp to={parseFloat(data.score)||0} decimals={1} durationMs={1400}/><span style={{fontSize:10,color:'var(--muted)'}}>/5</span></div>
          </div>
        )}
      </div>

      {/* Strength bar */}
      {data.score && <Bar score={data.score} color={col} style={{ marginBottom:12 }}/>}

      {/* Verdict badge */}
      <div style={{ padding:'5px 10px', background:`${col}14`, border:`1px solid ${col}30`, borderRadius:20, marginBottom:12, display:'inline-block' }}>
        <span style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:8, letterSpacing:'2px', color:col }}>{verdict.dot} {verdict.label.toUpperCase()}</span>
      </div>

      {loading && <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}><Skel/><Skel w="85%"/><Skel w="70%"/></div>}

      {/* Headline */}
      {data.headline && (
        <div style={{ fontSize:12, color:'var(--white)', lineHeight:1.65, paddingBottom:12, marginBottom:12, borderBottom:'1px solid rgba(201,168,76,0.12)', fontStyle:'italic' }}>
          {data.headline}
        </div>
      )}

      {/* Detail bullets */}
      {data.bullets && (
        <ul style={{ listStyle:'none', padding:0, marginBottom:12 }}>
          {data.bullets.map((b,i) => (
            <li key={i} style={{ fontSize:12, color:'var(--muted)', padding:'6px 0 6px 16px', position:'relative', borderBottom:i<data.bullets.length-1?'1px solid rgba(201,168,76,0.10)':'none', lineHeight:1.55 }}>
              <span style={{ position:'absolute', left:0, color:C.gm }}>›</span>{b}
            </li>
          ))}
        </ul>
      )}

      {/* What would change this + What it means for you */}
      {(data.risk||data.action) && (
        <div style={{ padding:'12px 14px', background:'rgba(11,18,32,0.6)', border:'1px solid rgba(201,168,76,0.12)', borderRadius:10 }}>
          {data.risk && (
            <div style={{ marginBottom:data.action?10:0 }}>
              <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:8, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:C.am, marginBottom:4 }}>What would change this signal</div>
              <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.55 }}>{data.risk}</div>
            </div>
          )}
          {data.action && (
            <div>
              <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:8, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:C.g, marginBottom:4 }}>What this means for your property</div>
              <div style={{ fontSize:11, color:'var(--white)', lineHeight:1.55 }}>{data.action}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Small market number card (for Supporting Data section) ────
function DataCard({ label, price, chg, up, loading, explain }) {
  const col = up===true?C.g : up===false?C.red : C.t2;
  return (
    <div className="print-keep-together mob-card-min lp-card" style={{ flex:1, minWidth:'min(160px, 100%)', padding:'16px 18px' }}>
      <div style={{ display:'inline-flex', alignItems:'center', fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'var(--muted)', border:'1px solid rgba(201,168,76,0.18)', padding:'3px 10px', borderRadius:40, marginBottom:10, background:'rgba(201,168,76,0.06)' }}>{label}</div>
      {loading?<><Skel h={18} mb={4}/><Skel w="55%" h={8}/></>:<>
        <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:20, fontWeight:800, color:price?col:'var(--muted)', lineHeight:1, textShadow:price?glowFor(col):'none' }}>{price||'—'}</div>
        {chg&&<div style={{ fontSize:10, color:col, marginTop:4, fontWeight:600 }}>{chg}</div>}
        {explain&&<div style={{ fontSize:10, color:'var(--muted)', marginTop:6, lineHeight:1.5, borderTop:'1px solid rgba(201,168,76,0.10)', paddingTop:6 }}>{explain}</div>}
      </>}
    </div>
  );
}

// ── Warning signs table ───────────────────────────────────────
const ALERTS = [
  ['A confirmed military strike or attack inside UAE','🔴 Act Today','Stop all new purchases immediately. Move to a cash-preferred position.',C.red],
  ['US or UK government warns against travel to UAE','🔴 Act Today','Western buyer demand will pause within 48 hours. Hold all listings.',C.red],
  ['Strait of Hormuz blocked or disrupted','🔴 Act Today','Direct impact on UAE economy. Maximum defensive position — no new moves.',C.red],
  ['Dubai\'s biggest developer (Emaar) shows financial stress','🟠 Pause & Watch','Stop buying off-plan projects. Switch to completed, rented properties only.',C.am],
  ['Dubai airport visitor numbers drop 25%+ vs last year','🟠 Pause & Watch','Tourism demand is weakening. Short-let and holiday home property most at risk.',C.am],
  ['Dubai property transaction volumes drop 30% for 2+ weeks','🟠 Pause & Watch','Market has gone quiet. Price falls likely in 60–90 days. Hold any listings.',C.am],
  ['Global stock markets crash 10%+ in a single week','🟠 Pause & Watch','International buyers pause immediately. Foreign demand drops for 4–8 weeks.',C.am],
  ['Oil price stays below $65 for 2+ weeks','👀 Keep Watching','Gulf investors — your biggest buyer group — have less money. Monitor volumes.',C.t2],
  ['US stock market falls 10%+ over a month','👀 Keep Watching','Wealthy foreign buyers feel poorer. Dubai luxury properties most affected.',C.t2],
];

const CHECKLIST = [
  ['News & Security · 07:30',[['Reuters Middle East','https://reuters.com/world/middle-east'],['Al Arabiya English','https://alarabiya.net'],['UK FCO UAE Travel Advice','https://gov.uk/foreign-travel-advice/uae']]],
  ['Property Market · 08:00',[['DLD Transactions (Official)','https://dubailand.gov.ae'],['Property Monitor Reports','https://propertymonitor.ae/insights'],['Bayut Research','https://bayut.com/research']]],
  ['Dubai Airport & Tourism · 08:30',[['Emirates Newsroom','https://emirates.com/media-centre/news'],['Dubai Airport Stats','https://dubaiairports.ae']]],
  ['Financial Markets · 09:00',[['DFM Live Market Data','https://dfm.ae/market-data'],['UAE Central Bank','https://centralbank.ae']]],
];

/** Sections for client PDF / static HTML (no API when clients open the file). */
const CLIENT_SECTION_META = [
  { id: 'header', label: 'Title & branding' },
  { id: 'verdict', label: "Today's verdict & score" },
  { id: 's01', label: '01 · Property numbers & charts' },
  { id: 's02', label: '02 · Seven market drivers' },
  { id: 's03', label: '03 · Scenarios & scorecard' },
  { id: 's04', label: '04 · Warning signs' },
  { id: 's05', label: '05 · Supporting data (stocks, rates)' },
  { id: 's06', label: '06 · Morning checklist' },
  { id: 'footer', label: 'Footer & contact' },
];

/** All sections on by default so HTML export & print match the full dashboard; users can uncheck in Client pack. */
const defaultClientSections = () =>
  Object.fromEntries(CLIENT_SECTION_META.map(({ id }) => [id, true]));

function cloneNodeNoNoPrint(el) {
  if (!el) return '';
  const c = el.cloneNode(true);
  c.querySelectorAll?.('.no-print')?.forEach((n) => n.remove());
  return c.outerHTML;
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export function DashboardView() {
  const [adminToken, setAdminToken] = useState('');
  const [intel,     setIntel]     = useState(null);
  const [prop,      setProp]      = useState(null);
  const [loadIntel, setLoadIntel] = useState(false);
  const [loadProp,  setLoadProp]  = useState(false);
  const [error,     setError]     = useState(null);
  const [propError, setPropError] = useState(null);
  const [ts,          setTs]          = useState(null);
  const [showData,    setShowData]    = useState(false); // Supporting data collapsed by default
  const [salesCsvPath,setSalesCsvPath]= useState('');
  const [uploadingCsv,setUploadingCsv]= useState(false);
  const [area, setArea] = useState('');
  const showDataBeforePrintRef = useRef(false);
  const uploadedCsvTextRef = useRef(null);
  const propEnrichEpochRef = useRef(0);
  const [clientSections, setClientSections] = useState(() => defaultClientSections());
  const [clientPackOpen, setClientPackOpen] = useState(false);
  const [printScope, setPrintScope] = useState(false);
  const [propTab, setPropTab] = useState('sales'); // 'sales' | 'rental'
  const [hotTypeByTab, setHotTypeByTab] = useState({ sales: 'apartment', rental: 'apartment' });
  const [refreshingSnapshot, setRefreshingSnapshot] = useState(false);

  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      setAdminToken((u.searchParams.get('adminToken') || '').trim());
    } catch {
      setAdminToken('');
    }
  }, []);


  const isClientView = !adminToken;

  const refreshIntel = useCallback(async () => {
    setLoadIntel(true); setError(null);
    // #region agent log
    fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H3',location:'page.js:refreshIntel',message:'refreshIntel start',data:{isClientView},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    try {
      const intelUrl = isClientView ? '/api/intelligence-read' : '/api/intelligence';
      const r = await fetch(intelUrl, { cache: 'no-store' });
      // #region agent log
      fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H4',location:'page.js:refreshIntel',message:'fetch intelligence response',data:{ok:r.ok,status:r.status,intelUrl},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setIntel(d); setTs(d.ts);
    } catch(e) { setError(e.message); }
    finally {
      // #region agent log
      fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H4',location:'page.js:refreshIntel',message:'refreshIntel finally',data:{},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setLoadIntel(false);
    }
  }, [isClientView]);

  const refreshIntelSnapshot = useCallback(async () => {
    if (isClientView) return;
    setRefreshingSnapshot(true);
    setError(null);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (adminToken) headers['x-intel-admin-token'] = adminToken;
      const r = await fetch('/api/intelligence-refresh', {
        method: 'POST',
        headers,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      // Refresh using the snapshot-read endpoint so we don't re-run intelligence.
      const rr = await fetch('/api/intelligence-read', { cache: 'no-store' });
      const dd = await rr.json().catch(() => ({}));
      if (rr.ok && dd?.ok) {
        setIntel(dd);
        setTs(dd.ts);
      }
    } catch (e) {
      setError(e.message || 'Snapshot refresh failed');
    } finally {
      setRefreshingSnapshot(false);
    }
  }, [adminToken, isClientView, refreshIntel]);

  const refreshProp = useCallback(async (forcedPath, overrideArea) => {
    setLoadProp(true); setPropError(null);
    propEnrichEpochRef.current += 1;
    const enrichEpoch = propEnrichEpochRef.current;
    // #region agent log
    fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H3',location:'page.js:refreshProp',message:'refreshProp start',data:{},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    try {
      const customPath = (forcedPath || salesCsvPath).trim();
      const a = (overrideArea !== undefined ? overrideArea : area).trim();
      const q = new URLSearchParams();
      if (customPath) q.set('salesCsv', customPath);
      if (a) q.set('area', a);
      const propUrl = q.toString() ? `/api/property?${q}` : '/api/property';
      const tFetch0 = Date.now();
      // Align with app/api/property maxDuration (120s): sales CSV fetch+parse can exceed 60s on large GitHub raw files.
      const timeoutMs = 120000;
      let r;
      try {
        r = await Promise.race([
          fetch(propUrl),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`prop fetch timeout after ${timeoutMs}ms`)), timeoutMs);
          }),
        ]);
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H2',location:'page.js:refreshProp',message:'prop fetch timed out / stalled',data:{ms:Date.now()-tFetch0,timeoutMs},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const msg = String(e?.message || '');
        const isTimeout = msg.includes(`timeout after ${timeoutMs}ms`);
        if (!isTimeout) throw e;

        // #region agent log
        fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H6',location:'page.js:refreshProp',message:'timeout → retry fast skip options',data:{timeoutMs,area:a},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        // Fast retry: force the lightest server path so core sales metrics still load when
        // full refresh stalls. This intentionally skips rental/listings.
        const qFast = new URLSearchParams(q);
        qFast.set('noSnapshot', '1');
        qFast.set('skipAi', '1');
        qFast.set('skipRental', '1');
        qFast.set('skipListings', '1');
        qFast.set('skipSalesListings', '1');
        qFast.set('skipHotListings', '1');
        qFast.set('listingsTimeoutMs', '5000');
        qFast.set('listingsMaxAttempts', '1');
        qFast.set('salesListingsTimeoutMs', '5000');
        qFast.set('salesListingsMaxAttempts', '1');
        const propUrlFast = `/api/property?${qFast.toString()}`;

        // Same heavy path as full refresh (minus snapshot/rental/listings); needs time for sales CSV + parse.
        const fastTimeoutMs = 110000;
        let rf;
        try {
          const tFast0 = Date.now();
          rf = await Promise.race([
            fetch(propUrlFast),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error(`prop fast retry timeout after ${fastTimeoutMs}ms`)), fastTimeoutMs);
            }),
          ]);

          const df = await rf.json().catch(() => ({}));
          if (!rf.ok || !df.ok) {
            const msg2 = df?.detail ? `${df.error || `HTTP ${rf.status}`} (${df.detail})` : (df?.error || `HTTP ${rf.status}`);
            throw new Error(msg2);
          }

          setProp(df);
          // #region agent log
          fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H11',location:'page.js:refreshProp',message:'fast retry payload shape',data:{dfOk:df?.ok,hasWeekly:!!df?.weekly,hasCharts30d:!!df?.charts_30d,hasSalesListings:!!df?.sales_listings,hasRentalListings:!!df?.listings,debugSkips:df?._debug_skips,tabs:propTab},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          setPropError(
            `Full refresh timed out after ${timeoutMs}ms; loading rental & listings in the background (large CSVs can take several minutes on first load).`,
          );
          // #region agent log
          fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H6',location:'page.js:refreshProp',message:'fast retry success',data:{ms:Date.now()-tFast0,hasDebugSkips:!!df?._debug_skips},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          // Deferred enrichment: same full /api/property work, but without blocking the
          // main spinner (loadProp clears in finally). Epoch guard drops stale runs.
          // Property route maxDuration 300s on Vercel (vercel.json); client must wait long enough for sales+listings CSV.
          const ENRICH_MS_DEFERRED = 285000;
          const ingestEnrich = (message, data, hypothesisId = 'H13') => {
            fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '69d0ba' },
              body: JSON.stringify({
                sessionId: '69d0ba',
                runId: 'enrich',
                hypothesisId,
                location: 'page.js:refreshProp:deferredEnrich',
                message,
                data,
                timestamp: Date.now(),
              }),
            }).catch(() => {});
          };
          void (async () => {
            const sameEpoch = () => propEnrichEpochRef.current === enrichEpoch;
            let rentalEnriched = false;
            let rentalNA = false;
            let rentalListingsNA = false;
            let rentalListingsOk = false;
            let salesListingsNA = false;
            let salesListingsOk = false;
            // Skip "full" deferred attempt: logs show it always hit ~119s timeout (noSnapshot CSV path) before rental-only.

            try {
              const qRent = new URLSearchParams(q);
              qRent.set('noSnapshot', '1');
              qRent.set('skipAi', '1');
              qRent.set('skipListings', '1');
              qRent.set('skipSalesListings', '1');
              qRent.set('skipHotListings', '1');
              ingestEnrich('deferred enrich rental-only start', {});
              const r2 = await Promise.race([
                fetch(`/api/property?${qRent.toString()}`),
                new Promise((_, rej) => {
                  setTimeout(() => rej(new Error('deferred rental timeout')), ENRICH_MS_DEFERRED);
                }),
              ]);
              const d2 = await r2.json().catch(() => ({}));
              if (sameEpoch() && r2.ok && d2?.ok) {
                setProp((prev) => mergeRentalSliceFromFetch(prev, d2));
                const rn = String(d2.rental?.note || '');
                if (rn.includes('not connected yet')) rentalNA = true;
                else rentalEnriched = !rn.includes('Rental URL failed');
                ingestEnrich('deferred enrich rental-only ok', { rentalEnriched, rentalNA });
              } else {
                ingestEnrich('deferred enrich rental-only miss', { httpOk: r2?.ok, bodyOk: d2?.ok });
              }
            } catch (e2) {
              ingestEnrich('deferred enrich rental-only err', { err: String(e2?.message || e2).slice(0, 160) });
            }

            if (!sameEpoch()) return;

            // Parallel listing fetches; server maxDuration 300s + overlapping CSV downloads.
            const qRentalListings = new URLSearchParams(q);
            qRentalListings.set('noSnapshot', '1');
            qRentalListings.set('skipAi', '1');
            qRentalListings.set('skipRental', '1');
            qRentalListings.delete('skipListings');
            qRentalListings.set('skipSalesListings', '1');
            // Hot listings need computeHotListings (skipHotListings=0); was forced on for speed but left tabs empty.

            const qSalesListingsOnly = new URLSearchParams(q);
            qSalesListingsOnly.set('noSnapshot', '1');
            qSalesListingsOnly.set('skipAi', '1');
            qSalesListingsOnly.set('skipRental', '1');
            qSalesListingsOnly.set('skipListings', '1');
            qSalesListingsOnly.delete('skipSalesListings');

            ingestEnrich('deferred enrich listings parallel start', {}, 'H14');

            const pullRentalListings = async () => {
              try {
                const r = await Promise.race([
                  fetch(`/api/property?${qRentalListings.toString()}`),
                  new Promise((_, rej) => {
                    setTimeout(() => rej(new Error('deferred rental-listings timeout')), ENRICH_MS_DEFERRED);
                  }),
                ]);
                const d = await r.json().catch(() => ({}));
                return { r, d, err: null };
              } catch (err) {
                return { r: null, d: null, err };
              }
            };

            const pullSalesListings = async () => {
              try {
                const r = await Promise.race([
                  fetch(`/api/property?${qSalesListingsOnly.toString()}`),
                  new Promise((_, rej) => {
                    setTimeout(() => rej(new Error('deferred sales-listings timeout')), ENRICH_MS_DEFERRED);
                  }),
                ]);
                const d = await r.json().catch(() => ({}));
                return { r, d, err: null };
              } catch (err) {
                return { r: null, d: null, err };
              }
            };

            try {
              let [outRL, outSL] = await Promise.all([pullRentalListings(), pullSalesListings()]);

              if (!sameEpoch()) return;

              if (outRL.err) {
                ingestEnrich('deferred enrich rental-listings err', { err: String(outRL.err?.message || outRL.err).slice(0, 160) }, 'H14');
              } else if (outRL.r?.ok && outRL.d?.ok) {
                const d = outRL.d;
                setProp((prev) =>
                  prev && d.listings != null
                    ? { ...prev, listings: d.listings }
                    : prev,
                );
                if (d.listings == null) rentalListingsNA = true;
                else rentalListingsOk = !d.listings.error;
                ingestEnrich('deferred enrich rental-listings ok', { rentalListingsOk, rentalListingsNA }, 'H14');
              } else {
                ingestEnrich('deferred enrich rental-listings miss', { httpOk: outRL.r?.ok, bodyOk: outRL.d?.ok }, 'H14');
              }

              if (
                sameEpoch() &&
                outSL.err &&
                String(outSL.err?.message || outSL.err).includes('sales-listings timeout')
              ) {
                ingestEnrich('deferred enrich sales-listings retry after timeout', {}, 'H15');
                outSL = await pullSalesListings();
              }

              if (!sameEpoch()) return;

              if (outSL.err) {
                ingestEnrich('deferred enrich sales-listings err', { err: String(outSL.err?.message || outSL.err).slice(0, 160) }, 'H15');
              } else if (outSL.r?.ok && outSL.d?.ok) {
                const d = outSL.d;
                setProp((prev) =>
                  prev && d.sales_listings != null
                    ? { ...prev, sales_listings: d.sales_listings }
                    : prev,
                );
                if (d.sales_listings == null) salesListingsNA = true;
                else salesListingsOk = !d.sales_listings.error;
                ingestEnrich('deferred enrich sales-listings ok', { salesListingsOk, salesListingsNA }, 'H15');
              } else {
                ingestEnrich('deferred enrich sales-listings miss', { httpOk: outSL.r?.ok, bodyOk: outSL.d?.ok }, 'H15');
              }
            } catch (e3) {
              ingestEnrich('deferred enrich listings parallel err', { err: String(e3?.message || e3).slice(0, 160) }, 'H14');
            }

            if (sameEpoch()) {
              const rentalOk = rentalNA || rentalEnriched;
              const listingsOk =
                (rentalListingsNA || rentalListingsOk) && (salesListingsNA || salesListingsOk);
              if (rentalOk && listingsOk) {
                setPropError(null);
              } else if (!rentalOk && !listingsOk) {
                setPropError((prevErr) =>
                  prevErr &&
                  (String(prevErr).includes('background') || String(prevErr).includes('Sales loaded first'))
                    ? 'Sales loaded first; rental and listings could not be loaded in time — try refresh.'
                    : prevErr,
                );
              } else {
                let miss = 'listings';
                if (!rentalOk) miss = 'rental';
                else if (rentalListingsOk && !salesListingsOk && !salesListingsNA) miss = 'sales listings';
                else if (salesListingsOk && !rentalListingsOk && !rentalListingsNA) miss = 'rental listings';
                setPropError((prevErr) =>
                  prevErr &&
                  (String(prevErr).includes('background') || String(prevErr).includes('Sales loaded first'))
                    ? `Sales loaded first; ${miss} still missing or failed — try refresh.`
                    : prevErr,
                );
              }
            }
          })();

          return;

          // #region agent log
          fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H7',location:'page.js:refreshProp',message:'try listings-only variant',data:{fastTimeoutMs},timestamp:Date.now()})}).catch(()=>{});
          // #endregion

          // Variant A: keep listings + sales listings (still skip rental + AI)
          const qListingsOnly = new URLSearchParams(qFast);
          qListingsOnly.set('skipRental', '1');
          qListingsOnly.set('skipListings', '0');
          qListingsOnly.set('skipSalesListings', '0');
          // Force a short listings CSV fetch to determine if the stall is network/retries vs CPU parsing.
          qListingsOnly.set('listingsTimeoutMs', '5000');
          qListingsOnly.set('listingsMaxAttempts', '1');
          qListingsOnly.set('salesListingsTimeoutMs', '5000');
          qListingsOnly.set('salesListingsMaxAttempts', '1');
          const propUrlListingsOnly = `/api/property?${qListingsOnly.toString()}`;

          const listingsOnlyTimeoutMs = 25000;
          try {
            const tA0 = Date.now();
            const rfA = await Promise.race([
              fetch(propUrlListingsOnly),
              new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`prop listings-only retry timeout after ${listingsOnlyTimeoutMs}ms`)), listingsOnlyTimeoutMs);
              }),
            ]);
            const dfA = await rfA.json().catch(() => ({}));
            if (rfA.ok && dfA?.ok) {
              setProp(dfA);
              setPropError(`Full refresh timed out; partial loaded (listings-only variant).`);
              fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H7',location:'page.js:refreshProp',message:'listings-only variant success',data:{ms:Date.now()-tA0,skips:dfA?._debug_skips},timestamp:Date.now()})}).catch(()=>{});
            } else {
              fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H7',location:'page.js:refreshProp',message:'listings-only variant non-ok',data:{status:rfA?.status,detail:dfA?.detail,skips:dfA?._debug_skips},timestamp:Date.now()})}).catch(()=>{});
            }
          } catch (eA) {
            fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H7',location:'page.js:refreshProp',message:'listings-only variant timed out',data:{ms:timeoutMs},timestamp:Date.now()})}).catch(()=>{});

            // Variant B: keep rental (still skip listings + sales listings + AI)
            const qRentalOnly = new URLSearchParams(qFast);
            qRentalOnly.set('skipRental', '0');
            qRentalOnly.set('skipListings', '1');
            qRentalOnly.set('skipSalesListings', '1');
            const propUrlRentalOnly = `/api/property?${qRentalOnly.toString()}`;

            const rentalOnlyTimeoutMs = 25000;
            try {
              const tB0 = Date.now();
              const rfB = await Promise.race([
                fetch(propUrlRentalOnly),
                new Promise((_, reject) => {
                  setTimeout(() => reject(new Error(`prop rental-only retry timeout after ${rentalOnlyTimeoutMs}ms`)), rentalOnlyTimeoutMs);
                }),
              ]);
              const dfB = await rfB.json().catch(() => ({}));
              if (rfB.ok && dfB?.ok) {
                setProp(dfB);
                setPropError(`Full refresh timed out; partial loaded (rental-only variant).`);
                fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H8',location:'page.js:refreshProp',message:'rental-only variant success',data:{ms:Date.now()-tB0,skips:dfB?._debug_skips},timestamp:Date.now()})}).catch(()=>{});
              } else {
                fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H8',location:'page.js:refreshProp',message:'rental-only variant non-ok',data:{status:rfB?.status,detail:dfB?.detail,skips:dfB?._debug_skips},timestamp:Date.now()})}).catch(()=>{});
              }
            } catch (eB) {
              fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H8',location:'page.js:refreshProp',message:'rental-only variant timed out',data:{error:String(eB?.message||eB).slice(0,120)},timestamp:Date.now()})}).catch(()=>{});
            }
          }

          // Variant C: rentals listings only (skip sales listings)
          const qRentListingsOnly = new URLSearchParams(qFast);
          qRentListingsOnly.set('skipRental', '1');
          qRentListingsOnly.set('skipListings', '0');
          qRentListingsOnly.set('skipSalesListings', '1');
          qRentListingsOnly.set('listingsTimeoutMs', '5000');
          qRentListingsOnly.set('listingsMaxAttempts', '1');
          const propUrlRentListingsOnly = `/api/property?${qRentListingsOnly.toString()}`;
          const rentListingsOnlyTimeoutMs = 25000;
          try {
            const tC0 = Date.now();
            const rfC = await Promise.race([
              fetch(propUrlRentListingsOnly),
              new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`prop rent-listings-only timeout after ${rentListingsOnlyTimeoutMs}ms`)), rentListingsOnlyTimeoutMs);
              }),
            ]);
            const dfC = await rfC.json().catch(() => ({}));
            if (rfC.ok && dfC?.ok) {
              setProp(dfC);
              setPropError(`Full refresh timed out; partial loaded (rental-listings-only variant).`);
              fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H9',location:'page.js:refreshProp',message:'rent-listings-only variant success',data:{ms:Date.now()-tC0,skips:dfC?._debug_skips},timestamp:Date.now()})}).catch(()=>{});
              return;
            }
            fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H9',location:'page.js:refreshProp',message:'rent-listings-only variant non-ok',data:{status:rfC?.status,detail:dfC?.detail,skips:dfC?._debug_skips},timestamp:Date.now()})}).catch(()=>{});
          } catch (eC) {
            fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H9',location:'page.js:refreshProp',message:'rent-listings-only variant timed out',data:{error:String(eC?.message||eC).slice(0,160)},timestamp:Date.now()})}).catch(()=>{});
          }

          // Variant D: sales listings only (skip rental listings)
          const qSalesListingsOnly = new URLSearchParams(qFast);
          qSalesListingsOnly.set('skipRental', '1');
          qSalesListingsOnly.set('skipListings', '1');
          qSalesListingsOnly.set('skipSalesListings', '0');
          qSalesListingsOnly.set('salesListingsTimeoutMs', '5000');
          qSalesListingsOnly.set('salesListingsMaxAttempts', '1');
          const propUrlSalesListingsOnly = `/api/property?${qSalesListingsOnly.toString()}`;
          const salesListingsOnlyTimeoutMs = 25000;
          try {
            const tD0 = Date.now();
            const rfD = await Promise.race([
              fetch(propUrlSalesListingsOnly),
              new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`prop sales-listings-only timeout after ${salesListingsOnlyTimeoutMs}ms`)), salesListingsOnlyTimeoutMs);
              }),
            ]);
            const dfD = await rfD.json().catch(() => ({}));
            if (rfD.ok && dfD?.ok) {
              setProp(dfD);
              setPropError(`Full refresh timed out; partial loaded (sales-listings-only variant).`);
              fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H10',location:'page.js:refreshProp',message:'sales-listings-only variant success',data:{ms:Date.now()-tD0,skips:dfD?._debug_skips},timestamp:Date.now()})}).catch(()=>{});
              return;
            }
            fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H10',location:'page.js:refreshProp',message:'sales-listings-only variant non-ok',data:{status:rfD?.status,detail:dfD?.detail,skips:dfD?._debug_skips},timestamp:Date.now()})}).catch(()=>{});
          } catch (eD) {
            fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H10',location:'page.js:refreshProp',message:'sales-listings-only variant timed out',data:{error:String(eD?.message||eD).slice(0,160)},timestamp:Date.now()})}).catch(()=>{});
          }

          return;
        } catch (fastErr) {
          // #region agent log
          fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H6',location:'page.js:refreshProp',message:'fast retry failed',data:{error:String(fastErr?.message||fastErr).slice(0,160)},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          throw fastErr;
        }
      }
      // #region agent log
      fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H2',location:'page.js:refreshProp',message:'fetch property response',data:{ok:r.ok,status:r.status},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        // #region agent log
        fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H12',location:'page.js:refreshProp',message:'property non-ok payload',data:{status:r.status,error:d?.error,detail:String(d?.detail||'').slice(0,180)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const msg = d?.detail ? `${d.error || `HTTP ${r.status}`} (${d.detail})` : (d?.error || `HTTP ${r.status}`);
        throw new Error(msg);
      }
      setProp(d);
    } catch(e) {
      // #region agent log
      fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H12',location:'page.js:refreshProp',message:'refreshProp catch',data:{error:String(e?.message||e).slice(0,180)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setPropError(e.message);
    }
    finally {
      // #region agent log
      fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H3',location:'page.js:refreshProp',message:'refreshProp finally',data:{},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setLoadProp(false);
    }
  }, [salesCsvPath, area, propTab]);

  const applyAreaClient = useCallback((nextArea) => {
    const text = uploadedCsvTextRef.current;
    if (!text) return;
    const label = salesCsvPath.replace(/^\(browser\)\s*/i, '') || 'uploaded.csv';
    const built = buildPayloadFromCsvText(text, label, { area: nextArea.trim() || undefined });
    if (!built.ok) {
      setPropError(built.body?.error || 'Filter failed');
      return;
    }
    const payload = { ...built.body };
    delete payload._stats_for_ai;
    setProp(payload);
    setPropError(null);
  }, [salesCsvPath]);

  const uploadCsv = useCallback(async (file) => {
    if (!file) return;
    setUploadingCsv(true); setPropError(null);
    try {
      const text = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => reject(new Error('Could not read file'));
        r.readAsText(file, 'UTF-8');
      });
      const label = file.name || 'sales.csv';
      uploadedCsvTextRef.current = text;
      setArea('');
      const built = buildPayloadFromCsvText(text, label, {});
      if (!built.ok) {
        throw new Error(built.body?.error || 'Could not parse CSV');
      }
      const payload = { ...built.body };
      const stats = payload._stats_for_ai;
      delete payload._stats_for_ai;
      setSalesCsvPath(`(browser) ${label}`);
      setProp(payload);
      if (stats) {
        try {
          const ir = await fetch('/api/property/interpret', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stats }),
          });
          const ai = await ir.json().catch(() => ({}));
          if (ai?.owner_briefing) {
            setProp(p => p && ({
              ...p,
              owner_briefing: ai.owner_briefing,
              market_split: { ...p.market_split, note: ai.market_note || p.market_split?.note },
              rental: { ...p.rental, landlord_vs_tenant: ai.demand_signal || p.rental?.landlord_vs_tenant },
            }));
          }
        } catch { /* AI optional */ }
      }
    } catch (e) {
      setPropError(e.message);
    } finally {
      setUploadingCsv(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const t0 = Date.now();
    // #region agent log
    fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H3',location:'page.js:refreshAll',message:'refreshAll start',data:{},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    await Promise.all([refreshIntel(), refreshProp()]);
    // #region agent log
    fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'pre-fix',hypothesisId:'H3',location:'page.js:refreshAll',message:'refreshAll done',data:{ms:Date.now()-t0},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }, [refreshIntel, refreshProp]);

  // Wire up scroll-reveal IntersectionObserver (re-runs when data changes so new elements are observed)
  useEffect(() => {
    const root = document.querySelector('.dashboard-root');
    if (!root) return;
    const targets = Array.from(root.querySelectorAll('.reveal:not(.visible)'));
    if (!targets.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.08 });
    targets.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [intel, prop, showData, propTab]);

  const mkt  = intel?.markets;
  const pl   = intel?.pillars;
  const pillarOrder  = ['security','oil','equities','macro','buyer_demand','aviation','property'];
  const pillarsWithKey = pillarOrder.map(k => pl?.[k] ? { ...pl[k], key:k } : null);

  const maxVol        = prop?.top_areas        ? Math.max(...prop.top_areas.map(a=>parseInt(a.vol?.replace(/,/g,''))||0))        : 1;
  const maxVolRental  = prop?.rental_top_areas ? Math.max(...prop.rental_top_areas.map(a=>parseInt(a.vol)||0)) : 1;
  const brentRaw  = mkt?.brent?.raw || 0;
  const vixRaw    = mkt?.vix?.raw   || 0;
  const r10Raw    = mkt?.us10y?.raw  || 0;
  const oilPctRaw  = parseFloat((mkt?.brent?.pct||'0%').replace('%',''));
  const goldPctRaw = parseFloat((mkt?.gold?.pct||'0%').replace('%',''));
  const oilGoldCoMove = oilPctRaw > 1.0 && goldPctRaw > 0.5;
  // Use flag from API if available, fall back to client-side signal
  const oilFlag = intel?.alert_indicators?.oil_supply_shock?.flag
    || (oilGoldCoMove && vixRaw >= 22 ? 'supply_shock' : oilGoldCoMove ? 'possible_disruption' : 'demand_driven');
  const eiborRate= parseFloat(intel?.eibor?.rate_pct||0);
  const pmiVal   = parseFloat(intel?.uae_pmi?.headline||0);

  const listingsForTab = propTab === 'sales' ? prop?.sales_listings : prop?.listings;
  const activeHotType = hotTypeByTab[propTab] || 'apartment';
  const hotTypeOptions = [
    ['apartment', 'Apartments'],
    ['villa', 'Villas'],
    ['townhouse', 'Townhouses'],
  ];
  const hotTypeLabel = activeHotType === 'villa'
    ? 'Villas'
    : activeHotType === 'townhouse'
      ? 'Townhouses'
      : 'Apartments';
  const hotByType = listingsForTab?.hot_listings_by_type || null;
  const displayedHotListings = hotByType
    ? (hotByType[activeHotType] || [])
    : (listingsForTab?.hot_listings || []);

  const openPrintPdf = useCallback(() => {
    showDataBeforePrintRef.current = showData;
    setShowData(true);
    setPrintScope(false);
    requestAnimationFrame(() => {
      setTimeout(() => window.print(), 450);
    });
  }, [showData]);

  const openPrintSelected = useCallback(() => {
    showDataBeforePrintRef.current = showData;
    if (clientSections.s05) setShowData(true);
    setPrintScope(true);
    requestAnimationFrame(() => {
      setTimeout(() => window.print(), 550);
    });
  }, [showData, clientSections.s05]);

  const buildClientHtml = useCallback(() => {
    // In the exported window we're not in @media print, so .print-only would stay hidden.
    // Override so client-pack content is visible on screen and when printing.
    const clientPackOverride = `
      .client-pack-print .print-only { display: block !important; }
      .client-pack-print .no-print { display: none !important; }
      @media (max-width: 768px) {
        .client-pack-print .client-pack-body { padding: 16px 12px 40px !important; }
        .client-pack-print > div:last-of-type { padding-left: 12px !important; padding-right: 12px !important; }
        .client-pack-print [style*="grid-template-columns"],
        .client-pack-print [style*="gridTemplateColumns"] { grid-template-columns: 1fr !important; }
        .client-pack-print .print-keep-together { min-width: 0; overflow-wrap: break-word; word-wrap: break-word; }
        .client-pack-print .print-keep-together > * { min-width: 0; }
        .client-pack-print [style*="display: flex"] > div:first-child,
        .client-pack-print [style*="display:flex"] > div:first-child { min-width: 0; overflow-wrap: break-word; word-wrap: break-word; }
      }
    `;
    const chunks = [
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Strada · Client brief · ${ts || ''}</title><style>${css}</style><style>${clientPackOverride}</style></head>`,
      `<body class="client-pack-print" style="margin:0;background:${C.bg};color:${C.t1};font-family:-apple-system,Segoe UI,sans-serif;font-weight:300;font-size:14px">`,
      `<div style="padding:16px 20px;background:${C.gd};border-bottom:1px solid ${C.border};font-family:monospace;font-size:10px;color:${C.am};line-height:1.5">`,
      `<strong>Static client brief</strong> · ${ts || '—'} GST · Opened offline — does not use Strada APIs (no credit use).`,
      `</div><div class="client-pack-body" style="padding:24px 40px 64px">`,
    ];
    for (const { id } of CLIENT_SECTION_META) {
      if (!clientSections[id]) continue;
      const el = document.querySelector(`[data-client-section="${id}"]`);
      if (el) chunks.push(cloneNodeNoNoPrint(el));
    }
    chunks.push(
      `</div><div style="padding:14px 40px;border-top:1px solid ${C.border};font-size:9px;color:${C.tm}">Strada Real Estate · stradauae.com · For discussion only; not financial advice.</div></body></html>`,
    );
    return chunks.join('');
  }, [clientSections, ts]);

  const downloadClientPackHtml = useCallback(() => {
    if (clientSections.s05) setShowData(true);
    const slug = (ts || new Date().toISOString()).replace(/[^\dA-Za-z]+/g, '-').slice(0, 32);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const html = buildClientHtml();
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Strada-client-brief-${slug}.html`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, clientSections.s05 ? 400 : 0);
    });
  }, [clientSections, ts, buildClientHtml]);

  /** Opens selected sections in a new window, ready for Print → Save as PDF. Each section starts on a new page. */
  const openClientPdfView = useCallback(() => {
    if (clientSections.s05) setShowData(true);
    // Build HTML after a short delay so s05 data can render, then open via Blob URL so we don't rely on popup-unblocked window.
    requestAnimationFrame(() => {
      setTimeout(() => {
        const html = buildClientHtml();
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        const w = window.open(blobUrl, '_blank', 'noopener,noreferrer,width=900,height=700,scrollbars=yes,resizable=yes');
        if (w) setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      }, clientSections.s05 ? 400 : 0);
    });
  }, [clientSections, ts, buildClientHtml]);

  /** Downloads a PDF with one page per section (section-based page breaks). Uses html2pdf.js; no server required. */
  const downloadClientPdf = useCallback(() => {
    if (clientSections.s05) setShowData(true);
    const slug = (ts || new Date().toISOString()).replace(/[^\dA-Za-z]+/g, '-').slice(0, 32);
    requestAnimationFrame(() => {
      setTimeout(async () => {
        const html2pdf = (await import('html2pdf.js')).default;
        const html = buildClientHtml();
        const iframe = document.createElement('iframe');
        iframe.setAttribute('style', 'position:fixed;left:-9999px;top:0;width:210mm;height:297mm;border:none');
        document.body.appendChild(iframe);
        const iframeDoc = iframe.contentDocument;
        if (!iframeDoc) { try { document.body.removeChild(iframe); } catch (_) {} return; }
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();
        iframeDoc.querySelectorAll('[data-client-section]:not([data-client-section="header"]):not([data-client-section="verdict"])').forEach(el => el.classList.add('pdf-page-break-before'));
        const opt = {
          margin: [10, 8, 10, 8],
          filename: `Strada-client-brief-${slug}.pdf`,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { before: '.pdf-page-break-before' },
        };
        try {
          await html2pdf().set(opt).from(iframeDoc.body).save();
        } finally {
          try { document.body.removeChild(iframe); } catch (_) {}
        }
      }, clientSections.s05 ? 400 : 0);
    });
  }, [clientSections, ts, buildClientHtml]);

  useEffect(() => {
    const onAfterPrint = () => {
      setShowData(showDataBeforePrintRef.current);
      setPrintScope(false);
    };
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  // Previously: auto-refresh market signals on mount.
  // Now disabled so web search / Haiku are only triggered by explicit user action.
  useEffect(() => {
    if (!isClientView) return;
    refreshIntel();
    refreshProp();
  }, [isClientView, refreshIntel, refreshProp]);

  useEffect(() => {
    if (isClientView) setClientPackOpen(false);
  }, [isClientView]);

  const secClass = (id) =>
    printScope && !clientSections[id] ? 'print-exclude-section' : '';

  const sanitizeRawGithubLinks = (t) => {
    if (t == null) return t;
    const s = typeof t === 'string' ? t : String(t);
    if (!s) return s;

    // Common pattern in our data: "Self-hosted CSV (https://raw.githubusercontent.com/...)".
    // Replace with the label only (no raw URL).
    let out = s.replace(
      /Self-hosted CSV\s*\(\s*https?:\/\/raw\.githubusercontent\.com\/[^)]*\s*\)/gi,
      'Self-hosted CSV'
    );

    // Redact any remaining raw GitHub URLs.
    out = out.replace(
      /https?:\/\/raw\.githubusercontent\.com\/[^\s)]+/gi,
      '[redacted raw data URL]'
    );

    // If we introduced empty parentheses, remove them.
    out = out.replace(/\(\s*\[redacted raw data URL\]\s*\)/gi, '');
    return out;
  };

  const sanitizeCsvHelp = (t) => {
    if (t == null) return t;
    const s = typeof t === 'string' ? t : String(t);
    // Remove any explicit raw GitHub URL references from visible UI text.
    return s
      .replace(/https?:\/\/raw\.githubusercontent\.com\/[^\s)]+/gi, '[redacted raw data URL]')
      .replace(/docs\/GITHUB_CSV\.md/gi, '[redacted docs]')
      .replace(/GitHub raw/gi, '[redacted]')
      .replace(/PROPERTY_SALES_CSV_URL/gi, 'CSV_URL')
      .replace(/PROPERTY_RENTAL_CSV_URL/gi, 'RENTAL_CSV_URL');
  };

  return (
    <div
      className={`dashboard-root${printScope ? ' client-pack-print' : ''}`}
      style={{ background:'var(--navy)', minHeight:'100vh', color:'var(--white)', fontFamily:"var(--font-poppins,'Poppins',-apple-system,'Segoe UI',sans-serif)", fontWeight:300, fontSize:14, maxWidth:'100%' }}
    >
      <style>{css}</style>

      {/* ── HEADER / NAV ────────────────────────────────── */}
      <div
        data-client-section="header"
        className={`dash-nav print-avoid-break ${secClass('header')}`}
      >
        <div className="dash-nav-inner">
          {/* Brand */}
          <div className="dash-brand">
            <div className="dash-brand-dot no-print"/>
            <div>
              <div className="dash-brand-name">Kyle<span>.</span>Caruana</div>
              <div className="dash-brand-sub">Dubai Property Intelligence</div>
            </div>
          </div>

          {/* Actions (admin only shows refresh, everyone sees area + print) */}
          <div className="no-print dash-nav-actions dash-header-actions">
            {!isClientView && (
              <button onClick={() => refreshAll()} disabled={loadIntel||loadProp} className="lp-btn lp-btn-gold">
                {(loadIntel||loadProp) && <span style={{ width:10,height:10,border:'2px solid #070b14',borderTopColor:'transparent',borderRadius:'50%',animation:'spin .7s linear infinite',flexShrink:0 }}/>}
                {(loadIntel||loadProp) ? 'Updating…' : '⟳  Get Latest Intelligence'}
              </button>
            )}

            <div className="dash-nav-row2">
              {!isClientView && (
                <button onClick={() => refreshIntel()} disabled={loadIntel} className="lp-btn lp-btn-ghost">
                  {loadIntel ? '…' : 'Market signals'}
                </button>
              )}
              {!isClientView && (
                <button onClick={() => refreshIntelSnapshot()} disabled={refreshingSnapshot} className="lp-btn lp-btn-ghost lp-btn-accent" title="Runs live intelligence once, stores snapshot for clients">
                  {refreshingSnapshot ? 'Refreshing…' : 'Update snapshot'}
                </button>
              )}
              {/* PDF/print export removed per request */}
              {!isClientView && (
                <button onClick={() => refreshProp()} disabled={loadProp} className="lp-btn lp-btn-ghost">
                  {loadProp ? '…' : 'Property data'}
                </button>
              )}
              <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'var(--gold)' }}>Area</span>
                <select
                  value={area}
                  onChange={(e) => {
                    const v = e.target.value;
                    setArea(v);
                    if (uploadedCsvTextRef.current) applyAreaClient(v);
                    else refreshProp(undefined, v);
                  }}
                  disabled={loadProp || (!(prop?.area_options?.length) && !uploadedCsvTextRef.current)}
                  style={{ padding:'7px 12px', background:'rgba(11,18,32,0.88)', border:'1px solid rgba(201,168,76,0.22)', borderRadius:8, color:'var(--white)', fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, maxWidth:220 }}
                >
                  <option value="">All areas</option>
                  {(prop?.area_options || []).map((a) => (
                    <option key={a} value={a}>{a.length > 40 ? `${a.slice(0, 37)}…` : a}</option>
                  ))}
                </select>
              </label>
            </div>

            {!isClientView && (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, width:'min(460px,100%)' }}>
                <input
                  value={salesCsvPath}
                  onChange={(e)=>setSalesCsvPath(e.target.value)}
                  onKeyDown={(e)=>{ if (e.key === 'Enter') refreshProp(); }}
                  placeholder="Optional hosted CSV URL (server path)"
                  style={{ width:'100%', padding:'8px 12px', background:'rgba(11,18,32,0.88)', color:'var(--white)', border:'1px solid rgba(201,168,76,0.18)', borderRadius:8, fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:10 }}
                />
                <label style={{ width:'100%', display:'block', fontSize:10, color:'var(--muted)' }}>
                  Or upload local CSV directly
                  <input type="file" accept=".csv,text/csv" onChange={(e)=>uploadCsv(e.target.files?.[0])} disabled={uploadingCsv} style={{ display:'block', width:'100%', marginTop:4, color:'var(--white)' }}/>
                </label>
                <div style={{ fontSize:9, color:'var(--muted)' }}>
                  {uploadingCsv ? 'Reading CSV…' : 'Hosted CSV URLs via environment variables. File picker = local parse.'}
                </div>
                <div style={{ fontSize:9, color:'var(--muted)' }}>
                  Off-plan is inferred from <span style={{ color:'var(--gold-light)' }}>Select Data Points = Oqood</span>.
                </div>
              </div>
            )}

          </div>

          {/* Meta strip: direct child of nav-inner so it spans full width as its own row */}
          <div className="no-print dash-nav-meta">
            <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, letterSpacing:'0.1em', color:'var(--muted)' }}>
              {ts ? `Last updated · ${ts} GST` : isClientView ? 'Waiting for intelligence snapshot' : 'Press "Get Latest Intelligence" to begin'}
            </div>
            {isClientView && (
              <div style={{ fontSize:9, color:'rgba(201,168,76,0.35)' }}>
                Client view · area filter active · refresh is admin-only
              </div>
            )}
          </div>

          <div className="print-only" style={{ fontSize:9, color:C.tm, textAlign:'right' }}>
            {ts ? `Data as of · ${ts} GST` : 'Load intelligence before export for full report'}
          </div>
        </div>

        {/* Notices */}
        {intel?.intel_notice && (
          <div className="no-print" style={{ margin:'0 clamp(16px,5vw,48px) 12px', padding:'10px 16px', background:'rgba(245,158,11,0.08)', border:`1px solid ${C.am}40`, borderRadius:10, fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:10, color:C.amL, lineHeight:1.5 }}>
            ⚠ AI intel disabled: {intel.intel_notice}
          </div>
        )}
        {error     && <div className="no-print" style={{ margin:'0 clamp(16px,5vw,48px) 12px', padding:'10px 16px', background:'rgba(239,68,68,0.08)', border:`1px solid ${C.red}30`, borderRadius:10, fontSize:10, color:C.red }}>⚠ {sanitizeCsvHelp(error)}</div>}
        {propError && <div className="no-print" style={{ margin:'0 clamp(16px,5vw,48px) 6px',  padding:'10px 16px', background:'rgba(239,68,68,0.08)', border:`1px solid ${C.red}30`, borderRadius:10, fontSize:10, color:C.red }}>⚠ {sanitizeCsvHelp(propError)}</div>}
      </div>

      <div
        style={{
          padding: `0 max(clamp(16px, 5vw, 48px), env(safe-area-inset-right, 0px)) 80px max(clamp(16px, 5vw, 48px), env(safe-area-inset-left, 0px))`,
        }}
      >

        {/* ══════════════════════════════════════════════ */}
        {/* ── TODAY'S VERDICT ── */}
        {/* ══════════════════════════════════════════════ */}
        {(intel||loadIntel) && (() => {
          const v = VERDICT(intel?.composite||3);
          return (
            <div
              data-client-section="verdict"
              className={`reveal print-avoid-break lp-card ${secClass('verdict')}`}
              style={{ marginTop:32, padding:'24px 28px', background:`${v.col}0e`, border:`1px solid ${v.col}40`, borderLeft:`5px solid ${v.col}` }}
            >
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:v.col, marginBottom:8 }}>Today's Market Verdict</div>
                  {loadIntel ? <Skel h={32} mb={8} w="60%"/> :
                    <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:28, fontWeight:800, color:v.col, marginBottom:6, textShadow:glowFor(v.col) }}>{v.label}</div>
                  }
                  {loadIntel ? <Skel h={14} w="80%"/> :
                    <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.65, maxWidth:520 }}>{v.sub}</div>
                  }
                  {intel?.action && !loadIntel && (
                    <div style={{ marginTop:16, padding:'12px 16px', background:'rgba(7,11,20,0.5)', border:`1px solid ${v.col}28`, borderRadius:10, maxWidth:520 }}>
                      <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:C.am, marginBottom:6 }}>Strada's Recommendation</div>
                      <div style={{ fontSize:12, color:'var(--white)', lineHeight:1.65 }}>{intel.action}</div>
                    </div>
                  )}
                </div>
                {!loadIntel && intel?.composite && (
                  <div style={{ textAlign:'center', minWidth:90 }}>
                    <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'var(--muted)', marginBottom:6 }}>Overall Score</div>
                    <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:64, fontWeight:800, color:v.col, lineHeight:1, textShadow:glowFor(v.col) }}><CountUp to={parseFloat(intel.composite)||0} decimals={1} durationMs={1800}/></div>
                    <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:10, letterSpacing:'2px', textTransform:'uppercase', color:'var(--muted)', marginTop:4 }}>Out of 5</div>
                  </div>
                )}
              </div>
              {!loadIntel && intel?.composite && <>
                <Bar score={intel.composite} color={v.col} style={{ marginTop:18, marginBottom:6 }}/>
                <div style={{ display:'flex', justifyContent:'space-between', fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:7, letterSpacing:'1px', color:'rgba(201,168,76,0.35)' }}>
                  <span>CRISIS</span><span>HIGH RISK</span><span>STABLE</span><span>STRONG</span><span>EXCELLENT</span>
                </div>
              </>}
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════ */}
        {/* ── 01 DUBAI PROPERTY MARKET — THE NUMBERS ── */}
        {/* ══════════════════════════════════════════════ */}
        <div data-client-section="s01" className={`print-section ${secClass('s01')}`} style={{ marginTop:56 }}>
          <SectionHead n="01" title="Dubai Property Market — The Numbers"
            desc="Live transaction data from Dubai Land Department, rental yields, asking prices and the most active areas this week."/>

          {/* ── Sales / Rental toggle ── */}
          <div style={{ display:'flex', gap:6, marginBottom:24, flexWrap:'wrap' }}>
            {[['sales','Sales Data'],['rental','Rental Data']].map(([tab, label]) => (
              <button key={tab} onClick={() => setPropTab(tab)} style={{
                padding:'8px 22px',
                background: propTab===tab ? C.amL : 'transparent',
                color: propTab===tab ? C.bg : C.t2,
                border: `1px solid ${propTab===tab ? C.amL : C.border}`,
                borderRadius: 40,
                fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)",
                fontSize:10, fontWeight:700, letterSpacing:'2px',
                textTransform:'uppercase', cursor:'pointer',
                transition:'background 0.2s, color 0.2s, border-color 0.2s',
              }}>{label}</button>
            ))}
          </div>

          {/* Owner briefing — switches between sales and rental summary */}
          {((propTab === 'sales' ? prop?.owner_briefing : prop?.rental_owner_briefing) || loadProp) && (
            <div className="reveal print-keep-together lp-card" style={{ marginBottom:20, padding:'20px 24px', borderLeft:`4px solid ${C.g}` }}>
              <Tag color={C.ga}>Strada's Market Summary · {prop?.data_freshness||'Latest data'}</Tag>
              {loadProp?<><Skel h={14} mb={6}/><Skel w="80%" h={14}/></>:
                <p style={{ fontSize:13, color:'var(--white)', lineHeight:1.75, marginTop:6 }}>
                  {na(propTab === 'sales' ? prop?.owner_briefing : (prop?.rental_owner_briefing || prop?.owner_briefing))}
                </p>
              }
            </div>
          )}

          {/* ── SALES TAB: weekly deal counts ── */}
          {propTab === 'sales' && (
            <div className="reveal" style={{ marginBottom:16 }}>
              <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:12 }}>HOW MANY DEALS ARE HAPPENING · {prop?.weekly?.period_label||'Latest week'}</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <TxCard label="Properties Sold" value={prop?.weekly?.sale_volume?.value} wowChg={prop?.weekly?.sale_volume?.chg_wow} yoyChg={prop?.weekly?.sale_volume?.chg_yoy} trend={prop?.weekly?.sale_volume?.trend} period={prop?.weekly?.sale_volume?.period} source={prop?.weekly?.sale_volume?.source} loading={loadProp}/>
                <TxCard label="Total Sales Value" value={prop?.weekly?.sale_value_aed?.value} wowChg={prop?.weekly?.sale_value_aed?.chg_wow} yoyChg={prop?.weekly?.sale_value_aed?.chg_yoy} trend={prop?.weekly?.sale_value_aed?.trend} period={prop?.weekly?.sale_value_aed?.period} source={prop?.weekly?.sale_value_aed?.source} loading={loadProp}/>
              </div>
            </div>
          )}

          {/* ── SALES TAB: last 25 transactions (area-filtered) ── */}
          {propTab === 'sales' && (
            <div className="reveal lp-card print-keep-together" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: "var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize: 9, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'var(--gold)' }}>Recent sales transactions</div>
                <div style={{ fontSize: 10, color: C.tm, marginTop: 4 }}>
                  Last 25 by date{prop?.filter_area ? ` · ${prop.filter_area}` : ''}
                </div>
              </div>
              {loadProp ? (
                <div style={{ padding: '14px 18px' }}><Skel h={12} mb={8} /><Skel h={12} mb={8} /><Skel h={12} w="70%" /></div>
              ) : (prop?.recent_sales_transactions && prop.recent_sales_transactions.length > 0) ? (
                <div className="tx-scroll-wrap" data-agent-tx-scroll="sales" style={{ maxHeight: 280, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ minWidth: 720, width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead>
                      <tr style={{ background: C.card }}>
                        <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Date</th>
                        <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Area</th>
                        <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Location</th>
                        <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Unit</th>
                        <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Type</th>
                        <th title="Segment" style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Seg.</th>
                        <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'right', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Price</th>
                        <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'right', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>PSF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prop.recent_sales_transactions.map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: '4px 5px', color: C.t1, whiteSpace: 'nowrap' }}>{row.date}</td>
                          <td style={{ padding: '4px 5px', color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }} title={row.area}>{row.area}</td>
                          <td style={{ padding: '4px 5px', color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }} title={row.location}>{row.location}</td>
                          <td style={{ padding: '4px 5px', color: C.t2, whiteSpace: 'nowrap' }}>{row.unit_no ?? '—'}</td>
                          <td style={{ padding: '4px 5px', color: C.t2, whiteSpace: 'nowrap' }} title={row.unit_type}>{row.unit_type}</td>
                          <td style={{ padding: '4px 5px', color: C.t2, whiteSpace: 'nowrap' }} title={row.segment}>{row.segment}</td>
                          <td style={{ padding: '4px 5px', color: C.metric, textAlign: 'right', whiteSpace: 'nowrap' }}>{row.price_fmt}</td>
                          <td style={{ padding: '4px 5px', color: C.t2, textAlign: 'right', whiteSpace: 'nowrap' }}>{row.psf_fmt !== '—' ? `${row.psf_fmt} /sqft` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '14px 18px', fontSize: 12, color: C.tm }}>No recent sales rows to show{prop?.filter_area ? ` for ${prop.filter_area}` : ''}.</div>
              )}
            </div>
          )}

          {/* ── RENTAL TAB: weekly rental counts ── */}
          {propTab === 'rental' && (
            <div className="reveal" style={{ marginBottom:16 }}>
              <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:12 }}>RENTAL ACTIVITY · {prop?.weekly?.period_label||'Latest week'}</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <TxCard label="Rental registrations" value={prop?.weekly?.rent_volume?.value} wowChg={prop?.weekly?.rent_volume?.chg_wow} yoyChg={prop?.weekly?.rent_volume?.chg_yoy} trend={prop?.weekly?.rent_volume?.trend} period={prop?.weekly?.rent_volume?.period} source={prop?.weekly?.rent_volume?.source} loading={loadProp}/>
                <TxCard label="Annualised rent (week)" value={prop?.weekly?.rent_value_aed?.value} wowChg={prop?.weekly?.rent_value_aed?.chg_wow} yoyChg={prop?.weekly?.rent_value_aed?.chg_yoy} trend={prop?.weekly?.rent_value_aed?.trend} period={prop?.weekly?.rent_value_aed?.period} source={prop?.weekly?.rent_value_aed?.source} loading={loadProp}/>
              </div>
              {prop?.weekly?.rent_new_vs_renewal && !loadProp && (
                <div className="reveal print-keep-together lp-card" style={{ marginTop:12, padding:'20px 22px' }}>
                  <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:14 }}>NEW VS RENEWAL · SAME WEEK (BY REGISTRATION DATE)</div>
                  <div style={{ display:'flex', gap:16, flexWrap:'wrap', alignItems:'center', marginBottom:12 }}>
                    <div style={{ flex:1, minWidth:140 }}>
                      <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:C.ga, marginBottom:6 }}>New Contract</div>
                      <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:28, fontWeight:800, color:C.ga, textShadow:C.glowGa }}>{prop.weekly.rent_new_vs_renewal.new_count}</div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{prop.weekly.rent_new_vs_renewal.new_pct}% of split · WoW {prop.weekly.rent_new_vs_renewal.new_chg_wow}</div>
                    </div>
                    <div style={{ flex:1, minWidth:140 }}>
                      <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:C.am, marginBottom:6 }}>Renewal</div>
                      <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:28, fontWeight:800, color:C.am, textShadow:C.glowAm }}>{prop.weekly.rent_new_vs_renewal.renewal_count}</div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{prop.weekly.rent_new_vs_renewal.renewal_pct}% of split · WoW {prop.weekly.rent_new_vs_renewal.renewal_chg_wow}</div>
                    </div>
                    {Number(prop.weekly.rent_new_vs_renewal.other_count) > 0 && (
                      <div style={{ flex:1, minWidth:140 }}>
                        <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:C.t2, marginBottom:6 }}>Other / Unspecified</div>
                        <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:28, fontWeight:800, color:C.t2 }}>{prop.weekly.rent_new_vs_renewal.other_count}</div>
                        <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>Rows not tagged as new or renewal</div>
                      </div>
                    )}
                  </div>
                  <div style={{ height:8, background:C.border, borderRadius:4, overflow:'hidden', display:'flex' }}>
                    <div style={{ width:`${prop.weekly.rent_new_vs_renewal.new_pct}%`, background:C.ga, minWidth: Number(prop.weekly.rent_new_vs_renewal.new_count) > 0 ? 2 : 0 }} title="New" />
                    <div style={{ width:`${prop.weekly.rent_new_vs_renewal.renewal_pct}%`, background:C.am, minWidth: Number(prop.weekly.rent_new_vs_renewal.renewal_count) > 0 ? 2 : 0 }} title="Renewal" />
                    {Number(prop.weekly.rent_new_vs_renewal.other_count) > 0 && (
                      <div style={{ width:`${Math.max(0,100-Number(prop.weekly.rent_new_vs_renewal.new_pct||0)-Number(prop.weekly.rent_new_vs_renewal.renewal_pct||0))}%`, background:C.td, minWidth:2 }} title="Other / unspecified"/>
                    )}
                  </div>
                  <div style={{ fontSize:10, color:'rgba(201,168,76,0.35)', marginTop:10 }}>Split = new + renewal + other ({Number(prop.weekly.rent_new_vs_renewal.new_count) + Number(prop.weekly.rent_new_vs_renewal.renewal_count) + Number(prop.weekly.rent_new_vs_renewal.other_count || 0)} of {prop?.weekly?.rent_volume?.value} registrations). Source: {prop.weekly.rent_new_vs_renewal.column}</div>
                </div>
              )}
            </div>
          )}

          {/* ── RENTAL TAB: last 25 transactions (area-filtered) ── */}
          {propTab === 'rental' && (
            <div className="reveal lp-card print-keep-together" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: "var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize: 9, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'var(--gold)' }}>Recent rental transactions</div>
                <div style={{ fontSize: 10, color: C.tm, marginTop: 4 }}>
                  Last 25 by date{prop?.filter_area ? ` · ${prop.filter_area}` : ''}
                </div>
              </div>
              {loadProp ? (
                <div style={{ padding: '14px 18px' }}><Skel h={12} mb={8} /><Skel h={12} mb={8} /><Skel h={12} w="70%" /></div>
              ) : (prop?.recent_rental_transactions && prop.recent_rental_transactions.length > 0) ? (
                <div className="tx-scroll-wrap" data-agent-tx-scroll="rental" style={{ maxHeight: 280, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ minWidth: 620, width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead>
                      <tr style={{ background: C.card }}>
                        <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Date</th>
                        <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Area</th>
                        <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Location</th>
                        <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Unit</th>
                        <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Beds</th>
                        <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'right', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Rent /yr</th>
                        <th title="New / renewal" style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 5px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>N/R</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prop.recent_rental_transactions.map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: '4px 5px', color: C.t1, whiteSpace: 'nowrap' }}>{row.date}</td>
                          <td style={{ padding: '4px 5px', color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }} title={row.area}>{row.area}</td>
                          <td style={{ padding: '4px 5px', color: C.t2, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }} title={row.location}>{row.location}</td>
                          <td style={{ padding: '4px 5px', color: C.t2, whiteSpace: 'nowrap' }}>{row.unit_no ?? '—'}</td>
                          <td style={{ padding: '4px 5px', color: C.t2, whiteSpace: 'nowrap' }} title={row.beds}>{row.beds}</td>
                          <td style={{ padding: '4px 5px', color: C.metric, textAlign: 'right', whiteSpace: 'nowrap' }}>{row.rent_fmt}</td>
                          <td style={{ padding: '4px 5px', color: C.t2, whiteSpace: 'nowrap' }} title={row.recurrence}>{row.recurrence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '14px 18px', fontSize: 12, color: C.tm }}>
                  {prop?.rental?.note && String(prop.rental.note).includes('Rental URL failed')
                    ? 'Rental data unavailable — recent transactions not loaded.'
                    : `No recent rental rows to show${prop?.filter_area ? ` for ${prop.filter_area}` : ''}.`}
                </div>
              )}
            </div>
          )}

          {/* ── Prices card — sales tab: PSF + optional asking sale by bed / rental tab: asking rent by bedroom ── */}
          <div className={`reveal ${propTab === 'sales' ? 'mob-stack-2' : ''}`} style={{ display:'grid', gridTemplateColumns: propTab === 'sales' ? (prop?.sales_listings?.by_beds || loadProp ? 'repeat(3, minmax(0, 1fr))' : '1fr 1fr') : '1fr', gap:12, marginBottom:12 }}>
            {propTab === 'sales' ? (
              <>
              <div className="print-keep-together lp-card" style={{ padding:'20px 22px' }}>
                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:14 }}>Average Asking Price Per Square Foot · {sanitizeRawGithubLinks(na(prop?.prices?.price_source))}</div>
                <div className="mob-stack-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    ['Apartments', prop?.prices?.apt_psf_aed, prop?.prices?.apt_avg_aed, prop?.prices?.apt_chg_yoy||prop?.prices?.price_index_chg_yoy],
                    ['Villas',     prop?.prices?.villa_psf_aed, prop?.prices?.villa_avg_aed, prop?.prices?.villa_chg_yoy||prop?.prices?.price_index_chg_yoy],
                  ].map(([type,psf,avg,yoy]) => (
                    <div key={type} style={{ padding:'12px 14px', background:'rgba(11,18,32,0.6)', borderRadius:10 }}>
                      <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'var(--muted)', marginBottom:8 }}>{type}</div>
                      <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:24, fontWeight:800, color:C.metric, textShadow:C.glowMetric }}>AED {na(psf)}<span style={{fontSize:10,color:'var(--muted)'}}>/sqft</span></div>
                      {avg&&<div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>Avg deal: AED {na(avg)}</div>}
                      {yoy&&<div style={{ fontSize:10, fontWeight:600, color:yoy.toString().startsWith('+')?C.g:C.red, marginTop:3 }}>{yoy} vs last year</div>}
                    </div>
                  ))}
                </div>
              </div>
              {(prop?.sales_listings?.by_beds || loadProp) && (
                <div className="print-keep-together lp-card" style={{ padding:'20px 22px' }}>
                  <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:14 }}>
                    Average Asking Sale Price by Bedroom · {sanitizeRawGithubLinks(na(prop?.sales_listings?.source))}
                  </div>
                  {loadProp ? <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>{[1,2,3,4].map(i=><Skel key={i} h={72} style={{ flex:1, minWidth:100 }}/>)}</div> : (()=>{
                    const beds = prop?.sales_listings?.by_beds || {};
                    const cmpMap = prop?.sales_listings?.asking_vs_txn_by_beds || {};
                    const bedOrder = ['Studio','1','2','3','4+'];
                    const rows = bedOrder.filter(k => beds[k]);
                    return (
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        {rows.map(key => {
                          const d = beds[key];
                          const dpct = cmpMap[key]?.delta_pct;
                          const dpctColor = dpct == null ? C.tm : dpct > 5 ? C.red : dpct < -5 ? C.g : C.am;
                          return (
                            <div key={key} style={{ flex:'1 1 min(100px,100%)', padding:'12px 14px', background:'rgba(11,18,32,0.6)', borderRadius:10, minWidth:'min(100px,100%)' }}>
                              <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'var(--muted)', marginBottom:8 }}>{key === 'Studio' ? 'Studio' : `${key} Bed`}</div>
                              <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:20, fontWeight:800, color:C.metric, textShadow:C.glowMetric }}>{d.avg_price_fmt}</div>
                              <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{d.count.toLocaleString()} listings</div>
                              {dpct != null && (
                                <div style={{ fontSize:10, fontWeight:600, color:dpctColor, marginTop:3 }}>
                                  {dpct > 0 ? '+' : ''}{dpct}% vs transacted
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
              </>
            ) : (
              /* Rental tab: average asking rent per bedroom from listings CSV */
              (prop?.listings?.by_beds || loadProp) && (
                <div className="print-keep-together lp-card" style={{ padding:'20px 22px' }}>
                  <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:14 }}>
                    Average Asking Rent by Bedroom · {sanitizeRawGithubLinks(na(prop?.listings?.source))}
                  </div>
                  {loadProp ? <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>{[1,2,3,4].map(i=><Skel key={i} h={72} style={{ flex:1, minWidth:100 }}/>)}</div> : (()=>{
                    const beds = prop?.listings?.by_beds || {};
                    const bedOrder = ['Studio','1','2','3','4+'];
                    const rows = bedOrder.filter(k => beds[k]);
                    const rentRef = { Studio: prop?.rental?.studio_avg_aed, '1': prop?.rental?.apt_1br_avg_aed, '2': prop?.rental?.apt_2br_avg_aed, '3': prop?.rental?.villa_3br_avg_aed };
                    return (
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        {rows.map(key => {
                          const d = beds[key];
                          const txnRaw = parseFloat(rentRef[key]);
                          const dpct = txnRaw && d.avg_price > 0 ? Math.round(((d.avg_price - txnRaw) / txnRaw) * 100) : null;
                          const dpctColor = dpct == null ? C.tm : dpct > 5 ? C.red : dpct < -5 ? C.g : C.am;
                          return (
                            <div key={key} style={{ flex:'1 1 min(100px,100%)', padding:'12px 14px', background:'rgba(11,18,32,0.6)', borderRadius:10, minWidth:'min(100px,100%)' }}>
                              <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'var(--muted)', marginBottom:8 }}>{key === 'Studio' ? 'Studio' : `${key} Bed`}</div>
                              <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:20, fontWeight:800, color:C.metric, textShadow:C.glowMetric }}>{d.avg_price_fmt}<span style={{fontSize:9,color:'var(--muted)'}}>/yr</span></div>
                              <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{d.count.toLocaleString()} listings</div>
                              {dpct != null && (
                                <div style={{ fontSize:10, fontWeight:600, color:dpctColor, marginTop:3 }}>
                                  {dpct > 0 ? '+' : ''}{dpct}% vs transacted
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )
            )}

            {/* Off-plan vs resale — sales tab only */}
            {propTab === 'sales' && (
              <div className="print-keep-together lp-card" style={{ padding:'20px 22px' }}>
                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:12 }}>What Kind of Property Is Selling? · {na(prop?.market_split?.split_period)}</div>
                {loadProp?<Skel h={60}/>:prop?.market_split&&(
                  <>
                    <SplitBar offplan={na(prop.market_split.offplan_pct)} secondary={na(prop.market_split.secondary_pct)} loading={loadProp}/>
                    <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(11,18,32,0.6)', borderRadius:10 }}>
                      <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'var(--muted)', marginBottom:5 }}>What This Means</div>
                      <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.6 }}>
                        {parseInt(prop.market_split.offplan_pct)>=65 ? 'New-build off-plan is dominating — developers have pricing power. Good if you own land or new builds; watch for oversupply risk.' :
                         parseInt(prop.market_split.offplan_pct)<=35 ? 'Resale market is stronger — existing homeowners are in a solid position.' :
                         prop.market_split.note || 'Balanced market between new builds and resales — healthy sign for all property types.'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 30-day trends: daily + 7d MA + weekly */}
          {/* ── Sales tab: 30-day sales charts ── */}
          {propTab === 'sales' && (prop?.charts_30d || loadProp) && (
            <div className="reveal print-keep-together" style={{ marginBottom:16 }}>
              <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:8 }}>
                Market Trend (Dubai) · {prop?.charts_30d?.window_label || '30 days'}
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14, maxWidth:720, lineHeight:1.55 }}>
                Daily lines are noisy (weekends & batch uploads). <strong style={{ color:C.t2 }}>7-day moving average</strong> highlights direction over the same 30-day window.
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap:12 }}>
                <TrendDualChart
                  title="Sale volume"
                  subtitle="Transactions per day vs smoothed trend"
                  daily={prop?.charts_30d?.sale_volume || []}
                  ma7={prop?.charts_30d?.sale_volume_ma7 || []}
                  dailyColor={C.ga}
                  maColor={C.gm}
                  yZero
                  loading={loadProp}
                />
                <TrendDualChart
                  title="PSF (AED/sq ft)"
                  subtitle="Daily avg (filled) vs 7-day average"
                  daily={prop?.charts_30d?.psf || []}
                  ma7={prop?.charts_30d?.psf_ma7 || []}
                  dailyColor={C.amL}
                  maColor="#e8a060"
                  loading={loadProp}
                />
              </div>
              <div className="print-keep-together" style={{ marginTop:12 }}>
                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', margin:'16px 0 10px' }}>Weekly Pulse (30-Day Window · Dubai Mon–Sun)</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap:12 }}>
                {loadProp ? (
                  <>
                    <div className="print-keep-together lp-card" style={{ padding:'16px 18px' }}><Tag color={C.gm}>Weekly volume</Tag><Skel h={36} /></div>
                    <div className="print-keep-together lp-card" style={{ padding:'16px 18px' }}><Tag color={C.gm}>Weekly PSF</Tag><Skel h={36} /></div>
                  </>
                ) : (
                  <>
                    <div className="print-keep-together lp-card" style={{ padding:'16px 18px' }}>
                      <Tag color={C.gm}>Weekly volume</Tag>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:6 }}>Total transactions Mon–Sun (Dubai)</div>
                      <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:13, fontWeight:700, color:(prop?.charts_30d?.wow_volume_pct ?? 0) >= 0 ? C.ga : C.amL, marginTop:10 }}>
                        Latest week vs prior:{' '}
                        {prop?.charts_30d?.wow_volume_pct != null && Number.isFinite(prop.charts_30d.wow_volume_pct)
                          ? `${prop.charts_30d.wow_volume_pct >= 0 ? '+' : ''}${prop.charts_30d.wow_volume_pct}%`
                          : 'N/A'}
                      </div>
                    </div>
                    <div className="print-keep-together lp-card" style={{ padding:'16px 18px' }}>
                      <Tag color={C.gm}>Weekly PSF</Tag>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:6 }}>Median price per sq ft by week</div>
                      <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:13, fontWeight:700, color:(prop?.charts_30d?.wow_psf_pct ?? 0) >= 0 ? C.ga : C.amL, marginTop:10 }}>
                        Median WoW:{' '}
                        {prop?.charts_30d?.wow_psf_pct != null && Number.isFinite(prop.charts_30d.wow_psf_pct)
                          ? `${prop.charts_30d.wow_psf_pct >= 0 ? '+' : ''}${prop.charts_30d.wow_psf_pct}%`
                          : 'N/A'}
                      </div>
                    </div>
                  </>
                )}
                </div>
              </div>
            </div>
          )}

          {/* ── Rental tab: 30-day rental charts ── */}
          {propTab === 'rental' && (prop?.rental_charts_30d || loadProp) && (
            <div className="reveal print-keep-together" style={{ marginBottom:16 }}>
              <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:8 }}>
                Rental Trend (Dubai) · {prop?.rental_charts_30d?.window_label || '30 days'}
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14, maxWidth:720, lineHeight:1.55 }}>
                Daily registration counts can be noisy. <strong style={{ color:C.t2 }}>7-day moving average</strong> shows the underlying rental activity trend.
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap:12 }}>
                <TrendDualChart
                  title="Rental volume"
                  subtitle="Registrations per day vs smoothed trend"
                  daily={prop?.rental_charts_30d?.rent_volume || []}
                  ma7={prop?.rental_charts_30d?.rent_volume_ma7 || []}
                  dailyColor={C.ga}
                  maColor={C.gm}
                  yZero
                  loading={loadProp}
                />
                <TrendDualChart
                  title="Avg annual rent (AED)"
                  subtitle="Daily avg (filled) vs 7-day average"
                  daily={prop?.rental_charts_30d?.rent_avg_aed || []}
                  ma7={prop?.rental_charts_30d?.rent_avg_aed_ma7 || []}
                  dailyColor={C.amL}
                  maColor="#e8a060"
                  loading={loadProp}
                />
              </div>
              <div className="print-keep-together" style={{ marginTop:12 }}>
                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', margin:'16px 0 10px' }}>Weekly Rental Pulse (30-Day Window · Dubai Mon–Sun)</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap:12 }}>
                {loadProp ? (
                  <>
                    <div className="print-keep-together lp-card" style={{ padding:'16px 18px' }}><Tag color={C.gm}>Weekly volume</Tag><Skel h={36} /></div>
                    <div className="print-keep-together lp-card" style={{ padding:'16px 18px' }}><Tag color={C.gm}>Weekly avg rent</Tag><Skel h={36} /></div>
                  </>
                ) : (
                  <>
                    <div className="print-keep-together lp-card" style={{ padding:'16px 18px' }}>
                      <Tag color={C.gm}>Weekly volume</Tag>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:6 }}>Total rental registrations Mon–Sun (Dubai)</div>
                      <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:13, fontWeight:700, color:(prop?.rental_charts_30d?.wow_volume_pct ?? 0) >= 0 ? C.ga : C.amL, marginTop:10 }}>
                        Latest week vs prior:{' '}
                        {prop?.rental_charts_30d?.wow_volume_pct != null && Number.isFinite(prop.rental_charts_30d.wow_volume_pct)
                          ? `${prop.rental_charts_30d.wow_volume_pct >= 0 ? '+' : ''}${prop.rental_charts_30d.wow_volume_pct}%`
                          : 'N/A'}
                      </div>
                    </div>
                    <div className="print-keep-together lp-card" style={{ padding:'16px 18px' }}>
                      <Tag color={C.gm}>Weekly avg rent</Tag>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:6 }}>Avg annualised rent (AED) — 7-day trend</div>
                      <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:13, fontWeight:700, color:(prop?.rental_charts_30d?.wow_rent_pct ?? 0) >= 0 ? C.ga : C.amL, marginTop:10 }}>
                        Avg WoW:{' '}
                        {prop?.rental_charts_30d?.wow_rent_pct != null && Number.isFinite(prop.rental_charts_30d.wow_rent_pct)
                          ? `${prop.rental_charts_30d.wow_rent_pct >= 0 ? '+' : ''}${prop.rental_charts_30d.wow_rent_pct}%`
                          : 'N/A'}
                      </div>
                    </div>
                  </>
                )}
                </div>
              </div>
            </div>
          )}

          {/* Rental yields — sales tab only */}
          {propTab === 'sales' && (prop?.yields||loadProp) && (
            <div className="print-keep-together reveal" style={{ marginBottom:12 }}>
              <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:12 }}>Annual Rental Yield — How Much Income Your Property Generates</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <YieldGauge label="Villa · Gross Yield"      gross={na(prop?.yields?.villa_gross_yield)}   loading={loadProp}/>
                <YieldGauge label="Apartment · Gross Yield"  gross={na(prop?.yields?.apt_gross_yield)}    loading={loadProp}/>
                <YieldGauge label="Townhouse · Gross Yield"   gross={na(prop?.yields?.townhouse_gross_yield)} loading={loadProp}/>
              </div>
            </div>
          )}

          {/* ── Listings pipeline — rental tab: rental listings CSV / sales tab: sales listings CSV ── */}
          {(listingsForTab || loadProp || prop?._debug_skips) && (
            <div className="reveal" style={{ marginBottom:12 }}>
              <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:12 }}>
                {propTab === 'sales' ? 'Sales Listings — Active Supply Pipeline' : 'Rental Listings — Active Supply Pipeline'}
                {listingsForTab?.filter_area && (
                  <span style={{ color:C.tm, fontWeight:400, marginLeft:6 }}>· {listingsForTab.filter_area}</span>
                )}
              </div>

              {!loadProp && listingsForTab?.error && (
                <div className="lp-card" style={{ padding:'12px 16px', marginBottom:12, fontSize:12, color:C.am, lineHeight:1.5 }}>{listingsForTab.error}</div>
              )}

              {!loadProp && !listingsForTab && prop?._debug_skips && (
                <div className="lp-card" style={{ padding:'12px 16px', marginBottom:12, fontSize:12, color:C.amL, lineHeight:1.5, background:'rgba(201,168,76,0.08)', border:`1px solid ${C.border}` }}>
                  Listings were skipped due to a refresh timeout. Transaction metrics are shown; retry “Get Latest Intelligence” when you want the full supply pipeline.
                </div>
              )}

              {/* Summary stat row */}
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
                {/* Total listings */}
                <div className="print-keep-together lp-card" style={{ flex:1, minWidth:'min(140px,100%)', padding:'16px 20px', textAlign:'center' }}>
                  <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:C.tm, marginBottom:8 }}>{propTab === 'sales' ? 'Active Sales Listings' : 'Active Rental Listings'}</div>
                  {loadProp?<Skel h={32} mb={4}/>:<>
                    <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:26, fontWeight:800, color:C.amL, textShadow:C.glowMetric }}>
                      {listingsForTab?.total != null ? listingsForTab.total.toLocaleString() : '—'}
                    </div>
                    {listingsForTab?.new_this_week != null && (
                      <div style={{ fontSize:10, marginTop:4 }}>
                        <span style={{ color:C.g }}>+{listingsForTab.new_this_week} last 7 days</span>
                        {listingsForTab?.wow_new_pct != null && (
                          <span style={{ color: listingsForTab.wow_new_pct >= 0 ? C.g : C.am, marginLeft:6 }}>
                            ({listingsForTab.wow_new_pct >= 0 ? '+' : ''}{listingsForTab.wow_new_pct}% WoW)
                          </span>
                        )}
                      </div>
                    )}
                  </>}
                </div>

                {/* Absorption / supply depth */}
                <div className="print-keep-together lp-card" style={{ flex:1, minWidth:'min(140px,100%)', padding:'16px 20px', textAlign:'center' }}>
                  <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:C.tm, marginBottom:8 }}>Listing Cover (Weeks)</div>
                  {loadProp?<Skel h={32} mb={4}/>:<>
                    {listingsForTab?.supply_depth ? (
                      <>
                        <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:26, fontWeight:800, color:listingsForTab.supply_depth.weeks<=4?C.g:listingsForTab.supply_depth.weeks<=8?C.am:C.red, textShadow:C.glowMetric }}>
                          {listingsForTab.supply_depth.weeks}
                        </div>
                        <div style={{ fontSize:9, color:C.tm, marginTop:4 }}>
                          {listingsForTab.supply_depth.listings_total} listings / {listingsForTab.supply_depth.weekly_registrations}{propTab === 'sales' ? ' deals/wk' : ' registrations/wk'}
                        </div>
                      </>
                    ) : <div style={{ fontSize:18, fontWeight:700, color:C.t2 }}>—</div>}
                  </>}
                </div>
              </div>

              {/* New listings per day — same Dubai 7-day window as “last 7 days” counts */}
              {!listingsForTab?.error && (
                loadProp ? (
                  <div className="lp-card print-keep-together" style={{ padding: '14px 18px', marginBottom: 12 }}>
                    <Skel h={12} w="55%" mb={10} />
                    <Skel h={72} />
                  </div>
                ) : (listingsForTab?.listings_added_by_day?.length > 0) ? (
                  (() => {
                    const added = listingsForTab.listings_added_by_day;
                    const maxC = Math.max(1, ...added.map((d) => d.count));
                    return (
                      <div className="reveal print-keep-together lp-card" style={{ padding: '14px 18px', marginBottom: 12 }}>
                        <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize: 9, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>
                          {propTab === 'sales' ? 'Sales listings added per day' : 'Rental listings added per day'}
                        </div>
                        {listingsForTab.listings_added_period && (
                          <div style={{ fontSize: 10, color: C.tm, marginBottom: 12 }}>{listingsForTab.listings_added_period}</div>
                        )}
                        <div
                          role="img"
                          aria-label={`Listings added per day in the Dubai week: ${added.map((d) => `${d.label} ${d.count}`).join(', ')}.`}
                          style={{ display: 'flex', gap: 4, alignItems: 'flex-end', minHeight: 88 }}
                        >
                          {added.map((d) => (
                            <div key={d.date} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', height: 88, justifyContent: 'flex-end' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: d.count > 0 ? C.amL : C.tm, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>{d.count}</div>
                              <div style={{ width: '100%', maxWidth: 40, height: 56, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderRadius: 4, background: `linear-gradient(to top, ${C.border} 0%, transparent 8%)` }}>
                                <div
                                  style={{
                                    width: 'min(100%, 36px)',
                                    height: `${(d.count / maxC) * 100}%`,
                                    minHeight: d.count > 0 ? 3 : 0,
                                    borderRadius: 4,
                                    background: d.count > 0 ? `linear-gradient(180deg, ${C.amL}, rgba(201,168,76,0.45))` : 'transparent',
                                    boxShadow: d.count > 0 ? C.glowMetric : 'none',
                                  }}
                                />
                              </div>
                              <div style={{ fontSize: 8, color: C.tm, marginTop: 6, textAlign: 'center', lineHeight: 1.2 }}>{d.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                ) : null
              )}

              {/* Hot Listings — vs transacted benchmark, ≤30d, area-filtered */}
              {!listingsForTab?.error && (
                <div className="reveal print-keep-together lp-card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize: 9, fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'var(--gold)' }}>Hot Listings</div>
                    <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>
                      {hotTypeOptions.map(([k, label]) => (
                        <button
                          key={k}
                          onClick={() => setHotTypeByTab((prev) => ({ ...prev, [propTab]: k }))}
                          style={{
                            padding:'5px 12px',
                            background: activeHotType===k ? C.amL : 'transparent',
                            color: activeHotType===k ? C.bg : C.t2,
                            border: `1px solid ${activeHotType===k ? C.amL : C.border}`,
                            borderRadius: 40,
                            fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)",
                            fontSize:9, fontWeight:700, letterSpacing:'1px',
                            textTransform:'uppercase', cursor:'pointer',
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: C.tm, marginTop: 4, lineHeight: 1.45 }}>
                      {listingsForTab?.hot_listings_rules || (propTab === 'sales'
                        ? 'Top 25 asks below average transacted sale per building + bedroom + property type in the selected area (last 30 days of listings).'
                        : 'Top 25 asks below average transacted rent per building + bedroom + property type in the selected area (last 30 days of listings).')}
                      <span style={{ fontWeight: 600 }}>{` · showing ${hotTypeLabel}`}</span>
                      {listingsForTab?.filter_area && (
                        <span style={{ fontWeight: 600 }}>{` · ${listingsForTab.filter_area}`}</span>
                      )}
                    </div>
                  </div>
                  {loadProp ? (
                    <div style={{ padding: '14px 18px' }}><Skel h={12} mb={8} /><Skel h={12} mb={8} /><Skel h={12} w="65%" /></div>
                  ) : (displayedHotListings && displayedHotListings.length > 0) ? (
                    <div className="tx-scroll-wrap" style={{ maxHeight: 320, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <table style={{ minWidth: 680, width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                        <thead>
                          <tr style={{ background: C.card }}>
                            <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Community</th>
                            <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Type</th>
                            <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Beds</th>
                            <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Building</th>
                            <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'right', padding: '4px 6px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Price</th>
                            <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'right', padding: '4px 6px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }} title={propTab === 'sales' ? '% below average transacted sale in this area for same building + bedroom + property type' : '% below average transacted rent in this area for same building + bedroom + property type'}>% below txn</th>
                            <th style={{ position: 'sticky', top: 0, background: C.card, textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${C.border}`, color: C.tm, fontWeight: 700, whiteSpace: 'nowrap' }}>Link</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedHotListings.map((row, i) => {
                            let safeHref = null;
                            if (row.link && typeof row.link === 'string') {
                              try {
                                const u = new URL(row.link.trim());
                                if (u.protocol === 'http:' || u.protocol === 'https:') safeHref = u.href;
                              } catch { /* ignore */ }
                            }
                            const tip = propTab === 'sales'
                              ? `Avg transacted sale (${row.property_type || 'Apartment'} · ${row.bed_label || row.beds || '—'}): ${row.market_avg_fmt || '—'}`
                              : `Avg transacted rent (${row.property_type || 'Apartment'} · ${row.bed_label || row.beds || '—'}): ${row.market_avg_fmt || '—'}`;
                            return (
                              <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                                <td style={{ padding: '4px 6px', color: C.t2, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.community}>{row.community}</td>
                                <td style={{ padding: '4px 6px', color: C.t2, whiteSpace: 'nowrap' }} title={row.property_type}>{row.property_type || '—'}</td>
                                <td style={{ padding: '4px 6px', color: C.t2, whiteSpace: 'nowrap' }} title={row.bed_label || row.beds}>{row.beds || row.bed_label || '—'}</td>
                                <td style={{ padding: '4px 6px', color: C.t2, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.building}>{row.building}</td>
                                <td style={{ padding: '4px 6px', color: C.metric, textAlign: 'right', whiteSpace: 'nowrap' }}>{row.price_fmt}</td>
                                <td style={{ padding: '4px 6px', color: C.ga, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }} title={tip}>{row.pct_drop != null ? `${row.pct_drop}%` : '—'}</td>
                                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                                  {safeHref ? (
                                    <a href={safeHref} target="_blank" rel="noopener noreferrer" style={{ color: C.amL, fontSize: 10, fontWeight: 600 }}>
                                      View
                                    </a>
                                  ) : (
                                    <span style={{ color: C.tm }}>—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ padding: '14px 18px', fontSize: 12, color: C.tm, lineHeight: 1.5 }}>
                      {listingsForTab?.hot_listings_note
                        || (propTab === 'sales'
                          ? `No ${hotTypeLabel.toLowerCase()} hot listings right now — need recent listings (last 30 days) with asking sale below the area’s transacted average for that building + bedroom + property type (sales CSV).`
                          : `No ${hotTypeLabel.toLowerCase()} hot listings right now — need recent listings (last 30 days) with asking rent below the area’s transacted average for that building + bedroom + property type (rental CSV).`)}
                    </div>
                  )}
                </div>
              )}

              {/* Asking by bedroom — rent (rental tab) or sale (sales tab) */}
              {(loadProp || listingsForTab?.by_beds) && (
                <div className="print-keep-together lp-card" style={{ padding:'20px 22px', marginBottom:8 }}>
                  <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:C.tm, marginBottom:14 }}>
                    {propTab === 'sales' ? 'Asking Sale Price by Bedroom Type' : 'Asking Rent by Bedroom Type'}
                  </div>
                  {loadProp?[1,2,3,4].map(i=><Skel key={i} h={28} mb={8}/>):(()=>{
                    const beds = listingsForTab?.by_beds || {};
                    const cmpMap = listingsForTab?.asking_vs_txn_by_beds || {};
                    const bedOrder = ['Studio','1','2','3','4+'];
                    const visibleRows = bedOrder.filter(k => beds[k]);
                    if (!visibleRows.length) return <div style={{ fontSize:11, color:C.tm }}>No bedroom data available.</div>;
                    const hasCmp = Object.keys(cmpMap).length > 0;
                    // 5 cols when comparison data available, 4 otherwise
                    const cols = hasCmp ? '70px 60px 1fr 1fr 60px' : '80px 1fr 1fr 1fr';
                    const headers = hasCmp
                      ? ['Beds','#','Avg Asking','Avg Transacted','Δ%']
                      : (propTab === 'sales' ? ['Beds','Listings','Avg Asking Sale','Range'] : ['Beds','Listings','Avg Asking Rent','Range']);
                    return (
                      <div data-agent-beds-grid="listings" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <div style={{ minWidth: hasCmp ? 520 : 360 }}>
                          <div style={{ display:'grid', gridTemplateColumns:cols, gap:4, marginBottom:8 }}>
                            {headers.map(h=>(
                              <div key={h} style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:8, fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:C.tm, whiteSpace:'nowrap' }}>{h}</div>
                            ))}
                          </div>
                          {visibleRows.map((key) => {
                            const d = beds[key];
                            const cmp = cmpMap[key];
                            const dpct = cmp?.delta_pct;
                            const deltaColor = dpct == null ? C.tm : dpct > 5 ? C.red : dpct < -5 ? C.g : C.am;
                            return (
                              <div key={key} style={{ display:'grid', gridTemplateColumns:cols, gap:4, padding:'8px 0', borderTop:`1px solid ${C.border}`, alignItems:'center' }}>
                                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontWeight:700, fontSize:13, color:C.amL, whiteSpace:'nowrap' }}>{key === 'Studio' ? 'Studio' : `${key} Bed`}</div>
                                <div style={{ fontSize:12, color:C.t1, whiteSpace:'nowrap' }}>{d.count.toLocaleString()}</div>
                                <div style={{ fontSize:12, color:C.t1, fontWeight:600, whiteSpace:'nowrap' }}>{d.avg_price_fmt}{propTab === 'sales' ? '' : '/yr'}</div>
                                {hasCmp ? <>
                                  <div style={{ fontSize:12, color:C.tm, whiteSpace:'nowrap' }}>
                                    {cmp ? `${cmp.txn_fmt}${propTab === 'sales' ? '' : '/yr'}` : '—'}
                                  </div>
                                  <div style={{ fontSize:12, fontWeight:700, color:deltaColor, whiteSpace:'nowrap' }}>
                                    {dpct != null ? `${dpct > 0 ? '+' : ''}${dpct}%` : '—'}
                                  </div>
                                </> : (
                                  <div style={{ fontSize:11, color:C.tm, whiteSpace:'nowrap' }}>{d.min_price_fmt} – {d.max_price_fmt}</div>
                                )}
                              </div>
                            );
                          })}
                          <div style={{ fontSize:9, color:C.tm, marginTop:10 }}>
                            {hasCmp
                              ? (propTab === 'sales'
                                ? 'Avg Transacted = avg sale price from rolling week in sales transactions (by bedroom). Δ% = asking vs transacted (red = asking above market, green = below).'
                                : 'Avg Transacted = avg recently registered rent from rental CSV. Δ% = asking vs transacted (red = asking above market, green = below).')
                              : (propTab === 'sales'
                                ? 'Min–max range of asking sale prices across active listings.'
                                : 'Min–max range of asking rents across active listings.')}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Top communities / buildings by listing supply */}
              {(loadProp || listingsForTab?.top_communities?.length > 0 || listingsForTab?.top_buildings?.length > 0) && (
                <div className="print-keep-together lp-card" style={{ padding:'20px 22px' }}>
                  <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:C.tm, marginBottom:6 }}>
                    {listingsForTab?.listings_top_mode === 'building'
                      ? (propTab === 'sales' ? 'Top Buildings by Sales Listing Volume' : 'Top Buildings by Rental Listing Volume')
                      : (propTab === 'sales' ? 'Top Communities by Sales Listing Volume' : 'Top Communities by Rental Listing Volume')}
                  </div>
                  <div style={{ fontSize:11, color:C.tm, marginBottom:14 }}>
                    {listingsForTab?.listings_top_mode === 'building'
                      ? `Inside ${listingsForTab.filter_area} · ranked by active listings`
                      : (propTab === 'sales' ? 'Where sales listing supply is concentrated' : 'Where rental supply is concentrated · last 15 days')}
                  </div>
                  {loadProp?[1,2,3,4,5].map(i=><Skel key={i} h={32} mb={8}/>):(()=>{
                    const items = listingsForTab?.listings_top_mode === 'building'
                      ? (listingsForTab?.top_buildings || [])
                      : (listingsForTab?.top_communities || []);
                    if (!items.length) return null;
                    const maxCount = items[0]?.count || 1;
                    return items.slice(0,10).map((c, i) => {
                      const pct = Math.round((c.count / maxCount) * 100);
                      const isLast = i === Math.min(items.length,10)-1;
                      return (
                        <div key={i} style={{ marginBottom: isLast?0:10 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                            <span style={{ fontSize:11, color:C.t1, fontWeight:i===0?700:400 }}>
                              <span style={{ color:C.amL, fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontWeight:700, marginRight:8 }}>#{i+1}</span>
                              {c.name}
                            </span>
                            <span style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:12, color:C.amL, fontWeight:700 }}>{c.count} listings</span>
                          </div>
                          <div style={{ height:3, background:`${C.amL}18`, borderRadius:2 }}>
                            <div style={{ width:`${pct}%`, height:'100%', background:`${C.amL}60`, borderRadius:2, transition:'width 1.2s ease' }}/>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Hottest areas — sales tab: ranked by sales deals */}
          {propTab === 'sales' && (prop?.top_areas||loadProp) && (
            <div className="reveal" style={{ marginBottom:12 }}>
              <div className="print-keep-together lp-card" style={{ padding:'20px 22px' }}>
                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:6 }}>
                  {prop?.top_areas_mode === 'sub_community'
                    ? 'Most Active Sub-Communities / Buildings'
                    : 'Most Active Areas This Week'}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:14 }}>
                  {prop?.top_areas_mode === 'sub_community'
                    ? `Inside ${prop?.filter_area || 'selected area'} · ranked by deals`
                    : 'Ranked by number of sales deals'}
                </div>
                {loadProp?[1,2,3,4,5].map(i=><Skel key={i} h={32} mb={8}/>):
                  (prop?.top_areas?.length
                    ? prop.top_areas.slice(0, 5).map((a, i) => (
                        <AreaRow key={i} rank={`#${i + 1}`} area={na(a.area)} vol={na(a.vol)} psf={na(a.avg_psf || a.psf)} trend={a.trend} maxVol={maxVol} last={i === Math.min(prop.top_areas.length, 5) - 1} />
                      ))
                    : prop?.top_areas_mode === 'sub_community' && prop?.top_areas_empty_hint ? (
                        <div style={{ fontSize: 10, color: C.tm, lineHeight: 1.5, padding: '8px 0' }}>{prop.top_areas_empty_hint}</div>
                      ) : null)}
              </div>
            </div>
          )}

          {/* Hottest areas — rental tab: ranked by rental registrations */}
          {propTab === 'rental' && (prop?.rental_top_areas||loadProp) && (
            <div className="reveal" style={{ marginBottom:12 }}>
              <div className="print-keep-together lp-card" style={{ padding:'20px 22px' }}>
                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:6 }}>
                  {prop?.rental_top_areas_mode === 'sub_community'
                    ? 'Most Active Rental Sub-Communities / Buildings'
                    : 'Most Active Rental Areas This Week'}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:14 }}>
                  {prop?.rental_top_areas_mode === 'sub_community'
                    ? `Inside ${prop?.filter_area || 'selected area'} · ranked by rental registrations`
                    : 'Ranked by number of rental registrations'}
                </div>
                {loadProp?[1,2,3,4,5].map(i=><Skel key={i} h={32} mb={8}/>):
                  (prop?.rental_top_areas?.length
                    ? prop.rental_top_areas.map((a, i) => (
                        <AreaRow
                          key={i}
                          rank={`#${i + 1}`}
                          area={na(a.area)}
                          vol={na(a.vol)}
                          volLabel="rentals"
                          psfDisplay={a.avg_rent_label ? `AED ${a.avg_rent_label}/yr` : undefined}
                          trend={a.trend}
                          maxVol={maxVolRental}
                          last={i === prop.rental_top_areas.length - 1}
                        />
                      ))
                    : <div style={{ fontSize:10, color:C.tm }}>No rental area data available</div>)}
              </div>
            </div>
          )}

        </div>

        {/* ══════════════════════════════════════════════ */}
        {/* ── 02 WHAT'S DRIVING THE MARKET ── */}
        {/* ══════════════════════════════════════════════ */}
        <div data-client-section="s02" className={`print-section ${secClass('s02')}`} style={{ marginTop:56 }}>
          <SectionHead n="02" title="What's Driving the Market?"
            desc="Seven forces that determine where Dubai property prices go next — each searched, scored and explained in plain English. Green means it's helping your property value. Red means it's adding pressure."/>
          <PillarCarousel pillars={pillarsWithKey} loading={loadIntel}/>
        </div>

        {/* ══════════════════════════════════════════════ */}
        {/* ── 03 THREE POSSIBLE OUTCOMES ── */}
        {/* ══════════════════════════════════════════════ */}
        {(intel||loadIntel) && (
        <div data-client-section="s03" className={`print-section ${secClass('s03')}`} style={{ marginTop:56 }}>
          <SectionHead n="03" title="Three Possible Outcomes"
            desc="Based on today's data, here are the three most likely ways the Dubai property market could move over the next 3–6 months."/>
          <div className="mob-stack-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>

            {/* Probabilities */}
            <div className="reveal print-keep-together lp-card" style={{ padding:24 }}>
              <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:18 }}>Likelihood of Each Scenario</div>
              {loadIntel?[1,2,3].map(i=><Skel key={i} h={40} mb={14}/>):[
                ['Most likely — market stays broadly stable', intel?.base, C.g, 'Geopolitical risk stays contained. Oil steady. Foreign buyers active.'],
                ['Negative — conditions deteriorate',         intel?.down, C.am, 'Conflict escalates or oil drops sharply. Buyers pause.'],
                ['Positive — surge of safe-haven demand',     intel?.up,   C.ga, 'De-escalation and confidence surge. Dubai benefits as safe haven.'],
              ].map(([lbl,pct,col,detail],i)=>(
                <div key={i} style={{ marginBottom:18 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
                    <span style={{ fontSize:12, color:'var(--muted)', flex:1, paddingRight:10, lineHeight:1.5 }}>{lbl}</span>
                    <span style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:22, fontWeight:800, color:col, textShadow:glowFor(col) }}>{pct ? <>~<CountUp to={parseFloat(pct)||0} suffix="%" durationMs={1600}/></> : '—'}</span>
                  </div>
                  <div style={{ height:4, background:'rgba(201,168,76,0.12)', borderRadius:4, marginBottom:6 }}>
                    <div style={{ width:`${pct||0}%`, height:'100%', background:`linear-gradient(90deg,${col},${col}cc)`, borderRadius:4, transition:'width 1.4s ease' }}/>
                  </div>
                  <div style={{ fontSize:10, color:'rgba(248,246,242,0.3)', lineHeight:1.5 }}>{detail}</div>
                </div>
              ))}
            </div>

            {/* Score card */}
            <div className="reveal reveal-d2 print-keep-together lp-card" style={{ border:'1px solid rgba(201,168,76,0.25)', padding:28, display:'flex', flexDirection:'column', justifyContent:'center' }}>
              {loadIntel?<Skel h={120}/>:<>
                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:10 }}>Overall Market Score</div>
                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:80, fontWeight:800, color:intel?.col||C.tm, lineHeight:1, marginBottom:4, textShadow:glowFor(intel?.col||C.tm) }}>
                  <CountUp to={parseFloat(intel?.composite)||0} decimals={1} durationMs={2000}/><span style={{fontSize:16,color:'var(--muted)'}}>/5</span>
                </div>
                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:12, fontWeight:700, letterSpacing:'0.1em', color:intel?.col||C.tm, marginBottom:14 }}>
                  {intel?.label}
                </div>
                <Bar score={intel?.composite} color={intel?.col} style={{ marginBottom:8 }}/>
                <div style={{ display:'flex', justifyContent:'space-between', fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:7, letterSpacing:'1px', color:'rgba(201,168,76,0.35)', marginBottom:16 }}>
                  <span>CRISIS</span><span>CAUTION</span><span>STABLE</span><span>STRONG</span><span>EXCELLENT</span>
                </div>
                <div style={{ padding:'14px 16px', background:'rgba(11,18,32,0.6)', border:'1px solid rgba(201,168,76,0.12)', borderRadius:10 }}>
                  <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:8, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:C.am, marginBottom:6 }}>Strada's Recommendation</div>
                  <div style={{ fontSize:12, color:'var(--white)', lineHeight:1.7 }}>{intel?.action}</div>
                </div>
                {/* Factor breakdown */}
                <div style={{ marginTop:16, paddingTop:12, borderTop:'1px solid rgba(201,168,76,0.12)' }}>
                  {pillarsWithKey.filter(Boolean).map(p => {
                    const meta = PILLARS[p.key]||{icon:'📊',title:p.title};
                    const col  = p.score>=4?C.g:p.score<=2?C.red:C.am;
                    return (
                      <div key={p.key} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid rgba(201,168,76,0.10)', alignItems:'center' }}>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>{meta.icon} {meta.title}</span>
                        <span style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:14, fontWeight:800, color:col, textShadow:glowFor(col) }}>{p.score ? <><CountUp to={parseFloat(p.score)||0} decimals={1} durationMs={1200}/><span style={{fontSize:9,color:'var(--muted)'}}>/5</span></> : '—'}</span>
                      </div>
                    );
                  })}
                </div>
              </>}
            </div>
          </div>
        </div>
        )}

        {/* ══════════════════════════════════════════════ */}
        {/* ── 04 WARNING SIGNS ── */}
        {/* ══════════════════════════════════════════════ */}
        <div data-client-section="s04" className={`print-section ${secClass('s04')}`} style={{ marginTop:56 }}>
          <SectionHead n="04" title="Warning Signs — Know When to Act"
            desc="Bookmark this page. If any of these occur, check the relevant column for what to do. Nothing on this list is currently triggered unless it glows red or amber."/>
          <div className="reveal print-keep-together" style={{ background:'var(--card-bg)', border:'1px solid var(--lp-border)', borderRadius:14, overflow:'hidden', backdropFilter:'blur(12px)' }}>
            <div className="mob-alert-grid" style={{ display:'grid', gridTemplateColumns:'1fr 120px 1fr', background:'rgba(11,18,32,0.6)', padding:'10px 18px', borderBottom:'1px solid rgba(201,168,76,0.12)' }}>
              {['What to Watch For','Urgency Level','What to Do'].map(h=><span key={h} style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:8, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', color:'var(--muted)' }}>{h}</span>)}
            </div>
            {ALERTS.map(([trigger,level,action,col],i)=>(
              <div key={i} className="mob-alert-grid" style={{ display:'grid', gridTemplateColumns:'1fr 120px 1fr', padding:'13px 18px', borderBottom:i<ALERTS.length-1?'1px solid rgba(201,168,76,0.08)':'none', alignItems:'center' }}>
                <span style={{ fontSize:12, color:'var(--white)', paddingRight:12, lineHeight:1.55 }}>{trigger}</span>
                <span style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:8, fontWeight:700, padding:'4px 8px', borderRadius:20, textAlign:'center', color:col, background:`${col}14`, border:`1px solid ${col}35`, lineHeight:1.5 }}>{level}</span>
                <span style={{ fontSize:12, color:'var(--muted)', paddingLeft:12, lineHeight:1.55 }}>{action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════ */}
        {/* ── 05 SUPPORTING DATA (collapsed by default) ── */}
        {/* ══════════════════════════════════════════════ */}
        <div data-client-section="s05" className={`print-section ${secClass('s05')}`} style={{ marginTop:56 }}>
          <div
            className="reveal no-print"
            onClick={() => setShowData(!showData)}
            style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'18px 22px', background:'var(--card-bg)', border:'1px solid var(--lp-border)', borderRadius:14, cursor:'pointer', userSelect:'none', backdropFilter:'blur(12px)' }}
          >
            <div>
              <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:16, fontWeight:800, color:'var(--white)' }}>
                05 · The Data Behind Our Analysis
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>
                The raw market numbers used to calculate the scores above — for those who want to go deeper
              </div>
            </div>
            <span style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:11, fontWeight:700, color:'var(--gold)', marginLeft:16 }}>{showData?'▲ Hide':'▼ Show'}</span>
          </div>
          <div className="print-only print-avoid-break" style={{ padding:'16px 20px', background:'var(--card-bg)', border:'1px solid var(--lp-border)', borderRadius:14, marginBottom:0 }}>
            <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:15, fontWeight:800, color:'var(--white)' }}>05 · The Data Behind Our Analysis</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>Supporting data (included in this PDF)</div>
          </div>

          {showData && (
            <div className="print-avoid-break" style={{ border:'1px solid var(--lp-border)', borderTop:'none', borderRadius:'0 0 14px 14px', padding:'24px 22px', background:'rgba(11,18,32,0.70)', backdropFilter:'blur(12px)' }}>

              {/* Dubai developers + banks */}
              <div className="reveal print-keep-together" style={{ marginBottom:24 }}>
                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:6 }}>Dubai Developer & Bank Stocks</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>When these rise, property prices tend to follow 2–3 months later</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <DataCard label="Emaar Properties (stock)" price={mkt?.emaar?.price?`AED ${mkt.emaar.price}`:null} chg={`${mkt?.emaar?.chg||''} ${mkt?.emaar?.pct||''}`} up={mkt?.emaar?.up} loading={loadIntel} explain="Dubai's biggest developer. A rising stock price leads property prices by 2–3 months."/>
                  <DataCard label="Dubai Stock Market" price={mkt?.dfmgi?.price} chg={`${mkt?.dfmgi?.chg||''} ${mkt?.dfmgi?.pct||''}`} up={mkt?.dfmgi?.up} loading={loadIntel} explain="Overall health of Dubai's public companies."/>
                  <DataCard label="DFM Real Estate Index (DFMREI.AE)" price={mkt?.dfmrei?.price?`AED ${mkt.dfmrei.price}`:null} chg={`${mkt?.dfmrei?.chg||''} ${mkt?.dfmrei?.pct||''}`} up={mkt?.dfmrei?.up} loading={loadIntel} explain="DFM sector index for listed real estate — tracks how the market prices property stocks on Dubai Financial Market."/>
                  <DataCard label="Emirates NBD Bank" price={mkt?.enbd?.price?`AED ${mkt.enbd.price}`:null} chg={`${mkt?.enbd?.chg||''} ${mkt?.enbd?.pct||''}`} up={mkt?.enbd?.up} loading={loadIntel} explain="Dubai's biggest bank. Rising = better mortgage lending conditions."/>
                  <DataCard label="Dubai Islamic Bank" price={mkt?.dib?.price?`AED ${mkt.dib.price}`:null} chg={`${mkt?.dib?.chg||''} ${mkt?.dib?.pct||''}`} up={mkt?.dib?.up} loading={loadIntel} explain="Main Islamic mortgage lender. Signals end-user demand."/>
                </div>
              </div>

              {/* Energy & global */}
              <div className="reveal print-keep-together" style={{ marginBottom:24 }}>
                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:6 }}>Global Conditions</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>World economy signals that drive foreign investor confidence and Gulf oil wealth</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <DataCard label="Oil Price (per barrel)" price={mkt?.brent?.price?`$${mkt.brent.price}`:null} chg={`${mkt?.brent?.chg||''} ${mkt?.brent?.pct||''}`} up={mkt?.brent?.up} loading={loadIntel} explain={
                    oilFlag==='supply_shock'
                      ? `Supply shock signal — oil & gold rising together with elevated fear (VIX ${mkt?.vix?.price||'—'}). Price rise is geopolitical, not demand-driven. GCC buyer activity may not follow.`
                      : oilFlag==='possible_disruption'
                      ? `Oil and gold moving up together — possible supply disruption. Monitor closely before treating as bullish for Gulf buyers.`
                      : brentRaw>=75
                      ? `Above $75 and demand-driven — Gulf states have strong budgets, wealthy Gulf buyers remain active`
                      : brentRaw>0&&brentRaw<65
                      ? `Below $65 — Gulf government budgets tighten, fewer Gulf investors buying`
                      : `Below $65 = trigger point for reduced Gulf buyer activity`
                  }/>
                  <DataCard label="Gold Price" price={mkt?.gold?.price?`$${mkt.gold.price}/oz`:null} chg={`${mkt?.gold?.chg||''} ${mkt?.gold?.pct||''}`} up={mkt?.gold?.up} loading={loadIntel} explain="Rising gold means investors are nervous globally — Dubai property often benefits as a safe-haven alternative."/>
                  <DataCard label="US Stock Market (S&P 500)" price={mkt?.sp500?.price} chg={`${mkt?.sp500?.chg||''} ${mkt?.sp500?.pct||''}`} up={mkt?.sp500?.up} loading={loadIntel} explain={intel?.sp500_30d?`30-day move: ${intel.sp500_30d.chgPct}. ${intel.sp500_30d.rawPct<=-10?'⚠ Down 10%+ — foreign buyers pausing.':'Healthy range.'}`:undefined}/>
                  <DataCard label="Global Anxiety Level" price={mkt?.vix?.price} chg={`${mkt?.vix?.chg||''} ${mkt?.vix?.pct||''}`} up={mkt?.vix?.up===true?false:mkt?.vix?.up===false?true:null} loading={loadIntel} explain={vixRaw<20?"Below 20 = calm. International buyers are confident.":vixRaw<35?"Moderate anxiety. Some caution among foreign buyers.":"Above 35 = high fear. International buyer activity will slow temporarily."}/>
                  <DataCard label="Global Borrowing Costs" price={mkt?.us10y?.price?`${mkt.us10y.price}%`:null} chg={`${mkt?.us10y?.chg||''} ${mkt?.us10y?.pct||''}`} up={mkt?.us10y?.up===true?false:mkt?.us10y?.up===false?true:null} loading={loadIntel} explain={r10Raw<4.5?"Low — cheap global borrowing encourages property investment.":r10Raw<5?"Moderate — some pressure on leveraged buyers.":"High — expensive borrowing worldwide, dampens foreign investment appetite."}/>
                </div>
              </div>

              {/* Buyer origin */}
              <div className="reveal print-keep-together" style={{ marginBottom:24 }}>
                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:6 }}>India & China — Top Buyer Nationalities at Dubai Land Department</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>Indian and Chinese nationals are consistently the #1 and #2 foreign buyer groups in Dubai</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <DataCard label="India Stock Market" price={mkt?.sensex?.price} chg={`${mkt?.sensex?.chg||''} ${mkt?.sensex?.pct||''}`} up={mkt?.sensex?.up} loading={loadIntel} explain={mkt?.sensex?.up===true?"Rising — Indian HNW investors feel wealthy, Dubai purchases increase in 4–6 weeks.":"Falling — Indian buyer confidence easing, watch DLD Indian buyer volumes."}/>
                  <DataCard label="Hong Kong / China Market" price={mkt?.hsi?.price} chg={`${mkt?.hsi?.chg||''} ${mkt?.hsi?.pct||''}`} up={mkt?.hsi?.up} loading={loadIntel} explain={mkt?.hsi?.up===true?"Rising — Chinese capital seeking offshore investments like Dubai increases.":"Falling — Chinese buyer activity may soften 60–90 days from now."}/>
                  <DataCard label="Indian Rupee → AED" price={mkt?.inraed?.price} chg={`${mkt?.inraed?.chg||''} ${mkt?.inraed?.pct||''}`} up={mkt?.inraed?.up} loading={loadIntel} explain={`30-day: ${intel?.inr30d?.chgPct||'N/A'}. ${(intel?.inr30d?.rawPct||0)>=0?'Rupee strengthening — Dubai gets cheaper for Indian buyers.':'Rupee weakening — Dubai gets more expensive for Indian buyers.'}`}/>
                  <DataCard label="Chinese Yuan → AED" price={mkt?.cnyaed?.price} chg={`${mkt?.cnyaed?.chg||''} ${mkt?.cnyaed?.pct||''}`} up={mkt?.cnyaed?.up} loading={loadIntel} explain={`30-day: ${intel?.cny30d?.chgPct||'N/A'}. ${(intel?.cny30d?.rawPct||0)>=0?'Yuan firming — Chinese buyers have more purchasing power.':'Yuan weakening — Chinese buyer purchasing power is squeezed.'}`}/>
                </div>
              </div>

              {/* UAE Mortgage rate & Business confidence */}
              <div className="reveal print-keep-together" style={{ marginBottom:24 }}>
                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:6 }}>UAE Mortgage Rate & Business Confidence</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>The interest rate Dubai banks charge on mortgages, and a measure of how confident businesses are</div>
                <div className="mob-stack-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {/* Mortgage rate */}
                  {(() => {
                    const e = intel?.eibor;
                    const rate = parseFloat(e?.rate_pct||0);
                    const col  = rate===0?C.tm:rate<5?C.g:rate<5.5?C.am:C.red;
                    return (
                      <div className="print-keep-together lp-card" style={{ padding:'16px 18px' }}>
                        <Tag color={C.gm}>UAE Mortgage Interest Rate (3-month)</Tag>
                        {loadIntel?<Skel h={28} mb={6}/>:<>
                          <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:28, fontWeight:800, color:col, lineHeight:1.1, marginBottom:6, textShadow:rate>0?glowFor(col):'none' }}>
                            {rate>0?<CountUp to={rate} decimals={2} suffix="%" durationMs={1400}/>:'—'}
                          </div>
                          {e?.prev_3m_pct&&<div style={{ fontSize:11, color:'var(--muted)', marginBottom:6 }}>3 months ago: {e.prev_3m_pct}%</div>}
                          <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.6 }}>
                            {rate<5?'Below 5% — mortgages are affordable. End-user buyers are active.':rate<5.5?'5–5.5% — moderate cost. Cash buyers now preferred over mortgage buyers.':rate>0?'Above 5.5% — high mortgage cost. Reduces number of buyers who can qualify.':'Searching for current rate...'}
                          </div>
                          {e?.period&&<div style={{ fontSize:9, color:'rgba(201,168,76,0.35)', marginTop:8 }}>{e.period} · {sanitizeRawGithubLinks(e.source||'UAE Central Bank')}</div>}
                        </>}
                      </div>
                    );
                  })()}
                  {/* Business confidence */}
                  {(() => {
                    const p   = intel?.uae_pmi;
                    const val = parseFloat(p?.headline||0);
                    const col = val===0?C.tm:val>=54?C.g:val>=50?C.am:C.red;
                    return (
                      <div className="print-keep-together lp-card" style={{ padding:'16px 18px' }}>
                        <Tag color={C.gm}>Dubai Business Confidence Index</Tag>
                        {loadIntel?<Skel h={28} mb={6}/>:<>
                          <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:28, fontWeight:800, color:col, lineHeight:1.1, marginBottom:6, textShadow:val>0?glowFor(col):'none' }}>
                            {val>0?<><CountUp to={val} decimals={1} durationMs={1400}/> <span style={{ fontSize:11, color:'var(--muted)' }}>{val>=50?'(growing)':'(shrinking)'}</span></>:'—'}
                          </div>
                          {p?.new_orders&&<div style={{ fontSize:11, color:'var(--muted)', marginBottom:5 }}>New business orders: {p.new_orders}</div>}
                          <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.6 }}>
                            {val>=56?'Very strong — corporate relocations and new residents flowing in. Leads property demand by ~6 months.':val>=54?'Healthy — business confidence solid. Property demand supported.':val>=50?'Moderate — growth slowing. Watch for deceleration.':val>0?'Contracting — business confidence falling. Property demand may soften in 2 quarters.':'Searching for latest data...'}
                          </div>
                          {p?.month_label&&<div style={{ fontSize:9, color:'rgba(201,168,76,0.35)', marginTop:8 }}>{p.month_label} · {sanitizeRawGithubLinks(p.source||'S&P Global')}</div>}
                        </>}
                      </div>
                    );
                  })()}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ── 06 MORNING CHECKLIST ── */}
        <div data-client-section="s06" className={`print-section ${secClass('s06')}`} style={{ marginTop:56 }}>
          <SectionHead n="06" title="Your 5-Minute Morning Checklist"
            desc="For those who want to go deeper — these are the best sources to check each morning. Bookmark this page."/>
          <div className="reveal" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:12 }}>
            {CHECKLIST.map(([cat,items])=>(
              <div key={cat} className="print-keep-together lp-card" style={{ padding:'18px 20px' }}>
                <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'2.5px', textTransform:'uppercase', color:'var(--gold)', marginBottom:12, paddingBottom:10, borderBottom:'1px solid rgba(201,168,76,0.14)' }}>{cat}</div>
                {items.map(([name,url])=>(
                  <div key={name} style={{ padding:'8px 0', borderBottom:'1px solid rgba(201,168,76,0.08)' }}>
                    <a href={url} target="_blank" style={{ fontSize:12, color:'var(--gold-light)' }}>{name}</a>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{url.replace('https://','')}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

      </div>

      <div
        data-client-section="footer"
        className={`dash-footer print-avoid-break ${secClass('footer')}`}
      >
        <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:13, fontStyle:'italic', color:'var(--muted)' }}>"The market rewards those who see clearly, earlier."</div>
        <div style={{ fontFamily:"var(--font-montserrat,'Montserrat',Georgia,serif)", fontSize:9, fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', color:'rgba(201,168,76,0.45)', textAlign:'right', lineHeight:2 }}>Strada Real Estate · Kyle Caruana · +971 58 579 2599 · Stradauae.com</div>
      </div>
    </div>
  );
}
