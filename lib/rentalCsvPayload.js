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
 * @param {{ filterArea?: string }} [opts] - same exact area as sales filter (All Developments / Area column)
 */
export function mergeRentalIntoPayload(payload, csvRaw, rentalLabel, windows, opts = {}) {
  const filterArea = (opts.filterArea || '').trim();
  const rows = parseCsv(csvRaw);
  const headers = Object.keys(rows[0] || {});
  const dateCol = pickColumn(headers, ['Evidence Date', 'Date', 'Contract Date', 'Listing Date', 'Start Date', 'Ejari Date']);
  /* Same hierarchy as sales buildPayloadFromCsvText → record.area (filter dropdown must match). */
  const masterAreaCol = pickColumn(headers, [
    'All Developments',
    'Area',
    'Project Name',
    'Community',
    'Location',
    'Master Project',
  ]);
  const cbCol = pickColumn(headers, ['Community/Building', 'community/building']);
  const subCol = pickColumn(headers, [
    'Sub Community / Building',
    'Sub Community',
    'Building',
    'Tower',
  ]);
  /** All money metrics use annualised rent only (not contract rent). */
  const rentCol = pickColumn(headers, [
    'Annualised Rental Price (AED)',
    'Annualised Rent (AED)',
    'Annualised Rent',
  ]);
  const bedsCol = pickColumn(headers, ['Beds', 'Bedrooms', 'Bed']);
  const recurrenceCol = pickColumn(headers, ['Rent Recurrence', 'Recurrence', 'Contract Type', 'New or Renewal']);

  if (!dateCol || !rentCol) {
    payload.rental = payload.rental || {};
    payload.rental.note = `Rental CSV: need Evidence Date and Annualised Rental Price (AED). Contract rent is not used. Missing: date=${!!dateCol} annualised=${!!rentCol}.`;
    payload.rental.rental_source = rentalLabel;
    return payload;
  }

  // #region agent log
  if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'run1',hypothesisId:'H1',location:'rentalCsvPayload.js:139',message:'Rental source columns detected',data:{filterArea,rows:rows.length,dateCol, rentCol, recurrenceCol, masterAreaCol, cbCol, subCol},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  function classifyRecurrence(raw) {
    const s = String(raw || '').toLowerCase();
    if (/\brenewal\b/.test(s)) return 'renewal';
    if (/\bnew\s*contract\b/.test(s) || /\bnew\b/.test(s)) return 'new';
    return 'other';
  }

  /** Property Monitor rental export: "01 Mar 2026 / 28 Feb 2027" → use contract start (first date). */
  function rentalEvidenceDate(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const first = s.split(/\s*\/\s*/)[0].trim();
    return parseDubaiEvidenceDate(first) || parseDubaiEvidenceDate(s);
  }

  let records = rows
    .map(r => {
      const areaVal = masterAreaCol ? String(getWithAliases(r, [masterAreaCol])).trim() : '';
      const cbVal = cbCol ? String(getWithAliases(r, [cbCol])).trim() : '';
      let towerVal = subCol ? String(getWithAliases(r, [subCol])).trim() : '';
      const rowArea = (areaVal || cbVal || towerVal || 'Unknown').trim();
      return {
        d: rentalEvidenceDate(getWithAliases(r, [dateCol])),
        rent: parseNumber(getWithAliases(r, [rentCol])),
        beds: String(getWithAliases(r, [bedsCol]) || '').toLowerCase(),
        recurrence: recurrenceCol ? classifyRecurrence(getWithAliases(r, [recurrenceCol])) : 'other',
        rowArea,
      };
    })
    .filter(r => r.d && r.rent);

  // #region agent log
  if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'run1',hypothesisId:'H2',location:'rentalCsvPayload.js:175',message:'Rental records parsed before area filter',data:{parsedRecords:records.length,recurrenceCounts:records.reduce((acc,r)=>{acc[r.recurrence]=(acc[r.recurrence]||0)+1;return acc;},{}),sample:records.slice(0,5).map(r=>({rowArea:r.rowArea,recurrence:r.recurrence,beds:r.beds,rent:r.rent})),},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  if (filterArea) {
    records = records.filter(r => r.rowArea === filterArea);
  }

  // #region agent log
  if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'run1',hypothesisId:'H3',location:'rentalCsvPayload.js:183',message:'Rental records after area filter',data:{filterArea,filteredRecords:records.length,filteredRecurrenceCounts:records.reduce((acc,r)=>{acc[r.recurrence]=(acc[r.recurrence]||0)+1;return acc;},{}),sample:records.slice(0,7).map(r=>({rowArea:r.rowArea,recurrence:r.recurrence,beds:r.beds,rent:r.rent})),},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  if (!records.length) {
    payload.rental = payload.rental || {};
    payload.rental.note = filterArea
      ? `Rental CSV: no rows for area “${filterArea}” (same label as sales Area / All Developments). Clear filter or align rental column names.`
      : 'Rental CSV: no rows with a parseable date and numeric rent (check Evidence Date format and rent column).';
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

  const weekNew = week.filter(r => r.recurrence === 'new').length;
  const weekRenewal = week.filter(r => r.recurrence === 'renewal').length;
  const prevNew = prev.filter(r => r.recurrence === 'new').length;
  const prevRenewal = prev.filter(r => r.recurrence === 'renewal').length;
  const splitDenom = weekNew + weekRenewal;

  // #region agent log
  if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'run1',hypothesisId:'H4',location:'rentalCsvPayload.js:203',message:'Rental split counts calculated',data:{weekCount,prevCount,weekNew,weekRenewal,splitDenom,otherCount:Math.max(weekCount-splitDenom,0),weekRecurrenceCounts:week.reduce((acc,r)=>{acc[r.recurrence]=(acc[r.recurrence]||0)+1;return acc;},{}),filterArea},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const newPct = splitDenom ? ((weekNew / splitDenom) * 100).toFixed(1) : null;
  const renewalPct = splitDenom ? ((weekRenewal / splitDenom) * 100).toFixed(1) : null;

  const period = payload.weekly?.sale_volume?.period || '';
  const source = filterArea
    ? `Rental CSV (${rentalLabel}) · ${filterArea}`
    : `Rental CSV (${rentalLabel})`;

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
    note: 'Sum of annualised rent (AED) for the week — contract rent not used.',
  };
  if (recurrenceCol && splitDenom > 0) {
    payload.weekly.rent_new_vs_renewal = {
      new_count: String(weekNew),
      renewal_count: String(weekRenewal),
      new_pct: newPct,
      renewal_pct: renewalPct,
      new_chg_wow: pctChange(weekNew, prevNew),
      renewal_chg_wow: pctChange(weekRenewal, prevRenewal),
      period,
      source,
      column: recurrenceCol,
    };
  }

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

  /* Studio: Beds column value "studio" or "0" (exclude 1-bed). */
  const studioLike = week.filter(r => {
    const b = (r.beds || '').toLowerCase().trim();
    return b === '0' || b === 'studio' || /^studio\b/.test(b);
  });
  const studioAvg = studioLike.length ? Math.round(studioLike.reduce((s, r) => s + r.rent, 0) / studioLike.length) : null;

  // #region agent log
  const bedCounts = {};
  week.forEach(r => { const k = r.beds || '(empty)'; bedCounts[k] = (bedCounts[k] || 0) + 1; });
  if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'13de73'},body:JSON.stringify({sessionId:'13de73',location:'rentalCsvPayload.js:avgRent',message:'Rental averages',data:{bedCounts,n1,n2,n3,studioLikeCount:studioLike.length,studioAvg},timestamp:Date.now(),hypothesisId:'H2',runId:'post-fix'})}).catch(()=>{});
  // #endregion

  payload.rental = payload.rental || {};
  if (studioAvg != null) payload.rental.studio_avg_aed = String(studioAvg);
  if (n1) payload.rental.apt_1br_avg_aed = String(n1);
  if (n2) payload.rental.apt_2br_avg_aed = String(n2);
  if (n3) payload.rental.villa_3br_avg_aed = String(n3);
  payload.rental.rental_source = source;
  payload.rental.rental_period = period;
  payload.rental.note = filterArea
    ? `Area filter “${filterArea}”: annualised rent only; weekly counts + bed averages for this area.`
    : 'Rental metrics use Annualised Rental Price (AED) only. Weekly count/value + new vs renewal (Rent Recurrence) + bed averages.';

  /* Gross yield = (annual rent / sale price) × 100. Apartments: avg of 1br & 2br when both present, else 2br or 1br; villas: 3br. */
  payload.yields = payload.yields || {};
  const aptPrice = payload.prices?.apt_avg_aed_num;
  const villaPrice = payload.prices?.villa_avg_aed_num;
  const aptRent = (n1 != null && n2 != null) ? (n1 + n2) / 2 : (n2 ?? n1);
  if (aptRent != null && aptPrice != null && aptPrice > 0) {
    const pct = (aptRent / aptPrice) * 100;
    payload.yields.apt_gross_yield = Number.isFinite(pct) ? pct.toFixed(1) : 'N/A';
  }
  if (n3 != null && villaPrice != null && villaPrice > 0) {
    const pct = (n3 / villaPrice) * 100;
    payload.yields.villa_gross_yield = Number.isFinite(pct) ? pct.toFixed(1) : 'N/A';
  }
  const townhousePrice = payload.prices?.townhouse_avg_aed_num;
  if (n3 != null && townhousePrice != null && townhousePrice > 0) {
    const pct = (n3 / townhousePrice) * 100;
    payload.yields.townhouse_gross_yield = Number.isFinite(pct) ? pct.toFixed(1) : 'N/A';
  }

  payload.sources_used = Array.isArray(payload.sources_used) ? [...payload.sources_used, source] : [source];

  if (payload._stats_for_ai) {
    payload._stats_for_ai.rent_week_count = weekCount;
    payload._stats_for_ai.rent_week_value_aed = Math.round(weekValue);
    if (payload.weekly.rent_new_vs_renewal) {
      payload._stats_for_ai.rent_new_week = weekNew;
      payload._stats_for_ai.rent_renewal_week = weekRenewal;
    }
  }

  return payload;
}
