## Self-hosted property data

This folder is where you can place self-hosted property datasets (CSV exports) for the dashboard to read server-side.

**Vercel / no upload:** configure `PROPERTY_SALES_CSV_URL` (and optional `PROPERTY_RENTAL_CSV_URL`) — see [HOSTING.md](./HOSTING.md).

### Sales transactions (CSV)

- **Default path (if you don’t set an env var)**: `data/property/sales.csv`
- **Override by env var**: set `PROPERTY_SALES_CSV_PATH` to an absolute path
- **Override from the UI/API call**: pass `salesCsv=/absolute/or/relative/path.csv` (same as `csvPath`)

### Rolling windows (sales)

Counts and AED totals use **today’s date in Dubai (GST)**: **last 7 calendar days including today**, compared to the **previous 7 calendar days** (for % change). Rows outside those ranges are ignored for the headline cards.

**Charts (30 days):** The API adds `charts_30d`: daily sale counts and PSF, **7-day moving averages**, and **weekly** aggregates (volume totals; PSF **median** plus 25th–75th percentile band). Rebuild metrics snapshots after deploy so JSON includes the new fields.

**Automated CSV upload:** See [HOSTING.md](./HOSTING.md) → *Automate Blob upload* — `npm run upload:sales-blob` after your daily merge.

### CSV mapping rules

The API now auto-maps common column name variants so your file does not need an exact schema match.

Required logical fields:
- Transaction date (e.g. `Evidence Date`, `Date`, `Transaction Date`)
- Price in AED (e.g. `Price (AED)`, `Sale Price`, `Amount`)

Optional fields used for richer cards:
- Segment marker (e.g. `Select Data Points`) where **`Oqood` = off-plan** and `Title Deed` = secondary
- Area/project/community name
- Unit/property type (used for apartment vs villa splits)
- Price per sq ft

If rentals/listings are not connected, the dashboard will explicitly show `N/A` for those sections while still using your sales feed for transaction-driven insights.

### Important path note

The path is resolved on the machine where Next.js is running (server-side).
If you are deployed remotely, `/Users/...` from your laptop is not readable by the server; use `PROPERTY_SALES_CSV_PATH` on that server or upload/copy the CSV into a server-readable location first.


### Uploading local CSV files from the dashboard

If your CSV is on your laptop (for example under `/Users/...`) and the dashboard runs in a container/remote host, that filesystem path will not be readable server-side.
Use the dashboard's **Upload local CSV directly** control, which sends the file to `/api/property` (POST) and stores it under `data/property/uploads/` for analysis.
