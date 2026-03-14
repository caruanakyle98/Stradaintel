# When Vercel Blob returns 503 (read fails after upload)

## Runtime check (proves it’s not your Next app)

From **any** machine (your laptop):

```bash
curl -sI "https://YOUR_STORE.public.blob.vercel-storage.com/stradaintel/sales.csv" | head -1
```

If you see **`HTTP/2 503`** (or `503 Service Unavailable`), **Vercel Blob is not delivering that object over HTTPS**. That matches what the dashboard and `curl` see — it is **not** caused by missing env vars or serverless alone.

Successful **`put`** + failing **`GET`** on the same URL has been reported; treat it as **Vercel-side** until support confirms otherwise.

## What to do

### A) Vercel Support (keep using Blob long term)

Open a ticket with:

- Blob store name / id  
- Full public URL  
- “Upload succeeds; **HEAD/GET returns 503** from browser and curl”  
- Optional: run `node scripts/verify-blob-read.mjs <publicUrl> stradaintel/sales.csv` and paste output  

### B) Unblock the dashboard now (GitHub raw)

1. Create a **public** repo (or use a folder in one).  
2. Add `sales.csv` (and `rentals.csv` if needed) and push.  
3. Raw URLs:
   - `https://raw.githubusercontent.com/<user>/<repo>/<branch>/sales.csv`
4. **Vercel → Env (Production):**
   - `PROPERTY_SALES_CSV_URL` = raw sales URL  
   - `PROPERTY_RENTAL_CSV_URL` = raw rentals URL  
5. **Remove or ignore Blob URLs** for these two vars until Blob reads work again.  
6. **Redeploy.**

You can **keep uploading to Blob** for backup; the app only needs a URL that returns **200** on GET.

### C) R2 / S3

Any **stable HTTPS 200** for the CSV works the same way.

---

**Summary:** 503 on public Blob URL from `curl` = **read path broken on Blob**. Use GitHub raw (or R2) for `PROPERTY_SALES_CSV_URL` until Vercel fixes the store or tells you what changed.
