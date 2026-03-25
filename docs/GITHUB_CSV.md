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

**Redeploy** after saving (only needed when adding a new env var for the first time).

### Listings CSV expected columns

| Column | Required | Notes |
|--------|----------|-------|
| `price_aed` | Yes | Asking price in AED |
| `community` | Recommended | Area / master community |
| `bedrooms` | Recommended | Numeric (0=Studio) or "Studio" |
| `listed_date` | Recommended | Enables "new this week" count |
| `building` | Optional | Tower / building name |
| `bathrooms` | Optional | Numeric |

You may **remove** Blob vars (`BLOB_READ_WRITE_TOKEN`, `BLOB_SALES_PATHNAME`, …) if you no longer use Blob.

## 4. Updates

Replace files → `git commit` → `git push`. No redeploy needed; refresh dashboard (GitHub may cache ~minutes).

## 5. Optional: comma-separated fallbacks

`PROPERTY_SALES_CSV_URL` can list multiple URLs (comma-separated); first successful GET wins.

## 6. Large CSVs and Vercel memory (HTTP 500 / “ran out of memory”)

The `/api/property` route loads and parses **sales**, **rentals**, and optionally **listings** in one invocation. Very large files (especially listings) can exceed the default **~2 GB** serverless memory and cause the runtime to exit with **HTTP 500**.

**Mitigations:**

- Keep each CSV only as large as needed (trim columns, drop stale rows, or split time ranges).
- If you still hit limits, open **Vercel → Project → Settings → Functions → Advanced** and raise the function memory to **Performance (4 GB / 2 vCPUs)** (Pro/Enterprise). You cannot set this in `vercel.json`; use the dashboard.
- Temporarily unset `PROPERTY_LISTINGS_CSV_URL` to confirm listings data is the main driver.

Successful responses log `property-api-timing` in Vercel function logs with `heap_mb` / `rss_mb` for diagnosis.
