# Blob setup from scratch (sales + rentals)

Use this after **removing Blob + env vars** (the app cannot read `data/property/sales.csv` on Vercel — you will see a setup error until these steps are done).

Goal: **one Blob store**, **two uploads**, **five env vars** on the **app project**, then **redeploy**.

## 1. Create or open a Blob store

1. [vercel.com](https://vercel.com) → **Storage** → **Create** → **Blob**.
2. Name it (e.g. `strada-data`) → **Create**.
3. Open the store → find **Read & Write** token (sometimes under “Connect”, “.env.local”, or “Tokens”).
4. Copy the full token (`vercel_blob_rw_…`). **Keep it secret.**

## 2. Link the store to your **app** project (important)

Still in the Blob store page, use **Connect to Project** (or equivalent) and select **the Next.js project that serves Stradaintel** (not only the Storage tab).

That step can add the token to the project automatically. If you skip it, you must add the token manually (step 4).

## 3. Upload both CSVs from your machine

```bash
cd /Users/kylecaruana/Documents/GitHub/Stradaintel
npm install
export BLOB_READ_WRITE_TOKEN="vercel_blob_rw_PASTE_FROM_VERCEL_STORAGE"
npm run upload:blob-all -- "/path/to/sales.csv" "/path/to/rentals.csv"
```

Examples:

```bash
npm run upload:blob-all -- "/Users/you/Documents/GitHub/Stradaintel/data/property/sales.csv" "/Users/you/Documents/GitHub/Stradaintel/rentals.csv"
```

The script prints **two URLs** and a **copy-paste table** for Vercel.

## 4. Environment variables (app project, not only Storage)

1. Vercel → **your Stradaintel project** (the one with the Next app).
2. **Settings** → **Environment Variables**.
3. Add **each** row. Enable **Production** (and Preview if you want).

| Name | Value |
|------|--------|
| `BLOB_READ_WRITE_TOKEN` | Same token as in `export` (no extra quotes in the UI). |
| `PROPERTY_SALES_CSV_URL` | Sales URL printed by the script. |
| `PROPERTY_RENTAL_CSV_URL` | Rentals URL printed by the script. |
| `BLOB_SALES_PATHNAME` | `stradaintel/sales.csv` |
| `BLOB_RENTAL_PATHNAME` | `stradaintel/rentals.csv` |

4. **Save**.
5. **Deployments** → open latest → **⋯** → **Redeploy** (or push an empty commit).  
   **New variables apply only after a redeploy.**

## 5. Checklist (what usually goes wrong)

- Token is on **Storage** but never on the **app** project → add `BLOB_READ_WRITE_TOKEN` on the app project.
- Only **Preview** enabled → enable **Production** for live site.
- **Redeploy skipped** → server still has old env.
- Token pasted with **smart quotes** or **spaces** → re-paste plain ASCII.
- Wrong variable name → must be exactly `BLOB_READ_WRITE_TOKEN`.

## 6. Why token matters

Public `GET` on the Blob URL can return **503** even when the file exists. The API then loads the same path using the token (`get(pathname)`) so the dashboard still works.

---

After this, refresh the dashboard. Optional: keep using `npm run upload:blob-all` whenever both CSVs update.
