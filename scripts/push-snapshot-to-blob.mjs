#!/usr/bin/env node
/**
 * Write the 7-day property snapshot to Vercel Blob so the client default view
 * has a fresh fallback without anyone clicking "build snapshots" in the admin UI.
 *
 * Reads the Action-built property_metrics.json, takes snapshots['7'] (an
 * ok:true single-window payload — the exact shape /api/property-read returns
 * and the client expects), stamps it, and puts it at the snapshot blob path.
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... node scripts/push-snapshot-to-blob.mjs [property_metrics.json]
 *
 * Env:
 *   BLOB_READ_WRITE_TOKEN  — required (Vercel Blob read/write token)
 *   PROP_SNAPSHOT_BLOB_PATH — optional, default stradaintel/property-latest.json
 */
import { readFileSync, existsSync } from 'fs';
import { put } from '@vercel/blob';

const token = (process.env.BLOB_READ_WRITE_TOKEN || '').trim();
const blobPath = (process.env.PROP_SNAPSHOT_BLOB_PATH || 'stradaintel/property-latest.json').trim();
const metricsFile = process.argv[2] || 'data/property/property_metrics.json';

if (!token) {
  console.error('Missing BLOB_READ_WRITE_TOKEN (Vercel → Storage → Blob → token).');
  process.exit(1);
}
if (!existsSync(metricsFile)) {
  console.error(`File not found: ${metricsFile}`);
  process.exit(1);
}

let metrics;
try {
  metrics = JSON.parse(readFileSync(metricsFile, 'utf8'));
} catch (e) {
  console.error(`Could not parse ${metricsFile}: ${e?.message || e}`);
  process.exit(1);
}

const snapshot = metrics?.snapshots?.['7'];
if (!snapshot || typeof snapshot !== 'object' || !snapshot.ok) {
  console.error('No usable snapshots["7"] (ok:true) in metrics file — refusing to overwrite blob.');
  process.exit(1);
}

const stamped = {
  ...snapshot,
  snapshot_refreshed_at: new Date().toISOString(),
  snapshot_source: 'github-action',
};

const result = await put(blobPath, JSON.stringify(stamped), {
  access: 'public',
  token,
  contentType: 'application/json; charset=utf-8',
  addRandomSuffix: false,
  allowOverwrite: true,
});

console.log('');
console.log('Snapshot blob updated OK');
console.log(`pathname: ${blobPath}`);
console.log(`URL: ${result?.url || '(unknown)'}`);
console.log(`snapshot_refreshed_at: ${stamped.snapshot_refreshed_at}`);
console.log('');
