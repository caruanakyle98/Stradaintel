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
  const txn = {
    't1|1': { avg: 90000, n: 3 },
    't2|1': { avg: 90000, n: 4 },
  };
  const { hot_listings } = computeHotListings(rows, thirty, true, txn);
  assert.strictEqual(hot_listings.length, 1);
  assert.strictEqual(hot_listings[0].building, 'T2');
  assert.strictEqual(hot_listings[0].beds, '1 Bed');
  assert.strictEqual(hot_listings[0].benchmark_n, 4);
  assert.strictEqual(hot_listings[0].benchmark_source, 'building_txn');
  assert.strictEqual(hot_listings[0].price_fmt.includes('10'), true);
  assert.ok(hot_listings[0].pct_drop > 85 && hot_listings[0].pct_drop < 90);
}

{
  const rows = [
    { price: 90000, bedKey: '1', listedDate: new Date(recent + 'T12:00:00.000Z'), community: 'C', building: 'T1', link: null },
    { price: 10000, bedKey: '1', listedDate: new Date(old + 'T12:00:00.000Z'), community: 'C', building: 'T2', link: null },
  ];
  const { hot_listings } = computeHotListings(rows, thirty, true, { 't1|1': { avg: 90000, n: 3 } });
  assert.strictEqual(hot_listings.length, 0);
}

{
  const rows = [
    { price: 80, bedKey: 'Other', listedDate: new Date(recent + 'T12:00:00.000Z'), community: 'C', building: 'X', link: null },
    { price: 90, bedKey: 'Other', listedDate: new Date(recent + 'T12:00:00.000Z'), community: 'C', building: 'Y', link: null },
  ];
  const { hot_listings } = computeHotListings(rows, thirty, true, { 'x|1': { avg: 100, n: 3 } });
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
Palm,Ph2,2,180000,${today},
Palm,No Bench,1,10000,${today},`;

const r = buildListingsPayload(csv, 't.csv', {
  dataType: 'rental',
  rentalTxnAvgByBeds: { '1br': 90000, '2br': 200000 },
  rentalTxnByBuildingBed: {
    'tower a|1': { avg: 90000, n: 3 },
    'tower b|1': { avg: 90000, n: 3 },
    'ph1|2': { avg: 200000, n: 3 },
    'ph2|2': { avg: 200000, n: 3 },
  },
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
const noBench = hot.filter((h) => h.building === 'No Bench');
assert.strictEqual(noBench.length, 0);
assert.strictEqual(hot[0].building, 'Tower B');

// --- buildListingsPayload sales mode ---
const csvSales = `community,building,bedrooms,price_aed,listed_date,url
Dubai Islands,Tower A,1,900000,${today},https://ex.test/s1
Dubai Islands,Tower B,1,100000,${today},https://ex.test/s2
Palm,Ph1,2,2000000,${today},
Palm,Ph2,2,1800000,${today},
Palm,No Bench,1,100000,${today},`;

const rs = buildListingsPayload(csvSales, 'sales-listings.csv', {
  dataType: 'sales',
  salesTxnAvgByBeds: { '1br': 900000, '2br': 2000000 },
  salesTxnByBuildingBed: {
    'tower a|1': { avg: 900000, n: 3 },
    'tower b|1': { avg: 900000, n: 3 },
    'ph1|2': { avg: 2000000, n: 3 },
    'ph2|2': { avg: 2000000, n: 3 },
  },
});
assert.strictEqual(rs.ok, true);
assert.strictEqual(rs.listings.data_type, 'sales');
assert.ok(Array.isArray(rs.listings.hot_listings));
const hotS = rs.listings.hot_listings;
const oneBedS = hotS.filter((h) => h.building === 'Tower B');
assert.strictEqual(oneBedS.length, 1);
assert.ok(oneBedS[0].pct_drop > 80);
const twoBedS = hotS.filter((h) => h.building === 'Ph2');
assert.strictEqual(twoBedS.length, 1);
assert.ok(twoBedS[0].pct_drop > 9 && twoBedS[0].pct_drop < 11);
assert.strictEqual(hotS.filter((h) => h.building === 'No Bench').length, 0);
assert.strictEqual(hotS[0].building, 'Tower B');
assert.ok(String(rs.listings.hot_listings_rules).includes('sale'));

console.log('test-hot-listings: ok');
