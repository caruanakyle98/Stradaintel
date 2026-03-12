## Self-hosted property data

This folder is where you can place self-hosted property datasets (CSV exports) for the dashboard to read server-side.

### Sales transactions (CSV)

- **Default path (if you don’t set an env var)**: `data/property/sales.csv`
- **Override**: set `PROPERTY_SALES_CSV_PATH` to an absolute path (recommended for local dev if the file is outside the repo)
- **Enable local mode**: set `PROPERTY_DATA_MODE=local` (or call `GET /api/property?mode=local`)

The API will compute weekly totals, off-plan vs secondary split, and top areas from the CSV.

