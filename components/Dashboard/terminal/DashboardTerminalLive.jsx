'use client';
// Live-data wrapper: fetches /api/property-read + /api/intelligence-read,
// adapts the response onto the SI_DATA shape, and renders DashboardTerminal.
// Falls back to the fixture if either snapshot is unavailable.

import { useEffect, useRef, useState } from 'react';
import { DashboardTerminal } from './DashboardTerminal.jsx';
import { SI_DATA } from './data.js';
import { adaptLive } from './adaptLive.js';

async function safeFetchJson(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export function DashboardTerminalLive() {
  const [data, setData] = useState(SI_DATA);
  const [status, setStatus] = useState('loading'); // 'loading' | 'live' | 'fallback'
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;
    let cancelled = false;
    (async () => {
      const [property, intelligence] = await Promise.all([
        safeFetchJson('/api/property-read'),
        safeFetchJson('/api/intelligence-read'),
      ]);
      if (cancelled) return;
      const haveAny = (property && property.ok !== false) || (intelligence && intelligence.ok !== false);
      if (!haveAny) {
        setStatus('fallback');
        return;
      }
      setData(adaptLive({ property, intelligence }));
      setStatus('live');
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {status !== 'live' && (
        <div style={{
          position: 'fixed', top: 8, right: 8, zIndex: 100,
          padding: '4px 10px', borderRadius: 999,
          background: status === 'loading' ? 'rgba(183,211,255,0.10)' : 'rgba(245,158,11,0.10)',
          border: status === 'loading' ? '1px solid rgba(183,211,255,0.30)' : '1px solid rgba(245,158,11,0.30)',
          color: status === 'loading' ? '#b7d3ff' : '#fbbf24',
          fontFamily: "'Montserrat',serif", fontSize: 9, fontWeight: 700,
          letterSpacing: '1.5px', textTransform: 'uppercase',
        }}>
          {status === 'loading' ? 'Loading live data…' : 'Showing cached fixture'}
        </div>
      )}
      <DashboardTerminal data={data} />
    </>
  );
}
