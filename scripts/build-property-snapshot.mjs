#!/usr/bin/env node
/**
 * Deterministic property snapshot builder (no AI).
 *
 * Env inputs (HTTPS URLs):
 * - PROPERTY_SALES_CSV_URL (required)
 * - PROPERTY_RENTAL_CSV_URL (optional)
 * - PROPERTY_LISTINGS_CSV_URL (optional, rental listings)
 * - PROPERTY_SALES_LISTINGS_CSV_URL (optional, sales listings)
 *
 * Usage:
 *   node scripts/build-property-snapshot.mjs > property_metrics.json
 */
import { buildPayloadFromCsvText } from '../lib/salesCsvPayload.js';
import { mergeRentalIntoPayload } from '../lib/rentalCsvPayload.js';
import { buildListingsPayload } from '../lib/listingsCsvPayload.js';

const salesUrl = (process.env.PROPERTY_SALES_CSV_URL || '').trim();
const rentalUrl = (process.env.PROPERTY_RENTAL_CSV_URL || '').trim();
const rentalListingsUrl = (process.env.PROPERTY_LISTINGS_CSV_URL || '').trim();
const salesListingsUrl = (process.env.PROPERTY_SALES_LISTINGS_CSV_URL || '').trim();

if (!salesUrl) {
  console.error('Missing PROPERTY_SALES_CSV_URL');
  process.exit(1);
}

async function fetchText(url, { timeoutMs = 50000 } = {}) {
  const max = 4;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= max; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Stradaintel-property-snapshot/1' },
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);
      lastStatus = r.status;
      if (r.ok) return r.text();
      if (![502, 503, 504].includes(r.status) || attempt === max) {
        throw new Error(`GET ${url} -> HTTP ${r.status}`);
      }
    } catch (e) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') {
        if (attempt === max) {
          throw new Error(`GET ${url} -> timed out after ${timeoutMs}ms`);
        }
        continue;
      }
      throw e;
    }
  }
  throw new Error(`GET ${salesUrl} -> HTTP ${lastStatus}`);
}

const salesRaw = await fetchText(salesUrl);
const built = buildPayloadFromCsvText(salesRaw, salesUrl, {});
if (!built.ok) {
  console.error(JSON.stringify(built.body, null, 2));
  process.exit(1);
}

const out = { ...built.body };
delete out._stats_for_ai;
delete out._yield_sales_rows;
out.ok = true;
/** Server skips live rental CSV merge when serving this snapshot (see /api/property metrics branch). */
out._property_snapshot_v1 = true;

if (rentalUrl && built.windows) {
  try {
    const rentalRaw = await fetchText(rentalUrl);
    mergeRentalIntoPayload(out, rentalRaw, rentalUrl, built.windows, { filterArea: '' });
  } catch (e) {
    out.rental = out.rental || {};
    out.rental.note = `Rental URL failed during snapshot build: ${e?.message || e}`;
  }
}

if (rentalListingsUrl) {
  try {
    const listingsRaw = await fetchText(rentalListingsUrl);
    const rentalTxnAvgByBeds = {
      studio: parseFloat(out.rental?.studio_avg_aed) || null,
      '1br': parseFloat(out.rental?.apt_1br_avg_aed) || null,
      '2br': parseFloat(out.rental?.apt_2br_avg_aed) || null,
      '3br': parseFloat(out.rental?.villa_3br_avg_aed) || null,
    };
    const listingsResult = buildListingsPayload(listingsRaw, rentalListingsUrl, {
      rentalTxnAvgByBeds,
      rentalTxnByBuildingBed: out.rental?.txn_by_building_bed || {},
      rentalTxnByCommunityBed: out.rental?.txn_by_community_bed || {},
      dataType: 'rental',
      filterArea: '',
    });
    out.listings = listingsResult.ok
      ? listingsResult.listings
      : { error: listingsResult.error, source: rentalListingsUrl };
  } catch (e) {
    out.listings = {
      error: `Rental listings URL failed during snapshot build: ${e?.message || e}`,
      source: rentalListingsUrl,
    };
  }
}

if (salesListingsUrl) {
  try {
    const salesListingsRaw = await fetchText(salesListingsUrl);
    const salesListingsResult = buildListingsPayload(salesListingsRaw, salesListingsUrl, {
      salesTxnAvgByBeds: out.sale_txn_avg_by_beds || {},
      salesTxnByBuildingBed: out.sale_txn_by_building_bed || {},
      salesTxnByCommunityBed: out.sale_txn_by_community_bed || {},
      dataType: 'sales',
      filterArea: '',
    });
    out.sales_listings = salesListingsResult.ok
      ? salesListingsResult.listings
      : { error: salesListingsResult.error, source: salesListingsUrl };
  } catch (e) {
    out.sales_listings = {
      error: `Sales listings URL failed during snapshot build: ${e?.message || e}`,
      source: salesListingsUrl,
    };
  }
}

out.data_freshness = `${out.data_freshness || ''}${out.data_freshness ? ' · ' : ''}snapshot build`;
delete out._yield_sales_rows;
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
