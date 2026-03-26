/**
 * Pure CSV → dashboard payload (browser + Node). No filesystem / fetch.
 * Used client-side to avoid Vercel HTTP 413 on large uploads.
 */

import { communitiesMatch, getCommunityAliasMapFromEnv, normalizeCommunityKey } from './communityMatch.js';
import { hotUnitTypeKeyFromSales } from './unitType.js';

/** Same semantics as listingsCsvPayload.normalizeBedKey (kept local to avoid sales↔listings import cycle). */
function normalizeBedKey(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s === '0' || s === 'studio' || /^studio\b/.test(s)) return 'Studio';
  const n = parseInt(s, 10);
  if (Number.isFinite(n)) return n >= 4 ? '4+' : String(n);
  return 'Other';
}

function detectDelimiter(text) {
  const sample = String(text || '').split('\n').slice(0, 5).join('\n');
  const commas = (sample.match(/,/g) || []).length;
  const semicolons = (sample.match(/;/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

/**
 * Stream CSV rows without allocating a giant array of row objects (same semantics as parseCsv).
 * @param {string} text
 * @param {(row: Record<string, string>, headerNames: string[]) => void} visitor
 * @param {{ onHeader?: (headerNames: string[]) => void }} [opts]
 */
export function forEachCsvObject(text, visitor, opts = {}) {
  const onHeader = typeof opts.onHeader === 'function' ? opts.onHeader : null;
  const delimiter = detectDelimiter(text);
  let row = [];
  let cur = '';
  let inQ = false;
  /** @type {string[]|null} */
  let header = null;

  function finishRow() {
    row.push(cur);
    cur = '';
    const cells = row;
    row = [];
    if (!header) {
      header = cells.map((h) => String(h || '').replace(/^\uFEFF/, '').trim());
      if (onHeader) onHeader(header);
      return;
    }
    if (!cells.some((v) => String(v || '').trim() !== '')) return;
    const o = {};
    for (let j = 0; j < header.length; j++) o[header[j]] = cells[j] ?? '';
    visitor(o, header);
  }

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
      finishRow();
      continue;
    }
    if (ch !== '\r') cur += ch;
  }

  // Mirror parseCsv: always flush last row (handles files with no trailing newline)
  row.push(cur);
  cur = '';
  const lastCells = row;
  row = [];
  if (!header) {
    header = lastCells.map((h) => String(h || '').replace(/^\uFEFF/, '').trim());
    if (onHeader) onHeader(header);
    return;
  }
  if (!lastCells.some((v) => String(v || '').trim() !== '')) return;
  const o = {};
  for (let j = 0; j < header.length; j++) o[header[j]] = lastCells[j] ?? '';
  visitor(o, header);
}

export function parseCsv(text) {
  const out = [];
  forEachCsvObject(text, (o) => out.push(o));
  return out;
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

/** Any PM-style "sub community / building.1" header (spacing/case variants). */
function pickSubCommunityBuilding1(headers) {
  const direct = pickColumn(headers, [
    'sub community / building.1',
    'Sub Community / Building.1',
    'sub community/building.1',
  ]);
  if (direct) return direct;
  for (const raw of headers) {
    const s = String(raw || '').toLowerCase();
    if (!s.includes('building')) continue;
    if (!/\.1\b|\.1$|building\s*1\b/.test(s) && !s.endsWith('.1')) continue;
    if (s.includes('sub') && s.includes('community')) return raw;
  }
  for (const raw of headers) {
    const s = String(raw || '').toLowerCase();
    if (s.includes('building') && (s.includes('.1') || /\b1\b/.test(s))) return raw;
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
  // Accept values like "AED 2,350.5 / sq ft" by stripping non-numeric tokens first.
  const s = String(n)
    .replace(/,/g, '')
    .replace(/[^\d.+-]/g, ' ')
    .trim()
    .split(/\s+/)
    .find(tok => tok && tok !== '-' && tok.toLowerCase() !== 'na' && tok.toLowerCase() !== 'n/a') || '';
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

/** Dubai calendar date key YYYY-MM-DD */
function dubaiDateKey(d) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
}

/** Dubai-local Monday week start YYYY-MM-DD */
function dubaiWeekStartKeyFromDate(d) {
  const dubai = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  const day = dubai.getDay();
  const mondayOffset = (day + 6) % 7;
  dubai.setDate(dubai.getDate() - mondayOffset);
  dubai.setHours(0, 0, 0, 0);
  return dubaiDateKey(dubai);
}

function medianSorted(sorted) {
  if (!sorted.length) return null;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function movingAvg7(series) {
  return series.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - 6); j <= i; j++) {
      const v = series[j].value;
      if (v != null && Number.isFinite(v)) {
        sum += v;
        n++;
      }
    }
    return n ? Math.round((sum / n) * 10) / 10 : null;
  });
}

/**
 * Last 30 Dubai days: daily counts + PSF; 7d MA; weekly sum volume + median PSF + IQR.
 */
function buildCharts30d(records) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  // Use a 30-day window ending **yesterday** (exclude today's partial data).
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
  const byDay = new Map(keys.map(k => [k, { count: 0, psfSum: 0, psfN: 0 }]));

  for (const r of records) {
    if (!r.evidenceDate) continue;
    const key = dubaiDateKey(r.evidenceDate);
    if (!byDay.has(key)) continue;
    const b = byDay.get(key);
    b.count += 1;
    if (r.psfAed != null && Number.isFinite(r.psfAed)) {
      b.psfSum += r.psfAed;
      b.psfN += 1;
    }
  }

  const sale_volume = [];
  const psf_daily_avg = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = keys[i];
    const b = byDay.get(key);
    const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' });
    sale_volume.push({ date: key, label, value: b.count });
    psf_daily_avg.push({
      date: key,
      label,
      value: b.psfN ? Math.round(b.psfSum / b.psfN) : null,
    });
  }
  let lastPsf = null;
  const psf = psf_daily_avg.map(p => {
    if (p.value != null) lastPsf = p.value;
    return { ...p, value: p.value != null ? p.value : lastPsf != null ? lastPsf : null };
  });

  const volMa = movingAvg7(sale_volume);
  const sale_volume_ma7 = sale_volume.map((s, i) => ({ date: s.date, label: s.label, value: volMa[i] }));
  const psf_ma7_raw = psf_daily_avg.map(p => ({ ...p, value: p.value }));
  let lastForMa = null;
  for (const p of psf_ma7_raw) {
    if (p.value != null) lastForMa = p.value;
    else if (lastForMa != null) p.value = lastForMa;
  }
  const psfMa = movingAvg7(psf_ma7_raw);
  const psf_ma7 = psf_ma7_raw.map((s, i) => ({ date: s.date, label: s.label, value: psfMa[i] }));

  const weekMap = new Map();
  for (const r of records) {
    if (!r.evidenceDate) continue;
    const dayKey = dubaiDateKey(r.evidenceDate);
    if (!keys.includes(dayKey)) continue;
    const wk = dubaiWeekStartKeyFromDate(r.evidenceDate);
    if (!weekMap.has(wk)) weekMap.set(wk, { volume: 0, psfs: [] });
    const w = weekMap.get(wk);
    w.volume += 1;
    if (r.psfAed != null && Number.isFinite(r.psfAed)) w.psfs.push(r.psfAed);
  }
  const weekKeys = [...weekMap.keys()].sort();
  const sale_volume_weekly = weekKeys.map(wk => {
    const d = new Date(wk + 'T12:00:00+04:00');
    const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' });
    return { date: wk, label: `Wk ${label}`, value: weekMap.get(wk).volume };
  });
  const psf_weekly = weekKeys.map(wk => {
    const psfs = [...weekMap.get(wk).psfs].sort((a, b) => a - b);
    const d = new Date(wk + 'T12:00:00+04:00');
    const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dubai' });
    return {
      date: wk,
      label: `Wk ${label}`,
      median: medianSorted(psfs),
      p25: percentile(psfs, 25),
      p75: percentile(psfs, 75),
    };
  }).filter(w => w.median != null);

  let wow_volume = null;
  if (sale_volume_weekly.length >= 2) {
    const a = sale_volume_weekly[sale_volume_weekly.length - 1].value;
    const b = sale_volume_weekly[sale_volume_weekly.length - 2].value;
    if (b) wow_volume = Math.round(((a - b) / b) * 1000) / 10;
  }
  let wow_psf = null;
  if (psf_weekly.length >= 2) {
    const a = psf_weekly[psf_weekly.length - 1].median;
    const b = psf_weekly[psf_weekly.length - 2].median;
    if (b) wow_psf = Math.round(((a - b) / b) * 1000) / 10;
  }

  return {
    sale_volume,
    psf,
    sale_volume_ma7,
    psf_ma7,
    sale_volume_weekly,
    psf_weekly,
    wow_volume_pct: wow_volume,
    wow_psf_pct: wow_psf,
    window_label: `${keys[0]} → ${keys[29]} (Dubai, 30 days)`,
  };
}

function buildFromSalesRecords({ records, weekStart, weekEnd, prevStart, prevEnd, csvPath, filterArea }) {
  const thisWeekLabel = `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`;
  const prevLabel = `${fmtDate(prevStart)} – ${fmtDate(prevEnd)}`;
  const areaSuffix = filterArea ? ` · Area: ${filterArea}` : '';
  const period = `Last 7 days (Dubai) — ${thisWeekLabel}${areaSuffix}`;
  const source = filterArea ? `Self-hosted CSV (${csvPath}) — filtered: ${filterArea}` : `Self-hosted CSV (${csvPath})`;

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

  const drillDown = !!filterArea;
  const norm = s => normalizeKey(s || '');
  const topKey = r => (drillDown ? r.subCommunity : r.area || 'Unknown');

  const byBucket = new Map();
  const byBucketPrev = new Map();

  function addWeekRow(r) {
    const key = drillDown ? r.subCommunity : r.area || 'Unknown';
    if (drillDown && !key) return;
    const cur = byBucket.get(key) || { area: key, vol: 0, psfTotal: 0, psfCnt: 0 };
    cur.vol += 1;
    if (r.psfAed) {
      cur.psfTotal += r.psfAed;
      cur.psfCnt += 1;
    }
    byBucket.set(key, cur);
  }
  function addPrevRow(r) {
    if (drillDown && !r.subCommunity) return;
    const key = topKey(r);
    if (drillDown && !key) return;
    byBucketPrev.set(key, (byBucketPrev.get(key) || 0) + 1);
  }

  if (drillDown) {
    for (const r of week) {
      if (r.subCommunity) addWeekRow(r);
    }
    if (byBucket.size === 0) {
      for (const r of week) {
        const cb = r.drillCommunityBuilding;
        if (!cb || norm(cb) === norm(filterArea)) continue;
        const key = cb.trim();
        const cur = byBucket.get(key) || { area: key, vol: 0, psfTotal: 0, psfCnt: 0 };
        cur.vol += 1;
        if (r.psfAed) {
          cur.psfTotal += r.psfAed;
          cur.psfCnt += 1;
        }
        byBucket.set(key, cur);
      }
    }
    for (const r of prev) {
      if (r.subCommunity) addPrevRow(r);
    }
    if (byBucketPrev.size === 0 && byBucket.size) {
      for (const r of prev) {
        const cb = r.drillCommunityBuilding;
        if (!cb || norm(cb) === norm(filterArea)) continue;
        const key = cb.trim();
        byBucketPrev.set(key, (byBucketPrev.get(key) || 0) + 1);
      }
    }
  } else {
    for (const r of week) addWeekRow(r);
    for (const r of prev) addPrevRow(r);
  }

  const topAreas = [...byBucket.values()]
    .sort((a, b) => b.vol - a.vol)
    .slice(0, 5)
    .map(a => {
      const prevVol = byBucketPrev.get(a.area) || 0;
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

  const charts_30d = buildCharts30d(records);

  const env = typeof process !== 'undefined' ? process.env : {};
  const hotLookbackDays = Math.max(1, parseInt(env.RENTAL_HOT_LISTINGS_LOOKBACK_DAYS || '365', 10) || 365);
  const hotMinTxn = Math.max(1, parseInt(env.HOT_LISTINGS_MIN_TXN_PER_BUILDING_BED || '3', 10) || 3);
  const hotCutoff = new Date(Date.now() - hotLookbackDays * 24 * 60 * 60 * 1000);

  const avgSaleForBedKey = (bk) => {
    const xs = week.filter((r) => r.bedKey === bk && r.priceAed > 0).map((r) => r.priceAed);
    if (!xs.length) return null;
    return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  };
  const sale_txn_avg_by_beds = {
    studio: avgSaleForBedKey('Studio'),
    '1br': avgSaleForBedKey('1'),
    '2br': avgSaleForBedKey('2'),
    '3br': avgSaleForBedKey('3'),
  };

  /* Building + bed + property type (apt/villa/townhouse), area-scoped via filtered `records`. */
  const txnByBuildingBedAgg = new Map();
  for (const r of records) {
    if (!r.evidenceDate || r.evidenceDate < hotCutoff) continue;
    const tower = String(r.subCommunity || r.drillCommunityBuilding || '').trim();
    if (!tower || !r.bedKey || r.bedKey === 'Other') continue;
    const uk = hotUnitTypeKeyFromSales(r.unitType);
    const key = `${normalizeCommunityKey(tower)}|${r.bedKey}|${uk}`;
    const cur = txnByBuildingBedAgg.get(key) || { sum: 0, count: 0 };
    cur.sum += Number(r.priceAed) || 0;
    cur.count += 1;
    txnByBuildingBedAgg.set(key, cur);
  }
  const sale_txn_by_building_bed = {};
  for (const [key, agg] of txnByBuildingBedAgg.entries()) {
    if (agg.count < hotMinTxn) continue;
    const avg = agg.sum / agg.count;
    if (!(avg > 0)) continue;
    sale_txn_by_building_bed[key] = { avg: Math.round(avg), n: agg.count };
  }

  const unitTypeLabel = (u) =>
    u === 'apt' ? 'Apartment' : u === 'villa' ? 'Villa' : u === 'townhouse' ? 'Townhouse' : 'Other';
  const recent_sales_transactions = [...records]
    .filter((r) => r.evidenceDate)
    .sort((a, b) => b.evidenceDate - a.evidenceDate)
    .slice(0, 25)
    .map((r) => ({
      date: fmtDate(r.evidenceDate),
      area: r.area || '—',
      location: r.subCommunity || r.drillCommunityBuilding || '—',
      unit_no: r.unitNumber ? String(r.unitNumber) : '—',
      beds: r.bedKey && r.bedKey !== 'Other' ? (r.bedKey === 'Studio' ? 'Studio' : r.bedKey === '4+' ? '4+' : `${r.bedKey} Bed`) : '—',
      unit_type: unitTypeLabel(r.unitType),
      segment: r.segment === 'offplan' ? 'Off-plan' : r.segment === 'secondary' ? 'Secondary' : '—',
      price_fmt: `AED ${fmtCompact(r.priceAed)}`,
      psf_fmt: r.psfAed != null ? String(Math.round(r.psfAed)) : '—',
    }));

  return {
    ok: true,
    charts_30d,
    recent_sales_transactions,
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
      townhouse_psf_aed: avgPsf('townhouse') ? String(Math.round(avgPsf('townhouse'))) : 'N/A',
      apt_avg_aed: `AED ${fmtCompact(avgDeal('apt'))}`,
      villa_avg_aed: `AED ${fmtCompact(avgDeal('villa'))}`,
      townhouse_avg_aed: `AED ${fmtCompact(avgDeal('townhouse'))}`,
      apt_avg_aed_num: avgDeal('apt') ?? null,
      villa_avg_aed_num: avgDeal('villa') ?? null,
      townhouse_avg_aed_num: avgDeal('townhouse') ?? null,
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
    top_areas_mode: drillDown ? 'sub_community' : 'area',
    top_areas_empty_hint:
      drillDown && topAreas.length === 0
        ? 'No building-level rows in the last 7 days: fill sub community / building.1, or use Community/Building when it differs from the area name.'
        : null,
    yields: { apt_gross_yield: 'N/A', villa_gross_yield: 'N/A', townhouse_gross_yield: 'N/A', best_yield_area: 'N/A', best_yield_pct: 'N/A', yield_vs_mortgage: 'N/A', yield_source: source, yield_period: period },
    supply: { pipeline_units_2025_26: 'N/A', completions_ytd: 'N/A', new_launches_this_month: 'N/A', absorption_rate: 'N/A', oversupply_risk: 'N/A', notable_launches: 'N/A', supply_source: source },
    rental: { apt_1br_avg_aed: 'N/A', apt_2br_avg_aed: 'N/A', villa_3br_avg_aed: 'N/A', rental_index_chg_yoy: 'N/A', ejari_registrations_weekly: 'N/A', vacancy_rate: 'N/A', landlord_vs_tenant: 'balanced', note: 'Rental/listing feeds are not connected yet. This dashboard currently uses sales transactions only.', rental_source: source, rental_period: period },
    mortgage: { typical_rate_pct: 'N/A', rate_type: 'variable', ltv_max_pct: 'N/A', avg_loan_size_aed: 'N/A', mortgage_share_of_sales_pct: 'N/A', financing_conditions: 'N/A', mortgage_source: source },
    owner_briefing: filterArea
      ? `Area filter “${filterArea}”. Rolling 7 days (${thisWeekLabel}, Dubai): ${weekCount.toLocaleString('en-US')} transactions worth AED ${fmtCompact(weekValue)}. Prior 7 days: ${prevCount.toLocaleString('en-US')} deals. Off-plan ${offplanPct == null ? 'N/A' : offplanPct + '%'}.`
      : `Rolling 7 days through today (${thisWeekLabel}, Dubai): ${weekCount.toLocaleString('en-US')} transactions in your CSV worth AED ${fmtCompact(weekValue)}. Prior 7 days (${prevLabel}): ${prevCount.toLocaleString('en-US')} deals. Off-plan share ${offplanPct == null ? 'N/A' : offplanPct + '%'} (Oqood-tagged rows).`,
    data_freshness: latestDate ? `Transactions through ${fmtDate(latestDate)}` : period,
    sources_used: [source],
    sale_txn_avg_by_beds,
    sale_txn_by_building_bed,
    sale_hot_listings_lookback_days: String(hotLookbackDays),
    sale_hot_listings_min_txn: String(hotMinTxn),
    _stats_for_ai: {
      window: 'rolling_7d_dubai_vs_prior_7d',
      this_week_period: thisWeekLabel,
      prev_week_period: prevLabel,
      week_count: weekCount,
      prev_week_count: prevCount,
      week_value_aed: Math.round(weekValue),
      prev_week_value_aed: Math.round(prevValue),
      offplan_pct: offplanPct,
      top_areas: topAreas,
      apt_psf_aed: avgPsf('apt') ? Math.round(avgPsf('apt')) : null,
      villa_psf_aed: avgPsf('villa') ? Math.round(avgPsf('villa')) : null,
      townhouse_psf_aed: avgPsf('townhouse') ? Math.round(avgPsf('townhouse')) : null,
    },
  };
}

/**
 * Rolling windows in Asia/Dubai (calendar days, inclusive).
 * Current: today 00:00 through today 23:59 + 6 prior days = 7 days including today.
 * Previous: the 7 calendar days immediately before that (for WoW-style %).
 */
export function deriveAnalysisWindows(_records) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  const weekEnd = new Date(now);
  weekEnd.setHours(23, 59, 59, 999);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const prevEnd = new Date(weekStart);
  prevEnd.setDate(weekStart.getDate() - 1);
  prevEnd.setHours(23, 59, 59, 999);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - 6);
  prevStart.setHours(0, 0, 0, 0);

  return { weekStart, weekEnd, prevStart, prevEnd };
}

/**
 * @param {string} csvRaw
 * @param {string} label - shown in sources (e.g. file name)
 * @param {{ area?: string, communityAliasMap?: Map<string, string>|null }} [options] - if area set, filter by community (normalized match + optional aliases)
 * @returns {{ ok: true, body: object } | { ok: false, status: number, body: object }}
 */
export function buildPayloadFromCsvText(csvRaw, label = 'uploaded.csv', options = {}) {
  /** @type {string[]} */
  let headers = [];
  /** @type {Record<string, string|null>} */
  let columnMap = {};
  let psfAltHeader = null;

  function resolveSalesColumns(h) {
    headers = h;
    columnMap = {
      evidenceDate: pickColumn(headers, ['Evidence Date', 'Date', 'Transaction Date', 'Sale Date']),
      area: pickColumn(headers, ['All Developments', 'all developments', 'Area', 'Project Name', 'Community']),
      subCommunityTower: pickSubCommunityBuilding1(headers),
      communityBuilding: pickColumn(headers, [
        'Community/Building',
        'community/building',
      ]),
      subCommunityAlt: pickColumn(headers, [
        'Sub Community / Building',
        'sub community / building',
        'Sub Community',
        'Building',
        'Tower',
      ]),
      segment: pickColumn(headers, ['Select Data Points', 'Data Point', 'Transaction Type', 'Registration Type']),
      unitNumber: pickColumn(headers, [
        'Unit Number',
        'Unit No',
        'Unit No.',
        'Property Number',
        'Door Number',
        'Municipality Number',
      ]),
      unitType: pickColumn(headers, ['Unit Type', 'Property Type', 'Unit Category', 'Type']),
      bedrooms: pickColumn(headers, ['bedrooms', 'Bedrooms', 'beds', 'Beds', 'bed', 'Bed', 'Bedroom']),
      priceAed: pickColumn(headers, ['Price (AED)', 'Price AED', 'Sale Price', 'Amount', 'Value', 'Property Value']),
      psfAed: pickColumn(headers, ['Price (AED/sq ft)', 'Price per sq ft', 'Price psf', 'AED/sqft']),
    };
    psfAltHeader = null;
    if (columnMap.psfAed) {
      const normMain = normalizeKey(columnMap.psfAed);
      psfAltHeader =
        headers.find(
          (hn) => hn !== columnMap.psfAed && normalizeKey(hn) === normMain,
        ) || null;
    }
  }

  const records = [];
  const areaSet = new Set();

  forEachCsvObject(
    csvRaw,
    (r) => {
      if (!columnMap.evidenceDate || !columnMap.priceAed) return;
      const unitTypeRaw = String(getWithAliases(r, [columnMap.unitType]) || '').toLowerCase();
      const select = String(getWithAliases(r, [columnMap.segment]) || '').trim().toLowerCase();

      const unitType = unitTypeRaw.includes('townhouse') ? 'townhouse'
        : unitTypeRaw.includes('villa') ? 'villa'
        : unitTypeRaw.includes('apartment') || unitTypeRaw.includes('hotel apartment') ? 'apt'
        : 'other';

      const areaVal = columnMap.area ? String(getWithAliases(r, [columnMap.area])).trim() : '';
      const cbVal = columnMap.communityBuilding
        ? String(getWithAliases(r, [columnMap.communityBuilding])).trim()
        : '';
      let towerVal = columnMap.subCommunityTower
        ? String(getWithAliases(r, [columnMap.subCommunityTower])).trim()
        : '';
      if (!towerVal && columnMap.subCommunityAlt) {
        towerVal = String(getWithAliases(r, [columnMap.subCommunityAlt])).trim();
      }
      let subVal = towerVal || cbVal || null;
      if (subVal && areaVal && normalizeKey(subVal) === normalizeKey(areaVal)) subVal = null;
      if (!areaVal && (cbVal || towerVal)) {
        /* CSV has only building column — use it for area filter + row label */
      }
      const unitNumRaw = columnMap.unitNumber
        ? String(getWithAliases(r, [columnMap.unitNumber]) || '').trim()
        : '';
      const rec = {
        evidenceDate: parseDubaiEvidenceDate(getWithAliases(r, [columnMap.evidenceDate])),
        area: areaVal || cbVal || towerVal || 'Unknown',
        subCommunity: subVal || null,
        drillCommunityBuilding: cbVal || null,
        segment: select.includes('oqood') ? 'offplan' : select.includes('title deed') ? 'secondary' : 'unknown',
        unitNumber: unitNumRaw || null,
        unitType,
        bedKey: columnMap.bedrooms ? normalizeBedKey(getWithAliases(r, [columnMap.bedrooms])) : null,
        priceAed: parseNumber(getWithAliases(r, [columnMap.priceAed])),
        psfAed: parseNumber(
          getWithAliases(r, [columnMap.psfAed, psfAltHeader].filter(Boolean)),
        ),
      };
      if (rec.evidenceDate && rec.priceAed) {
        records.push(rec);
        if (rec.area) areaSet.add(rec.area);
      }
    },
    { onHeader: (h) => resolveSalesColumns(h) },
  );

  if (!columnMap.evidenceDate || !columnMap.priceAed) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error: 'CSV schema not recognized. Required columns missing: transaction date and/or price.',
        expected: {
          evidenceDate: ['Evidence Date', 'Date', 'Transaction Date', 'Sale Date'],
          priceAed: ['Price (AED)', 'Price AED', 'Sale Price', 'Amount', 'Value'],
        },
        detected_headers: headers,
      },
    };
  }

  if (!records.length) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error: 'CSV was found but no valid sales records could be parsed (date/price may be malformed).',
        detected_headers: headers,
      },
    };
  }

  const areaOptions = [...areaSet].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );

  const areaFilter = (options.area || '').trim();
  const communityAliasMap = options.communityAliasMap ?? getCommunityAliasMapFromEnv();
  const filteredRecords =
    areaFilter && areaFilter !== '__all__'
      ? records.filter((r) => communitiesMatch(r.area, areaFilter, communityAliasMap))
      : records;

  if (areaFilter && areaFilter !== '__all__' && !filteredRecords.length) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error: `No transactions for area “${areaFilter}”. Choose another area or clear the filter.`,
        area_options: areaOptions,
      },
    };
  }

  const windows = deriveAnalysisWindows(filteredRecords);
  const payload = buildFromSalesRecords({
    records: filteredRecords,
    ...windows,
    csvPath: label,
    filterArea: areaFilter && areaFilter !== '__all__' ? areaFilter : null,
  });
  payload.area_options = areaOptions;
  payload.filter_area = areaFilter && areaFilter !== '__all__' ? areaFilter : null;
  return { ok: true, status: 200, body: payload, windows };
}

