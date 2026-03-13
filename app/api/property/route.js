// app/api/property/route.js
// Property data endpoint prioritising self-hosted sales CSV and optional AI interpretation.

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

function detectDelimiter(text) {
  const sample = String(text || '').split('\n').slice(0, 5).join('\n');
  const commas = (sample.match(/,/g) || []).length;
  const semicolons = (sample.match(/;/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cur = '';
  let inQ = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQ) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQ = false;
        continue;
      }
      cur += ch;
      continue;
    }

    if (ch === '"') {
      inQ = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(cur);
      cur = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      continue;
    }
    if (ch !== '\r') cur += ch;
  }

  row.push(cur);
  rows.push(row);

  const header = (rows.shift() || []).map(h => String(h || '').replace(/^\uFEFF/, '').trim());
  return rows
    .filter(r => r.some(v => String(v || '').trim() !== ''))
    .map(r => {
      const o = {};
      for (let j = 0; j < header.length; j++) o[header[j]] = r[j] ?? '';
      return o;
    });
}

function parseDubaiEvidenceDate(s) {
  if (!s) return null;
  const t = String(s).trim();

  const iso = new Date(t);
  if (!Number.isNaN(iso.getTime())) return iso;

  const slashWithTime = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (slashWithTime) {
    const d = parseInt(slashWithTime[1], 10);
    const m = parseInt(slashWithTime[2], 10) - 1;
    let y = parseInt(slashWithTime[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, m, d, 12, 0, 0));
    if (!Number.isNaN(dt.getTime())) return new Date(new Date(dt).toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  }

  const dayMonthWordYear = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (dayMonthWordYear) {
    const day = parseInt(dayMonthWordYear[1], 10);
    const mon = dayMonthWordYear[2].slice(0, 3).toLowerCase();
    const year = parseInt(dayMonthWordYear[3], 10);
    const months = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    const month = months[mon];
    if (month !== undefined) {
      const approx = new Date(Date.UTC(year, month, day, 12, 0, 0));
      return new Date(new Date(approx).toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
    }
  }

  return null;
}

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pickColumn(headers, aliases) {
  const normalizedHeaders = headers.map(h => ({ raw: h, norm: normalizeKey(h) }));
  const byNorm = new Map(normalizedHeaders.map(h => [h.norm, h.raw]));

  for (const alias of aliases) {
    const direct = byNorm.get(normalizeKey(alias));
    if (direct) return direct;
  }

  for (const alias of aliases) {
    const a = normalizeKey(alias);
    const tokens = a.split(' ').filter(Boolean);
    const partial = normalizedHeaders.find(h => tokens.every(t => h.norm.includes(t)));
    if (partial) return partial.raw;
  }

  return null;
}

function getWithAliases(row, aliases) {
  for (const a of aliases) {
    if (!a) continue;
    const v = row[a];
    if (v !== undefined && String(v).trim() !== '') return v;
  }
  return '';
}

function parseNumber(n) {
  if (n === null || n === undefined) return null;
  const s = String(n).replace(/,/g, '').trim();
  if (!s || s === '-' || s.toLowerCase() === 'na' || s.toLowerCase() === 'n/a') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function inRange(d, start, end) {
  if (!d) return false;
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function fmtDate(d) {
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

function fmtCompact(v) {
  if (!v || !Number.isFinite(v)) return 'N/A';
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2).replace(/\.00$/, '') + 'B';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return Math.round(v).toLocaleString('en-US');
}

function pctChange(cur, prev) {
  if (!prev || !Number.isFinite(prev)) return 'N/A';
  const pct = ((cur - prev) / prev) * 100;
  const p = pct.toFixed(1);
  return `${pct >= 0 ? '+' : ''}${p}%`;
}

function trendFrom(cur, prev) {
  if (!prev || !Number.isFinite(prev)) return 'flat';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

function safeJsonFromText(text) {
  const candidates = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  for (const c of candidates.reverse()) {
    try {
      return JSON.parse(c);
    } catch {}
  }
  return null;
}

async function aiInterpretSales(stats, key) {
  if (!key) return null;
  try {
    const prompt = `You are interpreting Dubai sales transactions data only (no rentals/listings available).
Return ONLY valid JSON:
{
  "owner_briefing": "2 sentences for a property owner with one actionable watchpoint",
  "market_note": "1 short sentence about off-plan vs secondary from this week's data",
  "demand_signal": "landlord|tenant|balanced"
}
Use this data:\n${JSON.stringify(stats, null, 2)}`;

    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': key,
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;

    const raw = await res.json();
    const text = (raw.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
    const parsed = safeJsonFromText(text);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      owner_briefing: String(parsed.owner_briefing || '').trim() || null,
      market_note: String(parsed.market_note || '').trim() || null,
      demand_signal: ['landlord', 'tenant', 'balanced'].includes(parsed.demand_signal) ? parsed.demand_signal : null,
    };
  } catch {
    return null;
  }
}

function buildFromSalesRecords({ records, weekStart, weekEnd, prevStart, prevEnd, csvPath }) {
  const thisWeekLabel = `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`;
  const period = `Weekly — ${thisWeekLabel}`;
  const source = `Self-hosted CSV (${csvPath})`;

  const week = records.filter(r => inRange(r.evidenceDate, weekStart, weekEnd));
  const prev = records.filter(r => inRange(r.evidenceDate, prevStart, prevEnd));

  const weekCount = week.length;
  const prevCount = prev.length;
  const weekValue = week.reduce((s, r) => s + (r.priceAed || 0), 0);
  const prevValue = prev.reduce((s, r) => s + (r.priceAed || 0), 0);

  const avg = (arr, pick) => {
    const vals = arr.map(pick).filter(v => v != null && Number.isFinite(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const avgPsf = type => avg(week.filter(r => r.unitType === type), r => r.psfAed);
  const avgDeal = type => avg(week.filter(r => r.unitType === type), r => r.priceAed);

  const offplan = week.filter(r => r.segment === 'offplan').length;
  const offplanPct = weekCount ? Math.round((offplan / weekCount) * 100) : null;

  const byArea = new Map();
  const byAreaPrev = new Map();

  for (const r of week) {
    const key = r.area || 'Unknown';
    const cur = byArea.get(key) || { area: key, vol: 0, psfTotal: 0, psfCnt: 0 };
    cur.vol += 1;
    if (r.psfAed) {
      cur.psfTotal += r.psfAed;
      cur.psfCnt += 1;
    }
    byArea.set(key, cur);
  }

  for (const r of prev) {
    byAreaPrev.set(r.area || 'Unknown', (byAreaPrev.get(r.area || 'Unknown') || 0) + 1);
  }

  const topAreas = [...byArea.values()]
    .sort((a, b) => b.vol - a.vol)
    .slice(0, 5)
    .map(a => {
      const prevVol = byAreaPrev.get(a.area) || 0;
      return {
        area: a.area,
        vol: String(a.vol),
        avg_psf: a.psfCnt ? String(Math.round(a.psfTotal / a.psfCnt)) : 'N/A',
        trend: trendFrom(a.vol, prevVol),
        period,
      };
    });

  const latestDate = records.length
    ? records.reduce((m, r) => (r.evidenceDate > m ? r.evidenceDate : m), records[0].evidenceDate)
    : null;

  return {
    ok: true,
    weekly: {
      sale_volume: { value: String(weekCount), chg_wow: pctChange(weekCount, prevCount), chg_yoy: 'N/A', trend: trendFrom(weekCount, prevCount), period, source },
      sale_value_aed: { value: `AED ${fmtCompact(weekValue)}`, chg_wow: pctChange(weekValue, prevValue), chg_yoy: 'N/A', trend: trendFrom(weekValue, prevValue), period, source },
      rent_volume: { value: 'N/A', chg_wow: 'N/A', chg_yoy: 'N/A', trend: 'flat', period, source },
      rent_value_aed: { value: 'N/A', chg_wow: 'N/A', chg_yoy: 'N/A', trend: 'flat', period, source },
      period_label: period,
    },
    prices: {
      apt_psf_aed: avgPsf('apt') ? String(Math.round(avgPsf('apt'))) : 'N/A',
      villa_psf_aed: avgPsf('villa') ? String(Math.round(avgPsf('villa'))) : 'N/A',
      apt_avg_aed: `AED ${fmtCompact(avgDeal('apt'))}`,
      villa_avg_aed: `AED ${fmtCompact(avgDeal('villa'))}`,
      price_index_chg_yoy: 'N/A',
      price_period: period,
      price_source: source,
    },
    market_split: {
      offplan_pct: offplanPct == null ? 'N/A' : String(offplanPct),
      secondary_pct: offplanPct == null ? 'N/A' : String(100 - offplanPct),
      offplan_chg_yoy: 'N/A',
      dominant_segment: offplanPct == null ? 'N/A' : offplanPct >= 50 ? 'Off-plan' : 'Secondary',
      split_period: period,
      note: 'Off-plan is detected from Select Data Points = Oqood in your sales CSV.',
    },
    top_areas: topAreas,
    yields: { apt_gross_yield: 'N/A', villa_gross_yield: 'N/A', apt_net_yield: 'N/A', villa_net_yield: 'N/A', best_yield_area: 'N/A', best_yield_pct: 'N/A', yield_vs_mortgage: 'N/A', yield_source: source, yield_period: period },
    supply: { pipeline_units_2025_26: 'N/A', completions_ytd: 'N/A', new_launches_this_month: 'N/A', absorption_rate: 'N/A', oversupply_risk: 'N/A', notable_launches: 'N/A', supply_source: source },
    rental: { apt_1br_avg_aed: 'N/A', apt_2br_avg_aed: 'N/A', villa_3br_avg_aed: 'N/A', rental_index_chg_yoy: 'N/A', ejari_registrations_weekly: 'N/A', vacancy_rate: 'N/A', landlord_vs_tenant: 'balanced', note: 'Rental/listing feeds are not connected yet. This dashboard currently uses sales transactions only.', rental_source: source, rental_period: period },
    mortgage: { typical_rate_pct: 'N/A', rate_type: 'variable', ltv_max_pct: 'N/A', avg_loan_size_aed: 'N/A', mortgage_share_of_sales_pct: 'N/A', financing_conditions: 'N/A', mortgage_source: source },
    owner_briefing: `This week (${thisWeekLabel}) your sales file shows ${weekCount.toLocaleString('en-US')} transactions worth AED ${fmtCompact(weekValue)}. Off-plan share is ${offplanPct == null ? 'N/A' : offplanPct + '%'} (derived from Oqood-tagged records). Watch for two consecutive weekly declines in both deal count and value as an early demand slowdown signal.`,
    data_freshness: latestDate ? `Transactions through ${fmtDate(latestDate)}` : period,
    sources_used: [source],
    _stats_for_ai: {
      this_week_period: thisWeekLabel,
      week_count: weekCount,
      prev_week_count: prevCount,
      week_value_aed: Math.round(weekValue),
      prev_week_value_aed: Math.round(prevValue),
      offplan_pct: offplanPct,
      top_areas: topAreas,
      apt_psf_aed: avgPsf('apt') ? Math.round(avgPsf('apt')) : null,
      villa_psf_aed: avgPsf('villa') ? Math.round(avgPsf('villa')) : null,
    },
  };
}

function deriveAnalysisWindows(records) {
  const latest = records.reduce((m, r) => (r.evidenceDate > m ? r.evidenceDate : m), records[0].evidenceDate);
  const weekEnd = new Date(latest);
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekEnd.getDate() - weekEnd.getDay());
  weekStart.setHours(0, 0, 0, 0);
  weekEnd.setHours(23, 59, 59, 999);
  const prevStart = new Date(weekStart);
  prevStart.setDate(weekStart.getDate() - 7);
  const prevEnd = new Date(weekEnd);
  prevEnd.setDate(weekEnd.getDate() - 7);
  return { weekStart, weekEnd, prevStart, prevEnd };
}

export async function GET(request) {
  const { access, readFile } = await import('node:fs/promises');
  const pathMod = await import('node:path');
  const url = new URL(typeof request?.url === 'string' ? request.url : 'http://localhost');

  const csvPathFromQuery = url.searchParams.get('salesCsv') || url.searchParams.get('csvPath');
  const csvPath = csvPathFromQuery
    ? pathMod.resolve(csvPathFromQuery)
    : process.env.PROPERTY_SALES_CSV_PATH
      ? process.env.PROPERTY_SALES_CSV_PATH
      : pathMod.resolve(process.cwd(), 'data/property/sales.csv');

  const forceLive = (url.searchParams.get('mode') || '').toLowerCase() === 'live';

  if (!forceLive) {
    try {
      await access(csvPath);
      const csvRaw = await readFile(csvPath, 'utf8');
      const rows = parseCsv(csvRaw);
      const headers = Object.keys(rows[0] || {});

      const columnMap = {
        evidenceDate: pickColumn(headers, ['Evidence Date', 'Date', 'Transaction Date', 'Sale Date']),
        area: pickColumn(headers, ['All Developments', 'Community/Building', 'Community', 'Area', 'Project Name']),
        segment: pickColumn(headers, ['Select Data Points', 'Data Point', 'Transaction Type', 'Registration Type']),
        unitType: pickColumn(headers, ['Unit Type', 'Property Type', 'Unit Category', 'Type']),
        priceAed: pickColumn(headers, ['Price (AED)', 'Price AED', 'Sale Price', 'Amount', 'Value', 'Property Value']),
        psfAed: pickColumn(headers, ['Price (AED/sq ft)', 'Price per sq ft', 'Price psf', 'AED/sqft']),
      };

      if (!columnMap.evidenceDate || !columnMap.priceAed) {
        return Response.json({
          ok: false,
          error: 'CSV schema not recognized. Required columns missing: transaction date and/or price.',
          expected: {
            evidenceDate: ['Evidence Date', 'Date', 'Transaction Date', 'Sale Date'],
            priceAed: ['Price (AED)', 'Price AED', 'Sale Price', 'Amount', 'Value'],
          },
          detected_headers: headers,
          csv_path: csvPath,
        }, { status: 400 });
      }

      const records = rows.map(r => {
        const unitTypeRaw = String(getWithAliases(r, [columnMap.unitType]) || '').toLowerCase();
        const select = String(getWithAliases(r, [columnMap.segment]) || '').trim().toLowerCase();

        const unitType = unitTypeRaw.includes('villa') || unitTypeRaw.includes('townhouse') ? 'villa'
          : unitTypeRaw.includes('apartment') || unitTypeRaw.includes('hotel apartment') ? 'apt'
          : 'other';

        return {
          evidenceDate: parseDubaiEvidenceDate(getWithAliases(r, [columnMap.evidenceDate])),
          area: String(getWithAliases(r, [columnMap.area])).trim() || 'Unknown',
          segment: select.includes('oqood') ? 'offplan' : select.includes('title deed') ? 'secondary' : 'unknown',
          unitType,
          priceAed: parseNumber(getWithAliases(r, [columnMap.priceAed])),
          psfAed: parseNumber(getWithAliases(r, [columnMap.psfAed])),
        };
      }).filter(r => r.evidenceDate && r.priceAed);

      if (records.length) {
        const windows = deriveAnalysisWindows(records);
        const payload = buildFromSalesRecords({ records, ...windows, csvPath });
        const ai = await aiInterpretSales(payload._stats_for_ai, process.env.ANTHROPIC_API_KEY);
        if (ai?.owner_briefing) payload.owner_briefing = ai.owner_briefing;
        if (ai?.market_note) payload.market_split.note = ai.market_note;
        if (ai?.demand_signal) payload.rental.landlord_vs_tenant = ai.demand_signal;
        delete payload._stats_for_ai;
        return Response.json(payload);
      }

      return Response.json({
        ok: false,
        error: 'CSV was found but no valid sales records could be parsed (date/price may be malformed).',
        csv_path: csvPath,
        detected_headers: headers,
      }, { status: 400 });
    } catch (e) {
      return Response.json({
        ok: false,
        error: `Unable to read sales CSV at path: ${csvPath}`,
        detail: e?.message || 'Unknown filesystem error.',
      }, { status: 500 });
    }
  }

  return Response.json({
    ok: false,
    error: `No sales CSV data found. Set PROPERTY_SALES_CSV_PATH or place sales.csv at ${csvPath}.`,
  }, { status: 500 });
}
