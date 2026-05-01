// Strada Intelligence — Trading Terminal · live data adapter.
// Maps the live /api/property-read + /api/intelligence-read snapshots onto the
// fixture's SI_DATA shape consumed by DashboardTerminal. Anything missing falls
// back to the fixture so the UI stays whole.

import { SI_DATA as FIXTURE } from './data.js';

// ── Helpers ───────────────────────────────────────────────────
const fmtAedB = (n) => {
  if (!Number.isFinite(n)) return null;
  if (n >= 1_000_000_000) return `AED ${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `AED ${(n / 1_000_000).toFixed(1)}M`;
  return `AED ${Math.round(n).toLocaleString('en-US')}`;
};

const fmtAedCount = (n) =>
  Number.isFinite(n) ? n.toLocaleString('en-US') : null;

const fmtAedPsf = (n) =>
  Number.isFinite(n) ? `AED ${Math.round(n).toLocaleString('en-US')}` : null;

const fmtPct = (n, sigfig = 1) => {
  if (!Number.isFinite(n)) return null;
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(sigfig)}%`;
};

const trendOf = (n) =>
  !Number.isFinite(n) ? 'flat' : n > 0.5 ? 'up' : n < -0.5 ? 'down' : 'flat';

const pickNum = (...vals) => {
  for (const v of vals) {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const fmtAsOf = (iso) => {
  if (!iso) return FIXTURE.verdict.asOf;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return FIXTURE.verdict.asOf;
    const opts = { day: '2-digit', month: 'short', year: 'numeric' };
    return `as of ${d.toLocaleDateString('en-GB', opts)}`;
  } catch {
    return FIXTURE.verdict.asOf;
  }
};

// ── Section adapters ──────────────────────────────────────────
function adaptKpis(prop) {
  if (!prop) return FIXTURE.s01.kpis;
  const w = prop.weekly || {};
  const p = prop.prices || {};
  const y = prop.yields || {};

  const soldVol      = pickNum(w.sale_volume, w.sales_volume);
  const soldDeltaPct = pickNum(w.wow_volume_pct, w.sale_volume_wow_pct);
  const valueAed     = pickNum(w.sale_value_aed, w.sales_value_aed);
  const valueDeltaPct = pickNum(w.wow_value_pct, w.sale_value_wow_pct);
  const psfAvg       = pickNum(p.apartment_psf_aed, p.average_psf_aed, p.psf_avg);
  const psfDeltaPct  = pickNum(p.psf_30d_delta_pct, p.apartment_psf_wow_pct);
  const yieldPct     = pickNum(y.apartment_gross_yield, y.gross_yield);
  const yieldDelta   = pickNum(y.apartment_yield_delta_pp, y.gross_yield_delta_pp);

  return [
    {
      label: 'Properties Sold',
      value: fmtAedCount(soldVol) ?? FIXTURE.s01.kpis[0].value,
      delta: fmtPct(soldDeltaPct) ?? FIXTURE.s01.kpis[0].delta,
      deltaLabel: 'vs last week',
      trend: trendOf(soldDeltaPct),
      period: 'Last 7 days',
    },
    {
      label: 'Total Sales Value',
      value: fmtAedB(valueAed) ?? FIXTURE.s01.kpis[1].value,
      delta: fmtPct(valueDeltaPct) ?? FIXTURE.s01.kpis[1].delta,
      deltaLabel: 'vs last week',
      trend: trendOf(valueDeltaPct),
      period: 'Last 7 days',
    },
    {
      label: 'Average PSF',
      value: fmtAedPsf(psfAvg) ?? FIXTURE.s01.kpis[2].value,
      delta: fmtPct(psfDeltaPct) ?? FIXTURE.s01.kpis[2].delta,
      deltaLabel: '30-day avg',
      trend: trendOf(psfDeltaPct),
      period: '30-day avg',
    },
    {
      label: 'Rental Yield',
      value: Number.isFinite(yieldPct) ? `${yieldPct.toFixed(1)}%` : FIXTURE.s01.kpis[3].value,
      delta: Number.isFinite(yieldDelta) ? `${yieldDelta > 0 ? '+' : yieldDelta < 0 ? '−' : ''}${Math.abs(yieldDelta).toFixed(2)}pp` : FIXTURE.s01.kpis[3].delta,
      deltaLabel: 'gross annual',
      trend: trendOf(yieldDelta),
      period: 'gross annual',
    },
  ];
}

function adaptPsfRows(prop) {
  if (!prop?.prices) return FIXTURE.s01.psfRows;
  const p = prop.prices;
  const apt = pickNum(p.apartment_psf_aed);
  const vil = pickNum(p.villa_psf_aed);
  const aptD = pickNum(p.apartment_psf_wow_pct, p.apartment_psf_30d_delta_pct);
  const vilD = pickNum(p.villa_psf_wow_pct, p.villa_psf_30d_delta_pct);
  const rows = [];
  if (Number.isFinite(apt)) rows.push({ label: 'Apartments', value: `${fmtAedPsf(apt)}/sqft`, delta: fmtPct(aptD) ?? '—' });
  if (Number.isFinite(vil)) rows.push({ label: 'Villas',     value: `${fmtAedPsf(vil)}/sqft`, delta: fmtPct(vilD) ?? '—' });
  return rows.length ? rows : FIXTURE.s01.psfRows;
}

function adaptMix(prop) {
  // Prefer property_type_activity if present; else market_split (off-plan/secondary).
  const a = prop?.property_type_activity;
  if (Array.isArray(a) && a.length) {
    return a.slice(0, 4).map((r) => ({
      label: r.label || r.type || 'Other',
      pct: Math.round(pickNum(r.pct, r.share_pct, r.percentage) ?? 0),
    }));
  }
  const ms = prop?.market_split;
  if (ms) {
    const off = pickNum(ms.off_plan_pct, ms.offPlanPct);
    const sec = pickNum(ms.secondary_pct, ms.secondaryPct);
    if (Number.isFinite(off) && Number.isFinite(sec)) {
      return [
        { label: 'Off-plan',  pct: Math.round(off) },
        { label: 'Secondary', pct: Math.round(sec) },
      ];
    }
  }
  return FIXTURE.s01.mix;
}

function adaptRecent(prop) {
  const arr = prop?.recent_sales_transactions;
  if (!Array.isArray(arr) || !arr.length) return FIXTURE.s01.recent;
  return arr.slice(0, 25).map((r) => ({
    date:  String(r.date || r.evidence_date || '—').slice(0, 6),
    area:  r.area || r.community || '—',
    bldg:  r.location || r.building || r.sub_community || '—',
    type:  r.unit_type || r.type || (r.beds ? `${r.beds} Bed Apt` : '—'),
    price: typeof r.price === 'string' ? r.price : fmtAedB(pickNum(r.price)) || '—',
    psf:   typeof r.psf === 'string' ? r.psf : (Number.isFinite(pickNum(r.psf)) ? Math.round(pickNum(r.psf)).toLocaleString('en-US') : '—'),
  }));
}

// Map live pillar keys → fixture pillar slot order/titles (skip extras to keep 7-up matrix).
const PILLAR_ORDER = [
  { liveKey: 'security',     id: 'region',    title: 'Is the Region Stable?',     q: 'Are conflicts or instability affecting investor confidence?' },
  { liveKey: 'oil',          id: 'oil',       title: 'Gulf Oil Wealth',           q: 'Do Gulf states have money to invest in Dubai property?' },
  { liveKey: 'equities',     id: 'companies', title: 'Dubai Company Health',      q: "Are Dubai's biggest property companies doing well?" },
  { liveKey: 'macro',        id: 'mortgage',  title: 'Are Mortgages Affordable?', q: 'Are global interest rates working for or against buyers?' },
  { liveKey: 'buyer_demand', id: 'foreign',   title: 'Foreign Buyer Appetite',    q: 'Are buyers from India, China and abroad still active?' },
  { liveKey: 'aviation',     id: 'tourism',   title: 'Tourism & People Moving',   q: 'Is Dubai still growing as a place to live and invest?' },
  { liveKey: 'property',     id: 'mood',      title: 'Property Market Mood',      q: 'How are buyers and sellers feeling about the market?' },
];

function adaptPillars(intel) {
  const live = intel?.pillars;
  if (!live || typeof live !== 'object') return FIXTURE.s02.pillars;
  return PILLAR_ORDER.map((slot, i) => {
    const lp = live[slot.liveKey];
    const fb = FIXTURE.s02.pillars[i];
    if (!lp) return fb;
    return {
      id: slot.id,
      title: slot.title,
      q: slot.q,
      score: pickNum(lp.score) ?? fb.score,
      summary: lp.headline || lp.summary || fb.summary,
    };
  });
}

function adaptVerdict(intel) {
  if (!intel) return FIXTURE.verdict;
  const score = pickNum(intel.composite);
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(5, score)) : FIXTURE.verdict.score,
    label: intel.label || FIXTURE.verdict.label,
    sub:   intel.action || FIXTURE.verdict.sub,
    asOf:  fmtAsOf(intel.snapshot_refreshed_at || intel.ts),
  };
}

function adaptAreas(prop) {
  const a = prop?.top_areas;
  if (!Array.isArray(a) || !a.length) return FIXTURE.s03.areas;
  return a.slice(0, 7).map((r, i) => ({
    rank:  r.rank ?? i + 1,
    area:  r.area || r.community || '—',
    vol:   pickNum(r.volume, r.vol, r.units) ?? 0,
    psf:   typeof r.psf === 'string' ? r.psf : (Number.isFinite(pickNum(r.psf)) ? Math.round(pickNum(r.psf)).toLocaleString('en-US') : '—'),
    trend: r.trend || trendOf(pickNum(r.psf_wow_pct, r.delta_pct)),
  }));
}

function adaptYields(prop) {
  const y = prop?.yields;
  if (!y) return FIXTURE.s03.yields;
  const rows = [];
  const apt = pickNum(y.apartment_gross_yield, y.gross_yield);
  const vil = pickNum(y.villa_gross_yield);
  const tow = pickNum(y.townhouse_gross_yield);
  if (Number.isFinite(apt)) rows.push({ label: 'Apartment', gross: apt });
  if (Number.isFinite(vil)) rows.push({ label: 'Villa',     gross: vil });
  if (Number.isFinite(tow)) rows.push({ label: 'Townhouse', gross: tow });
  return rows.length ? rows : FIXTURE.s03.yields;
}

function adaptCharts(prop) {
  const c = prop?.charts_30d;
  if (!c) return FIXTURE.s03.charts;
  const psfSeries = Array.isArray(c.psf_ma7) ? c.psf_ma7 : Array.isArray(c.psf) ? c.psf : null;
  const volSeries = Array.isArray(c.sale_volume_ma7) ? c.sale_volume_ma7 : Array.isArray(c.sale_volume) ? c.sale_volume : null;
  const valFor = (p) => pickNum(p.value, p.median, p.psf, p.count);
  const labelFor = (p) => p.label || p.date || '';

  const psfNums = psfSeries?.map(valFor).filter(Number.isFinite) ?? FIXTURE.s03.charts.psf;
  const volNums = volSeries?.map(valFor).filter(Number.isFinite) ?? FIXTURE.s03.charts.vol;
  const labels  = (psfSeries || volSeries || []).map(labelFor);
  return {
    psf: psfNums,
    vol: volNums,
    yld: FIXTURE.s03.charts.yld, // no time series for yield in live snapshot
    labels: labels.length ? [labels[0], labels[labels.length - 1]] : FIXTURE.s03.charts.labels,
  };
}

// ── Supporting data (markets) ─────────────────────────────────
const MARKETS_LABELS = {
  brent:  'Brent crude (USD/bbl)',
  eibor:  'EIBOR 3M',
  us10y:  'US 10Y Treasury',
  inraed: 'INR/AED',
  cnyaed: 'CNY/AED',
  sp500:  'S&P 500',
  vix:    'VIX',
  hsi:    'Hang Seng',
  sensex: 'Sensex',
  emaar:  'Emaar Properties',
  dfmgi:  'DFM General Index',
  dfmrei: 'DFM Real Estate',
  enbd:   'Emirates NBD',
  dib:    'Dubai Islamic Bank',
  gold:   'Gold (USD/oz)',
};

function fmtMarketValue(key, m) {
  const v = pickNum(m.price, m.value, m.last);
  if (!Number.isFinite(v)) return null;
  if (key === 'brent' || key === 'gold') return `$${v.toFixed(2)}`;
  if (key === 'eibor' || key === 'us10y' || key === 'vix') return `${v.toFixed(2)}%`;
  if (key === 'inraed' || key === 'cnyaed') return v.toFixed(4);
  if (key === 'emaar' || key === 'enbd' || key === 'dib') return `AED ${v.toFixed(2)}`;
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtMarketDelta(key, m) {
  const pct = pickNum(m.change_pct, m.changePct, m.delta_pct);
  const pp  = pickNum(m.change_pp, m.delta_pp);
  if (Number.isFinite(pp)) {
    return `${pp > 0 ? '+' : pp < 0 ? '−' : ''}${Math.abs(pp).toFixed(2)}pp`;
  }
  if (!Number.isFinite(pct)) return 'flat';
  if (Math.abs(pct) < 0.05) return 'flat';
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`;
}

function adaptSupporting(intel) {
  const m = intel?.markets;
  if (!m || typeof m !== 'object') return FIXTURE.s05.rows;
  const order = ['brent', 'eibor', 'us10y', 'inraed', 'sp500', 'vix', 'emaar', 'dfmrei'];
  const rows = [];
  for (const key of order) {
    const item = m[key];
    if (!item) continue;
    const value = fmtMarketValue(key, item);
    if (!value) continue;
    rows.push({
      label: MARKETS_LABELS[key] || key.toUpperCase(),
      value,
      delta: fmtMarketDelta(key, item),
    });
  }
  return rows.length ? rows : FIXTURE.s05.rows;
}

// ── Public entrypoint ─────────────────────────────────────────
export function adaptLive({ property, intelligence }) {
  const prop  = property?.ok === false ? null : property;
  const intel = intelligence?.ok === false ? null : intelligence;

  return {
    ...FIXTURE,
    verdict: adaptVerdict(intel),
    s01: {
      ...FIXTURE.s01,
      kpis:    adaptKpis(prop),
      psfRows: adaptPsfRows(prop),
      mix:     adaptMix(prop),
      recent:  adaptRecent(prop),
    },
    s02: { ...FIXTURE.s02, pillars: adaptPillars(intel) },
    s03: {
      ...FIXTURE.s03,
      areas:  adaptAreas(prop),
      yields: adaptYields(prop),
      charts: adaptCharts(prop),
    },
    // s04 (tripwires) and s06 (bookmarks) are static guidance — keep fixture content.
    s05: { ...FIXTURE.s05, rows: adaptSupporting(intel) },
  };
}
