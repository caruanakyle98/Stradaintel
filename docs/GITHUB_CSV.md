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

**Redeploy** after saving.

You may **remove** Blob vars (`BLOB_READ_WRITE_TOKEN`, `BLOB_SALES_PATHNAME`, …) if you no longer use Blob.

## 4. Updates

Replace files → `git commit` → `git push`. No redeploy needed; refresh dashboard (GitHub may cache ~minutes).

## 5. Optional: comma-separated fallbacks

`PROPERTY_SALES_CSV_URL` can list multiple URLs (comma-separated); first successful GET wins.
