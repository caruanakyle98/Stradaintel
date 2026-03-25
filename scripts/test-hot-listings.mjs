/**
 * Smoke tests for Hot Listings (computeHotListings + buildListingsPayload).
 * Run: node scripts/test-hot-listings.mjs
 */
import assert from 'node:assert';
import { buildListingsPayload, computeHotListings } from '../lib/listingsCsvPayload.js';

function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// --- computeHotListings (unit) ---
const thirty = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const recent = isoDaysAgo(5);
const old = isoDaysAgo(40);

{
  const rows = [
    { price: 90000, bedKey: '1', listedDate: new Date(recent + 'T12:00:00.000Z'), community: 'C', building: 'T1', link: null },
    { price: 10000, bedKey: '1', listedDate: new Date(recent + 'T12:00:00.000Z'), community: 'C', building: 'T2', link: 'https://ex.test/b' },
  ];
  const txn = { '1br': 90000 };
  const { hot_listings } = computeHotListings(rows, thirty, true, txn);
  assert.strictEqual(hot_listings.length, 1);
  assert.strictEqual(hot_listings[0].building, 'T2');
  assert.strictEqual(hot_listings[0].beds, '1 Bed');
  assert.strictEqual(hot_listings[0].price_fmt.includes('10'), true);
  assert.ok(hot_listings[0].pct_drop > 85 && hot_listings[0].pct_drop < 90);
}

{
  const rows = [
    { price: 90000, bedKey: '1', listedDate: new Date(recent + 'T12:00:00.000Z'), community: 'C', building: 'T1', link: null },
    { price: 10000, bedKey: '1', listedDate: new Date(old + 'T12:00:00.000Z'), community: 'C', building: 'T2', link: null },
  ];
  const { hot_listings } = computeHotListings(rows, thirty, true, { '1br': 90000 });
  assert.strictEqual(hot_listings.length, 0);
}

{
  const rows = [
    { price: 80, bedKey: 'Other', listedDate: new Date(recent + 'T12:00:00.000Z'), community: 'C', building: 'X', link: null },
    { price: 90, bedKey: 'Other', listedDate: new Date(recent + 'T12:00:00.000Z'), community: 'C', building: 'Y', link: null },
  ];
  const { hot_listings } = computeHotListings(rows, thirty, true, { '1br': 100 });
  assert.strictEqual(hot_listings.length, 0);
}

{
  const { hot_listings, hot_listings_note } = computeHotListings([], thirty, false);
  assert.strictEqual(hot_listings.length, 0);
  assert.ok(String(hot_listings_note).includes('Listed Date'));
}

// --- buildListingsPayload (integration) ---
const today = isoDaysAgo(0);
const csv = `community,building,bedrooms,price_aed,listed_date,url
Dubai Islands,Tower A,1,90000,${today},https://ex.test/1
Dubai Islands,Tower B,1,10000,${today},https://ex.test/2
Palm,Ph1,2,200000,${today},
Palm,Ph2,2,180000,${today},`;

const r = buildListingsPayload(csv, 't.csv', {
  dataType: 'rental',
  rentalTxnAvgByBeds: { '1br': 90000, '2br': 200000 },
});
assert.strictEqual(r.ok, true);
assert.ok(Array.isArray(r.listings.hot_listings));
const hot = r.listings.hot_listings;
const oneBed = hot.filter((h) => h.building === 'Tower B');
assert.strictEqual(oneBed.length, 1);
assert.ok(oneBed[0].pct_drop > 80);
const twoBed = hot.filter((h) => h.building === 'Ph2');
assert.strictEqual(twoBed.length, 1);
assert.ok(twoBed[0].pct_drop > 9 && twoBed[0].pct_drop < 11);
assert.strictEqual(hot[0].building, 'Tower B');

console.log('test-hot-listings: ok');
