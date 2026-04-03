/**
 * Active listings CSV → dashboard payload.
 * Columns: building, community, emirate, bedrooms, bathrooms, price_aed, listed_date, url (optional)
 * Pure function — no filesystem / fetch. Works in Node and browser.
 */

import { forEachCsvObject, deriveAnalysisWindows } from './salesCsvPayload.js';
import { communitiesMatch, getCommunityAliasMapFromEnv, normalizeCommunityKey } from './communityMatch.js';
import { hotUnitTypeLabel, normalizeUnitTypeKeyFromString } from './unitType.js';

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

/** Listing CSVs often ship "AED 90,000", "90,000 AED", or spaced digits — not plain `Number()`. */
function parseListingsPrice(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s || s === '-') return null;
  s = s
    .replace(/^[\s\u00A0]*(?:AED|د\.?إ?|\$|USD|EUR)[\s\u00A0]*/i, '')
    .replace(/[\s\u00A0]*(?:AED|د\.?إ?)[\s\u00A0]*$/i, '')
    .trim();
  s = s.replace(/,/g, '');
  const direct = Number(s);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const compact = s.replace(/\s+/g, '');
  const v2 = Number(compact);
  if (Number.isFinite(v2) && v2 > 0) return v2;
  const m = s.match(/-?\d[\d\s]*\.?\d*|\d+\.\d+/);
  if (m) {
    const v3 = Number(String(m[0]).replace(/\s/g, ''));
    if (Number.isFinite(v3) && v3 > 0) return v3;
  }
  return null;
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

export function normalizeBedKey(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s === '0' || s === 'studio' || /^studio\b/.test(s)) return 'Studio';
  const n = parseInt(s, 10);
  if (Number.isFinite(n)) return n >= 4 ? '4+' : String(n);
  return 'Other';
}

const BED_ORDER = ['Studio', '1', '2', '3', '4+', 'Other'];

function bedDisplayLabel(bedKey) {
  if (bedKey === 'Studio') return 'Studio';
  if (bedKey === '4+') return '4+ Bed';
  if (/^[1-3]$/.test(bedKey)) return `${bedKey} Bed`;
  return bedKey;
}

function normalizeListingUrl(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : null;
}

/**
 * Hot Listings: ≤30d listings where asking is below transacted average
 * for that specific building+bedroom bucket (rental or sale benchmarks).
 *
 * @param {Array<{ price: number, bedKey: string, unitTypeKey?: string, listedDate: Date|null, community: string, building: string, link: string|null }>} rows — area-filtered, valid price
 * @param {Date} thirtyDaysAgo
 * @param {boolean} dateColPresent
 * @param {Record<string, { avg: number, n: number }>} [txnBenchmarkByBuildingBed]
 * @param {'rental'|'sales'} [dataType]
 * @param {Record<string, { avg: number, n: number }>} [txnBenchmarkByCommunityBed] area + bed + type when area filter active (or per-row area unfiltered)
 * @param {string} [filterArea] used with listing community for community-key lookup when community cell is empty
 * @returns {{
 *   hot_listings: object[],
 *   hot_listings_by_type: { apartment: object[], villa: object[], townhouse: object[] },
 *   hot_listings_note: string|null
 * }}
 */
export function computeHotListings(
  rows,
  thirtyDaysAgo,
  dateColPresent,
  txnBenchmarkByBuildingBed = {},
  dataType = 'rental',
  txnBenchmarkByCommunityBed = {},
  filterArea = '',
) {
  if (!dateColPresent) {
    return {
      hot_listings: [],
      hot_listings_by_type: { apartment: [], villa: [], townhouse: [] },
      hot_listings_note: 'Add a Listed Date column to enable Hot Listings (last 30 days).',
    };
  }

  const recent = rows.filter(
    (r) => r.listedDate && r.listedDate >= thirtyDaysAgo && r.bedKey !== 'Other',
  );

  const hasAnyBench =
    Object.keys(txnBenchmarkByBuildingBed || {}).length > 0 ||
    Object.keys(txnBenchmarkByCommunityBed || {}).length > 0;

  /** @type {Array<{ community: string, building: string, beds: string, property_type: string, price_fmt: string, pct_drop: number, link: string|null, bed_label: string, market_avg_fmt: string, benchmark_n: number, benchmark_source: string }>} */
  const scored = [];

  for (const r of recent) {
    if (!r.building) continue;
    const uk =
      r.unitTypeKey === 'villa' || r.unitTypeKey === 'townhouse' ? r.unitTypeKey : 'apt';
    const bKey = `${normalizeCommunityKey(r.building)}|${r.bedKey}|${uk}`;
    let bench = txnBenchmarkByBuildingBed[bKey];
    let benchmark_source = 'building_txn';
    if (!bench || !(bench.avg > 0) || !(bench.n > 0)) {
      const commRaw = (r.community || '').trim() || (filterArea || '').trim();
      if (commRaw && Object.keys(txnBenchmarkByCommunityBed || {}).length > 0) {
        const cKey = `${normalizeCommunityKey(commRaw)}|${r.bedKey}|${uk}`;
        const cBench = txnBenchmarkByCommunityBed[cKey];
        if (cBench && cBench.avg > 0 && cBench.n > 0) {
          bench = cBench;
          benchmark_source = 'community_txn';
        }
      }
    }
    if (!bench || !(bench.avg > 0) || !(bench.n > 0)) continue;
    const t = Number(bench.avg);
    if (r.price >= t) continue;
    const pctDrop = ((t - r.price) / t) * 100;
    if (!Number.isFinite(pctDrop)) continue;
    scored.push({
      community: r.community || '—',
      building: r.building || '—',
      beds: bedDisplayLabel(r.bedKey),
      property_type: hotUnitTypeLabel(uk),
      price_fmt: fmtAed(r.price),
      pct_drop: parseFloat(pctDrop.toFixed(1)),
      link: r.link,
      bed_label: bedDisplayLabel(r.bedKey),
      market_avg_fmt: fmtAed(Math.round(t)),
      benchmark_n: bench.n,
      benchmark_source,
    });
  }

  scored.sort((a, b) => b.pct_drop - a.pct_drop);
  const hot_listings_by_type = {
    apartment: scored.filter((r) => r.property_type === 'Apartment').slice(0, 25),
    villa: scored.filter((r) => r.property_type === 'Villa').slice(0, 25),
    townhouse: scored.filter((r) => r.property_type === 'Townhouse').slice(0, 25),
  };
  // Backward-compatible field used by existing consumers.
  const hot_listings =
    hot_listings_by_type.apartment.length > 0
      ? hot_listings_by_type.apartment
      : scored.slice(0, 25);

  let hot_listings_note = null;
  if (recent.length === 0 && rows.length > 0) {
    hot_listings_note = 'No listings with a listed date in the last 30 days (or dates could not be parsed).';
  } else if (recent.length > 0 && !hasAnyBench) {
    hot_listings_note =
      dataType === 'sales'
        ? 'Hot Listings need transacted sale benchmarks by building + bedroom + property type in the selected area (sales CSV: Unit Type, Bedrooms, Sub Community / Building).'
        : 'Hot Listings need transacted rent benchmarks by building + bedroom + property type in the selected area (rental CSV: unit/building columns, Bedrooms). Optional Property Type on listings improves matching.';
  } else if (recent.length > 0 && hot_listings.length === 0 && hasAnyBench) {
    hot_listings_note =
      'No listings in the last 30 days are below the transacted average for their building + bedroom + property type, or below the community-level average when used as fallback.';
  }

  return { hot_listings, hot_listings_by_type, hot_listings_note };
}

/**
 * Parse a listings CSV and return aggregate analytics.
 * When listing price_aed represents asking annual rent (rental listings), pass rentalTxnAvgByBeds
 * so the by_beds table shows asking rent vs recently transacted rent.
 *
 * @param {string} csvRaw
 * @param {string} [label]
 * @param {{
 *   rentalTxnAvgByBeds?: { studio?: number, '1br'?: number, '2br'?: number, '3br'?: number },
 *   rentalAvgByBeds?:    { studio?: number, '1br'?: number, '2br'?: number, '3br'?: number },
 *   rentalTxnByBuildingBed?: Record<string, { avg: number, n: number }>,
 *   salesTxnAvgByBeds?:   { studio?: number, '1br'?: number, '2br'?: number, '3br'?: number },
 *   salesTxnByBuildingBed?: Record<string, { avg: number, n: number }>,
 *   rentalTxnByCommunityBed?: Record<string, { avg: number, n: number }>,
 *   salesTxnByCommunityBed?: Record<string, { avg: number, n: number }>,
 *   txnAvgByBeds?:       { studio?: number, '1br'?: number, '2br'?: number, '3br'?: number },
 *   dataType?:           'rental' | 'sales',
 *   communityAliasMap?: Map<string, string>|null,
 *   filterArea?: string,
 *   skipHotListings?: boolean,
 * }} [opts]
 * @returns {{ ok: boolean, listings?: object, error?: string }}
 */
export function buildListingsPayload(csvRaw, label = 'listings.csv', opts = {}) {
  if (!String(csvRaw || '').trim()) {
    return { ok: false, error: 'Listings CSV is empty.' };
  }

  /** @type {string|null} */
  let buildingCol = null;
  let communityCol = null;
  let emirateCol = null;
  let bedsCol = null;
  let bathsCol = null;
  let priceCol = null;
  let dateCol = null;
  let linkCol = null;
  let unitTypeCol = null;
  let columnsResolved = false;

  const filterArea = (opts.filterArea || '').trim();
  const communityAliasMap = opts.communityAliasMap ?? getCommunityAliasMapFromEnv();
  const skipHotListings = !!opts.skipHotListings;

  const now = new Date();
  const { weekStart, weekEnd, prevStart, prevEnd } = deriveAnalysisWindows([]);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  /** @type {Array<{ price: number, bedKey: string, unitTypeKey: string, listedDate: Date|null, community: string, building: string, link: string|null }>} */
  const listingRows = [];

  let total = 0;
  let new_this_week = 0;
  let new_prev_7_days = 0;
  /** @type {Record<string, { count: number, sum: number, min: number, max: number }>} */
  const byBedsAgg = {};
  const communityCounts = {};
  const buildingCounts = {};
  const emirateCounts = {};

  let dbgRowsTotal = 0;
  let dbgSkippedArea = 0;
  let dbgAfterArea = 0;
  let dbgInvalidPrice = 0;
  /** @type {string[]} */
  const dbgInvalidPriceSamples = [];

  function resolveColumns(headerNames) {
    buildingCol  = pickColumn(headerNames, ['building', 'Building', 'Tower', 'tower', 'Project Name']);
    communityCol = pickColumn(headerNames, ['community', 'Community', 'area', 'Area', 'Location', 'Master Community', 'Project']);
    emirateCol   = pickColumn(headerNames, ['emirate', 'Emirate', 'city', 'City', 'Region']);
    bedsCol      = pickColumn(headerNames, ['bedrooms', 'Bedrooms', 'beds', 'Beds', 'bed', 'Bed', 'Bedroom']);
    bathsCol     = pickColumn(headerNames, ['bathrooms', 'Bathrooms', 'baths', 'Baths', 'bath', 'Bath', 'Bathroom']);
    priceCol     = pickColumn(headerNames, [
      'price_aed',
      'Price AED',
      'Price (AED)',
      'Asking Price (AED)',
      'Sale Price',
      'Sale Price (AED)',
      'Total Price',
      'Annual Rent',
      'Annual Rent (AED)',
      'Yearly Rent',
      'Rental Price',
      'price',
      'Price',
      'asking_price',
      'list_price',
      'Asking Price',
      'Listing Price',
    ]);
    dateCol      = pickColumn(headerNames, ['listed_date', 'Listed Date', 'list_date', 'listing_date', 'Created Date', 'Date Listed', 'date', 'Date']);
    linkCol      = pickColumn(headerNames, ['url', 'URL', 'link', 'Link', 'Listing URL', 'listing_url', 'Property URL', 'Portal URL', 'Portal Link']);
    unitTypeCol  = pickColumn(headerNames, [
      'Unit Type',
      'Property Type',
      'Property Category',
      'Unit Category',
      'Listing Type',
    ]);
    columnsResolved = true;
  }

  try {
    forEachCsvObject(
      csvRaw,
      (row) => {
      if (!priceCol) return;

      dbgRowsTotal += 1;

      if (filterArea && communityCol) {
        const comm = getVal(row, communityCol);
        if (!communitiesMatch(comm, filterArea, communityAliasMap)) {
          dbgSkippedArea += 1;
          return;
        }
      }

      dbgAfterArea += 1;
      const rawPrice = getVal(row, priceCol);
      const price = parseListingsPrice(rawPrice);
      if (!price || price <= 0) {
        dbgInvalidPrice += 1;
        if (dbgInvalidPriceSamples.length < 8) {
          dbgInvalidPriceSamples.push(rawPrice.length > 120 ? `${rawPrice.slice(0, 117)}…` : rawPrice);
        }
        return;
      }

      total++;

      let listedDate = null;
      if (dateCol) {
        listedDate = parseListingDate(getVal(row, dateCol));
        if (listedDate) {
          const t = listedDate.getTime();
          if (t >= weekStart.getTime() && t <= weekEnd.getTime()) new_this_week++;
          else if (t >= prevStart.getTime() && t <= prevEnd.getTime()) new_prev_7_days++;
        }
      }

      const bedKey = bedsCol ? normalizeBedKey(getVal(row, bedsCol)) : 'Other';
      if (!byBedsAgg[bedKey]) {
        byBedsAgg[bedKey] = { count: 0, sum: 0, min: Infinity, max: -Infinity };
      }
      const agg = byBedsAgg[bedKey];
      agg.count++;
      agg.sum += price;
      agg.min = Math.min(agg.min, price);
      agg.max = Math.max(agg.max, price);

      const comm = communityCol ? getVal(row, communityCol) : '';
      if (comm) communityCounts[comm] = (communityCounts[comm] || 0) + 1;

      const bldg = buildingCol ? getVal(row, buildingCol) : '';
      if (bldg) buildingCounts[bldg] = (buildingCounts[bldg] || 0) + 1;

      const emir = emirateCol ? getVal(row, emirateCol) : '';
      if (emir) emirateCounts[emir] = (emirateCounts[emir] || 0) + 1;

      const link = linkCol ? normalizeListingUrl(getVal(row, linkCol)) : null;
      const unitTypeKey = unitTypeCol
        ? normalizeUnitTypeKeyFromString(getVal(row, unitTypeCol))
        : 'apt';
      listingRows.push({
        price,
        bedKey,
        unitTypeKey,
        listedDate,
        community: comm,
        building: bldg,
        link,
      });
      },
      { onHeader: (headerNames) => resolveColumns(headerNames) },
    );
  } catch (e) {
    return { ok: false, error: `Failed to parse listings CSV: ${e?.message || e}` };
  }

  if (!columnsResolved || !priceCol) {
    return { ok: false, error: 'Listings CSV: could not find a price column (expected: price_aed).' };
  }

  if (total === 0) {
    if (dbgRowsTotal === 0) {
      return { ok: false, error: 'Listings CSV: file has no data rows (or only a header).' };
    }
    if (filterArea && communityCol && dbgSkippedArea === dbgRowsTotal) {
      return {
        ok: false,
        error: `Listings CSV: area filter “${filterArea}” matched no rows in the community/area column. Check spelling vs your CSV or set COMMUNITY_ALIAS_JSON.`,
      };
    }
    if (dbgAfterArea > 0 && dbgInvalidPrice === dbgAfterArea) {
      return {
        ok: false,
        error:
          'Listings CSV: price column is present but no numeric prices parsed (strip currency text or use digits only, e.g. 90000).',
      };
    }
    return { ok: false, error: 'Listings CSV: no rows with a valid price_aed value.' };
  }

  // by_beds — ordered and with formatted values (running min/max/sum — no giant price arrays)
  const by_beds = {};
  const allBedKeys = [...new Set([...BED_ORDER, ...Object.keys(byBedsAgg)])];
  for (const key of allBedKeys) {
    if (!byBedsAgg[key]) continue;
    const { count, sum, min, max } = byBedsAgg[key];
    const avg = Math.round(sum / count);
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
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // When filtered to a specific area, drill down to buildings; otherwise show communities
  const listings_top_mode = filterArea ? 'building' : 'community';

  const by_emirate = Object.fromEntries(
    Object.entries(emirateCounts).sort((a, b) => b[1] - a[1])
  );

  // For rental listings: compare asking rent (listing price_aed) vs recently transacted rent.
  // delta_pct > 0 means asking above market; < 0 means asking below market.
  const asking_vs_txn_by_beds = {};
  const {
    rentalTxnAvgByBeds,
    rentalAvgByBeds = {},
    rentalTxnByBuildingBed = {},
    salesTxnAvgByBeds = {},
    salesTxnByBuildingBed = {},
    rentalTxnByCommunityBed = {},
    salesTxnByCommunityBed = {},
    dataType = 'rental',
  } = opts;
  // Support legacy rentalAvgByBeds param; sales mode uses salesTxnAvgByBeds from transactions CSV
  const txnRefForBeds =
    dataType === 'sales' ? salesTxnAvgByBeds : rentalTxnAvgByBeds || rentalAvgByBeds;

  const bedToRefKey = { Studio: 'studio', '1': '1br', '2': '2br', '3': '3br' };
  for (const [bedKey, data] of Object.entries(by_beds)) {
    const refKey = bedToRefKey[bedKey];
    if (!refKey) continue;
    const txnAvg = txnRefForBeds[refKey];
    if (!txnAvg || txnAvg <= 0 || data.avg_price <= 0) continue;

    const deltaPct = ((data.avg_price - txnAvg) / txnAvg) * 100;
    asking_vs_txn_by_beds[bedKey] = {
      delta_pct:    Number.isFinite(deltaPct) ? parseFloat(deltaPct.toFixed(1)) : null,
      asking_avg:   data.avg_price,
      txn_avg:      txnAvg,
      asking_fmt:   fmtAed(data.avg_price),
      txn_fmt:      fmtAed(txnAvg),
    };
  }

  const wow_new_listings_pct = new_prev_7_days > 0
    ? parseFloat((((new_this_week - new_prev_7_days) / new_prev_7_days) * 100).toFixed(1))
    : null;

  const benchmarkMap =
    dataType === 'sales' ? salesTxnByBuildingBed || {} : rentalTxnByBuildingBed || {};
  const communityBenchMap =
    dataType === 'sales' ? salesTxnByCommunityBed || {} : rentalTxnByCommunityBed || {};

  const { hot_listings, hot_listings_by_type, hot_listings_note } = skipHotListings
    ? {
        hot_listings: [],
        hot_listings_by_type: {
          apartment: [],
          villa: [],
          townhouse: [],
        },
        hot_listings_note: 'Hot Listings skipped in partial refresh for speed.',
      }
    : computeHotListings(
        listingRows,
        thirtyDaysAgo,
        !!dateCol,
        benchmarkMap,
        dataType,
        communityBenchMap,
        filterArea,
      );

  const hot_listings_rules =
    dataType === 'sales'
      ? 'Top 25 asks below average transacted sale price per building + bedroom + property type (apartment / villa / townhouse) within the selected area — sales CSV, last 30 days of listings. If a building has too few comparable sales, the community + bedroom + type average is used instead.'
      : 'Top 25 asks below average transacted rent per building + bedroom + property type (apartment / villa / townhouse) within the selected area — rental CSV, last 30 days of listings. If a building has too few comparable rentals, the community + bedroom + type average is used instead.';

  /** Same Dubai calendar week as sales/rental weekly cards (7 days including today). */
  let listings_added_by_day = [];
  let listings_added_prev_by_day = [];
  let listings_added_period = null;
  let listings_added_period_prior = null;
  /** @type {null | { avg_per_day_current: number, avg_per_day_prior: number, pct_of_inventory_week: number | null, peak_day_current: { label: string, count: number }, peak_day_prior: { label: string, count: number } }} */
  let listings_flow = null;
  if (dateCol) {
    const daySlots = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      const date = day.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
      const label = day.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Dubai',
      });
      daySlots.push({ date, label, count: 0 });
    }
    const countByKey = new Map(daySlots.map((d) => [d.date, 0]));
    for (const r of listingRows) {
      if (!r.listedDate) continue;
      const k = r.listedDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
      if (countByKey.has(k)) countByKey.set(k, (countByKey.get(k) || 0) + 1);
    }
    listings_added_by_day = daySlots.map(({ date, label }) => ({
      date,
      label,
      count: countByKey.get(date) || 0,
    }));

    const prevDaySlots = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(prevStart);
      day.setDate(prevStart.getDate() + i);
      const date = day.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
      const labelP = day.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Dubai',
      });
      prevDaySlots.push({ date, label: labelP, count: 0 });
    }
    const prevCountByKey = new Map(prevDaySlots.map((d) => [d.date, 0]));
    for (const r of listingRows) {
      if (!r.listedDate) continue;
      const k = r.listedDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
      if (prevCountByKey.has(k)) prevCountByKey.set(k, (prevCountByKey.get(k) || 0) + 1);
    }
    listings_added_prev_by_day = prevDaySlots.map(({ date, label }) => ({
      date,
      label,
      count: prevCountByKey.get(date) || 0,
    }));

    const w0 = weekStart.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Dubai',
    });
    const w1 = weekEnd.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Dubai',
    });
    listings_added_period = `${w0} – ${w1} (Dubai)`;

    const p0 = prevStart.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Dubai',
    });
    const p1 = prevEnd.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Dubai',
    });
    listings_added_period_prior = `${p0} – ${p1} (Dubai)`;

    const peakFrom = (arr) => {
      if (!arr.length) return { label: '—', count: 0 };
      let best = arr[0];
      for (const d of arr) {
        if (d.count > best.count) best = d;
      }
      return { label: best.label, count: best.count };
    };
    listings_flow = {
      avg_per_day_current: parseFloat((new_this_week / 7).toFixed(1)),
      avg_per_day_prior: parseFloat((new_prev_7_days / 7).toFixed(1)),
      pct_of_inventory_week:
        total > 0 ? parseFloat(((new_this_week / total) * 100).toFixed(1)) : null,
      peak_day_current: peakFrom(listings_added_by_day),
      peak_day_prior: peakFrom(listings_added_prev_by_day),
    };
  }

  return {
    ok: true,
    listings: {
      total,
      data_type: dataType,
      new_this_week:    dateCol ? new_this_week    : null,
      new_prev_7_days:  dateCol ? new_prev_7_days  : null,
      wow_new_pct:      dateCol ? wow_new_listings_pct : null,
      listings_added_by_day,
      listings_added_prev_by_day,
      listings_added_period,
      listings_added_period_prior,
      listings_flow,
      by_beds,
      top_communities,
      top_buildings,
      by_emirate,
      asking_vs_txn_by_beds,
      source: label,
      filter_area: filterArea || null,
      listings_top_mode,
      hot_listings,
      hot_listings_by_type,
      hot_listings_note,
      hot_listings_rules,
      columns_found: {
        building:    !!buildingCol,
        community:   !!communityCol,
        bedrooms:    !!bedsCol,
        bathrooms:   !!bathsCol,
        price_aed:   !!priceCol,
        listed_date: !!dateCol,
        link:        !!linkCol,
        property_type: !!unitTypeCol,
      },
    },
  };
}
