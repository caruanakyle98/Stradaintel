/**
 * Rental listings / transactions CSV → merge into property dashboard payload.
 * Uses same week windows as sales so volumes align.
 */

import { parseCsv } from './salesCsvPayload.js';

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
  if (!s || s === '-') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function parseDubaiEvidenceDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  const iso = new Date(t);
  if (!Number.isNaN(iso.getTime())) return iso;
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
  const slash = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (slash) {
    const d = parseInt(slash[1], 10);
    const m = parseInt(slash[2], 10) - 1;
    let y = parseInt(slash[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, m, d, 12, 0, 0));
    if (!Number.isNaN(dt.getTime())) return new Date(new Date(dt).toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  }
  return null;
}

function inRange(d, start, end) {
  if (!d) return false;
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function pctChange(cur, prev) {
  if (!prev || !Number.isFinite(prev) || prev === 0) return 'N/A';
  const pct = ((cur - prev) / prev) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function trendFrom(cur, prev) {
  if (!prev || !Number.isFinite(prev)) return 'flat';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

function fmtCompact(v) {
  if (!v || !Number.isFinite(v)) return 'N/A';
  if (v >= 1e6) return (v / 1e6).toFixed(2).replace(/\.00$/, '') + 'M';
  if (v >= 1e3) return Math.round(v).toLocaleString('en-US');
  return String(Math.round(v));
}

/**
 * @param {string} csvRaw
 * @param {string} rentalLabel
 * @param {{ weekStart: Date, weekEnd: Date, prevStart: Date, prevEnd: Date }} windows
 * @param {string} period - same as sales weekly.period
 */
export function mergeRentalIntoPayload(payload, csvRaw, rentalLabel, windows) {
  const rows = parseCsv(csvRaw);
  const headers = Object.keys(rows[0] || {});
  const dateCol = pickColumn(headers, ['Evidence Date', 'Date', 'Contract Date', 'Listing Date', 'Start Date', 'Ejari Date']);
  const rentCol = pickColumn(headers, [
    'Annualised Rental Price (AED)',
    'Contract Rental Price (AED)',
    'Annual Rent (AED)',
    'Rent (AED)',
    'Annual Rent',
    'Rent',
    'Price (AED)',
    'Yearly Rent',
    'Rent Amount',
  ]);
  const bedsCol = pickColumn(headers, ['Beds', 'Bedrooms', 'Bed']);

  if (!dateCol || !rentCol) {
    payload.rental = payload.rental || {};
    payload.rental.note = `Rental CSV: need a date column (${dateCol ? 'ok' : 'missing'}) and rent column (${rentCol ? 'ok' : 'missing'}). Headers: ${headers.slice(0, 12).join(', ')}…`;
    payload.rental.rental_source = rentalLabel;
    return payload;
  }

  /** Property Monitor rental export: "01 Mar 2026 / 28 Feb 2027" → use contract start (first date). */
  function rentalEvidenceDate(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const first = s.split(/\s*\/\s*/)[0].trim();
    return parseDubaiEvidenceDate(first) || parseDubaiEvidenceDate(s);
  }

  const records = rows
    .map(r => ({
      d: rentalEvidenceDate(getWithAliases(r, [dateCol])),
      rent: parseNumber(getWithAliases(r, [rentCol])),
      beds: String(getWithAliases(r, [bedsCol]) || '').toLowerCase(),
    }))
    .filter(r => r.d && r.rent);

  if (!records.length) {
    payload.rental = payload.rental || {};
    payload.rental.note = 'Rental CSV: no rows with a parseable date and numeric rent (check Evidence Date format and rent column).';
    payload.rental.rental_source = rentalLabel;
    return payload;
  }

  const { weekStart, weekEnd, prevStart, prevEnd } = windows;
  const week = records.filter(r => inRange(r.d, weekStart, weekEnd));
  const prev = records.filter(r => inRange(r.d, prevStart, prevEnd));

  const weekCount = week.length;
  const prevCount = prev.length;
  const weekValue = week.reduce((s, r) => s + r.rent, 0);
  const prevValue = prev.reduce((s, r) => s + r.rent, 0);

  const period = payload.weekly?.sale_volume?.period || '';
  const source = `Rental CSV (${rentalLabel})`;

  payload.weekly = payload.weekly || {};
  payload.weekly.rent_volume = {
    value: String(weekCount),
    chg_wow: pctChange(weekCount, prevCount),
    chg_yoy: 'N/A',
    trend: trendFrom(weekCount, prevCount),
    period,
    source,
  };
  payload.weekly.rent_value_aed = {
    value: `AED ${fmtCompact(weekValue)}`,
    chg_wow: pctChange(weekValue, prevValue),
    chg_yoy: 'N/A',
    trend: trendFrom(weekValue, prevValue),
    period,
    source,
  };

  const avgRent = beds => {
    const xs = week.filter(r => {
      const b = r.beds.replace(/\D/g, '') || r.beds;
      if (beds === 1) return b === '1' || r.beds === 'one';
      if (beds === 2) return b === '2' || r.beds === 'two';
      if (beds === 3) return b === '3' || r.beds.includes('3');
      return false;
    }).map(r => r.rent);
    if (!xs.length) return null;
    return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  };

  const n1 = avgRent(1);
  const n2 = avgRent(2);
  const n3 = avgRent(3);

  payload.rental = payload.rental || {};
  if (n1) payload.rental.apt_1br_avg_aed = String(n1);
  if (n2) payload.rental.apt_2br_avg_aed = String(n2);
  if (n3) payload.rental.villa_3br_avg_aed = String(n3);
  payload.rental.rental_source = source;
  payload.rental.rental_period = period;
  payload.rental.note = 'Rental metrics from PROPERTY_RENTAL_CSV_URL (weekly count/value + bed averages where beds column matches).';

  payload.sources_used = Array.isArray(payload.sources_used) ? [...payload.sources_used, source] : [source];

  if (payload._stats_for_ai) {
    payload._stats_for_ai.rent_week_count = weekCount;
    payload._stats_for_ai.rent_week_value_aed = Math.round(weekValue);
  }

  return payload;
}
