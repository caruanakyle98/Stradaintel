# `property_metrics.json` (committed snapshot)

GitHub Actions writes [`property_metrics.json`](./property_metrics.json) here when the **Property metrics snapshot** workflow runs.

**Vercel Production:** set `PROPERTY_METRICS_JSON_URL` to the raw URL, for example:

`https://raw.githubusercontent.com/<USER>/<REPO>/<BRANCH>/data/property/property_metrics.json`

The first run of the workflow creates this file; until then the path may be missing locally.
