# Hosting sales & rental data (no browser upload)

**Starting over (503 / token not visible):** follow **[docs/BLOB_SETUP_FROM_SCRATCH.md](../docs/BLOB_SETUP_FROM_SCRATCH.md)** and run `npm run upload:blob-all` for sales + rentals in one step.  
**Blob still 503 with token?** Use GitHub raw or R2 — **[docs/CSV_WHEN_BLOB_503.md](../docs/CSV_WHEN_BLOB_503.md)**.

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
| `PROPERTY_SALES_CSV_URL` | HTTPS URL to **sales** CSV. With Blob, **same pathname + overwrite → same public URL** (it does not change each upload). |
| **`BLOB_READ_WRITE_TOKEN`** | **Required on Vercel for reliable loads.** Same Read/Write token you use for upload. **Environment = Production** (not only Preview). **Redeploy after adding.** The API loads `stradaintel/sales.csv` via this token **before** trying the public URL. |
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

- **Date**: `Evidence Date`, `Date`, … — PM rental rows may show **`01 Mar 2026 / 28 Feb 2027`**; the **first date** is used for the week bucket.
- **Annual rent (AED)**: **`Annualised Rental Price (AED)` only** — contract rent is not used for any metric.
- **New vs renewal**: `Rent Recurrence` (e.g. `New Contract` vs `Renewal`) drives the weekly split on the dashboard.
- **Beds**: `Beds`, `Bedrooms`

Each row with a valid date + annualised rent counts toward **weekly rental volume**; averages fill **1BR / 2BR / 3BR** rent cards when beds match.

## Updating data

1. Export CSV from Property Monitor (or your pipeline).
2. Upload/replace the object in Blob/R2/S3 (**Vercel Blob: URL stays the same** when you overwrite the same pathname).
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

4. **Vercel** → your **app project** (not only Storage) → **Settings → Environment Variables**:
   - Add **`BLOB_READ_WRITE_TOKEN`** = paste the **same** token. **Check “Production”** (and Preview if you want). Save.
   - **Redeploy** the project (Deployments → … → Redeploy). New env vars do not apply until redeploy.
5. Set **`PROPERTY_SALES_CSV_URL`** to the URL from the script if you like (optional once token is set).
6. Keep the same **`BLOB_SALES_PATHNAME`** every upload (default `stradaintel/sales.csv`).

**If you see HTTP 503 on GET** even though the URL is unchanged: public CDN can still glitch; the API can load the same file via **`BLOB_READ_WRITE_TOKEN`** + pathname (no dependency on that GET). Ensure the token is on **Production** and redeploy. Only if you **create a new Blob store** would the public base URL change—then update `PROPERTY_SALES_CSV_URL` once.

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
| `BLOB_READ_WRITE_TOKEN` | Required for upload; **set on Vercel too** so `/api/property` can read sales/rental by pathname when the public Blob URL returns 503 (dead link after store reset). |
| `BLOB_SALES_PATHNAME` | Optional; default `stradaintel/sales.csv` |
| `BLOB_RENTAL_PATHNAME` | Optional; default `stradaintel/rentals.csv` (fallback when `PROPERTY_RENTAL_CSV_URL` fails) |
| `SALES_CSV_FILE` | Optional default path when argv omitted |

CLI alternative: `vercel blob put ./sales.csv --pathname stradaintel/sales.csv --allow-overwrite`

## Optional: nightly metrics snapshot (Option C)

See [scripts/build-metrics.mjs](../../scripts/build-metrics.mjs) and [.github/workflows/property-metrics.yml](../../.github/workflows/property-metrics.yml). CI builds a small JSON; upload the artifact to Blob/R2 and set `PROPERTY_METRICS_JSON_URL`.
