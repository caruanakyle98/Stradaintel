# Hosting sales & rental data (no browser upload)

**Primary:** **[GitHub raw](../docs/GITHUB_CSV.md)** — `PROPERTY_SALES_CSV_URL` + `PROPERTY_RENTAL_CSV_URL` (public data repo, CSVs only; no API keys in that repo).

**Optional:** Vercel Blob — **[docs/BLOB_SETUP_FROM_SCRATCH.md](../docs/BLOB_SETUP_FROM_SCRATCH.md)** if Blob reads work (503 → stay on GitHub).

The app **GETs** CSVs over HTTPS—nothing is uploaded through the Next app (avoids HTTP 413).

## Environment variables (Vercel / `.env.local`)

| Variable | Purpose |
|----------|--------|
| **`PROPERTY_SALES_CSV_URL`** | **Required for hosted.** GitHub raw: `https://raw.githubusercontent.com/USER/REPO/BRANCH/sales.csv` |
| **`PROPERTY_RENTAL_CSV_URL`** | Raw URL for rentals CSV (optional but recommended) |
| `PROPERTY_METRICS_JSON_URL` | Pre-built JSON snapshot (optional) |
| `PROPERTY_SALES_CSV_PATH` | Local/server filesystem path only |
| `BLOB_READ_WRITE_TOKEN` | Optional — only if using Blob fallback after URLs fail |

**Area filter:** `GET /api/property?area=…` — server-side CSV only; **`PROPERTY_METRICS_JSON_URL`** ignored when area is set.

## Load order (`GET /api/property`)

1. `PROPERTY_METRICS_JSON_URL` (if set, no area filter) → JSON snapshot  
2. Else **`PROPERTY_SALES_CSV_URL`** first (GitHub raw), then Blob token + pathname if configured  
3. Merge rental from **`PROPERTY_RENTAL_CSV_URL`** (then Blob rental pathname if needed)

## Rental CSV columns

See earlier sections in git history or [rentalCsvPayload.js](../../lib/rentalCsvPayload.js) — Annualised rent, Rent Recurrence (new vs renewal), Evidence Date (first date), Beds.

## Updating data (GitHub)

1. Export / build `sales.csv` and `rentals.csv`.  
2. Commit + push to the **data** repo.  
3. Dashboard refresh pulls latest (no redeploy).

---

Blob upload scripts remain in `package.json` (`upload:sales-blob`, `upload:blob-all`) if you switch back later.
