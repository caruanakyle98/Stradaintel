// Property data: optional metrics JSON URL, sales/rental CSV URLs (HTTPS), or local path.

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { buildPayloadFromCsvText, deriveAnalysisWindows } from '../../../lib/salesCsvPayload.js';
import { mergeRentalIntoPayload } from '../../../lib/rentalCsvPayload.js';

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

/** Fetch URL as text; retry 502/503/504 a few times (Blob/CDN blips). */
async function fetchText(url) {
  const max = 4;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= max; attempt++) {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Stradaintel/1' },
      cache: 'no-store',
    });
    lastStatus = r.status;
    if (r.ok) return r.text();
    if (![502, 503, 504].includes(r.status) || attempt === max) {
      throw new Error(`GET ${url} → HTTP ${r.status}`);
    }
  }
  throw new Error(`GET ${url} → HTTP ${lastStatus}`);
}

/**
 * Load sales CSV. Token-first: avoids dead public URLs (503) when PROPERTY_SALES_CSV_URL is stale.
 * Upload uses the same pathname (default stradaintel/sales.csv) + same token → always hits current store.
 */
async function loadSalesCsvText() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const pathname = process.env.BLOB_SALES_PATHNAME || 'stradaintel/sales.csv';
  const salesUrl = process.env.PROPERTY_SALES_CSV_URL?.trim();
  let urlErr = null;

  if (token) {
    try {
      const { get } = await import('@vercel/blob');
      const out = await get(pathname, { access: 'public', token });
      if (out?.stream) {
        const text = await new Response(out.stream).text();
        if (text.length > 100) return { text, label: `blob:${pathname}` };
      }
    } catch {
      /* try public URL below */
    }
  }

  if (salesUrl) {
    try {
      return { text: await fetchText(salesUrl), label: salesUrl };
    } catch (e) {
      urlErr = e?.message || String(e);
    }
  }

  if (!token) {
    throw new Error(
      `${urlErr || 'No sales source'}. Fix: Vercel → Project → Settings → Environment Variables → add BLOB_READ_WRITE_TOKEN (Read/Write token from the SAME Blob store you used for upload). Scope: Production. Redeploy. Optional: set PROPERTY_SALES_CSV_URL to the URL printed after upload.`,
    );
  }
  throw new Error(
    `Blob store has no file at pathname "${pathname}" (or token store mismatch). ${urlErr ? `Public URL also failed: ${urlErr}` : ''} Re-run: npm run upload:sales-blob -- /path/to/sales.csv — then redeploy with BLOB_READ_WRITE_TOKEN set for Production.`,
  );
}

async function loadRentalCsvText() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const pathname = process.env.BLOB_RENTAL_PATHNAME || 'stradaintel/rentals.csv';
  const rentalUrl = process.env.PROPERTY_RENTAL_CSV_URL?.trim();
  let urlErr = null;

  if (token) {
    try {
      const { get } = await import('@vercel/blob');
      const out = await get(pathname, { access: 'public', token });
      if (out?.stream) {
        const text = await new Response(out.stream).text();
        if (text.length > 50) return { text, label: `blob:${pathname}` };
      }
    } catch {
      /* fall through */
    }
  }
  if (rentalUrl) {
    try {
      return { text: await fetchText(rentalUrl), label: rentalUrl };
    } catch (e) {
      urlErr = e?.message || String(e);
    }
  }
  throw new Error(
    token
      ? `Rental: no file at "${pathname}" and URL failed. ${urlErr || ''}`
      : `Rental load failed. ${urlErr || 'Set PROPERTY_RENTAL_CSV_URL or BLOB_READ_WRITE_TOKEN + upload rentals to BLOB_RENTAL_PATHNAME.'}`,
  );
}

async function buildFromSalesText(csvRaw, label, { area, skipAi } = {}) {
  const result = buildPayloadFromCsvText(csvRaw, label, { area: area || undefined });
  if (!result.ok) return result;
  const payload = { ...result.body };
  const windows = result.windows;
  if (!skipAi) {
    const ai = await aiInterpretSales(payload._stats_for_ai, process.env.ANTHROPIC_API_KEY);
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
            mergeRentalIntoPayload(body, rentalRaw, rentalLabel, windows);
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
  if (forceLive && !salesUrlEnv && !csvPathFromQuery && !process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({
      ok: false,
      error:
        'Set PROPERTY_SALES_CSV_URL or BLOB_READ_WRITE_TOKEN (+ upload sales.csv), or PROPERTY_METRICS_JSON_URL.',
    }, { status: 500 });
  }

  try {
    let result;

    const buildOpts = {
      area: areaParam || undefined,
      skipAi: areaFilterActive,
    };

    if ((salesUrlEnv || process.env.BLOB_READ_WRITE_TOKEN) && !csvPathFromQuery) {
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

    if (rentalUrlEnv && result.windows) {
      try {
        const { text: rentalRaw, label: rentalLabel } = await loadRentalCsvText();
        mergeRentalIntoPayload(result.body, rentalRaw, rentalLabel, result.windows);
      } catch (e) {
        result.body.rental = result.body.rental || {};
        result.body.rental.note = `Rental URL failed: ${e?.message || e}. Sales data still shown.`;
      }
    }

    return Response.json(result.body, { status: 200 });
  } catch (e) {
    const detail = e?.message || String(e);
    const hint503 =
      detail.includes('503') || detail.includes('502') || detail.includes('504') || detail.includes('BLOB_READ_WRITE_TOKEN')
        ? 'Load order is now: BLOB_READ_WRITE_TOKEN + pathname first (ignores dead public URLs). On Vercel add BLOB_READ_WRITE_TOKEN for Production, redeploy. Upload pathname must be stradaintel/sales.csv unless BLOB_SALES_PATHNAME is set.'
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
