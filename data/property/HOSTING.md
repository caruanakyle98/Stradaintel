# Hosting sales & rental data (no browser upload)

Put CSVs (or a pre-built JSON snapshot) on **HTTPS** storage. The app **pulls** them on each refresh—nothing is uploaded through Vercel (avoids HTTP 413).

## Recommended stores

| Store | Use case |
|-------|----------|
| **Vercel Blob** | Same ecosystem; CLI `vercel blob put sales.csv` or `@vercel/blob` in a cron job |
| **Cloudflare R2** | Cheap, S3-compatible; presigned GET URL in env |
| **AWS S3** | Private bucket + presigned URL (rotate as needed) |

Any **stable HTTPS URL** works (including long-lived presigned URLs).

## Environment variables (Vercel / `.env.local`)

| Variable | Purpose |
|----------|---------|
| `PROPERTY_SALES_CSV_URL` | HTTPS URL to **sales** CSV (required for hosted no-upload flow) |
| `PROPERTY_RENTAL_CSV_URL` | HTTPS URL to **rental** listings or transactions CSV (optional) |
| `PROPERTY_METRICS_JSON_URL` | HTTPS URL to **pre-built** dashboard JSON (optional; skips CSV parse on server) |
| `PROPERTY_SALES_CSV_PATH` | Server filesystem path (local/Docker only) |

**Area filter (no API credits):** `GET /api/property?area=Exact%20Area%20Name` filters rows by the **All Developments** column (same as dashboard **Area** dropdown). Filtering is server-side CSV only—**Anthropic is not called** when `area` is set. **`PROPERTY_METRICS_JSON_URL`** is ignored whenever `area` is present (snapshot cannot be filtered); use live CSV for filtering.

Priority when calling `GET /api/property`:

1. If `PROPERTY_METRICS_JSON_URL` is set → return that JSON (fastest).
2. Else load sales from `PROPERTY_SALES_CSV_URL` (or path fallback).
3. If `PROPERTY_RENTAL_CSV_URL` is set → merge rental metrics into the same response.

## Rental CSV columns (flexible)

The parser looks for headers similar to:

- **Date**: `Evidence Date`, `Date`, `Contract Date`, `Listing Date`
- **Annual rent (AED)**: `Annual Rent (AED)`, `Rent (AED)`, `Rent`, `Annual Rent`, `Price (AED)`
- **Beds**: `Beds`, `Bedrooms`

Each row with a valid date + rent counts toward **weekly rental volume**; averages fill **1BR / 2BR / 3BR** rent cards when beds match.

## Updating data

1. Export CSV from Property Monitor (or your pipeline).
2. Upload/replace the object in Blob/R2/S3 (same URL, or update env to new URL).
3. Redeploy not required—next **Property data only** refresh pulls fresh data.

## Automate Blob upload (recommended)

The dashboard always reads **the current file** at `PROPERTY_SALES_CSV_URL`. After you merge into local `sales.csv`, run the upload script so Blob holds that file again—**no delete step**; **same pathname + overwrite** keeps the URL stable.

### One-time (you do manually)

1. **Vercel** → **Storage** → open your **Blob** store → copy a **Read/Write** token (or create one).
2. In the repo: `npm install` (pulls `@vercel/blob`).
3. Upload once and capture the URL:

   ```bash
   export BLOB_READ_WRITE_TOKEN="vercel_blob_rw_xxxxxxxx"
   npm run upload:sales-blob -- /full/path/to/sales.csv
   ```

4. **Vercel** → Project → **Settings → Environment Variables** → set **`PROPERTY_SALES_CSV_URL`** to the **URL printed** (only needed the first time, if it matches your existing Blob URL you can skip).
5. Keep using the **same** `BLOB_SALES_PATHNAME` every run (default: `stradaintel/sales.csv`) so overwrite does not change the link.

### Every day (automate)

After Property Monitor + Python append:

```bash
export BLOB_READ_WRITE_TOKEN="vercel_blob_rw_xxxxxxxx"
npm run upload:sales-blob -- /full/path/to/sales.csv
```

Or call the same from Python (after writing `sales.csv`):

```python
import subprocess, os
subprocess.run(
    ["npm", "run", "upload:sales-blob", "--", "/path/to/sales.csv"],
    cwd="/path/to/Stradaintel",
    check=True,
    env={**os.environ, "BLOB_READ_WRITE_TOKEN": os.environ["BLOB_READ_WRITE_TOKEN"]},
)
```

| Env | Purpose |
|-----|--------|
| `BLOB_READ_WRITE_TOKEN` | Required |
| `BLOB_SALES_PATHNAME` | Optional; default `stradaintel/sales.csv` |
| `SALES_CSV_FILE` | Optional default path when argv omitted |

CLI alternative: `vercel blob put ./sales.csv --pathname stradaintel/sales.csv --allow-overwrite`

## Optional: nightly metrics snapshot (Option C)

See [scripts/build-metrics.mjs](../../scripts/build-metrics.mjs) and [.github/workflows/property-metrics.yml](../../.github/workflows/property-metrics.yml). CI builds a small JSON; upload the artifact to Blob/R2 and set `PROPERTY_METRICS_JSON_URL`.
