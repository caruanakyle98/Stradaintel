# When Vercel Blob keeps returning 503 (even with token)

Your logs show **both**:

- `token+pathname: … Failed to fetch blob: 503`
- public `GET …blob.vercel-storage.com… → 503`

So the app and token are wired correctly; **Vercel Blob is not serving that object reliably** (store/region/incident or very large object timing out). Easiest fix: **serve the CSV from any other HTTPS URL that returns 200** and point the app there only.

## Option A — GitHub (simple if repo can be public)

1. New **public** repo (e.g. `strada-csv`) or use a folder in an existing public repo.
2. Commit `sales.csv` (and optionally `rentals.csv`). Stay under GitHub’s file size limits (~100MB per file).
3. Raw URLs look like:
   - `https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/sales.csv`
   - `https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/rentals.csv`
4. **Vercel → Environment variables (Production):**
   - `PROPERTY_SALES_CSV_URL` = raw sales URL  
   - `PROPERTY_RENTAL_CSV_URL` = raw rentals URL (if used)  
5. **Redeploy.** You can leave `BLOB_READ_WRITE_TOKEN` set or not — the API will use these URLs first via normal `GET` (no Blob SDK for that request).

## Option B — Cloudflare R2 (good for large files)

1. R2 bucket → allow **public access** on a custom domain or r2.dev subdomain.
2. Upload `sales.csv` → copy public object URL.
3. Set `PROPERTY_SALES_CSV_URL` to that URL → redeploy.

## Option C — Wait / Vercel support

503 on **authenticated** Blob reads often means **their** edge or store. Check [vercel-status.com](https://www.vercel-status.com), open a support ticket, or try **new Blob store + re-upload** later.

---

**Summary:** `PROPERTY_SALES_CSV_URL` / `PROPERTY_RENTAL_CSV_URL` can be **any** stable HTTPS CSV link. Blob is optional once those URLs work.
