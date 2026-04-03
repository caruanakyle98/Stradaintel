import { put } from '@vercel/blob';

import { buildPayloadFromCsvText, deriveAnalysisWindows } from '../../../lib/salesCsvPayload.js';
import { mergeRentalIntoPayload } from '../../../lib/rentalCsvPayload.js';
import { buildListingsPayload } from '../../../lib/listingsCsvPayload.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function blobToken() {
  return (
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.vercel_blob_rw_token ||
    process.env.VERCEL_BLOB_READ_WRITE_TOKEN ||
    ''
  ).trim();
}

function snapshotPath() {
  return (process.env.PROP_SNAPSHOT_BLOB_PATH || 'stradaintel/property-latest.json').trim();
}

function adminToken() {
  return (process.env.INTEL_ADMIN_TOKEN || '').trim();
}

function tokenFromRequest(request) {
  const h = request.headers.get('x-intel-admin-token') || request.headers.get('authorization') || '';
  const fromHeader = h.startsWith('Bearer ') ? h.slice(7) : h;
  if (fromHeader.trim()) return fromHeader.trim();
  try {
    const u = new URL(typeof request?.url === 'string' ? request.url : 'http://localhost');
    return (u.searchParams.get('token') || '').trim();
  } catch {
    return '';
  }
}

/** Fetch URL as text; retry 502/503/504 a few times. */
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

async function loadCsvFromUrls(envVar, blobPathname) {
  const token = blobToken();
  const rawUrls = (envVar || '').split(/[,\n\r]+/).map(s => s.trim()).filter(u => u.startsWith('http'));
  const errs = [];

  for (const u of rawUrls) {
    try {
      return { text: await fetchText(u), label: u };
    } catch (e) {
      errs.push(`${u.slice(0, 48)}… → ${e?.message || e}`);
    }
  }

  if (token && blobPathname) {
    const { get } = await import('@vercel/blob');
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const out = await get(blobPathname, { access: 'public', token });
        if (out?.stream) {
          const text = await new Response(out.stream).text();
          if (text.length > 100) return { text, label: `blob:${blobPathname}` };
        }
        break;
      } catch (e) {
        if (attempt === 3) errs.push(`blob: ${e?.message || e}`);
        if (!(e?.message || '').includes('503') || attempt === 3) break;
        await new Promise(r => setTimeout(r, 400 * attempt));
      }
    }
  }

  throw new Error(`CSV load failed: ${errs.join(' | ') || 'no source configured'}`);
}

export async function POST(request) {
  const expected = adminToken();
  if (!expected) {
    return Response.json({ ok: false, error: 'INTEL_ADMIN_TOKEN not configured.' }, { status: 500 });
  }
  const got = tokenFromRequest(request);
  if (!got || got !== expected) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }
  const token = blobToken();
  if (!token) {
    return Response.json({ ok: false, error: 'Blob token missing. Set BLOB_READ_WRITE_TOKEN.' }, { status: 500 });
  }

  const t0 = Date.now();

  try {
    // 1. Load sales CSV
    const salesUrlEnv = process.env.PROPERTY_SALES_CSV_URL || '';
    const { text: salesRaw, label: salesLabel } = await loadCsvFromUrls(
      salesUrlEnv,
      process.env.BLOB_SALES_PATHNAME || 'stradaintel/sales.csv',
    );

    // 2. Start rental + listings fetches in parallel with sales parse
    const rentalUrlEnv = process.env.PROPERTY_RENTAL_CSV_URL || '';
    const listingsUrlEnv = (process.env.PROPERTY_LISTINGS_CSV_URL || '').trim();
    const salesListingsUrlEnv = (process.env.PROPERTY_SALES_LISTINGS_CSV_URL || '').trim();

    const rentalPromise = rentalUrlEnv
      ? loadCsvFromUrls(rentalUrlEnv, process.env.BLOB_RENTAL_PATHNAME || 'stradaintel/rentals.csv')
          .then(v => ({ ok: true, ...v }), e => ({ ok: false, error: e }))
      : Promise.resolve(null);

    const listingsPromise = listingsUrlEnv
      ? loadCsvFromUrls(listingsUrlEnv, null)
          .then(v => ({ ok: true, ...v }), e => ({ ok: false, error: e }))
      : Promise.resolve(null);

    const salesListingsPromise = salesListingsUrlEnv
      ? loadCsvFromUrls(salesListingsUrlEnv, null)
          .then(v => ({ ok: true, ...v }), e => ({ ok: false, error: e }))
      : Promise.resolve(null);

    // 3. Build sales payload
    const result = buildPayloadFromCsvText(salesRaw, salesLabel, {});
    if (!result.ok) {
      return Response.json({ ok: false, error: result.body?.error || 'Sales CSV parse failed' }, { status: 500 });
    }
    const payload = { ...result.body };
    const windows = result.windows;
    delete payload._stats_for_ai;

    // 4. Await all parallel CSV fetches
    const [rentalResult, listingsResult, salesListingsResult] = await Promise.all([
      rentalPromise,
      listingsPromise,
      salesListingsPromise,
    ]);

    // 5. Merge rental
    if (rentalResult?.ok && windows) {
      try {
        mergeRentalIntoPayload(payload, rentalResult.text, rentalResult.label, windows, {});
      } catch (e) {
        payload.rental = payload.rental || {};
        payload.rental.note = `Rental merge failed: ${e?.message || e}`;
      }
    } else if (rentalResult && !rentalResult.ok) {
      payload.rental = payload.rental || {};
      payload.rental.note = `Rental CSV failed: ${rentalResult.error?.message || rentalResult.error}`;
    }

    // 6. Merge rental listings
    if (listingsResult?.ok) {
      try {
        const rentalTxnAvgByBeds = {
          studio: parseFloat(payload.rental?.studio_avg_aed) || null,
          '1br':  parseFloat(payload.rental?.apt_1br_avg_aed) || null,
          '2br':  parseFloat(payload.rental?.apt_2br_avg_aed) || null,
          '3br':  parseFloat(payload.rental?.villa_3br_avg_aed) || null,
        };
        const rentalTxnByBuildingBed = payload.rental?.txn_by_building_bed || {};
        const rentalTxnByCommunityBed = payload.rental?.txn_by_community_bed || {};

        const built = buildListingsPayload(listingsResult.text, listingsResult.label, {
          rentalTxnAvgByBeds,
          rentalTxnByBuildingBed,
          rentalTxnByCommunityBed,
          dataType: 'rental',
          filterArea: '',
          skipHotListings: false,
        });

        if (built.ok && built.listings) {
          const weeklyRentals = parseInt(payload.weekly?.rent_volume?.value) || null;
          if (weeklyRentals && weeklyRentals > 0) {
            const weeksOfSupply = built.listings.total / weeklyRentals;
            built.listings.supply_depth = {
              weeks: parseFloat(weeksOfSupply.toFixed(1)),
              listings_total: built.listings.total,
              weekly_registrations: weeklyRentals,
              label: `${weeksOfSupply.toFixed(1)} weeks of rental listing cover`,
            };
          }
          payload.listings = built.listings;
        } else {
          payload.listings = { error: built.error, source: listingsResult.label };
        }
      } catch (e) {
        payload.listings = { error: `Listings build failed: ${e?.message || e}` };
      }
    }

    // 7. Merge sales listings
    if (salesListingsResult?.ok) {
      try {
        const salesTxnAvgByBeds = payload.sale_txn_avg_by_beds || {};
        const salesTxnByBuildingBed = payload.sale_txn_by_building_bed || {};
        const salesTxnByCommunityBed = payload.sale_txn_by_community_bed || {};

        const built = buildListingsPayload(salesListingsResult.text, salesListingsResult.label, {
          salesTxnAvgByBeds,
          salesTxnByBuildingBed,
          salesTxnByCommunityBed,
          dataType: 'sales',
          filterArea: '',
          skipHotListings: false,
        });

        if (built.ok && built.listings) {
          const weeklySales = parseInt(payload.weekly?.sale_volume?.value, 10) || null;
          if (weeklySales && weeklySales > 0) {
            const weeksOfSupply = built.listings.total / weeklySales;
            built.listings.supply_depth = {
              weeks: parseFloat(weeksOfSupply.toFixed(1)),
              listings_total: built.listings.total,
              weekly_registrations: weeklySales,
              label: `${weeksOfSupply.toFixed(1)} weeks of sales listing cover`,
            };
          }
          payload.sales_listings = built.listings;
        } else {
          payload.sales_listings = { error: built.error, source: salesListingsResult.label };
        }
      } catch (e) {
        payload.sales_listings = { error: `Sales listings build failed: ${e?.message || e}` };
      }
    }

    // 8. Stamp and save to Blob
    payload.ok = true;
    const stamped = {
      ...payload,
      snapshot_refreshed_at: new Date().toISOString(),
      snapshot_source: 'property-refresh',
    };

    const path = snapshotPath();
    const saved = await put(path, JSON.stringify(stamped), {
      access: 'public',
      token,
      contentType: 'application/json; charset=utf-8',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return Response.json({
      ok: true,
      snapshot_refreshed_at: stamped.snapshot_refreshed_at,
      snapshot_path: path,
      snapshot_url: saved?.url || null,
      build_ms: Date.now() - t0,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: 'Failed to refresh property snapshot.', detail: String(e?.message || e) },
      { status: 500 },
    );
  }
}
