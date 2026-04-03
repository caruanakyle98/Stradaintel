import { get } from '@vercel/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function blobToken() {
  return (
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.vercel_blob_rw_token ||
    process.env.VERCEL_BLOB_READ_WRITE_TOKEN ||
    ''
  ).trim();
}

function snapshotPath() {
  return (process.env.PROP_SNAPSHOT_BLOB_PATH || 'stradaintel/property-latest.json').trim();
}

export async function GET() {
  const token = blobToken();
  if (!token) {
    return Response.json(
      { ok: false, error: 'Blob token missing. Set BLOB_READ_WRITE_TOKEN.' },
      { status: 500 },
    );
  }
  const path = snapshotPath();
  try {
    const out = await get(path, { access: 'public', token });
    if (!out?.stream) {
      return Response.json({ ok: false, error: 'No property snapshot found. Run property-refresh first.' }, { status: 404 });
    }
    const text = await new Response(out.stream).text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') {
      return Response.json({ ok: false, error: 'Snapshot JSON invalid.' }, { status: 500 });
    }
    return Response.json(parsed);
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: 'No property snapshot available yet. An admin must run property-refresh.',
        detail: String(e?.message || e),
      },
      { status: 404 },
    );
  }
}
