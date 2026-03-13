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

## Optional: nightly metrics snapshot (Option C)

See [scripts/build-metrics.mjs](../../scripts/build-metrics.mjs) and [.github/workflows/property-metrics.yml](../../.github/workflows/property-metrics.yml). CI builds a small JSON; upload the artifact to Blob/R2 and set `PROPERTY_METRICS_JSON_URL`.
