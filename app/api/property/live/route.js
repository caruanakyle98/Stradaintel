/**
 * Thin cached proxy over /api/property with segment-specific skip flags.
 * Lets the client load rental + listing slices in parallel; CDN can cache per type (data updates daily).
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CDN_CACHE = 'public, s-maxage=21600, stale-while-revalidate=86400';

function internalPropertySearchParams(type) {
  const p = new URLSearchParams();
  p.set('noSnapshot', '1');
  p.set('skipAi', '1');
  p.set('skipHotListings', '1');
  if (type === 'sales') {
    p.set('skipRental', '1');
    p.set('skipListings', '1');
    p.set('skipSalesListings', '1');
  } else if (type === 'rental') {
    p.set('skipListings', '1');
    p.set('skipSalesListings', '1');
  } else if (type === 'listings_rental') {
    p.set('skipSalesListings', '1');
  } else if (type === 'listings_sales') {
    p.set('skipRental', '1');
    p.set('skipListings', '1');
  } else {
    return null;
  }
  return p;
}

export async function GET(request) {
  const type = request.nextUrl.searchParams.get('type');
  const params = internalPropertySearchParams(type);
  if (!params) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Invalid or missing type',
        detail: 'Use type=sales|rental|listings_rental|listings_sales',
      },
      { status: 400 },
    );
  }

  const forwardKeys = new Set(['area', 'salesCsv']);
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (key === 'type' || !forwardKeys.has(key)) continue;
    params.set(key, value);
  }

  const url = `${request.nextUrl.origin}/api/property?${params.toString()}`;
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Stradaintel-property-live-segment/1' },
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': res.ok ? CDN_CACHE : 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: 'Upstream property fetch failed', detail: String(e?.message || e) },
      { status: 502 },
    );
  }
}
