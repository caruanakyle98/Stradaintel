// Property data: optional metrics JSON URL, sales/rental CSV URLs (HTTPS), or local path.

/** Pro/Enterprise: raise if CSV + AI still exceed default (see Vercel → Functions max duration). */
export const maxDuration = 120;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { buildPayloadFromCsvText, deriveAnalysisWindows } from '../../../lib/salesCsvPayload.js';
import { mergeRentalIntoPayload } from '../../../lib/rentalCsvPayload.js';
import { buildListingsPayload } from '../../../lib/listingsCsvPayload.js';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

function safeJsonFromText(text) {
  const candidates = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  for (const c of candidates.reverse()) {
    try {
      return JSON.parse(c);
    } catch {}
  }
  return null;
}

async function aiInterpretSales(stats, key) {
  if (!key) return null;
  try {
    const prompt = `You are interpreting Dubai property data (sales + optional rental counts).
Return ONLY valid JSON:
{
  "owner_briefing": "2 sentences for a property owner with one actionable watchpoint",
  "market_note": "1 short sentence about off-plan vs secondary from this week's data",
  "demand_signal": "landlord|tenant|balanced"
}
Use this data:\n${JSON.stringify(stats, null, 2)}`;

    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': key,
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const raw = await res.json();
    const text = (raw.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
    const parsed = safeJsonFromText(text);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      owner_briefing: String(parsed.owner_briefing || '').trim() || null,
      market_note: String(parsed.market_note || '').trim() || null,
      demand_signal: ['landlord', 'tenant', 'balanced'].includes(parsed.demand_signal) ? parsed.demand_signal : null,
    };
  } catch {
    return null;
  }
}

/** Fetch URL as text; retry 502/503/504 a few times (Blob/CDN blips). Per-attempt timeout avoids hanging until platform 504. */
async function fetchText(url, { timeoutMs = 50000 } = {}) {
  const max = 4;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= max; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Stradaintel/1' },
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);
      lastStatus = r.status;
      if (r.ok) return r.text();
      if (![502, 503, 504].includes(r.status) || attempt === max) {
        throw new Error(`GET ${url} → HTTP ${r.status}`);
      }
    } catch (e) {
      clearTimeout(timer);
      if (e?.name === 'AbortError') {
        if (attempt === max) {
          throw new Error(`GET ${url} → timed out after ${timeoutMs}ms (CSV may be very large or GitHub slow)`);
        }
        continue;
      }
      throw e;
    }
  }
  throw new Error(`GET ${url} → HTTP ${lastStatus}`);
}

function blobReadWriteToken() {
  return (
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.vercel_blob_rw_token ||
    process.env.VERCEL_BLOB_READ_WRITE_TOKEN ||
    ''
  ).trim();
}

/**
 * Load sales CSV. Order: (1) PROPERTY_SALES_CSV_URL(s) e.g. GitHub raw (2) Blob token + pathname fallback.
 */
async function loadSalesCsvText() {
  const token = blobReadWriteToken();
  const pathname = process.env.BLOB_SALES_PATHNAME || 'stradaintel/sales.csv';
  const rawUrls = process.env.PROPERTY_SALES_CSV_URL || '';
  const urlList = rawUrls
    .split(/[,\n\r]+/)
    .map((s) => s.trim())
    .filter((u) => u.startsWith('http'));
  let urlErrs = [];

  for (const u of urlList) {
    try {
      return { text: await fetchText(u), label: u };
    } catch (e) {
      urlErrs.push(`${u.slice(0, 48)}… → ${e?.message || e}`);
    }
  }

  if (token) {
    const { get } = await import('@vercel/blob');
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const out = await get(pathname, { access: 'public', token });
        if (out?.stream) {
          const text = await new Response(out.stream).text();
          if (text.length > 100) return { text, label: `blob:${pathname}` };
        }
        break;
      } catch (e) {
        const msg = e?.message || String(e);
        if (attempt === 3) urlErrs.push(`blob token+pathname: ${msg}`);
        if (!msg.includes('503') || attempt === 3) break;
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }

  const hint =
    urlList.length === 0 && !token
      ? 'Set PROPERTY_SALES_CSV_URL (e.g. GitHub raw). See docs/GITHUB_CSV.md'
      : urlList.length > 0
        ? 'All sales URL(s) failed. Check raw URL in browser (must return 200). docs/GITHUB_CSV.md'
        : 'Blob read failed. Set PROPERTY_SALES_CSV_URL to GitHub raw, or fix Blob. docs/GITHUB_CSV.md';
  throw new Error(`${hint} Details: ${urlErrs.join(' | ') || 'no source'}`);
}

async function loadRentalCsvText() {
  const token = blobReadWriteToken();
  const pathname = process.env.BLOB_RENTAL_PATHNAME || 'stradaintel/rentals.csv';
  const rentalUrls = (process.env.PROPERTY_RENTAL_CSV_URL || '')
    .split(/[,\n\r]+/)
    .map((s) => s.trim())
    .filter((u) => u.startsWith('http'));
  let urlErr = null;

  for (const rentalUrl of rentalUrls) {
    try {
      return { text: await fetchText(rentalUrl), label: rentalUrl };
    } catch (e) {
      urlErr = e?.message || String(e);
    }
  }
  if (token) {
    try {
      const { get } = await import('@vercel/blob');
      const out = await get(pathname, { access: 'public', token });
      if (out?.stream) {
        const text = await new Response(out.stream).text();
        if (text.length > 50) return { text, label: `blob:${pathname}` };
      }
    } catch (e) {
      urlErr = e?.message || String(urlErr || e);
    }
  }
  throw new Error(
    `Rental CSV failed. Set PROPERTY_RENTAL_CSV_URL (GitHub raw). ${urlErr || ''} docs/GITHUB_CSV.md`,
  );
}

async function loadListingsCsvText() {
  const listingsUrls = (process.env.PROPERTY_LISTINGS_CSV_URL || '')
    .split(/[,\n\r]+/)
    .map((s) => s.trim())
    .filter((u) => u.startsWith('http'));

  let urlErr = null;
  for (const url of listingsUrls) {
    try {
      return { text: await fetchText(url), label: url };
    } catch (e) {
      urlErr = e?.message || String(e);
    }
  }
  throw new Error(
    `Listings CSV failed. Set PROPERTY_LISTINGS_CSV_URL (GitHub raw). ${urlErr || ''} docs/GITHUB_CSV.md`,
  );
}

async function buildFromSalesText(csvRaw, label, { area, skipAi } = {}) {
  const result = buildPayloadFromCsvText(csvRaw, label, { area: area || undefined });
  if (!result.ok) return result;
  const payload = { ...result.body };
  const windows = result.windows;
  if (!skipAi) {
    const AI_MS = 22000;
    const ai = await Promise.race([
      aiInterpretSales(payload._stats_for_ai, process.env.ANTHROPIC_API_KEY),
      new Promise((resolve) => setTimeout(() => resolve(null), AI_MS)),
    ]);
    if (ai?.owner_briefing) payload.owner_briefing = ai.owner_briefing;
    if (ai?.market_note) payload.market_split.note = ai.market_note;
    if (ai?.demand_signal) payload.rental.landlord_vs_tenant = ai.demand_signal;
  }
  delete payload._stats_for_ai;
  return { ok: true, status: 200, body: payload, windows };
}

async function buildPayloadFromCsvPath(csvPath, opts) {
  const { access, readFile } = await import('node:fs/promises');
  await access(csvPath);
  const csvRaw = await readFile(csvPath, 'utf8');
  return buildFromSalesText(csvRaw, csvPath, opts);
}

function localPathHint(path) {
  if (!path) return null;
  if (path.startsWith('/Users/') || path.startsWith('C:\\')) {
    return 'Set PROPERTY_SALES_CSV_URL (HTTPS) on Vercel, or use the file picker. Server cannot read your Mac/PC path.';
  }
  return null;
}

export async function GET(request) {
  const pathMod = await import('node:path');
  const reqUrl = new URL(typeof request?.url === 'string' ? request.url : 'http://localhost');

  const areaParam = (reqUrl.searchParams.get('area') || '').trim();
  const areaFilterActive = !!(areaParam && areaParam !== '__all__');

  const csvPathFromQuery = reqUrl.searchParams.get('salesCsv') || reqUrl.searchParams.get('csvPath');
  const salesUrlEnv = process.env.PROPERTY_SALES_CSV_URL;
  const rentalUrlEnv = process.env.PROPERTY_RENTAL_CSV_URL;

  const metricsUrl = process.env.PROPERTY_METRICS_JSON_URL;
  if (metricsUrl && !reqUrl.searchParams.get('noSnapshot') && !areaFilterActive) {
    try {
      const text = await fetchText(metricsUrl);
      const json = JSON.parse(text);
      if (json && typeof json === 'object' && json.ok !== false) {
        const body = json.ok === undefined ? { ok: true, ...json } : json;
        if (rentalUrlEnv && body && typeof body === 'object') {
          try {
            const { text: rentalRaw, label: rentalLabel } = await loadRentalCsvText();
            const windows = deriveAnalysisWindows([]);
            mergeRentalIntoPayload(body, rentalRaw, rentalLabel, windows, {});
          } catch (e) {
            body.rental = body.rental || {};
            body.rental.note = `Rental URL failed: ${e?.message || e}.`;
          }
        }
        return Response.json(body);
      }
    } catch {
      /* fall through to CSV URLs */
    }
  }

  const forceLive = (reqUrl.searchParams.get('mode') || '').toLowerCase() === 'live';
  const hasSalesSource =
    !!(salesUrlEnv?.trim() || blobReadWriteToken() || csvPathFromQuery || process.env.PROPERTY_SALES_CSV_PATH);
  /* GitHub raw: PROPERTY_SALES_CSV_URL alone is enough — no Blob token required */
  if (forceLive && !hasSalesSource) {
    return Response.json({
      ok: false,
      error:
        'Set PROPERTY_SALES_CSV_URL or BLOB_READ_WRITE_TOKEN (+ upload sales.csv), or PROPERTY_METRICS_JSON_URL.',
    }, { status: 500 });
  }

  /* On Vercel, default repo path is not deployed — ENOENT without Blob/env */
  if (!hasSalesSource && process.env.VERCEL) {
    return Response.json(
      {
        ok: false,
        error: 'No sales CSV source configured',
        detail:
          'Vercel has no PROPERTY_SALES_CSV_URL or BLOB_READ_WRITE_TOKEN. data/property/sales.csv is not on the serverless bundle.',
        setup: [
          '1) Public data repo: push sales.csv + rentals.csv',
          '2) Raw URLs: https://raw.githubusercontent.com/USER/REPO/BRANCH/sales.csv',
          '3) Vercel → Env (Production): PROPERTY_SALES_CSV_URL, PROPERTY_RENTAL_CSV_URL → Redeploy',
          '4) docs/GITHUB_CSV.md',
        ],
      },
      { status: 503 },
    );
  }

  try {
    let result;

    const buildOpts = {
      area: areaParam || undefined,
      skipAi: areaFilterActive,
    };

    if ((salesUrlEnv?.trim() || blobReadWriteToken()) && !csvPathFromQuery) {
      const { text: csvRaw, label: salesLabel } = await loadSalesCsvText();
      result = await buildFromSalesText(csvRaw, salesLabel, buildOpts);
    } else {
      const csvPath = csvPathFromQuery
        ? pathMod.resolve(csvPathFromQuery)
        : process.env.PROPERTY_SALES_CSV_PATH
          ? process.env.PROPERTY_SALES_CSV_PATH
          : pathMod.resolve(process.cwd(), 'data/property/sales.csv');
      result = await buildPayloadFromCsvPath(csvPath, buildOpts);
    }

    if (!result.ok) {
      return Response.json(result.body, { status: result.status });
    }

    const listingsUrlEnv = process.env.PROPERTY_LISTINGS_CSV_URL?.trim();
    const needRental = !!(rentalUrlEnv && result.windows);
    const needListings = !!listingsUrlEnv;

    /* Sequential rental → listings (not parallel) to cap peak RAM: two large CSV strings
     * at once + parse copies can OOM the default ~2GB Node heap on Vercel. */
    if (needRental || needListings) {
      try {
        if (needRental) {
          try {
            const { text: rentalRaw, label: rentalLabel } = await loadRentalCsvText();
            mergeRentalIntoPayload(result.body, rentalRaw, rentalLabel, result.windows, {
              filterArea: areaFilterActive ? areaParam : '',
            });
          } catch (e) {
            result.body.rental = result.body.rental || {};
            result.body.rental.note = `Rental URL failed: ${e?.message || e}. Sales data still shown.`;
          }
        }

        if (needListings) {
          try {
            const { text: listingsRaw, label: listingsLabel } = await loadListingsCsvText();

            const rentalTxnAvgByBeds = {
              studio: parseFloat(result.body.rental?.studio_avg_aed) || null,
              '1br':  parseFloat(result.body.rental?.apt_1br_avg_aed) || null,
              '2br':  parseFloat(result.body.rental?.apt_2br_avg_aed) || null,
              '3br':  parseFloat(result.body.rental?.villa_3br_avg_aed) || null,
            };
            const rentalTxnByBuildingBed = result.body.rental?.txn_by_building_bed || {};

            const listingsResult = buildListingsPayload(listingsRaw, listingsLabel, {
              rentalTxnAvgByBeds,
              rentalTxnByBuildingBed,
              dataType: 'rental',
              filterArea: areaFilterActive ? areaParam : '',
            });

            if (listingsResult.ok && listingsResult.listings) {
              const weeklyRentals = parseInt(result.body.weekly?.rent_volume?.value) || null;
              if (weeklyRentals && weeklyRentals > 0) {
                const weeksOfSupply = listingsResult.listings.total / weeklyRentals;
                listingsResult.listings.supply_depth = {
                  weeks: parseFloat(weeksOfSupply.toFixed(1)),
                  listings_total: listingsResult.listings.total,
                  weekly_registrations: weeklyRentals,
                  label: `${weeksOfSupply.toFixed(1)} weeks of rental listing cover`,
                };
              }
              result.body.listings = listingsResult.listings;
            } else {
              result.body.listings = { error: listingsResult.error, source: listingsLabel };
            }
          } catch (e) {
            result.body.listings = { error: `Listings URL failed: ${e?.message || e}. Other data still shown.` };
          }
        }
      } catch (e) {
        result.body.rental = result.body.rental || {};
        result.body.rental.note = `Rental URL failed: ${e?.message || e}. Sales data still shown.`;
      }
    }

    return Response.json(result.body, { status: 200 });
  } catch (e) {
    const detail = e?.message || String(e);
    const hint503 =
      detail.includes('503') || detail.includes('502') || detail.includes('504')
        ? 'Use GitHub raw for PROPERTY_SALES_CSV_URL if Blob 503. docs/GITHUB_CSV.md'
        : null;
    return Response.json({
      ok: false,
      error: 'Failed to load property data',
      detail,
      hint: hint503 || localPathHint(csvPathFromQuery || ''),
    }, { status: 500 });
  }
}

export async function POST(request) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const pathMod = await import('node:path');
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return Response.json({ ok: false, error: 'No file provided.' }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > 4_000_000) {
      return Response.json({
        ok: false,
        error: 'File too large for server upload. Use file picker or PROPERTY_SALES_CSV_URL.',
      }, { status: 413 });
    }
    const safeName = String(file.name || 'sales.csv').replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!safeName.toLowerCase().endsWith('.csv')) {
      return Response.json({ ok: false, error: 'Only .csv files.' }, { status: 400 });
    }
    const uploadDir = pathMod.resolve(process.cwd(), 'data/property/uploads');
    await mkdir(uploadDir, { recursive: true });
    const fullPath = pathMod.join(uploadDir, `${Date.now()}-${safeName}`);
    await writeFile(fullPath, buf);
    return Response.json({ ok: true, csv_path: fullPath });
  } catch (e) {
    return Response.json({ ok: false, error: 'Upload failed.', detail: String(e?.message || e) }, { status: 500 });
  }
}
