// app/api/property/route.js
// Dedicated property market intelligence endpoint
// Strict date-scoped prompting to prevent monthly/YTD figures being passed as weekly

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

export async function GET() {
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
