#!/usr/bin/env node
/**
 * Upload or replace sales.csv on Vercel Blob (same pathname → same public URL).
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... node scripts/upload-sales-to-blob.mjs /path/to/sales.csv
 *   npm run upload:sales-blob -- /path/to/sales.csv
 *
 * Env:
 *   BLOB_READ_WRITE_TOKEN  — required (Vercel Blob read/write token)
 *   BLOB_SALES_PATHNAME    — optional, default stradaintel/sales.csv
 *   SALES_CSV_FILE         — default file if no argv
 */
import { readFileSync, existsSync } from 'fs';
import { put } from '@vercel/blob';

const token = process.env.BLOB_READ_WRITE_TOKEN;
const pathname = process.env.BLOB_SALES_PATHNAME || 'stradaintel/sales.csv';
const filePath = process.argv[2] || process.env.SALES_CSV_FILE || 'data/property/sales.csv';

if (!token) {
  console.error('Missing BLOB_READ_WRITE_TOKEN (Vercel → Storage → Blob → token).');
  process.exit(1);
}
if (!existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const body = readFileSync(filePath);
const sizeMb = (body.length / (1024 * 1024)).toFixed(2);

const result = await put(pathname, body, {
  access: 'public',
  token,
  allowOverwrite: true,
  contentType: 'text/csv; charset=utf-8',
});

console.log('');
console.log('Uploaded OK');
console.log('URL (set once in Vercel as PROPERTY_SALES_CSV_URL):');
console.log(result.url);
console.log(`Size: ${body.length} bytes (${sizeMb} MB) · pathname: ${pathname}`);
console.log('');
