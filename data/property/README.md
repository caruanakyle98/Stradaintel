## Self-hosted property data

This folder is where you can place self-hosted property datasets (CSV exports) for the dashboard to read server-side.

### Sales transactions (CSV)

- **Default path (if you don’t set an env var)**: `data/property/sales.csv`
- **Override by env var**: set `PROPERTY_SALES_CSV_PATH` to an absolute path
- **Override from the UI/API call**: pass `salesCsv=/absolute/or/relative/path.csv` (same as `csvPath`)

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
