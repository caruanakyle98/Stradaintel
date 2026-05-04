// Maps live /api/property-read + /api/intelligence-read snapshots into the
// page-prop shapes consumed by /app/report.
//
// Bed-key conventions:
//   prop.monthly.cur_avg_by_beds       → keys: Studio, 1, 2, 3, 4+
//   prop.rental.txn_by_community_bed   → keys: "<community-prefix>|<bedKey>|<unit-type>"
//                                        bedKey is Studio, 1br, 2br, 3br
//   prop.listings.by_beds              → keys: Studio, 1, 2, 3, 4+
//   prop.listings.asking_vs_txn_by_beds→ keys: Studio, 1, 2, 3, 4+ → { asking_avg, txn_avg, ... }

const BED_LABEL = { Studio: 'Studio', 1: '1 Bed', 2: '2 Bed', 3: '3 Bed', '4+': '4 Bed' };

function parseNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[^\d.\-+]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function communityPrefix(community) {
  return (community || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Aggregate rental txn_by_community_bed across unit types (apartment/villa/townhouse)
// for a given bedroom in this community.
function rentalAvgForBed(txnByBed, community, bedKey) {
  const prefix = communityPrefix(community);
  if (!prefix) return null;
  const matchKey = `${prefix}|${bedKey}|`;
  let sum = 0;
  let count = 0;
  for (const [key, val] of Object.entries(txnByBed || {})) {
    if (!key.startsWith(matchKey)) continue;
    sum += (val.avg || 0) * (val.n || 0);
    count += val.n || 0;
  }
  return count > 0 ? Math.round(sum / count) : null;
}

// Count recent rental transactions for a given bedroom in this community.
function countTransactions(rows, community, bedNum) {
  const prefix = communityPrefix(community);
  return (rows || []).filter((r) => {
    const matchesArea = !prefix || (r.location || r.area || '').toLowerCase().includes(prefix);
    const matchesBed = bedKeyOf(r.beds) === String(bedNum);
    return matchesArea && matchesBed;
  }).length;
}

function bedKeyOf(beds) {
  if (beds == null) return null;
  const s = String(beds).trim().toLowerCase();
  if (s === 'studio' || s === '0' || s === 's') return 'Studio';
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return null;
  if (n >= 4) return '4+';
  return String(n);
}

export function adaptReportData(prop, intel, { area, community, building }) {
  const filterCommunity = community ? community.trim().toLowerCase() : '';
  const matchesFilter = (row) => {
    if (!filterCommunity) return true;
    const haystack = `${row.location || ''} ${row.area || ''}`.toLowerCase();
    return haystack.includes(filterCommunity);
  };

  // 06 — Sales transfers
  const salesRows = (prop.recent_sales_transactions || [])
    .filter(matchesFilter)
    .slice(0, 13)
    .map((t) => [
      t.date || '—',
      t.location || t.area || '—',
      t.unit_no ?? '—',
      t.beds ?? '—',
      t.unit_type || '—',
      t.price_fmt || '—',
    ]);

  // 07 — Rental contracts
  const rentalRows = (prop.recent_rental_transactions || [])
    .filter(matchesFilter)
    .slice(0, 13)
    .map((t) => [
      t.date || '—',
      t.location || t.area || '—',
      t.unit_no ?? '—',
      t.beds ?? '—',
      t.unit_type || '—',
      t.rent_fmt || '—',
    ]);

  // 08 — Listing performance: listing avg vs txn avg per bed
  const askingVsTxn = prop.listings?.asking_vs_txn_by_beds || {};
  const listingPerf = ['1', '2', '3']
    .map((bedKey) => {
      const entry = askingVsTxn[bedKey];
      if (entry && entry.asking_avg && entry.txn_avg) {
        return { label: BED_LABEL[bedKey], listing: entry.asking_avg, txn: entry.txn_avg };
      }
      return null;
    })
    .filter(Boolean);

  const rentVolumeByBed = [1, 2, 3].map((b) => ({
    beds: b,
    count: countTransactions(prop.recent_rental_transactions, community, b),
  }));

  // 09 — Sales index 6mo (single-chart fallback): avg sale price by bed (apt only)
  const salesByBed = prop.monthly?.cur_avg_by_beds || {};
  const sales6mo = ['1', '2', '3']
    .map((bedKey) => {
      const e = salesByBed[bedKey];
      if (!e || !e.avg) return null;
      return { label: BED_LABEL[bedKey], value: e.avg };
    })
    .filter(Boolean);

  // 10 — Sales index 12mo: HBars for 1/2/3/4 bed + KPI circle
  const momByBed = prop.monthly?.mom_avg_by_beds_pct || {};
  const sales12mo = ['1', '2', '3', '4+']
    .map((bedKey) => {
      const e = salesByBed[bedKey];
      if (!e || !e.avg) return null;
      return {
        label: BED_LABEL[bedKey],
        value: e.avg,
        delta: parseNum(momByBed[bedKey]),
      };
    })
    .filter(Boolean);

  const sales12moKpi = {
    count: parseNum(prop.weekly?.sale_volume?.value),
    chgPct: parseNum(prop.weekly?.sale_volume?.chg_yoy ?? prop.weekly?.sale_volume?.chg_wow),
  };

  // 11 — Rental index 3mo (single-chart fallback): avg rent per bed for community
  const txnByBed = prop.rental?.txn_by_community_bed || {};
  const rental3mo = [1, 2, 3]
    .map((b) => {
      const avg = rentalAvgForBed(txnByBed, community, String(b));
      if (!avg) return null;
      return { label: `${b} Bed`, value: avg };
    })
    .filter(Boolean);

  // 12 — Rental index month: same data + KPI circle
  // Delta data isn't currently tracked per-bed for rentals, so leave deltas null;
  // user can override via Tweaks if they have figures.
  const rentalMonth = rental3mo.map((row) => ({ ...row, delta: null }));

  const rentalMonthKpi = {
    count: parseNum(prop.weekly?.rent_volume?.value),
    chgPct: parseNum(prop.weekly?.rent_volume?.chg_wow ?? prop.weekly?.rent_volume?.chg_yoy),
  };

  // 13 — Back cover live KPIs
  const liveTransfers = parseNum(prop.weekly?.sale_volume?.value);
  const indexDelta = prop.prices?.price_index_chg_yoy;
  const activeListings = parseNum(prop.listings?.total);

  const fmtPct = (raw) => {
    const n = parseNum(raw);
    if (n == null) return raw && raw !== 'N/A' ? String(raw) : '—';
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  };

  const backCoverKpis = [
    ['Live transfers', liveTransfers != null ? liveTransfers.toLocaleString() : '—', '#e8c96d'],
    ['Index Δ', fmtPct(indexDelta), '#f4d35e'],
    ['Active listings', activeListings != null ? activeListings.toLocaleString() : '—', '#e8eefc'],
  ];

  return {
    salesRows,
    rentalRows,
    listingPerf,
    rentVolumeByBed,
    sales6mo,
    sales12mo,
    sales12moKpi,
    rental3mo,
    rentalMonth,
    rentalMonthKpi,
    backCoverKpis,
  };
}
