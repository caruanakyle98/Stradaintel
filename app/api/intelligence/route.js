// app/api/intelligence/route.js
//
// ARCHITECTURE:
//   Layer 1 — Yahoo Finance v8 API (free, no key):
//     • 9 existing instruments (DFM, energy, global macro)
//     • 4 new buyer-origin instruments: INR/AED, CNY/AED, Hang Seng, Sensex
//     • S&P 500 + INR/AED + CNY/AED 30-day trend (1mo range fetch)
//   Layer 2 — Haiku parallel calls:
//     • Call A: news narrative (security, property, aviation)
//     • Call B: EIBOR 3-month + UAE PMI (borrowing cost & economic health)

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const YF_BASE       = 'https://query2.finance.yahoo.com/v8/finance/chart';

// ── All Yahoo Finance symbols ─────────────────────────────
const SYMBOLS = {
  // UAE & Gulf equities
  emaar: { symbol: 'EMAAR.AE', dec: 2 },
  dfmgi: { symbol: 'DFMGI.AE', dec: 2 },
  enbd:  { symbol: 'ENBD.AE',  dec: 2 },
  dib:   { symbol: 'DIB.AE',   dec: 2 },
  // Energy & safe haven
  brent: { symbol: 'BZ=F',     dec: 2 },
  gold:  { symbol: 'GC=F',     dec: 0 },
  // Global macro
  sp500: { symbol: '^GSPC',    dec: 0 },
  vix:   { symbol: '^VIX',     dec: 2 },
  us10y: { symbol: '^TNX',     dec: 3 },
  // Buyer-origin markets (NEW)
  inraed: { symbol: 'INRAED=X', dec: 4 }, // Indian Rupee → AED
  cnyaed: { symbol: 'CNYAED=X', dec: 4 }, // Chinese Yuan  → AED
  hsi:    { symbol: '^HSI',     dec: 0 }, // Hang Seng Index
  sensex: { symbol: '^BSESN',   dec: 0 }, // BSE Sensex
};

// ── Fetch one symbol (5-day window, day-on-day change) ────
async function fetchYF(key) {
  const { symbol, dec } = SYMBOLS[key];
  const url = `${YF_BASE}/${encodeURIComponent(symbol)}?range=5d&interval=1d&includePrePost=false`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Accept': 'application/json' },
    });
    if (!r.ok) return { key, error: `HTTP ${r.status}` };
    const d = await r.json();
    const result = d?.chart?.result?.[0];
    if (!result) return { key, error: 'No result' };

    const meta   = result.meta || {};
    const closes = (result.indicators?.quote?.[0]?.close || []).filter(c => c != null && !isNaN(c));
    if (!closes.length) return { key, error: 'No close data' };

    const close  = closes[closes.length - 1];
    const prev   = closes.length >= 2 ? closes[closes.length - 2] : (meta.previousClose || close);
    const chgAbs = close - prev;
    const chgPct = prev > 0 ? (chgAbs / prev) * 100 : 0;
    const up     = chgAbs >= 0;
    const fmt    = (n, d) => d === 0 ? Math.round(n).toLocaleString('en-US') : n.toFixed(d);

    return { key, raw: close, price: fmt(close, dec), chg: (up?'+':'')+fmt(chgAbs,dec), pct: (up?'+':'')+chgPct.toFixed(2)+'%', up, source: 'Yahoo Finance' };
  } catch (e) { return { key, error: e.message }; }
}

// ── 30-day trend fetch (1mo range) for any symbol ────────
async function fetch30d(symbolEncoded, dec = 0) {
  const url = `${YF_BASE}/${symbolEncoded}?range=1mo&interval=1d&includePrePost=false`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
    if (!r.ok) return null;
    const d = await r.json();
    const closes = (d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(c => c != null && !isNaN(c));
    if (closes.length < 2) return null;
    const current = closes[closes.length - 1];
    const old     = closes[0];
    const chgPct  = ((current - old) / old) * 100;
    const up      = chgPct >= 0;
    const fmt     = (n, d) => d === 0 ? Math.round(n).toLocaleString('en-US') : n.toFixed(d);
    return { current: fmt(current, dec), old: fmt(old, dec), chgPct: (up?'+':'')+chgPct.toFixed(2)+'%', rawPct: chgPct, up };
  } catch { return null; }
}

// ── Fetch all instruments + 30d trends in parallel ───────
async function fetchAllMarketData() {
  const [pricesRaw, sp30d, inr30d, cny30d] = await Promise.all([
    Promise.allSettled(Object.keys(SYMBOLS).map(k => fetchYF(k))),
    fetch30d('%5EGSPC', 0),
    fetch30d('INRAED%3DX', 4),
    fetch30d('CNYAED%3DX', 4),
  ]);

  const markets = {};
  for (const r of pricesRaw) {
    if (r.status === 'fulfilled') {
      const { key, error, ...data } = r.value;
      markets[key] = error ? { price: 'N/A', chg: '—', pct: '—', up: null, error } : data;
    }
  }
  return { markets, sp30d, inr30d, cny30d };
}

// ── Strip XML/cite tags recursively ──────────────────────
function stripTags(v) {
  if (typeof v === 'string') return v.replace(/<[^>]+>/g, '').trim();
  if (Array.isArray(v))      return v.map(stripTags);
  if (v && typeof v === 'object') { const o={}; for (const k of Object.keys(v)) o[k]=stripTags(v[k]); return o; }
  return v;
}

// ── Haiku call helper ─────────────────────────────────────
async function haikuSearch(system, prompt, anthropicKey, maxTokens = 1200) {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'anthropic-version':'2023-06-01', 'x-api-key': anthropicKey },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const raw  = await res.json();
  const text = (raw.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return stripTags(JSON.parse(match[0]));
}

// ── Haiku Call A: News pillars ────────────────────────────
async function fetchNewsNarrative(today, mkt, sp30d, anthropicKey) {
  const ctx = `Brent $${mkt.brent?.price||'N/A'}/bbl | VIX ${mkt.vix?.price||'N/A'} | S&P ${mkt.sp500?.price||'N/A'} (30d:${sp30d?.chgPct||'N/A'})`;
  const prompt = `Today is ${today}. Context: ${ctx}

Search for current news on these 3 topics. Return ONLY this JSON (no markdown, no backticks, no XML):
{
  "security": { "score":3, "sig":"neutral", "headline":"One sentence on current Middle East security status", "bullets":["Event with date","Event","Event"], "risk":"Most specific UAE threat", "action":"Investor positioning" },
  "property":  { "score":4, "sig":"positive","headline":"One sentence on Dubai property this week", "bullets":["Transaction data","Developer/pricing news","Rental signal"], "risk":"Primary property risk", "action":"Buyer or seller action" },
  "aviation":  { "score":4, "sig":"positive","headline":"One sentence on Emirates or DXB airport", "bullets":["Passenger/flight data","Hotel/tourism metric","Route news"], "risk":"Aviation risk", "action":"Short-let implication" }
}`;
  return haikuSearch('Dubai real estate analyst. Search news on Middle East security, Dubai property, Emirates/DXB. Return ONLY valid JSON, no markdown, no cite tags.', prompt, anthropicKey, 1200);
}

// ── Haiku Call B: EIBOR 3M + UAE PMI ─────────────────────
async function fetchRatesAndPMI(today, anthropicKey) {
  const prompt = `Today is ${today}.

Search for these two specific data points published by official sources:

SEARCH 1 — EIBOR 3-MONTH RATE
Search: "EIBOR rate today 2026" OR "Emirates interbank offered rate March 2026"
Source: centralbank.ae or UAE banking news
Find: The current 3-month EIBOR rate as a percentage. This is the benchmark for all UAE mortgage pricing.
It typically reads between 4.5% and 6.0%. Return the exact percentage.
Also find: what it was 3 months ago if possible (for trend).

SEARCH 2 — UAE NON-OIL PMI
Search: "UAE PMI March 2026" OR "S&P Global UAE purchasing managers index 2026"
Source: S&P Global, IHS Markit, or financial news
Find: The most recent UAE non-oil private sector PMI headline number and the month it covers.
Above 50 = expansion, below 50 = contraction. Typically reads 53–57 in healthy conditions.
Also: new orders sub-index if available.

Return ONLY this JSON (no markdown, no backticks, no XML tags):
{
  "eibor": {
    "rate_pct": "5.15",
    "prev_3m_pct": "5.30",
    "trend": "falling",
    "period": "Mar 2026",
    "source": "centralbank.ae",
    "interpretation": "One sentence on what this means for UAE mortgage affordability"
  },
  "uae_pmi": {
    "headline": "55.3",
    "new_orders": "56.1",
    "month_label": "February 2026",
    "vs_prev": "+0.4",
    "signal": "expansion",
    "source": "S&P Global",
    "interpretation": "One sentence on what this means for Dubai property demand"
  }
}`;
  return haikuSearch(
    'Financial data researcher. Search for UAE EIBOR 3-month interest rate and UAE non-oil PMI. Return ONLY valid JSON with real numbers found. No markdown, no backticks, no cite tags.',
    prompt, anthropicKey, 900
  );
}

// ── Run all Haiku calls in parallel ──────────────────────
async function fetchAllNarrative(today, mkt, sp30d, anthropicKey) {
  const [newsRes, ratesRes] = await Promise.allSettled([
    fetchNewsNarrative(today, mkt, sp30d, anthropicKey),
    fetchRatesAndPMI(today, anthropicKey),
  ]);
  const news  = newsRes.status  === 'fulfilled' ? newsRes.value  : {};
  const rates = ratesRes.status === 'fulfilled' ? ratesRes.value : {};
  return {
    security: news.security || { score:3, sig:'neutral', headline:'Unavailable', bullets:[], risk:'N/A', action:'N/A' },
    property: news.property || { score:3, sig:'neutral', headline:'Unavailable', bullets:[], risk:'N/A', action:'N/A' },
    aviation: news.aviation || { score:3, sig:'neutral', headline:'Unavailable', bullets:[], risk:'N/A', action:'N/A' },
    eibor:    rates.eibor    || null,
    uae_pmi:  rates.uae_pmi  || null,
  };
}

// ── Main handler ──────────────────────────────────────────
export async function GET() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const now   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  const today = now.toLocaleDateString('en-AE', { timeZone:'Asia/Dubai', day:'2-digit', month:'short', year:'numeric' });
  const ts    = now.toLocaleString('en-AE', { timeZone:'Asia/Dubai', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });

  // Run market data fetch and narrative fetch in parallel
  const [mktRes, narrRes] = await Promise.allSettled([
    fetchAllMarketData(),
    // narrative needs prices so we start it slightly after — but still run together
    (async () => null)(), // placeholder, replaced below
  ]);

  // Fetch market data first (fast), then narrative (needs price context)
  let mktData = { markets:{}, sp30d:null, inr30d:null, cny30d:null };
  try { mktData = await fetchAllMarketData(); } catch {}

  let narrative = { security:{score:3,sig:'neutral',headline:'Unavailable',bullets:[],risk:'N/A',action:'N/A'}, property:{score:3,sig:'neutral',headline:'Unavailable',bullets:[],risk:'N/A',action:'N/A'}, aviation:{score:3,sig:'neutral',headline:'Unavailable',bullets:[],risk:'N/A',action:'N/A'}, eibor:null, uae_pmi:null };
  try { narrative = await fetchAllNarrative(today, mktData.markets, mktData.sp30d, anthropicKey); } catch {}

  const { markets, sp30d, inr30d, cny30d } = mktData;

  // ── Alert flags ───────────────────────────────────────
  if (sp30d) sp30d.alert_level = sp30d.rawPct <= -10 ? 'WATCH L1' : null;
  const brent = markets.brent?.raw || 0;
  const vix   = markets.vix?.raw   || 0;
  const r10   = markets.us10y?.raw || 0;

  // ── EIBOR scoring: lower = more supportive ────────────
  const eiborRate = parseFloat(narrative.eibor?.rate_pct || '0');
  const eiborScore = eiborRate === 0 ? 3 : eiborRate < 4.5 ? 5 : eiborRate < 5.0 ? 4 : eiborRate < 5.5 ? 3 : eiborRate < 6.0 ? 2 : 1;

  // ── PMI scoring: >55 = strong, 50-55 = ok, <50 = contraction
  const pmiVal   = parseFloat(narrative.uae_pmi?.headline || '0');
  const pmiScore = pmiVal === 0 ? 3 : pmiVal >= 56 ? 5 : pmiVal >= 54 ? 4 : pmiVal >= 52 ? 3 : pmiVal >= 50 ? 2 : 1;

  // ── Buyer-origin score: Hang Seng + Sensex + FX trend ─
  const hsiPct    = parseFloat((markets.hsi?.pct||'0%').replace('%',''));
  const sensexPct = parseFloat((markets.sensex?.pct||'0%').replace('%',''));
  const inrTrend  = inr30d?.rawPct || 0; // positive = INR strengthening vs AED = bullish for Indian buyers
  const cnyTrend  = cny30d?.rawPct || 0;
  const avgEqMove = (hsiPct + sensexPct) / 2;
  const fxBoost   = (inrTrend + cnyTrend) / 2;
  const buyerRaw  = avgEqMove * 0.6 + fxBoost * 0.4;
  const buyerScore = buyerRaw > 1.5 ? 5 : buyerRaw > 0.5 ? 4 : buyerRaw > -0.5 ? 3 : buyerRaw > -1.5 ? 2 : 1;
  const buyerSig   = buyerScore >= 4 ? 'positive' : buyerScore <= 2 ? 'negative' : 'neutral';

  // ── Existing pillar scores ────────────────────────────
  const clamp    = n => Math.min(Math.max(parseInt(n)||3, 1), 5);
  const sigOf    = n => n>=4 ? 'positive' : n<=2 ? 'negative' : 'neutral';
  const secScore = clamp(narrative.security?.score);
  const prpScore = clamp(narrative.property?.score);
  const aviScore = clamp(narrative.aviation?.score);
  const oilScore = brent>=88?5 : brent>=78?4 : brent>=68?3 : brent>=58?2 : brent>0?1 : 3;
  const emaarPct = parseFloat((markets.emaar?.pct||'0%').replace('%',''));
  const dfmPct   = parseFloat((markets.dfmgi?.pct||'0%').replace('%',''));
  const eqScore  = ((emaarPct+dfmPct)/2)>1.5?5 : ((emaarPct+dfmPct)/2)>0.3?4 : ((emaarPct+dfmPct)/2)>-0.5?3 : ((emaarPct+dfmPct)/2)>-1.5?2 : 1;
  // Macro now incorporates EIBOR — rates + global fear
  const macroBase  = vix>=35?1 : vix>=25?2 : r10>=5.5?2 : r10>=4.5?3 : vix>0?4 : 3;
  const macroScore = Math.round((macroBase * 0.5 + eiborScore * 0.3 + pmiScore * 0.2));

  // ── Composite — updated weights to include buyer demand ─
  // Security 24% | Oil 16% | Equities 14% | Macro/Rates 14% | Buyer Demand 12% | Aviation 9% | Property 8% | Banking 3%
  const composite = Math.round((
    secScore   * 0.24 +
    oilScore   * 0.16 +
    eqScore    * 0.14 +
    macroScore * 0.14 +
    buyerScore * 0.12 +
    aviScore   * 0.09 +
    prpScore   * 0.08 +
    3          * 0.03
  ) * 10) / 10;

  const SCENARIOS = [
    [4.3,'UPSIDE ACTIVATING',  '#78c278',20, 5,75,'Buy window open. Aggressive acquisition across prime micro-markets.'],
    [3.8,'BULL CASE BUILDING', '#52a352',35,10,55,'Accumulate prime completed stock. Selective off-plan in scarcity locations only.'],
    [3.3,'BASE CASE HOLDING',  '#52a352',55,25,20,'Hold and selectively accumulate. Prime completed stock. Avoid commodity off-plan.'],
    [2.8,'CAUTION — SLOW DOWN','#d49535',45,38,17,'Slow pace of new commitments. Prioritise cashflow assets. Build liquidity buffer.'],
    [2.2,'CAUTION — PAUSE',    '#d49535',35,50,15,'Pause all new commitments. Rotate to income-generating completed units only.'],
    [1.6,'DOWNSIDE SCENARIO',  '#c94f4f',20,65,15,'Reduce leverage immediately. Capital preservation priority. Wait for inflection.'],
    [0.0,'CRISIS — DEFENSIVE', '#c94f4f', 8,82,10,'Maximum defensive posture. Cash only. No new positions under any circumstances.'],
  ];
  const [,label,col,base,down,up,action] = SCENARIOS.find(([t])=>composite>=t)||SCENARIOS[SCENARIOS.length-1];

  const pricesOk    = Object.values(markets).filter(m=>m.price&&m.price!=='N/A').length;
  const totalSyms   = Object.keys(SYMBOLS).length;
  const priceSource = pricesOk >= totalSyms-2 ? `Yahoo Finance (${pricesOk}/${totalSyms} live)` : `Yahoo Finance (partial ${pricesOk}/${totalSyms})`;

  return Response.json({
    ok: true, ts, priceSource,
    markets, sp30d, inr30d, cny30d,
    eibor:   narrative.eibor,
    uae_pmi: narrative.uae_pmi,
    alert_indicators: {
      sp500_30d: sp30d,
      brent_65:  { value: markets.brent?.price, alert_level: brent>0&&brent<65?'WATCH L1':null },
      vix_35:    { value: markets.vix?.price,   alert_level: vix>=35?'AMBER L2':null },
    },
    pillars: {
      security: { ...narrative.security, score:secScore, weight:24, title:'Security & Geopolitical' },
      oil: {
        score:oilScore, sig:sigOf(oilScore), weight:16, title:'Oil & GCC Wealth Flow',
        headline: brent>0 ? `Brent $${markets.brent?.price}/bbl — ${oilScore>=4?'GCC budgets balanced, capital flowing':'pressure on Gulf sovereign wealth'}` : 'Oil data unavailable',
        bullets: [`Brent crude: $${markets.brent?.price||'N/A'} (${markets.brent?.pct||'—'})`, `Gold: $${markets.gold?.price||'N/A'} (${markets.gold?.pct||'—'})`, oilScore>=4?'GCC sovereign budgets in surplus — Dubai property allocations intact':'Monitor GCC buyer activity at DLD'],
        risk:'Sustained sub-$65 Brent compresses GCC sovereign wealth flows into Dubai',
        action: brent>0&&brent<70?'Low oil — monitor Gulf buyer volumes at DLD closely.':'Oil supportive. GCC capital flows to Dubai remain intact.',
      },
      equities: {
        score:eqScore, sig:sigOf(eqScore), weight:14, title:'UAE & Gulf Equities',
        headline: `Emaar AED ${markets.emaar?.price||'—'} (${markets.emaar?.pct||'—'}) · DFM ${markets.dfmgi?.price||'—'} (${markets.dfmgi?.pct||'—'})`,
        bullets: [`Emaar: AED ${markets.emaar?.price||'N/A'} ${markets.emaar?.chg||''}`, `DFMGI: ${markets.dfmgi?.price||'N/A'} ${markets.dfmgi?.chg||''}`, `ENBD: AED ${markets.enbd?.price||'N/A'} · DIB: AED ${markets.dib?.price||'N/A'}`],
        risk:'Emaar stock leads property prices by 60–90 days. Sustained weakness = sell signal.',
        action: eqScore>=4?'Developer stocks bullish — demand confirmed.':eqScore<=2?'Developer stocks weak — reduce off-plan exposure.':'Flat markets — hold, watch for directional break.',
      },
      macro: {
        score:macroScore, sig:sigOf(macroScore), weight:14, title:'Global Macro · Rates · EIBOR',
        headline: `VIX ${markets.vix?.price||'—'} · US10Y ${markets.us10y?.price||'—'}% · EIBOR 3M ${narrative.eibor?.rate_pct||'—'}% · PMI ${narrative.uae_pmi?.headline||'—'}`,
        bullets: [
          `VIX: ${markets.vix?.price||'N/A'} — ${vix<20?'calm markets, risk appetite healthy':vix<30?'moderate volatility':'elevated fear, buyer caution likely'}`,
          `EIBOR 3M: ${narrative.eibor?.rate_pct||'N/A'}% — ${eiborRate>0?(eiborRate<5?'below 5%, mortgages accessible':eiborRate<5.5?'moderate mortgage cost':'high — affordability headwind for end-users'):'searching...'}`,
          `UAE PMI: ${narrative.uae_pmi?.headline||'N/A'} (${narrative.uae_pmi?.month_label||'latest'}) — ${pmiVal>=54?'strong expansion, demand robust':pmiVal>=50?'moderate expansion':'contraction — caution'}`,
        ],
        risk:'EIBOR above 5.5% + VIX above 35 simultaneously = sharp pause in buyer activity',
        action: macroScore>=4?'Rates and macro supportive — financing conditions favour buyers.':macroScore<=2?'High rates/fear — cash buyers only, mortgage demand contracting.':'Macro mixed — monitor EIBOR trend weekly.',
      },
      buyer_demand: {
        score:buyerScore, sig:buyerSig, weight:12, title:'Buyer Origin Markets',
        headline: `Hang Seng ${markets.hsi?.price||'—'} (${markets.hsi?.pct||'—'}) · Sensex ${markets.sensex?.price||'—'} (${markets.sensex?.pct||'—'})`,
        bullets: [
          `India (largest buyer nationality): Sensex ${markets.sensex?.pct||'—'} today · INR/AED 30d: ${inr30d?.chgPct||'N/A'} — ${(inr30d?.rawPct||0)>=0?'rupee firm, Indian buyers have purchasing power':'rupee weak, Dubai more expensive for Indian buyers'}`,
          `China (top 3 nationality): Hang Seng ${markets.hsi?.pct||'—'} today · CNY/AED 30d: ${cny30d?.chgPct||'N/A'} — ${(cny30d?.rawPct||0)>=0?'yuan stable, Chinese HNW capital outflow supported':'yuan pressure, Chinese buyer affordability squeezed'}`,
          buyerScore>=4?'Both key buyer markets healthy — foreign demand pipeline solid':'Monitor DLD nationality data for early demand shift signal',
        ],
        risk:'Simultaneous INR+CNY weakness against AED reduces effective buying power of top 2 nationalities by ~5-10%',
        action: buyerScore>=4?'Buyer origin conditions bullish. Prime and luxury segment well-supported.':buyerScore<=2?'Key buyer markets under pressure. Expect softening in Indian and Chinese buyer segments.':'Mixed signals — GCC buyers likely carrying more weight currently.',
      },
      aviation: { ...narrative.aviation, score:aviScore, weight:9,  title:'Aviation & Tourism' },
      property:  { ...narrative.property, score:prpScore, weight:8,  title:'Property Market Sentiment' },
    },
    composite, label, col, base, down, up, action,
  });
}
