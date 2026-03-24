/**
 * Active listings CSV → dashboard payload.
 * Columns: building, community, emirate, bedrooms, bathrooms, price_aed, listed_date
 * Pure function — no filesystem / fetch. Works in Node and browser.
 */

import { parseCsv } from './salesCsvPayload.js';

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pickColumn(headers, aliases) {
  const normalized = headers.map(h => ({ raw: h, norm: normalizeKey(h) }));
  const byNorm = new Map(normalized.map(h => [h.norm, h.raw]));
  for (const alias of aliases) {
    const direct = byNorm.get(normalizeKey(alias));
    if (direct) return direct;
  }
  for (const alias of aliases) {
    const a = normalizeKey(alias);
    const tokens = a.split(' ').filter(Boolean);
    const partial = normalized.find(h => tokens.every(t => h.norm.includes(t)));
    if (partial) return partial.raw;
  }
  return null;
}

function getVal(row, col) {
  if (!col) return '';
  const v = row[col];
  return v !== undefined ? String(v).trim() : '';
}

function parseNumber(n) {
  if (n === null || n === undefined) return null;
  const s = String(n).replace(/,/g, '').trim();
  if (!s || s === '-') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function parseListingDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  const iso = new Date(t);
  if (!Number.isNaN(iso.getTime())) return iso;
  const slash = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (slash) {
    const d = parseInt(slash[1], 10);
    const m = parseInt(slash[2], 10) - 1;
    let y = parseInt(slash[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, m, d, 12, 0, 0));
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  // "01 Mar 2026" style
  const wordMonth = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (wordMonth) {
    const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const mon = months[wordMonth[2].slice(0,3).toLowerCase()];
    if (mon !== undefined) {
      const dt = new Date(Date.UTC(parseInt(wordMonth[1],10), mon, parseInt(wordMonth[3],10), 12, 0, 0));
      if (!Number.isNaN(dt.getTime())) return dt;
    }
  }
  return null;
}

function fmtAed(v) {
  if (!v || !Number.isFinite(v)) return 'N/A';
  if (v >= 1e6) return 'AED ' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (v >= 1e3) return 'AED ' + Math.round(v).toLocaleString('en-US');
  return 'AED ' + String(Math.round(v));
}

function normalizeBedKey(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s === '0' || s === 'studio' || /^studio\b/.test(s)) return 'Studio';
  const n = parseInt(s, 10);
  if (Number.isFinite(n)) return n >= 4 ? '4+' : String(n);
  return 'Other';
}

const BED_ORDER = ['Studio', '1', '2', '3', '4+', 'Other'];

/**
 * Parse a listings CSV and return aggregate analytics.
 * When listing price_aed represents asking annual rent (rental listings), pass rentalTxnAvgByBeds
 * so the by_beds table shows asking rent vs recently transacted rent.
 *
 * @param {string} csvRaw
 * @param {string} [label]
 * @param {{
 *   rentalTxnAvgByBeds?: { studio?: number, '1br'?: number, '2br'?: number, '3br'?: number },
 *   /** @deprecated use rentalTxnAvgByBeds — kept for back-compat */
 *   rentalAvgByBeds?:    { studio?: number, '1br'?: number, '2br'?: number, '3br'?: number },
 *   txnAvgByBeds?:       { studio?: number, '1br'?: number, '2br'?: number, '3br'?: number },
 *   dataType?:           'rental' | 'sales',
 * }} [opts]
 * @returns {{ ok: boolean, listings?: object, error?: string }}
 */
export function buildListingsPayload(csvRaw, label = 'listings.csv', opts = {}) {
  let rows;
  try {
    rows = parseCsv(csvRaw);
  } catch (e) {
    return { ok: false, error: `Failed to parse listings CSV: ${e?.message || e}` };
  }

  if (!rows.length) {
    return { ok: false, error: 'Listings CSV is empty.' };
  }

  const headers = Object.keys(rows[0] || {});

  const buildingCol  = pickColumn(headers, ['building', 'Building', 'Tower', 'tower', 'Project Name']);
  const communityCol = pickColumn(headers, ['community', 'Community', 'area', 'Area', 'Location', 'Master Community', 'Project']);
  const emirateCol   = pickColumn(headers, ['emirate', 'Emirate', 'city', 'City', 'Region']);
  const bedsCol      = pickColumn(headers, ['bedrooms', 'Bedrooms', 'beds', 'Beds', 'bed', 'Bed', 'Bedroom']);
  const bathsCol     = pickColumn(headers, ['bathrooms', 'Bathrooms', 'baths', 'Baths', 'bath', 'Bath', 'Bathroom']);
  const priceCol     = pickColumn(headers, ['price_aed', 'Price AED', 'Price (AED)', 'price', 'Price', 'asking_price', 'list_price', 'Asking Price', 'Listing Price']);
  const dateCol      = pickColumn(headers, ['listed_date', 'Listed Date', 'list_date', 'listing_date', 'Created Date', 'Date Listed', 'date', 'Date']);

  if (!priceCol) {
    return { ok: false, error: 'Listings CSV: could not find a price column (expected: price_aed).' };
  }

  const now = new Date();
  const sevenDaysAgo  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  let total = 0;
  let new_this_week = 0;
  let new_prev_7_days = 0;
  const byBeds = {};
  const communityCounts = {};
  const buildingCounts = {};
  const emirateCounts = {};

  for (const row of rows) {
    const price = parseNumber(getVal(row, priceCol));
    if (!price || price <= 0) continue;

    total++;

    if (dateCol) {
      const d = parseListingDate(getVal(row, dateCol));
      if (d) {
        if (d >= sevenDaysAgo) new_this_week++;
        else if (d >= fourteenDaysAgo) new_prev_7_days++;
      }
    }

    const bedKey = bedsCol ? normalizeBedKey(getVal(row, bedsCol)) : 'Other';
    if (!byBeds[bedKey]) byBeds[bedKey] = { count: 0, prices: [] };
    byBeds[bedKey].count++;
    byBeds[bedKey].prices.push(price);

    const comm = communityCol ? getVal(row, communityCol) : '';
    if (comm) communityCounts[comm] = (communityCounts[comm] || 0) + 1;

    const bldg = buildingCol ? getVal(row, buildingCol) : '';
    if (bldg) buildingCounts[bldg] = (buildingCounts[bldg] || 0) + 1;

    const emir = emirateCol ? getVal(row, emirateCol) : '';
    if (emir) emirateCounts[emir] = (emirateCounts[emir] || 0) + 1;
  }

  if (total === 0) {
    return { ok: false, error: 'Listings CSV: no rows with a valid price_aed value.' };
  }

  // by_beds — ordered and with formatted values
  const by_beds = {};
  const allBedKeys = [...new Set([...BED_ORDER, ...Object.keys(byBeds)])];
  for (const key of allBedKeys) {
    if (!byBeds[key]) continue;
    const { count, prices } = byBeds[key];
    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    by_beds[key] = {
      count,
      avg_price:     avg,
      avg_price_fmt: fmtAed(avg),
      min_price_fmt: fmtAed(min),
      max_price_fmt: fmtAed(max),
    };
  }

  const top_communities = Object.entries(communityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const top_buildings = Object.entries(buildingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const by_emirate = Object.fromEntries(
    Object.entries(emirateCounts).sort((a, b) => b[1] - a[1])
  );

  // For rental listings: compare asking rent (listing price_aed) vs recently transacted rent.
  // delta_pct > 0 means asking above market; < 0 means asking below market.
  const asking_vs_txn_by_beds = {};
  const { rentalTxnAvgByBeds, rentalAvgByBeds = {}, dataType = 'rental' } = opts;
  // Support legacy rentalAvgByBeds param
  const txnRentRef = rentalTxnAvgByBeds || rentalAvgByBeds;

  const rentKeyMap = { Studio: 'studio', '1': '1br', '2': '2br', '3': '3br' };
  for (const [bedKey, data] of Object.entries(by_beds)) {
    const rentKey = rentKeyMap[bedKey];
    if (!rentKey) continue;
    const txnRent = txnRentRef[rentKey];
    if (!txnRent || txnRent <= 0 || data.avg_price <= 0) continue;

    const deltaPct = ((data.avg_price - txnRent) / txnRent) * 100;
    asking_vs_txn_by_beds[bedKey] = {
      delta_pct:    Number.isFinite(deltaPct) ? parseFloat(deltaPct.toFixed(1)) : null,
      asking_avg:   data.avg_price,
      txn_avg:      txnRent,
      asking_fmt:   fmtAed(data.avg_price),
      txn_fmt:      fmtAed(txnRent),
    };
  }

  const wow_new_listings_pct = new_prev_7_days > 0
    ? parseFloat((((new_this_week - new_prev_7_days) / new_prev_7_days) * 100).toFixed(1))
    : null;

  return {
    ok: true,
    listings: {
      total,
      data_type: dataType,
      new_this_week:    dateCol ? new_this_week    : null,
      new_prev_7_days:  dateCol ? new_prev_7_days  : null,
      wow_new_pct:      dateCol ? wow_new_listings_pct : null,
      by_beds,
      top_communities,
      top_buildings,
      by_emirate,
      asking_vs_txn_by_beds,
      source: label,
      columns_found: {
        building:    !!buildingCol,
        community:   !!communityCol,
        bedrooms:    !!bedsCol,
        bathrooms:   !!bathsCol,
        price_aed:   !!priceCol,
        listed_date: !!dateCol,
      },
    },
  };
}
