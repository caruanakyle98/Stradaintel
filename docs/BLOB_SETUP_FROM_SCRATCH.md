# Vercel Blob (optional)

**Default hosting is GitHub raw** — see **[GITHUB_CSV.md](./GITHUB_CSV.md)**. Use Blob only if you prefer it and reads return 200.

## Blob setup (sales + rentals)

1. Vercel → **Storage** → **Blob** → create store → **Read & Write** token.
2. **Connect** store to your app project (optional).
3. Local upload:

   ```bash
   export BLOB_READ_WRITE_TOKEN="vercel_blob_rw_…"
   npm run upload:blob-all -- /path/to/sales.csv /path/to/rentals.csv
   ```

4. Vercel → Env **Production**: `BLOB_READ_WRITE_TOKEN`, `PROPERTY_SALES_CSV_URL`, `PROPERTY_RENTAL_CSV_URL`, `BLOB_SALES_PATHNAME=stradaintel/sales.csv`, `BLOB_RENTAL_PATHNAME=stradaintel/rentals.csv` → **Redeploy**.

If Blob **GET returns 503**, use GitHub raw for the two URL vars instead (API tries URLs **before** Blob).
