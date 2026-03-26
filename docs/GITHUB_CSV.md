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
| `PROPERTY_LISTINGS_CSV_URL` | raw URL for active listings (optional — enables supply pipeline section) |
| `COMMUNITY_ALIAS_JSON` | Optional — see [Community names across CSVs](#7-community-names-across-csvs) |

**Redeploy** after saving (only needed when adding a new env var for the first time).

### Listings CSV expected columns

| Column | Required | Notes |
|--------|----------|-------|
| `price_aed` | Yes | Asking price in AED |
| `community` | Recommended | Area / master community |
| `bedrooms` | Recommended | Numeric (0=Studio) or "Studio" |
| `listed_date` | Recommended | Enables "new this week" count and **Hot Listings** (must be parseable; last 30 days) |
| `building` | Optional | Tower / building name |
| `bathrooms` | Optional | Numeric |
| `url` / `link` | Optional | Full **https://** listing URL for the Hot Listings table |

### Hot Listings (dashboard)

When listings load successfully, the API adds `listings.hot_listings`: up to **25** rows with the largest **% below the transacted rental average for the same building + bedroom bucket**. **Not** compared to average asking on other listings. Only listings with a **listed date in the last 30 days** qualify, and the **area filter** applies to both rental transactions and listings before scoring.

Building benchmark details:
- Rental benchmark key is `normalizeCommunityKey(sub-community/tower) + bedroom bucket`.
- Rental rows are included from a rolling lookback (default **365 days**, env `RENTAL_HOT_LISTINGS_LOOKBACK_DAYS`).
- Minimum sample size is enforced per building+bed bucket (default **3**, env `HOT_LISTINGS_MIN_TXN_PER_BUILDING_BED`).
- If a listing has no qualifying building+bed benchmark (name mismatch, sparse data, or missing building), it is excluded from Hot Listings in v1.

For best match rate, keep building/tower naming consistent between listings and rental exports. Optional **link** column supplies the outbound URL.

### Metrics snapshot (`PROPERTY_METRICS_JSON_URL`)

If the app returns **cached JSON** from `PROPERTY_METRICS_JSON_URL` (no area filter, no `noSnapshot`), that payload is **not** rebuilt by `buildListingsPayload` on the server. **`hot_listings` appears only when listings are merged from `PROPERTY_LISTINGS_CSV_URL` in that request** — e.g. use an **area filter**, append **`?noSnapshot=1`**, or **regenerate** your snapshot file after deploy so it includes `hot_listings` if you rely on the default snapshot path.

You may **remove** Blob vars (`BLOB_READ_WRITE_TOKEN`, `BLOB_SALES_PATHNAME`, …) if you no longer use Blob.

## 4. Updates

Replace files → `git commit` → `git push`. No redeploy needed; refresh dashboard (GitHub may cache ~minutes).

## 5. Optional: comma-separated fallbacks

`PROPERTY_SALES_CSV_URL` can list multiple URLs (comma-separated); first successful GET wins.

## 6. Large CSVs and Vercel memory (HTTP 500 / “ran out of memory”)

The `/api/property` route loads **sales**, **rentals**, and optionally **listings** in one invocation. Parsing uses **streaming row iteration** (no full duplicate of the CSV as a giant row array for sales/rental/listings), but **records** for sales and rental still live in memory for aggregation — extremely large extracts can still approach limits.

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
