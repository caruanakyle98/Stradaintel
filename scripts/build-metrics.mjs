#!/usr/bin/env node
/**
 * SALES_CSV_URL=https://... node scripts/build-metrics.mjs > metrics.json
 * Optional: RENTAL_CSV_URL=https://...
 */
import { buildPayloadFromCsvText } from '../lib/salesCsvPayload.js';
import { mergeRentalIntoPayload } from '../lib/rentalCsvPayload.js';

const salesUrl = process.env.SALES_CSV_URL || process.argv[2];
const rentalUrl = process.env.RENTAL_CSV_URL || process.argv[3];

if (!salesUrl) {
  console.error('Usage: SALES_CSV_URL=https://... node scripts/build-metrics.mjs');
  process.exit(1);
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Stradaintel-build-metrics/1' } });
  if (!r.ok) throw new Error(`GET ${url} ${r.status}`);
  return r.text();
}

const salesText = await fetchText(salesUrl);
const built = buildPayloadFromCsvText(salesText, salesUrl);
if (!built.ok) {
  console.error(JSON.stringify(built.body, null, 2));
  process.exit(1);
}

const body = { ...built.body };
delete body._stats_for_ai;

if (rentalUrl && built.windows) {
  try {
    const rentalText = await fetchText(rentalUrl);
    mergeRentalIntoPayload(body, rentalText, rentalUrl, built.windows);
  } catch (e) {
    body.rental = body.rental || {};
    body.rental.note = `Rental fetch failed: ${e.message}`;
  }
}

body.ok = true;
body.data_freshness = (body.data_freshness || '') + ' · snapshot build';
process.stdout.write(JSON.stringify(body, null, 2));
