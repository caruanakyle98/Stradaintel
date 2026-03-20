#!/usr/bin/env node
/**
 * After upload: check if the Blob URL is readable (GET must be 200).
 * If this prints 503, the problem is Vercel Blob delivery — not your app.
 *
 *   export BLOB_READ_WRITE_TOKEN="..."
 *   node scripts/verify-blob-read.mjs https://....blob.vercel-storage.com/.../sales.csv stradaintel/sales.csv
 */
import { get } from '@vercel/blob';

const publicUrl = process.argv[2];
const pathname = process.argv[3] || 'stradaintel/sales.csv';
const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();

async function headStatus(url) {
  const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  return r.status;
}

console.log('\n--- Blob read check ---\n');
if (publicUrl) {
  const s = await headStatus(publicUrl);
  console.log('Public HEAD', publicUrl.slice(0, 64) + '… → HTTP', s);
}
if (token) {
  try {
    const out = await get(pathname, { access: 'public', token });
    console.log('Token get(' + pathname + ') →', out?.stream ? '200 + body' : 'no stream');
  } catch (e) {
    console.log('Token get →', e?.message || e);
  }
} else {
  console.log('(no BLOB_READ_WRITE_TOKEN — skip token get)');
}
console.log('\n503 on both → Vercel Blob is not serving reads for this store/object.');
console.log('Workaround: host CSV on GitHub raw (or R2) and set PROPERTY_SALES_CSV_URL.');
console.log('Support: vercel.com/support with store id + URL + "GET returns 503 after successful put".\n');
