import { buildListingsPayload } from '../../../lib/listingsCsvPayload.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Fetch URL as text; retry 502/503/504 a few times.
 * Per-attempt timeout avoids hanging until platform 504.
 */
async function fetchText(url, { timeoutMs = 50000, maxAttempts = 4 } = {}) {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Stradaintel/1' },
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);
      lastStatus = r.status;
      if (r.ok) return r.text();
      if (![502, 503, 504].includes(r.status) || attempt === maxAttempts) {
        throw new Error(`GET ${url} → HTTP ${r.status}`);
      }
    } catch (e) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') {
        if (attempt === maxAttempts) {
          throw new Error(`GET ${url} → timed out after ${timeoutMs}ms`);
        }
        continue;
      }
      throw e;
    }
  }
  throw new Error(`GET ${url} → HTTP ${lastStatus}`);
}

/**
 * Lightweight listings endpoint — accepts benchmarks via POST body,
 * downloads only the ONE listing CSV needed, and returns built listings.
 * No sales CSV download or parse. Runs in its own serverless invocation
 * with its own memory budget.
 *
 * Body: {
 *   dataType: 'rental' | 'sales',
 *   benchmarks: { txnAvgByBeds, txnByBuildingBed, txnByCommunityBed, weeklyVolume },
 *   area?: string,
 *   skipHotListings?: boolean,
 * }
 */
export async function POST(request) {
  const t0 = Date.now();
  try {
    const body = await request.json();
    const { dataType, benchmarks, area, skipHotListings } = body || {};

    if (!dataType || !['rental', 'sales'].includes(dataType)) {
      return Response.json(
        { ok: false, error: 'dataType must be "rental" or "sales".' },
        { status: 400 },
      );
    }

    const csvUrl =
      dataType === 'rental'
        ? (process.env.PROPERTY_LISTINGS_CSV_URL || '').trim()
        : (process.env.PROPERTY_SALES_LISTINGS_CSV_URL || '').trim();

    if (!csvUrl) {
      return Response.json(
        { ok: false, error: `No CSV URL configured for ${dataType} listings.` },
        { status: 500 },
      );
    }

    const bm = benchmarks || {};
    const filterArea = (area || '').trim();
    const areaFilterActive = !!(filterArea && filterArea !== '__all__');

    // Download the listing CSV (the only large file this function touches)
    const csvText = await fetchText(csvUrl);

    // Map benchmarks to the shape buildListingsPayload expects
    const opts =
      dataType === 'rental'
        ? {
            rentalTxnAvgByBeds: bm.txnAvgByBeds || {},
            rentalTxnByBuildingBed: bm.txnByBuildingBed || {},
            rentalTxnByCommunityBed: bm.txnByCommunityBed || {},
            dataType: 'rental',
            filterArea: areaFilterActive ? filterArea : '',
            skipHotListings: !!skipHotListings,
          }
        : {
            salesTxnAvgByBeds: bm.txnAvgByBeds || {},
            salesTxnByBuildingBed: bm.txnByBuildingBed || {},
            salesTxnByCommunityBed: bm.txnByCommunityBed || {},
            dataType: 'sales',
            filterArea: areaFilterActive ? filterArea : '',
            skipHotListings: !!skipHotListings,
          };

    const result = buildListingsPayload(csvText, csvUrl, opts);

    if (result.ok && result.listings) {
      // Calculate supply depth if weekly volume was provided
      const weeklyVolume = parseInt(bm.weeklyVolume, 10) || null;
      if (weeklyVolume && weeklyVolume > 0) {
        const weeksOfSupply = result.listings.total / weeklyVolume;
        result.listings.supply_depth = {
          weeks: parseFloat(weeksOfSupply.toFixed(1)),
          listings_total: result.listings.total,
          weekly_registrations: weeklyVolume,
          label: `${weeksOfSupply.toFixed(1)} weeks of ${dataType === 'rental' ? 'rental' : 'sales'} listing cover`,
        };
      }

      return Response.json({
        ok: true,
        data_type: dataType,
        listings: result.listings,
        build_ms: Date.now() - t0,
      });
    }

    return Response.json({
      ok: false,
      error: result.error || 'Listings build returned no data.',
      data_type: dataType,
    }, { status: 500 });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: `Listings build failed: ${e?.message || e}`,
        build_ms: Date.now() - t0,
      },
      { status: 500 },
    );
  }
}
