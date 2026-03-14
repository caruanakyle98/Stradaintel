#!/usr/bin/env node
/**
 * Upload sales + rental CSVs in one go; print exact Vercel env lines to paste.
 *
 * Usage:
 *   export BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
 *   npm run upload:blob-all -- /path/to/sales.csv /path/to/rentals.csv
 *
 * Defaults: data/property/sales.csv and ./rentals.csv if args omitted.
 */
import { readFileSync, existsSync } from 'fs';
import { put } from '@vercel/blob';

const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
const salesPath = process.argv[2] || process.env.SALES_CSV_FILE || 'data/property/sales.csv';
const rentalPath = process.argv[3] || process.env.RENTALS_CSV_FILE || 'rentals.csv';
const salesPathname = process.env.BLOB_SALES_PATHNAME || 'stradaintel/sales.csv';
const rentalPathname = process.env.BLOB_RENTAL_PATHNAME || 'stradaintel/rentals.csv';

if (!token) {
  console.error('\n  Missing BLOB_READ_WRITE_TOKEN.\n  Vercel → Storage → Blob → your store → .env.local / token → copy Read & Write token.\n');
  process.exit(1);
}
for (const [label, p] of [
  ['sales', salesPath],
  ['rentals', rentalPath],
]) {
  if (!existsSync(p)) {
    console.error(`  File not found (${label}): ${p}`);
    process.exit(1);
  }
}

async function upload(pathname, filePath, label) {
  const body = readFileSync(filePath);
  const result = await put(pathname, body, {
    access: 'public',
    token,
    allowOverwrite: true,
    contentType: 'text/csv; charset=utf-8',
  });
  const mb = (body.length / (1024 * 1024)).toFixed(2);
  console.log(`\n  ${label} OK  ${body.length} bytes (${mb} MB)  pathname: ${pathname}`);
  console.log(`  URL: ${result.url}\n`);
  return result.url;
}

console.log('\n========== Strada Blob upload (sales + rentals) ==========\n');
const salesUrl = await upload(salesPathname, salesPath, 'Sales');
const rentalUrl = await upload(rentalPathname, rentalPath, 'Rentals');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  NEXT: Vercel → YOUR APP PROJECT (stradaintel) → Settings →');
console.log('  Environment Variables → Add each row → Production ✓ → Save');
console.log('  → Deployments → ⋮ → Redeploy (required).');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('  Name                              Value (paste)');
console.log('  ────────────────────────────────  ─────────────────────────────');
console.log('  BLOB_READ_WRITE_TOKEN             <same token you exported in shell>');
console.log('  PROPERTY_SALES_CSV_URL            ' + salesUrl);
console.log('  PROPERTY_RENTAL_CSV_URL           ' + rentalUrl);
console.log('  BLOB_SALES_PATHNAME               ' + salesPathname);
console.log('  BLOB_RENTAL_PATHNAME              ' + rentalPathname);
console.log('\n  Token name must be exactly: BLOB_READ_WRITE_TOKEN');
console.log('  Do not wrap the token in quotes in the Vercel UI.');
console.log('  If the app still fails, use Storage → Connect store → link to this project');
console.log('  (some setups auto-inject the token). Then redeploy again.\n');
