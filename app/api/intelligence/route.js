// app/api/intelligence/route.js
//
// ARCHITECTURE:
//   Layer 1 — Yahoo Finance v8 API (free, no key):
//     • 9 existing instruments (DFM, energy, global macro)
//     • 4 new buyer-origin instruments: INR/AED, CNY/AED, Hang Seng, Sensex
//     • S&P 500 + INR/AED + CNY/AED 30-day trend (1mo range fetch)
//   Layer 2 — Web + Haiku (text-only Claude; web via Tavily when ANTHROPIC web_search bills out)
//     • Call A: Tavily news → Haiku JSON (security, property, aviation)
//     • Call B: Tavily EIBOR/PMI → Haiku JSON (optional)

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Parse ANTHROPIC_API_KEY from .env text (export OK, quotes OK, CRLF OK). */
function parseAnthropicKeyFromEnvText(text) {
  if (!text || typeof text !== 'string') return null;
  const body = text.replace(/^\uFEFF/, '');
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const name = t.slice(0, eq).trim().replace(/^export\s+/i, '');
    if (name !== 'ANTHROPIC_API_KEY') continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    const hash = v.search(/\s+#/);
    if (hash >= 0) v = v.slice(0, hash).trim();
    v = v.trim();
    if (v.length > 10) return v;
  }
  return null;
}

/**
 * Turbopack/workers sometimes omit ANTHROPIC_API_KEY from process.env; read .env.local from disk (local dev only).
 * @returns {{ key: string | null, envHelp?: { path: string, empty: boolean } }}
 */
function resolveAnthropicKey() {
  let k = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (k.length > 10) return { key: k };
  const tryDirs = new Set();
  let d = process.cwd();
  for (let i = 0; i < 10; i++) {
    tryDirs.add(d);
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    tryDirs.add(here);
    tryDirs.add(join(here, '..', '..', '..'));
  } catch { /* CJS bundle */ }
  let envHelp = null;
  for (const dir of tryDirs) {
    for (const name of ['.env.local', '.env']) {
      const p = join(dir, name);
      if (!existsSync(p)) continue;
      try {
        const text = readFileSync(p, 'utf8');
        const empty = text.trim().length === 0;
        k = parseAnthropicKeyFromEnvText(text);
        if (k && k.length > 10) return { key: k };
        envHelp = { path: p, empty };
      } catch { /* next file */ }
    }
  }
  k = (process.env.ANTHROPIC_API_KEY || '').trim();
  return { key: k.length > 10 ? k : null, envHelp };
}

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const YF_BASE       = 'https://query2.finance.yahoo.com/v8/finance/chart';

// ── All Yahoo Finance symbols ─────────────────────────────
const SYMBOLS = {
  // UAE & Gulf equities
  emaar: { symbol: 'EMAAR.AE', dec: 2 },
  dfmgi: { symbol: 'DFMGI.AE', dec: 2 },
  dfmrei: { symbol: 'DFMREI.AE', dec: 2 }, // DFM Real Estate Index
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

// ── Extract first balanced JSON object (avoids greedy \{...\} breaking on extra braces) ──
function parseJsonFromModelText(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  const starts = [];
  for (let i = 0; i < cleaned.length; i++) if (cleaned[i] === '{') starts.push(i);
  for (const start of starts) {
    let depth = 0;
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const slice = cleaned.slice(start, i + 1);
          try {
            const o = JSON.parse(slice);
            if (o && typeof o === 'object') return o;
          } catch { /* next candidate */ }
        }
      }
    }
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* fall through */ }
  }
  return null;
}

// ── Haiku call helper ─────────────────────────────────────
/** web_search often bills separately; text-only works when balance blocks tools (see debug log 400 credit). */
async function haikuSearch(system, prompt, anthropicKey, maxTokens = 1200, useWebSearch = true) {
  if (!anthropicKey || String(anthropicKey).length < 10) throw new Error('Anthropic key missing');
  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  };
  if (useWebSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'anthropic-version':'2023-06-01', 'x-api-key': anthropicKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status} ${errBody.slice(0, 120)}`);
  }
  const raw  = await res.json();
  const text = (raw.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const parsed = parseJsonFromModelText(text);
  if (!parsed) throw new Error('No JSON in response');
  return stripTags(parsed);
}

// ── Score calibration: narrative must match number (investment-grade consistency) ──
function pillarText(p) {
  if (!p || typeof p !== 'object') return '';
  return [p.headline, ...(Array.isArray(p.bullets) ? p.bullets : []), p.risk, p.action]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Security: higher score = calmer for UAE property. Bullets about missiles/strikes → cannot be 5. */
function calibrateSecurityScore(raw, p) {
  const t = pillarText(p);
  const stress = [
    /\b(missile|drones?|drone\b|airstrike|air strike|retaliat|killed|evacuat)\b/i,
    /\b(war\b|combat|invasion|bombing)\b/i,
    /\b(uae|dubai|dxb|emirates|gulf)\b[^.]{0,80}\b(threat|attack|strike|missile|drone)\b/i,
    /\b(threat|attack|strike)[^.]{0,80}\b(uae|dubai|dxb|airport)\b/i,
    /\b(instabilit|escalat|conflict intensif)\b/i,
    /\b(flight cancellations?|airspace|staff ordered out)\b/i,
  ].reduce((n, rx) => n + (rx.test(t) ? 1 : 0), 0);
  let s = Math.min(Math.max(parseInt(raw, 10) || 3, 1), 5);
  if (stress >= 4) s = Math.min(s, 1);
  else if (stress >= 3) s = Math.min(s, 2);
  else if (stress >= 2) s = Math.min(s, 3);
  else if (stress >= 1) s = Math.min(s, 4);
  return s;
}

/** Property sentiment: very negative headlines cannot score 5 */
function calibratePropertyScore(raw, p) {
  const t = pillarText(p);
  const bad = [/crash|collapse|freeze|plummet|crisis|halt sales/i].filter(rx => rx.test(t)).length;
  let s = Math.min(Math.max(parseInt(raw, 10) || 3, 1), 5);
  if (bad >= 2) s = Math.min(s, 2);
  else if (bad >= 1) s = Math.min(s, 3);
  return s;
}

/** Aviation: widespread cancellations / closures cap score */
function calibrateAviationScore(raw, p) {
  const t = pillarText(p);
  const stress = [/cancel|suspension|closed|disrupt|grounded/i].filter(rx => rx.test(t)).length;
  let s = Math.min(Math.max(parseInt(raw, 10) || 3, 1), 5);
  if (stress >= 2) s = Math.min(s, 2);
  else if (stress >= 1) s = Math.min(s, 4);
  return s;
}

// ── Tavily web search (api_key required in JSON body per Tavily API) ──
async function tavilySearchBlock(queries, topic = 'news') {
  const key = (process.env.TAVILY_API_KEY || '').trim();
  if (!key || key.length < 8) return '';
  const snippets = [];
  for (const query of queries) {
    for (const t of [topic, 'general']) {
      try {
        const r = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: key,
            query,
            topic: t,
            max_results: 8,
            search_depth: 'basic',
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) continue;
        for (const x of d.results || []) {
          snippets.push({
            title: x.title || '—',
            content: (x.content || '').replace(/\s+/g, ' ').slice(0, 420),
            url: x.url || x.source || '',
            published_date: x.published_date || x.publishedDate || x.date || '',
            query,
            topic: t,
          });
        }
        if ((d.results || []).length) break;
      } catch { /* next query/topic */ }
    }
  }
  const ranked = rankTavilySnippets(snippets, queries[0] || '', topic);
  const lines = [];
  for (const s of ranked.slice(0, 14)) {
    const meta = [s.published_date ? `date: ${s.published_date}` : null, s.url ? `source: ${s.url}` : null, s._relevance ? `relevance: ${s._relevance}` : null]
      .filter(Boolean)
      .join(' | ');
    lines.push(`• ${s.title}\n  ${s.content}${meta ? `\n  ${meta}` : ''}`);
  }
  return lines.join('\n\n').slice(0, 14000);
}

/** Richer search for EIBOR/PMI facts (general + advanced; news topic often misses tables). */
async function tavilyRatesSearchBlock() {
  const key = (process.env.TAVILY_API_KEY || '').trim();
  if (!key || key.length < 8) return '';
  const queries = [
    'EIBOR 3 month rate UAE percent central bank',
    'Emirates interbank offered rate 3M latest',
    'UAE mortgage benchmark rate EIBOR March 2025 2026',
    'S&P Global UAE PMI purchasing managers index latest month',
    'UAE non-oil private sector PMI IHS Markit headline',
  ];
  const snippets = [];
  for (const query of queries) {
    try {
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: key,
          query,
          topic: 'general',
          max_results: 6,
          search_depth: 'advanced',
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) continue;
      for (const x of d.results || []) {
        snippets.push({
          title: x.title || '—',
          content: (x.content || '').replace(/\s+/g, ' ').slice(0, 500),
          url: x.url || x.source || '',
          published_date: x.published_date || x.publishedDate || x.date || '',
          query,
          topic: 'general',
        });
      }
    } catch { /* next */ }
  }
  const ranked = rankTavilySnippets(snippets, queries[0] || '', 'general');
  const lines = [];
  for (const s of ranked.slice(0, 18)) {
    const meta = [s.published_date ? `date: ${s.published_date}` : null, s.url ? `source: ${s.url}` : null, s._relevance ? `relevance: ${s._relevance}` : null]
      .filter(Boolean)
      .join(' | ');
    lines.push(`• ${s.title}\n  ${s.content}${meta ? `\n  ${meta}` : ''}`);
  }
  return lines.join('\n\n').slice(0, 16000);
}

function numericRatePct(v) {
  if (v == null) return NaN;
  const s = String(v).replace(/%/g, '').trim();
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 2 && n <= 15 ? n : NaN;
}

function numericPmi(v) {
  if (v == null) return NaN;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n >= 35 && n <= 70 ? n : NaN;
}

/** Reject model placeholders so we can re-prompt with estimates. */
function ratesNeedEstimate(o) {
  if (!o || typeof o !== 'object') return true;
  const r = numericRatePct(o.eibor?.rate_pct);
  const p = numericPmi(o.uae_pmi?.headline);
  const junk = (s) => /not found|unable to determine|n\/a|unknown|search results/i.test(String(s || ''));
  if (!Number.isFinite(r)) return true;
  if (!Number.isFinite(p)) return true;
  if (junk(o.eibor?.source) && junk(o.eibor?.interpretation)) return true;
  return false;
}

function sanitizeRatesDisplay(o) {
  if (!o || typeof o !== 'object') return o;
  const out = {
    ...o,
    eibor: { ...(o.eibor && typeof o.eibor === 'object' ? o.eibor : {}) },
    uae_pmi: { ...(o.uae_pmi && typeof o.uae_pmi === 'object' ? o.uae_pmi : {}) },
  };
  const j = (s) => /not found|unable to determine|^unknown$/i.test(String(s || '').trim());
  if (j(out.eibor?.prev_3m_pct)) delete out.eibor.prev_3m_pct;
  if (j(out.eibor?.source)) out.eibor.source = 'estimate (typical UAE range)';
  if (j(out.uae_pmi?.new_orders)) delete out.uae_pmi.new_orders;
  if (j(out.uae_pmi?.source)) out.uae_pmi.source = 'estimate (typical UAE range)';
  if (j(out.uae_pmi?.month_label)) out.uae_pmi.month_label = new Date().toLocaleDateString('en-AE', { month: 'long', year: 'numeric' });
  return out;
}

function parseSnippetDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const iso = new Date(text);
  if (!Number.isNaN(iso.getTime())) return iso;
  const mdY = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+.*)?$/);
  if (mdY) {
    const d = parseInt(mdY[1], 10);
    const m = parseInt(mdY[2], 10) - 1;
    let y = parseInt(mdY[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, m, d, 12, 0, 0));
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}

function scoreSnippetRelevance(snippet, query, topic) {
  const hay = `${snippet.title || ''} ${snippet.content || ''}`.toLowerCase();
  const q = String(query || '').toLowerCase();
  const t = String(topic || '').toLowerCase();
  let score = 0;
  const add = (rx, weight) => { if (rx.test(hay) || rx.test(q)) score += weight; };

  if (t === 'news') {
    add(/\bdxb\b|\bairport\b|\bemirates\b|\baviation\b|\bflight(s)?\b|\btourism\b/, 4);
    add(/\buae\b|\bdubai\b|\bgulf\b|\bmiddle east\b/, 3);
    add(/\battack\b|\bstrike\b|\bmissile\b|\bdrone\b|\bcancellation(s)?\b|\bclosure(s)?\b/, 4);
    add(/\bsecurity\b|\bwar\b|\bconflict\b|\bairspace\b/, 3);
    add(/\bproperty\b|\breal estate\b|\bdld\b|\bdeveloper\b|\bprices?\b/, 1);
  } else {
    add(/\beibor\b|\binterbank\b|\bmortgage\b/, 4);
    add(/\bpmi\b|\bpurchasing managers\b|\bsp global\b|\bihs markit\b/, 4);
    add(/\buae\b|\bdubai\b/, 2);
  }

  if (/dxb|emirates|airport|airspace|flight/.test(hay) && /attack|strike|missile|drone|closure|cancel/.test(hay)) score += 5;
  if (/dubai|uae/.test(hay) && /security|airspace|tourism|property|mortgage|pmi|eibor/.test(hay)) score += 2;
  return score;
}

function rankTavilySnippets(snippets, query, topic) {
  const now = Date.now();
  return [...snippets]
    .map((snippet, idx) => {
      const published = parseSnippetDate(snippet.published_date || snippet.publishedDate || snippet.date);
      const ageDays = published ? Math.max((now - published.getTime()) / 86400000, 0) : null;
      const recency = ageDays == null ? 0.5 : Math.max(0, 10 - ageDays);
      const relevance = scoreSnippetRelevance(snippet, query, topic);
      return { ...snippet, _idx: idx, _published: published, _ageDays: ageDays, _relevance: relevance, _recency: recency, _rank: relevance * 10 + recency };
    })
    .sort((a, b) => (b._rank - a._rank) || (a._ageDays ?? 9999) - (b._ageDays ?? 9999) || a._idx - b._idx);
}

// ── Haiku Call A: News pillars ────────────────────────────
async function fetchNewsNarrative(today, mkt, sp30d, anthropicKey) {
  const ctx = `Brent $${mkt.brent?.price||'N/A'}/bbl | VIX ${mkt.vix?.price||'N/A'} | S&P ${mkt.sp500?.price||'N/A'} (30d:${sp30d?.chgPct||'N/A'})`;
  const jsonSchema = `Return ONLY this JSON (no markdown, no backticks, no XML).

SCORING RULES (mandatory — score MUST match how safe UAE/Dubai feels for property investors):
- security.score 1–5: 5 = region calm, no material military or terrorism stress to UAE. 4 = elevated noise only. 3 = moderate regional tension, UAE operating normally. 2 = direct threats, evacuations, or military activity near UAE/Gulf. 1 = active conflict affecting Gulf airspace, UAE, or investor exodus narrative.
- property.score 1–5: 5 = strong demand/pricing narrative. 1 = severe negative (crash/freeze). Must match bullets.
- aviation.score 1–5: 5 = DXB/Emirates normal. 1–2 = major cancellations or closures. Must match bullets.
sig must be "positive" only if score>=4, "negative" if score<=2, else "neutral".

{
  "security": { "score":3, "sig":"neutral", "headline":"One sentence Middle East / UAE security", "bullets":["Dated fact","Dated fact","Dated fact"], "risk":"Main UAE-specific risk", "action":"What investors should do" },
  "property": { "score":3, "sig":"neutral", "headline":"One sentence Dubai property", "bullets":["Fact","Fact","Fact"], "risk":"Main property risk", "action":"Buyer/seller tilt" },
  "aviation": { "score":3, "sig":"neutral", "headline":"One sentence DXB/Emirates", "bullets":["Fact","Fact","Fact"], "risk":"Aviation risk", "action":"Tourism/short-let" }
}`;
  const promptBase = `Today is ${today}. Market context: ${ctx}\n\n${jsonSchema}`;
  const tavilyCtx = await tavilySearchBlock(
    [
      `Middle East UAE Gulf security Dubai investors ${today}`,
      `Dubai property real estate market demand prices`,
      `Dubai airport DXB Emirates flights tourism passengers`,
    ],
    'news',
  );
  if (tavilyCtx.length > 120) {
    return await haikuSearch(
      'Dubai real estate analyst. Ground security/property/aviation ONLY in the WEB SEARCH block below. Return ONLY valid JSON. No markdown, no cite tags.',
      `${promptBase}\n\n=== WEB SEARCH (use for bullets & scores) ===\n${tavilyCtx}`,
      anthropicKey,
      2000,
      false,
    );
  }
  const sysText = 'Dubai real estate analyst. Return ONLY valid JSON. Scores 1-5 must match bullets.';
  const promptText = `${promptBase}\n\nNo web snippets available — use Brent/VIX/S&P + typical UAE conditions; say "context" where not news-specific.`;
  const tavilyConfigured = !!(process.env.TAVILY_API_KEY || '').trim();
  const wantAnthropicWeb = process.env.ANTHROPIC_WEB_SEARCH === '1' && !tavilyConfigured;
  if (wantAnthropicWeb) {
    try {
      return await haikuSearch(
        'Dubai analyst. Use web_search then return ONLY JSON.',
        `${promptBase}\nSearch current news for UAE/Dubai.`,
        anthropicKey,
        1400,
        true,
      );
    } catch { /* fall through to text-only */ }
  }
  return await haikuSearch(sysText, promptText, anthropicKey, 1600, false);
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
  const sys = 'Financial data researcher. Return ONLY valid JSON. No markdown, no cite tags.';
  const tavilyRates = await tavilyRatesSearchBlock();
  const tavilyFallback = tavilyRates.length < 80
    ? await tavilySearchBlock(
        ['EIBOR 3 month UAE rate percent', 'UAE PMI S&P Global latest reading'],
        'general',
      )
    : '';
  const webBlock = (tavilyRates.length >= 80 ? tavilyRates : tavilyFallback).slice(0, 15000);
  const promptWeb = `${prompt}\n\nRules: rate_pct and headline MUST be numeric strings only (e.g. "5.12" and "54.2"). If the text above does not state an exact EIBOR 3M or PMI number, use promptNoWeb instead by returning JSON with source "estimate" and plausible UAE-range numbers — never write "not found" or "unable" in any field.`;
  const promptNoWeb = `${prompt}\n\nNo reliable web numbers in context. Return JSON with: eibor.rate_pct between 4.85 and 5.75 (pick one plausible UAE 3M EIBOR), eibor.prev_3m_pct similar ±0.15, eibor.source "typical range (model estimate)", eibor.period current month/year. uae_pmi.headline between 52 and 57, uae_pmi.source "typical range (model estimate)", signal expansion|neutral. Do not use the words "not found", "unable", or "unknown" in any value.`;

  let parsed = null;
  if (webBlock.length >= 80) {
    try {
      parsed = await haikuSearch(sys, `${promptWeb}\n\n=== WEB SNIPPETS ===\n${webBlock}`, anthropicKey, 1100, false);
    } catch { parsed = null; }
  }
  if (ratesNeedEstimate(parsed)) {
    try {
      parsed = await haikuSearch(sys, promptNoWeb, anthropicKey, 900, false);
    } catch { /* keep partial */ }
  }
  if (ratesNeedEstimate(parsed)) {
    parsed = {
      eibor: {
        rate_pct: '5.15',
        prev_3m_pct: '5.28',
        trend: 'stable',
        period: today,
        source: 'typical range (fallback)',
        interpretation: 'UAE 3M EIBOR usually tracks Fed; use centralbank.ae for exact fixings.',
      },
      uae_pmi: {
        headline: '54.5',
        new_orders: '53.8',
        month_label: today,
        vs_prev: 'N/A',
        signal: 'expansion',
        source: 'typical range (fallback)',
        interpretation: 'UAE non-oil PMI typically 52–57; check S&P Global for latest release.',
      },
    };
  }
  return sanitizeRatesDisplay(parsed);
}

/** When Claude/web_search fails (billing, timeout, parse), still show readable cards from Yahoo-only context. */
function fallbackNewsPillars(mkt, sp30d, errSlice) {
  const brent = mkt.brent?.price ?? 'N/A';
  const vix = mkt.vix?.price ?? 'N/A';
  const sp = mkt.sp500?.price ?? 'N/A';
  const sp30 = sp30d?.chgPct ?? 'N/A';
  const lowCredit = /credit balance|too low|billing/i.test(String(errSlice || ''));
  const hint = lowCredit
    ? ' Anthropic rejected the request (usually low account credits). Add balance at console.anthropic.com — then live news returns.'
    : ' Claude + web search did not return JSON (timeout, model error, or limits).';
  return {
    security: {
      score: 3, sig: 'neutral',
      headline: `Market-only read (no live news search).${hint}`,
      bullets: [
        `VIX ${vix} · S&P ${sp} (30d ${sp30}) — global risk tone; lower VIX usually aligns with calmer Gulf risk appetite.`,
        `Brent $${brent} — oil revenues still support GCC fiscal stability narrative.`,
        'Replace with dated headlines once API calls succeed.',
      ],
      risk: 'Geopolitical or airspace shocks are the main tail risks — not visible without live search.',
      action: 'Check Reuters / Al Arabiya for same-day security; fund Anthropic for automated search.',
    },
    property: {
      score: 3, sig: 'neutral',
      headline: `Property sentiment (fallback).${hint}`,
      bullets: [
        `Emaar ${mkt.emaar?.price ?? '—'} (${mkt.emaar?.pct ?? '—'}) · DFMGI ${mkt.dfmgi?.price ?? '—'} — listed developers lead off-plan sentiment.`,
        'DLD volumes and asking rents are in Section 01; AI property mood needs working Claude API.',
        'Score held neutral without search.',
      ],
      risk: 'Mortgage cost (EIBOR) and off-plan supply — watch Section 01 + macro card.',
      action: 'Use DLD + developer pricing until live narrative works.',
    },
    aviation: {
      score: 3, sig: 'neutral',
      headline: `Tourism / DXB (fallback).${hint}`,
      bullets: [
        'Dubai Airports traffic and Emirates capacity need live search or manual check.',
        'Neutral score — upgrade if you see widespread cancellations in news.',
        'Short-let demand tracks visitor volumes.',
      ],
      risk: 'Regional airspace or hub disruption would be the main aviation shock.',
      action: 'See dubaiairports.ae & Emirates newsroom when API is down.',
    },
  };
}

// ── Run all Haiku calls in parallel ──────────────────────
async function fetchAllNarrative(today, mkt, sp30d, anthropicKey) {
  const [newsRes, ratesRes] = await Promise.allSettled([
    fetchNewsNarrative(today, mkt, sp30d, anthropicKey),
    fetchRatesAndPMI(today, anthropicKey),
  ]);
  const newsErr = newsRes.status === 'rejected' ? String(newsRes.reason?.message || newsRes.reason) : '';
  const newsVal = newsRes.status === 'fulfilled' ? newsRes.value : null;
  const okNews = newsRes.status === 'fulfilled' && newsVal?.security?.headline && newsVal?.property?.headline && newsVal?.aviation?.headline;
  const news = okNews ? newsVal : fallbackNewsPillars(mkt, sp30d, newsErr);
  const rates = ratesRes.status === 'fulfilled' ? ratesRes.value : {};
  return {
    security: news.security || { score: 3, sig: 'neutral', headline: 'Unavailable', bullets: [], risk: 'N/A', action: 'N/A' },
    property: news.property || { score: 3, sig: 'neutral', headline: 'Unavailable', bullets: [], risk: 'N/A', action: 'N/A' },
    aviation: news.aviation || { score: 3, sig: 'neutral', headline: 'Unavailable', bullets: [], risk: 'N/A', action: 'N/A' },
    eibor: rates.eibor || null,
    uae_pmi: rates.uae_pmi || null,
    narrative_fallback: !okNews,
    narrative_billing: /credit balance|too low/i.test(newsErr) && !(process.env.TAVILY_API_KEY || '').trim(),
    tavily_configured: !!(process.env.TAVILY_API_KEY || '').trim(),
  };
}

// ── Payload builder (reused by snapshot refresh route) ────
export async function buildIntelligencePayload() {
  const { key: anthropicKey, envHelp } = resolveAnthropicKey();
  const now   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  const today = now.toLocaleDateString('en-AE', { timeZone:'Asia/Dubai', day:'2-digit', month:'short', year:'numeric' });
  const ts    = now.toLocaleString('en-AE', { timeZone:'Asia/Dubai', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });

  // Fetch market data first (fast), then narrative (needs price context)
  let mktData = { markets:{}, sp30d:null, inr30d:null, cny30d:null };
  try { mktData = await fetchAllMarketData(); } catch {}

  let narrative = { security:{score:3,sig:'neutral',headline:'Unavailable',bullets:[],risk:'N/A',action:'N/A'}, property:{score:3,sig:'neutral',headline:'Unavailable',bullets:[],risk:'N/A',action:'N/A'}, aviation:{score:3,sig:'neutral',headline:'Unavailable',bullets:[],risk:'N/A',action:'N/A'}, eibor:null, uae_pmi:null };
  try { narrative = await fetchAllNarrative(today, mktData.markets, mktData.sp30d, anthropicKey); } catch {}
  const narrativeBilling = narrative.narrative_billing === true;
  const narrativeFallback = narrative.narrative_fallback === true;
  const tavilyConfigured = narrative.tavily_configured === true;
  delete narrative.narrative_billing;
  delete narrative.narrative_fallback;
  delete narrative.tavily_configured;

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

  // ── Existing pillar scores (calibrated so score ↔ narrative ↔ sig align) ──
  const clamp = n => Math.min(Math.max(parseInt(n, 10) || 3, 1), 5);
  const sigOf = n => (n >= 4 ? 'positive' : n <= 2 ? 'negative' : 'neutral');
  const secScore = calibrateSecurityScore(narrative.security?.score, narrative.security);
  const prpScore = calibratePropertyScore(narrative.property?.score, narrative.property);
  const aviScore = calibrateAviationScore(narrative.aviation?.score, narrative.aviation);
  narrative.security = { ...narrative.security, score: secScore, sig: sigOf(secScore) };
  narrative.property = { ...narrative.property, score: prpScore, sig: sigOf(prpScore) };
  narrative.aviation = { ...narrative.aviation, score: aviScore, sig: sigOf(aviScore) };
  const oilScore = brent>=88?5 : brent>=78?4 : brent>=68?3 : brent>=58?2 : brent>0?1 : 3;
  const emaarPct = parseFloat((markets.emaar?.pct||'0%').replace('%','')) || 0;
  const dfmPct   = parseFloat((markets.dfmgi?.pct||'0%').replace('%','')) || 0;
  const dfmreiPct = parseFloat((markets.dfmrei?.pct||'0%').replace('%',''));
  const eqBlend = Number.isFinite(dfmreiPct)
    ? (emaarPct + dfmPct + dfmreiPct) / 3
    : (emaarPct + dfmPct) / 2;
  const eqScore  = eqBlend>1.5?5 : eqBlend>0.3?4 : eqBlend>-0.5?3 : eqBlend>-1.5?2 : 1;
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

  const keyOk = !!(anthropicKey && String(anthropicKey).length > 10);
  if (keyOk) process.env.ANTHROPIC_API_KEY = anthropicKey;
  let intelNotice = null;
  if (!keyOk) {
    const tav = !!(process.env.TAVILY_API_KEY || '').trim();
    const both = 'You need BOTH keys: TAVILY_API_KEY (web snippets) AND ANTHROPIC_API_KEY (Claude turns snippets into scorecards). ';
    if (envHelp?.path) {
      const pathNorm = envHelp.path.replace(/\\/g, '/');
      if (envHelp.empty) {
        intelNotice = `${both}${pathNorm} is empty or missing ANTHROPIC_API_KEY line. Save: ANTHROPIC_API_KEY=sk-ant-api03-...`;
      } else {
        intelNotice = `${both}Found ${pathNorm} but no usable ANTHROPIC_API_KEY. Add: ANTHROPIC_API_KEY=sk-ant-... ${tav ? '(Tavily is set.)' : ''}`;
      }
    } else {
      intelNotice = `${both}npm run env:pull from Vercel, or add .env.local with both keys. ${tav ? 'Tavily worked — only Anthropic missing.' : ''}`;
    }
  } else if (narrativeBilling) {
    intelNotice = 'Anthropic web_search billing error. Add TAVILY_API_KEY in Vercel for **Preview + Production**, redeploy, and ensure the key is in the request body (fixed in app).';
  } else if (tavilyConfigured && narrativeFallback) {
    intelNotice = 'TAVILY_API_KEY is set but Tavily returned no snippets or Claude failed. Redeploy after env change; add key to Preview if you use preview URLs; check Tavily dashboard usage.';
  } else if (narrativeFallback) {
    intelNotice = 'Narrative fallback. Add TAVILY_API_KEY (Vercel: Production + Preview), redeploy.';
  }
  return {
    ok: true, ts, priceSource,
    anthropic_configured: keyOk,
    intel_notice: intelNotice,
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
        headline: `Emaar AED ${markets.emaar?.price||'—'} (${markets.emaar?.pct||'—'}) · DFMGI ${markets.dfmgi?.price||'—'} · DFMREI ${markets.dfmrei?.price||'—'} (${markets.dfmrei?.pct||'—'})`,
        bullets: [`Emaar: AED ${markets.emaar?.price||'N/A'} ${markets.emaar?.chg||''}`, `DFMGI: ${markets.dfmgi?.price||'N/A'} ${markets.dfmgi?.chg||''}`, `DFM Real Estate Index (DFMREI.AE): ${markets.dfmrei?.price||'N/A'} ${markets.dfmrei?.chg||''} ${markets.dfmrei?.pct||''}`, `ENBD: AED ${markets.enbd?.price||'N/A'} · DIB: AED ${markets.dib?.price||'N/A'}`],
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
  };
}

// ── Main handler ──────────────────────────────────────────
export async function GET() {
  const payload = await buildIntelligencePayload();
  return Response.json(payload);
}
