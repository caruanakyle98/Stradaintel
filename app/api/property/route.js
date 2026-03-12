// app/api/property/route.js
// Dedicated property market intelligence endpoint
// Strict date-scoped prompting to prevent monthly/YTD figures being passed as weekly

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

export async function GET(request) {
  // ── Compute current week and reference periods ───────────
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  const dayOfWeek = now.getDay(); // 0=Sun
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - dayOfWeek);
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const prevStart = new Date(weekStart); prevStart.setDate(weekStart.getDate() - 7);
  const prevEnd   = new Date(weekEnd);   prevEnd.setDate(weekEnd.getDate() - 7);

  const fmt  = d => d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  const fmtS = d => d.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' });

  const thisWeek  = `${fmt(weekStart)} – ${fmt(weekEnd)}`;
  const priorWeek = `${fmt(prevStart)} – ${fmt(prevEnd)}`;
  const thisMonth = now.toLocaleDateString('en-AE', { month:'long', year:'numeric' });
  const today     = fmt(now);

  // ── Local (self-hosted) data path ────────────────────────
  // Enable with: PROPERTY_DATA_MODE=local and PROPERTY_SALES_CSV_PATH=/absolute/path/to/file.csv
  // Optional override: /api/property?mode=local
  const url = new URL(typeof request?.url === 'string' ? request.url : 'http://localhost');
  const mode = (url.searchParams.get('mode') || process.env.PROPERTY_DATA_MODE || '').toLowerCase();

  if (mode === 'local') {
    try {
      const { readFile } = await import('node:fs/promises');
      const pathMod = await import('node:path');

      const csvPathEnv = process.env.PROPERTY_SALES_CSV_PATH;
      const csvPath = csvPathEnv
        ? csvPathEnv
        : pathMod.resolve(process.cwd(), 'data/property/sales.csv');

      const csvRaw = await readFile(csvPath, 'utf8');

      function parseDubaiEvidenceDate(s) {
        // Example: "12 Mar 2026"
        if (!s) return null;
        const t = String(s).trim();
        const m = t.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
        if (!m) return null;
        const day = parseInt(m[1], 10);
        const mon = m[2].toLowerCase();
        const year = parseInt(m[3], 10);
        const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
        const month = months[mon];
        if (month === undefined) return null;
        const approx = new Date(Date.UTC(year, month, day, 12, 0, 0));
        return new Date(new Date(approx).toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
      }

      function inRange(d, start, end) {
        if (!d) return false;
        const x = d.getTime();
        return x >= start.getTime() && x <= end.getTime();
      }

      function parseNumber(n) {
        if (n === null || n === undefined) return null;
        const s = String(n).replace(/,/g, '').trim();
        if (!s || s === '-' || s.toLowerCase() === 'na' || s.toLowerCase() === 'n/a') return null;
        const v = Number(s);
        return Number.isFinite(v) ? v : null;
      }

      function parseCsv(text) {
        const rows = [];
        let row = [];
        let cur = '';
        let inQ = false;

        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          const next = text[i + 1];

          if (inQ) {
            if (ch === '"' && next === '"') { cur += '"'; i++; continue; }
            if (ch === '"') { inQ = false; continue; }
            cur += ch;
            continue;
          }

          if (ch === '"') { inQ = true; continue; }
          if (ch === ',') { row.push(cur); cur = ''; continue; }
          if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; continue; }
          if (ch === '\r') continue;
          cur += ch;
        }
        row.push(cur);
        rows.push(row);

        const header = rows.shift()?.map(h => String(h || '').trim()) || [];
        return rows
          .filter(r => r.some(v => String(v || '').trim() !== ''))
          .map(r => {
            const o = {};
            for (let j = 0; j < header.length; j++) o[header[j]] = r[j] ?? '';
            return o;
          });
      }

      const records = parseCsv(csvRaw).map(r => {
        const evidenceDate = parseDubaiEvidenceDate(r['Evidence Date']);
        const community = String(r['Community/Building'] || '').trim();
        const allDev = String(r['All Developments'] || '').trim();
        const select = String(r['Select Data Points'] || '').trim();
        const unitTypeRaw = String(r['Unit Type'] || '').toLowerCase();

        const priceAed = parseNumber(r['Price (AED)']);
        const psfAed = parseNumber(r['Price (AED/sq ft)']);

        const unitType =
          unitTypeRaw.includes('villa') ? 'villa' :
          unitTypeRaw.includes('townhouse') ? 'villa' :
          unitTypeRaw.includes('apartment') ? 'apt' :
          unitTypeRaw.includes('hotel apartment') ? 'apt' :
          'other';

        const segment = select.toLowerCase() === 'oqood'
          ? 'offplan'
          : (select.toLowerCase() === 'title deed' ? 'secondary' : 'unknown');

        return { evidenceDate, allDev: allDev || community, segment, unitType, priceAed, psfAed };
      }).filter(r => r.evidenceDate && r.priceAed);

      const weekRecs = records.filter(r => inRange(r.evidenceDate, weekStart, weekEnd));
      const prevRecs = records.filter(r => inRange(r.evidenceDate, prevStart, prevEnd));

      const weekCount = weekRecs.length;
      const prevCount = prevRecs.length;
      const weekValue = weekRecs.reduce((s, r) => s + (r.priceAed || 0), 0);
      const prevValue = prevRecs.reduce((s, r) => s + (r.priceAed || 0), 0);

      const pctChg = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);
      const fmtPct = p => (p === null || p === undefined || !Number.isFinite(p)) ? 'N/A' : `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
      const trendOf = p => (p === null || p === undefined) ? 'flat' : (p > 0.5 ? 'up' : (p < -0.5 ? 'down' : 'flat'));

      const wowVol = pctChg(weekCount, prevCount);
      const wowVal = pctChg(weekValue, prevValue);

      const offplanCount = weekRecs.filter(r => r.segment === 'offplan').length;
      const secondaryCount = weekRecs.filter(r => r.segment === 'secondary').length;
      const denom = offplanCount + secondaryCount;
      const offplanPct = denom ? Math.round((offplanCount / denom) * 100) : null;

      const areaMap = new Map();
      for (const r of weekRecs) {
        const k = r.allDev || 'Unknown';
        const cur = areaMap.get(k) || { vol: 0, psfSum: 0, psfN: 0 };
        cur.vol += 1;
        if (r.psfAed) { cur.psfSum += r.psfAed; cur.psfN += 1; }
        areaMap.set(k, cur);
      }
      const topAreas = Array.from(areaMap.entries())
        .map(([area, v]) => ({ area, vol: String(v.vol), avg_psf: v.psfN ? String(Math.round(v.psfSum / v.psfN)) : 'N/A', trend: 'flat', period: thisWeek }))
        .sort((a, b) => (parseInt(b.vol) || 0) - (parseInt(a.vol) || 0))
        .slice(0, 5);

      const avgPsf = type => {
        const xs = weekRecs.filter(r => r.unitType === type && r.psfAed).map(r => r.psfAed);
        return xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null;
      };
      const avgDeal = type => {
        const xs = weekRecs.filter(r => r.unitType === type && r.priceAed).map(r => r.priceAed);
        return xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length) : null;
      };

      const fmtCompact = n => {
        if (!n || !Number.isFinite(n)) return 'N/A';
        if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
        if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.00$/, '') + 'M';
        if (n >= 1e3) return Math.round(n).toLocaleString('en-US');
        return String(Math.round(n));
      };

      const latestDate = weekRecs.length
        ? weekRecs.reduce((m, r) => (r.evidenceDate > m ? r.evidenceDate : m), weekRecs[0].evidenceDate)
        : null;

      const sourceLabel = 'Self-hosted CSV (Property Monitor export)';

      return Response.json({
        ok: true,
        weekly: {
          sale_volume: { value: String(weekCount), chg_wow: fmtPct(wowVol), chg_yoy: 'N/A', trend: trendOf(wowVol), period: thisWeek, source: sourceLabel },
          sale_value_aed: { value: `AED ${fmtCompact(weekValue)}`, chg_wow: fmtPct(wowVal), chg_yoy: 'N/A', trend: trendOf(wowVal), period: thisWeek, source: sourceLabel },
          rent_volume: { value: 'N/A', chg_wow: 'N/A', chg_yoy: 'N/A', trend: 'flat', period: thisWeek, source: sourceLabel },
          rent_value_aed: { value: 'N/A', chg_wow: 'N/A', chg_yoy: 'N/A', trend: 'flat', period: thisWeek, source: sourceLabel },
          period_label: `Weekly — ${thisWeek}`,
        },
        prices: {
          apt_psf_aed: avgPsf('apt') ? String(avgPsf('apt')) : 'N/A',
          villa_psf_aed: avgPsf('villa') ? String(avgPsf('villa')) : 'N/A',
          apt_avg_aed: `AED ${fmtCompact(avgDeal('apt'))}`,
          villa_avg_aed: `AED ${fmtCompact(avgDeal('villa'))}`,
          price_index_chg_yoy: 'N/A',
          price_period: `Weekly — ${thisWeek}`,
          price_source: sourceLabel,
        },
        market_split: {
          offplan_pct: offplanPct === null ? 'N/A' : String(offplanPct),
          secondary_pct: offplanPct === null ? 'N/A' : String(100 - offplanPct),
          offplan_chg_yoy: 'N/A',
          dominant_segment: offplanPct === null ? 'Off-plan' : (offplanPct >= 50 ? 'Off-plan' : 'Secondary'),
          split_period: `Weekly — ${thisWeek}`,
          note: 'Computed from Oqood (off-plan) vs Title Deed (secondary) in your self-hosted transactions file.',
        },
        top_areas: topAreas,
        yields: { apt_gross_yield: 'N/A', villa_gross_yield: 'N/A', apt_net_yield: 'N/A', villa_net_yield: 'N/A', best_yield_area: 'N/A', best_yield_pct: 'N/A', yield_vs_mortgage: 'N/A', yield_source: sourceLabel, yield_period: `Weekly — ${thisWeek}` },
        supply: { pipeline_units_2025_26: 'N/A', completions_ytd: 'N/A', new_launches_this_month: 'N/A', absorption_rate: 'N/A', oversupply_risk: 'N/A', notable_launches: 'N/A', supply_source: sourceLabel },
        rental: { apt_1br_avg_aed: 'N/A', apt_2br_avg_aed: 'N/A', villa_3br_avg_aed: 'N/A', rental_index_chg_yoy: 'N/A', ejari_registrations_weekly: 'N/A', vacancy_rate: 'N/A', landlord_vs_tenant: 'balanced', note: 'Rental data not yet connected (planned: rental listings + Ejari transactions).', rental_source: sourceLabel, rental_period: `Weekly — ${thisWeek}` },
        mortgage: { typical_rate_pct: 'N/A', rate_type: 'variable', ltv_max_pct: 'N/A', avg_loan_size_aed: 'N/A', mortgage_share_of_sales_pct: 'N/A', financing_conditions: 'N/A', mortgage_source: sourceLabel },
        owner_briefing: `This week (${thisWeek}) your self-hosted transactions file shows ${weekCount.toLocaleString('en-US')} recorded sales worth ~AED ${fmtCompact(weekValue)}. Off-plan share is ${offplanPct === null ? 'N/A' : (offplanPct + '%')} based on Oqood vs Title Deed. Watch: if this weekly volume or value drops sharply versus the prior week, it typically signals buyer hesitation within 1–2 weeks.`,
        data_freshness: latestDate ? `Transactions through ${fmt(latestDate)}` : `Weekly — ${thisWeek}`,
        sources_used: [sourceLabel],
      });
    } catch (err) {
      return Response.json({ ok: false, error: `Local property data failed: ${err.message}` }, { status: 500 });
    }
  }

  const prompt = `
Today is ${today} (Dubai time). You are a Dubai real estate data analyst with strict data integrity rules.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL DATA INTEGRITY RULES — READ FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. NEVER mix time periods. If a number is monthly, label it monthly. If yearly, label it yearly. Never present a monthly or YTD figure as if it were weekly.
2. If you cannot find weekly data, use "N/A" and set period_label to what you DID find (e.g. "Monthly — Feb 2026").
3. Always state EXACTLY which period and source each number comes from in the period_label / source fields.
4. The example numbers in the JSON template below are ILLUSTRATIVE PLACEHOLDERS. Replace every single one with real searched data.
5. When a number sounds too large for a week (e.g. >AED 15B in weekly sales), double-check — it is probably monthly.
6. Do NOT blend or average multiple reports. Pick the single most authoritative recent source for each metric.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT TO SEARCH — IN ORDER OF PRIORITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECTION A — WEEKLY TRANSACTION DATA
Search: "Dubai Land Department transactions ${thisWeek}" OR "DLD weekly report ${thisMonth}"
Search: "dubailand.gov.ae weekly transactions" OR "DLD real estate report March 2026"
Target: dubailand.gov.ae, Property Monitor weekly report, Gulf News property weekly wrap
What to extract: Number of sale transactions and total AED value specifically for week ${thisWeek} or ${priorWeek}.
If only monthly data found for ${thisMonth}, return that and label it "Monthly — ${thisMonth}".
Weekly Dubai sales are typically 3,000–6,000 deals and AED 6B–15B per week. If a number is outside this range, it is probably monthly.

SECTION B — RENTAL REGISTRATIONS (EJARI)
Search: "Ejari registrations ${thisMonth}" OR "Dubai rental contracts weekly 2026"
Target: dubailand.gov.ae/ejari, Arabian Business, The National
What to extract: Number of new Ejari registrations for the week or month. Weekly Ejari is typically 2,000–5,000.

SECTION C — PRICE PER SQUARE FOOT (MOST RECENT MONTH)
Search: "Dubai property price per square foot ${thisMonth}" OR "Dubai residential prices February 2026"
Target: Property Monitor monthly index, CBRE Dubai Q1 2026, Knight Frank UAE, Bayut Q1 report
What to extract: Average AED/sqft for apartments and villas. Source and month must be stated.
Typical ranges: Apartments AED 1,100–1,800/sqft. Villas AED 1,400–2,500/sqft.

SECTION D — OFF-PLAN vs SECONDARY SPLIT
Search: "Dubai off-plan vs secondary market share 2026" OR "DLD off-plan sales percentage ${thisMonth}"
Target: Property Monitor, Bayut, CBRE reports
What to extract: Percentage split. Off-plan is typically 50–65% of total volume currently.

SECTION E — TOP AREAS BY VOLUME
Search: "Dubai top communities transactions ${thisMonth}" OR "most active areas Dubai property March 2026"
Target: Property Monitor area rankings, Bayut area report, dubailand.gov.ae
What to extract: Top 5 areas by number of transactions and their average AED/sqft.

SECTION F — RENTAL PRICES
Search: "Dubai average rent 2026" OR "Dubai rental prices ${thisMonth} apartment villa"
Target: Bayut rental report, Property Finder research, Dubizzle, CBRE
What to extract: Annual rent for 1BR, 2BR apartments and 3BR villas in AED.

SECTION G — RENTAL YIELDS
Search: "Dubai rental yield 2026" OR "Dubai investment yield apartments villas"
Target: Property Monitor, Knight Frank, Bayut yield calculator, CBRE
What to extract: Gross yield % for apartments and villas. Typically 5–8% gross for apartments.

SECTION H — SUPPLY PIPELINE
Search: "Dubai property supply pipeline 2026" OR "new property launches Dubai ${thisMonth}"
Target: Property Monitor, CBRE, JLL, Asteco supply reports
What to extract: Units under construction, completions expected, new launches.

SECTION I — MORTGAGE CONDITIONS
Search: "UAE mortgage rates 2026" OR "Dubai home loan rates ${thisMonth}"
Target: UAE banks (Emirates NBD, ADCB, FAB), Mortgage Finder UAE, The National finance
What to extract: Typical variable/fixed rates, max LTV for expats and nationals.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RETURN THIS JSON — fill every field from your searches
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "weekly": {
    "sale_volume": {
      "value": "[NUMBER OF DEALS — replace with real figure]",
      "chg_wow": "[% vs prior week OR N/A]",
      "chg_yoy": "[% vs same week last year OR N/A]",
      "trend": "up|down|flat",
      "period": "[exact dates or 'Monthly — Feb 2026' if weekly unavailable]",
      "source": "[exact source name]"
    },
    "sale_value_aed": {
      "value": "[AED value with B/M suffix — replace with real figure]",
      "chg_wow": "[% vs prior week OR N/A]",
      "chg_yoy": "[% vs same week last year OR N/A]",
      "trend": "up|down|flat",
      "period": "[exact dates or month if weekly unavailable]",
      "source": "[exact source name]"
    },
    "rent_volume": {
      "value": "[Ejari contracts — replace with real figure]",
      "chg_wow": "[% OR N/A]",
      "chg_yoy": "[% OR N/A]",
      "trend": "up|down|flat",
      "period": "[exact dates or month]",
      "source": "[exact source name]"
    },
    "period_label": "[Summarise what period this data actually covers]"
  },
  "prices": {
    "apt_psf_aed": "[number only, e.g. 1420]",
    "villa_psf_aed": "[number only, e.g. 1890]",
    "apt_avg_aed": "[e.g. 1.35M]",
    "villa_avg_aed": "[e.g. 5.40M]",
    "price_index_chg_yoy": "[e.g. +9.8%]",
    "price_period": "[month this data covers, e.g. Feb 2026]",
    "price_source": "[exact source]"
  },
  "market_split": {
    "offplan_pct": "[number only, e.g. 58]",
    "secondary_pct": "[number only, e.g. 42]",
    "offplan_chg_yoy": "[e.g. +6pp OR N/A]",
    "dominant_segment": "Off-plan|Secondary",
    "split_period": "[month or period this covers]",
    "note": "[one sentence explanation]"
  },
  "top_areas": [
    {"area": "[name]", "vol": "[number]", "avg_psf": "[number]", "trend": "up|down|flat", "period": "[month]"},
    {"area": "[name]", "vol": "[number]", "avg_psf": "[number]", "trend": "up|down|flat", "period": "[month]"},
    {"area": "[name]", "vol": "[number]", "avg_psf": "[number]", "trend": "up|down|flat", "period": "[month]"},
    {"area": "[name]", "vol": "[number]", "avg_psf": "[number]", "trend": "up|down|flat", "period": "[month]"},
    {"area": "[name]", "vol": "[number]", "avg_psf": "[number]", "trend": "up|down|flat", "period": "[month]"}
  ],
  "yields": {
    "apt_gross_yield": "[e.g. 6.8% — include % sign]",
    "villa_gross_yield": "[e.g. 4.9%]",
    "apt_net_yield": "[e.g. 5.2% OR N/A]",
    "villa_net_yield": "[e.g. 3.8% OR N/A]",
    "best_yield_area": "[area name]",
    "best_yield_pct": "[e.g. 8.1%]",
    "yield_vs_mortgage": "[one sentence: is gross yield above or below current mortgage rate]",
    "yield_source": "[exact source]",
    "yield_period": "[quarter or month]"
  },
  "supply": {
    "pipeline_units_2025_26": "[number]",
    "completions_ytd": "[number — year to date ${today}]",
    "new_launches_this_month": "[count of projects launched in ${thisMonth}]",
    "absorption_rate": "[one sentence assessment]",
    "oversupply_risk": "low|medium|high",
    "notable_launches": "[project names this month]",
    "supply_source": "[exact source]"
  },
  "rental": {
    "apt_1br_avg_aed": "[annual AED — number only e.g. 95000]",
    "apt_2br_avg_aed": "[annual AED]",
    "villa_3br_avg_aed": "[annual AED]",
    "rental_index_chg_yoy": "[e.g. +8.2%]",
    "ejari_registrations_weekly": "[number OR N/A]",
    "vacancy_rate": "[e.g. 8% OR N/A]",
    "landlord_vs_tenant": "landlord|tenant|balanced",
    "note": "[one sentence on who has pricing power and why]",
    "rental_source": "[exact source]",
    "rental_period": "[month or quarter]"
  },
  "mortgage": {
    "typical_rate_pct": "[e.g. 4.25 — number only]",
    "rate_type": "variable|fixed",
    "ltv_max_pct": "[e.g. 80 — number only]",
    "avg_loan_size_aed": "[e.g. 1.2M]",
    "mortgage_share_of_sales_pct": "[e.g. 32 — number only OR N/A]",
    "financing_conditions": "[one sentence on accessibility]",
    "mortgage_source": "[exact source]"
  },
  "owner_briefing": "[2–3 sentence plain-English summary FOR A PROPERTY OWNER. Describe: (1) what the market is doing right now with specific numbers, (2) what it means for their asset value and rental income, (3) one specific watch point or action. Be direct and concrete — no vague generalities.]",
  "data_freshness": "[the most recent period all this data collectively covers]",
  "sources_used": ["[source 1]", "[source 2]", "[source 3]"]
}`;

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2500,
        system: `You are a Dubai real estate data analyst with strict integrity standards.
RULES:
- Search the web for REAL data. Do not invent numbers.
- Every metric must state its source and exact time period.
- NEVER present monthly or YTD figures as weekly figures.
- If weekly data is unavailable, use N/A and return the most recent monthly figure instead, clearly labelled.
- Do NOT include <cite> tags, XML tags, or any HTML markup inside string values.
- Return ONLY a valid JSON object. No markdown, no backticks, no text outside the JSON.`,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API ${res.status}: ${err.slice(0, 200)}`);
    }

    const raw = await res.json();
    const text = (raw.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON returned. Raw: ' + text.slice(0, 300));

    const data = JSON.parse(match[0]);

    // Sanitise: flatten any {value,type} objects AND strip <cite> / HTML tags
    function sanitise(obj) {
      if (obj === null || obj === undefined) return obj;
      if (Array.isArray(obj)) return obj.map(sanitise);
      if (typeof obj === 'string') return obj.replace(/<[^>]+>/g, '').trim();
      if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        if (keys.length <= 4 && (obj.value !== undefined || obj.price !== undefined)) {
          return String(obj.value ?? obj.price ?? '').replace(/<[^>]+>/g, '').trim();
        }
        const out = {};
        for (const k of keys) out[k] = sanitise(obj[k]);
        return out;
      }
      return obj;
    }

    const clean = sanitise(data);

    // ── Post-process: pull period/source fields up for display ──
    // weekly sub-objects may have {value, period, source, chg_wow, ...}
    // We need to extract those before sanitise collapses them
    // Re-parse from raw to get nested objects safely
    const raw2 = JSON.parse(match[0]);
    const weekly = raw2.weekly || {};

    const txFields = ['sale_volume', 'sale_value_aed', 'rent_volume'];
    const txMeta = {};
    for (const f of txFields) {
      const obj = weekly[f] || {};
      txMeta[f] = {
        value:   typeof obj === 'object' ? (obj.value  || 'N/A') : (obj || 'N/A'),
        chg_wow: typeof obj === 'object' ? (obj.chg_wow || 'N/A') : 'N/A',
        chg_yoy: typeof obj === 'object' ? (obj.chg_yoy || 'N/A') : 'N/A',
        trend:   typeof obj === 'object' ? (obj.trend  || 'flat') : 'flat',
        period:  typeof obj === 'object' ? (obj.period  || '') : '',
        source:  typeof obj === 'object' ? (obj.source  || '') : '',
      };
    }

    // Same for top_areas (may have period)
    const areas = (raw2.top_areas || []).map(a => ({
      area:    String(a.area   || ''),
      vol:     String(a.vol    || 'N/A'),
      avg_psf: String(a.avg_psf|| 'N/A'),
      trend:   String(a.trend  || 'flat'),
      period:  String(a.period || ''),
    }));

    return Response.json({
      ok: true,
      ...clean,
      weekly: {
        ...clean.weekly,
        ...txMeta,
        period_label: weekly.period_label || clean.weekly?.period_label || 'Latest available',
      },
      top_areas: areas,
    });

  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
