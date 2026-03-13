// Property data from self-hosted sales CSV; optional AI interpretation.
// Large uploads: use client-side parse (see page.js) — Vercel rejects bodies > ~4.5MB (HTTP 413).

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

import { buildPayloadFromCsvText } from '../../../lib/salesCsvPayload.js';

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
    const prompt = `You are interpreting Dubai sales transactions data only (no rentals/listings available).
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

async function buildPayloadFromCsvPath(csvPath) {
  const { access, readFile } = await import('node:fs/promises');
  await access(csvPath);
  const csvRaw = await readFile(csvPath, 'utf8');
  const result = buildPayloadFromCsvText(csvRaw, csvPath);
  if (!result.ok) return result;
  const payload = { ...result.body };
  const ai = await aiInterpretSales(payload._stats_for_ai, process.env.ANTHROPIC_API_KEY);
  if (ai?.owner_briefing) payload.owner_briefing = ai.owner_briefing;
  if (ai?.market_note) payload.market_split.note = ai.market_note;
  if (ai?.demand_signal) payload.rental.landlord_vs_tenant = ai.demand_signal;
  delete payload._stats_for_ai;
  return { ok: true, status: 200, body: payload };
}

function localPathHint(path) {
  if (!path) return null;
  if (path.startsWith('/Users/') || path.startsWith('C:\\')) {
    return 'Server cannot read your Mac/PC path. Choose the CSV file again — it loads in your browser (no upload size limit).';
  }
  return null;
}

export async function GET(request) {
  const pathMod = await import('node:path');
  const url = new URL(typeof request?.url === 'string' ? request.url : 'http://localhost');

  const csvPathFromQuery = url.searchParams.get('salesCsv') || url.searchParams.get('csvPath');
  const csvPath = csvPathFromQuery
    ? pathMod.resolve(csvPathFromQuery)
    : process.env.PROPERTY_SALES_CSV_PATH
      ? process.env.PROPERTY_SALES_CSV_PATH
      : pathMod.resolve(process.cwd(), 'data/property/sales.csv');

  const forceLive = (url.searchParams.get('mode') || '').toLowerCase() === 'live';
  if (forceLive) {
    return Response.json({
      ok: false,
      error: `No sales CSV data found. Set PROPERTY_SALES_CSV_PATH or place sales.csv at ${csvPath}.`,
    }, { status: 500 });
  }

  try {
    const result = await buildPayloadFromCsvPath(csvPath);
    return Response.json(result.body, { status: result.status });
  } catch (e) {
    return Response.json({
      ok: false,
      error: `Unable to read sales CSV at path: ${csvPath}`,
      detail: e?.message || 'Unknown filesystem error.',
      hint: localPathHint(csvPath),
    }, { status: 500 });
  }
}

/** Small uploads only — Vercel returns 413 before this runs if body > ~4.5MB. */
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
        error: 'File too large for server upload (HTTP 413 on Vercel). Choose the same file again — dashboard parses it in your browser.',
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
    const msg = String(e?.message || '');
    if (msg.includes('413') || msg.includes('too large')) {
      return Response.json({
        ok: false,
        error: 'Upload too large for hosting. Use file picker — CSV is parsed in your browser (no limit).',
      }, { status: 413 });
    }
    return Response.json({ ok: false, error: 'Upload failed.', detail: msg }, { status: 500 });
  }
}
