# Hosting sales & rental CSVs on GitHub (recommended)

The app loads CSVs with a normal **HTTPS GET**. **GitHub raw** URLs are stable and avoid Vercel Blob read issues.

## 1. Data repo (CSV-only is fine)

- Public repo containing only **`sales.csv`** and **`rentals.csv`** (and optional README).
- Do **not** commit API keys or `.env` — keep those in Vercel + your private app repo.

## 2. Raw URLs

After push to branch `main`:

```
https://raw.githubusercontent.com/<USER>/<REPO>/main/sales.csv
https://raw.githubusercontent.com/<USER>/<REPO>/main/rentals.csv
```

Open each in a browser — you must see CSV text (HTTP 200).

## 3. Vercel (Production)

| Variable | Value |
|----------|--------|
| `PROPERTY_SALES_CSV_URL` | raw URL for sales |
| `PROPERTY_RENTAL_CSV_URL` | raw URL for rentals |
| `PROPERTY_LISTINGS_CSV_URL` | raw URL for **rental** active listings (optional — rental tab supply pipeline) |
| `PROPERTY_SALES_LISTINGS_CSV_URL` | raw URL for **sales** active listings (optional — sales tab supply pipeline; same column schema as rental listings) |
| `PROPERTY_ENABLE_AI` | Optional. Set to `1` to enable Anthropic interpretation. Default is off (no AI credits). |
| `COMMUNITY_ALIAS_JSON` | Optional — see [Community names across CSVs](#7-community-names-across-csvs) |

**Redeploy** after saving (only needed when adding a new env var for the first time).

### Rental listings CSV (`PROPERTY_LISTINGS_CSV_URL`) — expected columns

| Column | Required | Notes |
|--------|----------|-------|
| `price_aed` | Yes | Asking **annual rent** in AED |
| `community` | Recommended | Area / master community |
| `bedrooms` | Recommended | Numeric (0=Studio) or "Studio" |
| `listed_date` | Recommended | Enables "new this week" count and **Hot Listings** (must be parseable; last 30 days) |
| `building` | Optional | Tower / building name |
| `Unit Type` / `Property Type` | Optional | Apartment, Villa, Townhouse — used for **Hot Listings** vs transactions (defaults to **Apartment** if omitted) |
| `bathrooms` | Optional | Numeric |
| `url` / `link` | Optional | Full **https://** listing URL for the Hot Listings table |

### Sales listings CSV (`PROPERTY_SALES_LISTINGS_CSV_URL`)

Use the **same column schema** as rental listings, but `price_aed` is the **asking sale price** (total AED). The API merges this into `sales_listings` on the property payload and benchmarks against **sales transactions** from `PROPERTY_SALES_CSV_URL` (rolling week averages by bedroom + building-level sale averages). Comma-separated fallback URLs behave like other property CSV env vars.

**Sales transactions CSV:** keep **Unit Type** (Apartment / Villa / Townhouse) and optional **bedrooms** so Hot Listings can bucket by building + bedroom + property type. Same for **rental (Ejari) CSV**: map **Unit Type** / **Property Type** when present; rows without it are treated as **Apartment** for benchmarking.

### Hot Listings (dashboard)

When an **area filter** is set (e.g. Dubai Harbour), Hot Listings compare each recent listing’s ask to the **average transacted price in that same area** for the same **building + bedroom count + property type** (apartment vs villa vs townhouse). **% below txn** is how far below that average the listing ask is.

- **Rental tab (`listings`):** Primary benchmarks from **rental transactions** in the filtered area (`txn_by_building_bed`). If a **building + bed + type** bucket has fewer than the minimum transaction count, the listing is compared to the **community + bed + type** average instead (`txn_by_community_bed`). Listings CSV rows are filtered by listing **community** to that area.
- **Sales tab (`sales_listings`):** Same pattern: `sale_txn_by_building_bed` first, then **`sale_txn_by_community_bed`** when the building sample is too thin.

Benchmark keys (both): **Building:** `normalizeCommunityKey(Sub Community / Building or Community/Building) | bedroom bucket | apt|villa|townhouse`. **Community fallback:** `normalizeCommunityKey(area / listing community) | bedroom bucket | apt|villa|townhouse`.

Details:
- Only **rental/sales rows that pass the same area filter** as the dashboard feed the Hot Listings averages (master **Area** / community column must match the filter; use **`COMMUNITY_ALIAS_JSON`** if labels differ between CSVs).
- Rolling lookback default **365 days** (`RENTAL_HOT_LISTINGS_LOOKBACK_DAYS`); minimum **3** transactions per bucket (`HOT_LISTINGS_MIN_TXN_PER_BUILDING_BED`) applies separately to **building** and **community** aggregates.
- Listings without **Property Type** default to **Apartment** for matching; set **Unit Type** on listings when you have villas/townhouses.

Optional **link** column supplies the outbound URL.

### Metrics snapshot (`PROPERTY_METRICS_JSON_URL`)

If the app returns **cached JSON** from `PROPERTY_METRICS_JSON_URL` (no area filter, no `noSnapshot`), it serves that payload as-is. To include up-to-date **`listings`** (rental hot listings) and **`sales_listings`** (sales hot listings), generate the snapshot with:

```bash
npm run build:property-snapshot > property_metrics.json
```

The snapshot builder keeps rental/sales listings separate and does not call Anthropic.

You may **remove** Blob vars (`BLOB_READ_WRITE_TOKEN`, `BLOB_SALES_PATHNAME`, …) if you no longer use Blob.

## 4. Updates

Replace files → `git commit` → `git push`. No redeploy needed; refresh dashboard (GitHub may cache ~minutes).

## 4b. No-credit daily snapshot mode

Use `.github/workflows/property-metrics.yml` to build `property_metrics.json` daily from:

- `PROPERTY_SALES_CSV_URL` (sales transactions)
- `PROPERTY_RENTAL_CSV_URL` (rental transactions, optional)
- `PROPERTY_LISTINGS_CSV_URL` (rental listings, optional)
- `PROPERTY_SALES_LISTINGS_CSV_URL` (sales listings, optional)

This mode is deterministic and uses no LLM credits unless you explicitly set `PROPERTY_ENABLE_AI=1` for live API interpretation.

## 5. Optional: comma-separated fallbacks

`PROPERTY_SALES_CSV_URL` can list multiple URLs (comma-separated); first successful GET wins.

## 6. Large CSVs and Vercel memory (HTTP 500 / “ran out of memory”)

The `/api/property` route loads **sales**, **rentals**, and optionally **rental listings** and **sales listings** in one invocation. Parsing uses **streaming row iteration** (no full duplicate of the CSV as a giant row array for sales/rental/listings), but **records** for sales and rental still live in memory for aggregation — extremely large extracts can still approach limits.

**Mitigations:**

- Keep each CSV only as large as needed (trim columns, drop stale rows, or split time ranges).
- If you still hit limits, open **Vercel → Project → Settings → Functions → Advanced** and raise the function memory to **Performance (4 GB / 2 vCPUs)** (Pro/Enterprise). You cannot set this in `vercel.json`; use the dashboard.
- Temporarily unset `PROPERTY_LISTINGS_CSV_URL` to confirm listings data is the main driver.

Use **Vercel → Functions → Logs** for invocation errors and duration if you need to correlate failures with deploys or data updates.

## 7. Community names across CSVs

Sales, rental, and listing exports may use **slightly different labels** for the same place (e.g. **"The Greens"** in sales/rental vs **"Greens"** in listings). The dashboard normalizes names when applying the area filter: case, spacing, and a leading **"The "** are ignored so filters stay aligned.

For pairs that cannot be matched automatically (e.g. **"JVC"** vs **"Jumeirah Village Circle"**), set optional **`COMMUNITY_ALIAS_JSON`** in Vercel (Production) to a JSON array of synonym groups — the first name in each group is the canonical key:

```json
[["Jumeirah Village Circle", "JVC"]]
```

Redeploy after changing env vars. Prefer consistent naming in your CSVs when possible.
