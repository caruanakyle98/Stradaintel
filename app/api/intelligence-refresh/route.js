import { put } from '@vercel/blob';
import { buildIntelligencePayload } from '../intelligence/route.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function blobToken() {
  return (
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.vercel_blob_rw_token ||
    process.env.VERCEL_BLOB_READ_WRITE_TOKEN ||
    ''
  ).trim();
}

function snapshotPath() {
  return (process.env.INTEL_SNAPSHOT_BLOB_PATH || 'stradaintel/intelligence-latest.json').trim();
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
    const payload = await buildIntelligencePayload();
    const stamped = {
      ...payload,
      snapshot_refreshed_at: new Date().toISOString(),
      snapshot_source: 'admin-refresh',
    };
    const path = snapshotPath();
    const saved = await put(path, JSON.stringify(stamped, null, 2), {
      access: 'public',
      token,
      contentType: 'application/json; charset=utf-8',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return Response.json({
      ok: true,
      ts: stamped.ts,
      snapshot_refreshed_at: stamped.snapshot_refreshed_at,
      snapshot_path: path,
      snapshot_url: saved?.url || null,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: 'Failed to refresh intelligence snapshot.', detail: String(e?.message || e) },
      { status: 500 },
    );
  }
}

