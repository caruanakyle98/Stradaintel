/**
 * Rental listings / transactions CSV → merge into property dashboard payload.
 * Uses same week windows as sales so volumes align.
 */

import { forEachCsvObject } from './salesCsvPayload.js';
import { communitiesMatch, getCommunityAliasMapFromEnv, normalizeCommunityKey } from './communityMatch.js';
import { normalizeBedKey } from './listingsCsvPayload.js';

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

function dubaiDateKey(d) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
}

function movingAvg7(series) {
  return series.map((_, i) => {
    const slice = series.slice(Math.max(0, i - 6), i + 1).map(x => x.value).filter(v => v != null);
    return slice.length ? Math.round(slice.reduce((a, b) => a + b, 0) / slice.length) : null;
  });
}

function fmtCompactRent(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

function fmtTxDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Build 30-day daily rental volume + avg rent charts (mirrors buildCharts30d from salesCsvPayload). */
function buildRentalCharts30d(records) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  const end = new Date(now);
  end.setDate(now.getDate() - 1);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(end.getDate() - 29);
  start.setHours(0, 0, 0, 0);

  const keys = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    keys.push(dubaiDateKey(d));
  }

  const byDay = new Map(keys.map(k => [k, { count: 0, rentSum: 0, rentN: 0 }]));
  for (const r of records) {
    if (!r.d) continue;
    const key = dubaiDateKey(r.d);
    if (!byDay.has(key)) continue;
    const b = byDay.get(key);
    b.count += 1;
    if (r.rent != null && Number.isFinite(r.rent)) { b.rentSum += r.rent; b.rentN += 1; }
  }

  const rent_volume = [];
  const rent_avg_raw = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = keys[i];
    const b = byDay.get(key);
    const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' });
    rent_volume.push({ date: key, label, value: b.count });
    rent_avg_raw.push({ date: key, label, value: b.rentN ? Math.round(b.rentSum / b.rentN) : null });
  }

  // Forward-fill nulls for avg rent
  let lastRent = null;
  const rent_avg_aed = rent_avg_raw.map(p => {
    if (p.value != null) lastRent = p.value;
    return { ...p, value: p.value != null ? p.value : lastRent };
  });

  const volMa = movingAvg7(rent_volume);
  const rent_volume_ma7 = rent_volume.map((s, i) => ({ ...s, value: volMa[i] }));

  const rentForMa = rent_avg_raw.map(p => ({ ...p, value: p.value }));
  let lastForMa = null;
  for (const p of rentForMa) {
    if (p.value != null) lastForMa = p.value;
    else if (lastForMa != null) p.value = lastForMa;
  }
  const rentMa = movingAvg7(rentForMa);
  const rent_avg_aed_ma7 = rentForMa.map((s, i) => ({ ...s, value: rentMa[i] }));

  // WoW volume — last two 7-day buckets in the window
  const recentVol = rent_volume.slice(-14);
  const lastWkVol  = recentVol.slice(7).reduce((s, x) => s + (x.value || 0), 0);
  const priorWkVol = recentVol.slice(0, 7).reduce((s, x) => s + (x.value || 0), 0);
  const wow_volume_pct = priorWkVol ? Math.round(((lastWkVol - priorWkVol) / priorWkVol) * 1000) / 10 : null;

  const recentRent = rentForMa.slice(-14).filter(p => p.value != null).map(p => p.value);
  const lastWkRent  = recentRent.slice(Math.floor(recentRent.length / 2)).reduce((s, v) => s + v, 0) / Math.max(1, recentRent.slice(Math.floor(recentRent.length / 2)).length);
  const priorWkRent = recentRent.slice(0, Math.ceil(recentRent.length / 2)).reduce((s, v) => s + v, 0) / Math.max(1, recentRent.slice(0, Math.ceil(recentRent.length / 2)).length);
  const wow_rent_pct = priorWkRent ? Math.round(((lastWkRent - priorWkRent) / priorWkRent) * 1000) / 10 : null;

  return {
    rent_volume,
    rent_volume_ma7,
    rent_avg_aed,
    rent_avg_aed_ma7,
    wow_volume_pct,
    wow_rent_pct,
    window_label: `${keys[0]} → ${keys[29]} (Dubai, 30 days)`,
  };
}

/** Top 5 areas by rental registration count for the current week.
 *  When filterArea is active, drills into sub-community / community-building (same logic as sales). */
function buildRentalTopAreas(records, weekStart, weekEnd, filterArea) {
  function inRange(d, s, e) { if (!d) return false; const t = d.getTime(); return t >= s.getTime() && t <= e.getTime(); }
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const drillDown = !!filterArea;
  const week = records.filter(r => inRange(r.d, weekStart, weekEnd));

  const byArea = new Map();
  function addRow(r, keyFn) {
    const key = keyFn(r);
    if (!key) return;
    if (!byArea.has(key)) byArea.set(key, { count: 0, rentSum: 0 });
    const b = byArea.get(key);
    b.count += 1;
    b.rentSum += r.rent || 0;
  }

  if (drillDown) {
    // Try sub-community first
    for (const r of week) {
      if (r.subCommunity) addRow(r, x => x.subCommunity);
    }
    // Fall back to communityBuilding if sub-community yielded nothing
    if (byArea.size === 0) {
      for (const r of week) {
        const cb = r.communityBuilding;
        if (!cb || norm(cb) === norm(filterArea)) continue;
        addRow(r, () => cb.trim());
      }
    }
    // Last resort: use rowArea (will likely all be the same, but better than nothing)
    if (byArea.size === 0) {
      for (const r of week) addRow(r, x => x.rowArea || 'Unknown');
    }
  } else {
    for (const r of week) addRow(r, x => x.rowArea || 'Unknown');
  }

  return [...byArea.entries()]
    .map(([area, b]) => ({
      area,
      vol: String(b.count),
      avg_rent_aed: b.count ? String(Math.round(b.rentSum / b.count)) : null,
      avg_rent_label: b.count ? fmtCompactRent(Math.round(b.rentSum / b.count)) : 'N/A',
      trend: 'flat',
    }))
    .sort((a, b) => parseInt(b.vol) - parseInt(a.vol))
    .slice(0, 5);
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
 * @param {{ filterArea?: string, communityAliasMap?: Map<string, string>|null }} [opts] - area as sales filter; optional alias map (else COMMUNITY_ALIAS_JSON on server)
 */
export function mergeRentalIntoPayload(payload, csvRaw, rentalLabel, windows, opts = {}) {
  const filterArea = (opts.filterArea || '').trim();
  /** @type {string|null} */
  let dateCol = null;
  let masterAreaCol = null;
  let cbCol = null;
  let subCol = null;
  let rentCol = null;
  let bedsCol = null;
  let recurrenceCol = null;
  let unitNumCol = null;

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

  function resolveRentalColumns(headers) {
    dateCol = pickColumn(headers, ['Evidence Date', 'Date', 'Contract Date', 'Listing Date', 'Start Date', 'Ejari Date']);
    masterAreaCol = pickColumn(headers, [
      'All Developments',
      'Area',
      'Project Name',
      'Community',
      'Location',
      'Master Project',
    ]);
    cbCol = pickColumn(headers, ['Community/Building', 'community/building']);
    subCol = pickColumn(headers, [
      'Sub Community / Building',
      'Sub Community',
      'Building',
      'Tower',
    ]);
    rentCol = pickColumn(headers, [
      'Annualised Rental Price (AED)',
      'Annualised Rent (AED)',
      'Annualised Rent',
    ]);
    bedsCol = pickColumn(headers, ['Beds', 'Bedrooms', 'Bed']);
    recurrenceCol = pickColumn(headers, ['Rent Recurrence', 'Recurrence', 'Contract Type', 'New or Renewal']);
    unitNumCol = pickColumn(headers, [
      'Unit Number',
      'Unit No',
      'Unit No.',
      'Property Number',
      'Door Number',
    ]);
  }

  const records = [];

  forEachCsvObject(
    csvRaw,
    (r) => {
      if (!dateCol || !rentCol) return;
      const areaVal = masterAreaCol ? String(getWithAliases(r, [masterAreaCol])).trim() : '';
      const cbVal = cbCol ? String(getWithAliases(r, [cbCol])).trim() : '';
      const towerVal = subCol ? String(getWithAliases(r, [subCol])).trim() : '';
      const rowArea = (areaVal || cbVal || towerVal || 'Unknown').trim();
      const unitNumRaw = unitNumCol ? String(getWithAliases(r, [unitNumCol]) || '').trim() : '';
      const rec = {
        d: rentalEvidenceDate(getWithAliases(r, [dateCol])),
        rent: parseNumber(getWithAliases(r, [rentCol])),
        beds: String(getWithAliases(r, [bedsCol]) || '').toLowerCase(),
        recurrence: recurrenceCol ? classifyRecurrence(getWithAliases(r, [recurrenceCol])) : 'other',
        rowArea,
        subCommunity: towerVal || null,
        communityBuilding: cbVal || null,
        unitNumber: unitNumRaw || null,
      };
      if (rec.d && rec.rent) records.push(rec);
    },
    { onHeader: (headerNames) => resolveRentalColumns(headerNames) },
  );

  if (!dateCol || !rentCol) {
    payload.rental = payload.rental || {};
    payload.rental.note = `Rental CSV: need Evidence Date and Annualised Rental Price (AED). Contract rent is not used. Missing: date=${!!dateCol} annualised=${!!rentCol}.`;
    payload.rental.rental_source = rentalLabel;
    return payload;
  }

  const communityAliasMap = opts.communityAliasMap ?? getCommunityAliasMapFromEnv();
  let recordsFiltered = records;
  if (filterArea) {
    recordsFiltered = records.filter((r) => communitiesMatch(r.rowArea, filterArea, communityAliasMap));
  }
  const hotLookbackDays = Math.max(1, parseInt(process.env.RENTAL_HOT_LISTINGS_LOOKBACK_DAYS || '365', 10) || 365);
  const hotMinTxn = Math.max(1, parseInt(process.env.HOT_LISTINGS_MIN_TXN_PER_BUILDING_BED || '3', 10) || 3);

  if (!recordsFiltered.length) {
    payload.rental = payload.rental || {};
    payload.rental.note = filterArea
      ? `Rental CSV: no rows for area “${filterArea}” (same label as sales Area / All Developments). Clear filter or align rental column names.`
      : 'Rental CSV: no rows with a parseable date and numeric rent (check Evidence Date format and rent column).';
    payload.rental.rental_source = rentalLabel;
    return payload;
  }

  const { weekStart, weekEnd, prevStart, prevEnd } = windows;
  const week = recordsFiltered.filter(r => inRange(r.d, weekStart, weekEnd));
  const prev = recordsFiltered.filter(r => inRange(r.d, prevStart, prevEnd));

  const weekCount = week.length;
  const prevCount = prev.length;
  const weekValue = week.reduce((s, r) => s + r.rent, 0);
  const prevValue = prev.reduce((s, r) => s + r.rent, 0);

  const weekNew = week.filter(r => r.recurrence === 'new').length;
  const weekRenewal = week.filter(r => r.recurrence === 'renewal').length;
  const prevNew = prev.filter(r => r.recurrence === 'new').length;
  const prevRenewal = prev.filter(r => r.recurrence === 'renewal').length;
  const splitDenom = weekNew + weekRenewal;
  const weekOther = Math.max(weekCount - splitDenom, 0);

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
      other_count: String(weekOther),
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

  // Build rental 30-day charts and top areas for tab-specific display
  payload.rental_charts_30d = buildRentalCharts30d(recordsFiltered);
  payload.rental_top_areas = buildRentalTopAreas(recordsFiltered, weekStart, weekEnd, filterArea);
  payload.rental_top_areas_mode = filterArea ? 'sub_community' : 'area';

  payload.recent_rental_transactions = [...recordsFiltered]
    .filter((r) => r.d)
    .sort((a, b) => b.d.getTime() - a.d.getTime())
    .slice(0, 25)
    .map((r) => ({
      date: fmtTxDate(r.d),
      area: r.rowArea || '—',
      location: [r.subCommunity, r.communityBuilding].filter(Boolean).join(' · ') || '—',
      unit_no: r.unitNumber ? String(r.unitNumber) : '—',
      beds: r.beds ? String(r.beds) : '—',
      rent_fmt: `AED ${fmtCompactRent(r.rent)}/yr`,
      recurrence: r.recurrence === 'new' ? 'New' : r.recurrence === 'renewal' ? 'Renewal' : '—',
    }));

  const hotCutoff = new Date(Date.now() - hotLookbackDays * 24 * 60 * 60 * 1000);
  const txnByBuildingBedAgg = new Map();
  for (const r of recordsFiltered) {
    if (!r.d || r.d < hotCutoff) continue;
    const tower = String(r.subCommunity || r.communityBuilding || '').trim();
    if (!tower) continue;
    const bedKey = normalizeBedKey(r.beds);
    if (bedKey === 'Other') continue;
    const key = `${normalizeCommunityKey(tower)}|${bedKey}`;
    const cur = txnByBuildingBedAgg.get(key) || { sum: 0, count: 0 };
    cur.sum += Number(r.rent) || 0;
    cur.count += 1;
    txnByBuildingBedAgg.set(key, cur);
  }
  const txn_by_building_bed = {};
  for (const [key, agg] of txnByBuildingBedAgg.entries()) {
    if (agg.count < hotMinTxn) continue;
    const avg = agg.sum / agg.count;
    if (!(avg > 0)) continue;
    txn_by_building_bed[key] = { avg: Math.round(avg), n: agg.count };
  }
  payload.rental.txn_by_building_bed = txn_by_building_bed;
  payload.rental.hot_listings_lookback_days = String(hotLookbackDays);
  payload.rental.hot_listings_min_txn = String(hotMinTxn);

  // Rental-specific market summary (mirrors sales owner_briefing)
  const newPctStr = splitDenom > 0 ? ` New contracts ${newPct}% of split.` : '';
  payload.rental_owner_briefing = filterArea
    ? `Area filter "${filterArea}". Rolling 7 days (${period}, Dubai): ${weekCount.toLocaleString('en-US')} rental registrations, annualised value AED ${fmtCompact(weekValue)}. Prior 7 days: ${prevCount.toLocaleString('en-US')} registrations.${newPctStr}`
    : `Rolling 7 days (${period}, Dubai): ${weekCount.toLocaleString('en-US')} rental registrations in your CSV, annualised value AED ${fmtCompact(weekValue)}. Prior 7 days: ${prevCount.toLocaleString('en-US')} registrations.${newPctStr}`;

  if (payload._stats_for_ai) {
    payload._stats_for_ai.rent_week_count = weekCount;
    payload._stats_for_ai.rent_week_value_aed = Math.round(weekValue);
    if (payload.weekly.rent_new_vs_renewal) {
      payload._stats_for_ai.rent_new_week = weekNew;
      payload._stats_for_ai.rent_renewal_week = weekRenewal;
      payload._stats_for_ai.rent_other_week = weekOther;
    }
  }

  return payload;
}
