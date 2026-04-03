import { put } from '@vercel/blob';

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

function adminToken() {
  return (process.env.INTEL_ADMIN_TOKEN || '').trim();
}

function tokenFromRequest(request) {
  const h = request.headers.get('x-intel-admin-token') || request.headers.get('authorization') || '';
  const fromHeader = h.startsWith('Bearer ') ? h.slice(7) : h;
  if (fromHeader.trim()) return fromHeader.trim();
  try {
    const u = new URL(typeof request?.url === 'string' ? request.url : 'http://localhost');
    return (u.searchParams.get('token') || '').trim();
  } catch {
    return '';
  }
}

/**
 * Receives the already-built property payload from the admin frontend
 * and saves it to Blob. No CSV processing — avoids Vercel OOM.
 */
export async function POST(request) {
  const expected = adminToken();
  if (!expected) {
    return Response.json({ ok: false, error: 'INTEL_ADMIN_TOKEN not configured.' }, { status: 500 });
  }
  const got = tokenFromRequest(request);
  if (!got || got !== expected) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }
  const token = blobToken();
  if (!token) {
    return Response.json({ ok: false, error: 'Blob token missing. Set BLOB_READ_WRITE_TOKEN.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || !body.ok) {
      return Response.json({ ok: false, error: 'Invalid payload. Expected property data with ok: true.' }, { status: 400 });
    }

    const stamped = {
      ...body,
      snapshot_refreshed_at: new Date().toISOString(),
      snapshot_source: 'property-refresh',
    };

    const path = snapshotPath();
    const saved = await put(path, JSON.stringify(stamped), {
      access: 'public',
      token,
      contentType: 'application/json; charset=utf-8',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return Response.json({
      ok: true,
      snapshot_refreshed_at: stamped.snapshot_refreshed_at,
      snapshot_path: path,
      snapshot_url: saved?.url || null,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: 'Failed to save property snapshot.', detail: String(e?.message || e) },
      { status: 500 },
    );
  }
}
