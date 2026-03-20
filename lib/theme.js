/**
 * Single source of truth for UI colours. Sharper accents and glow utilities
 * so key metrics pop; keeps the intelligence/dashboard style (green/amber/red semantics).
 */
export const C = {
  // Deep navy / near-black baseline
  bg: '#07080c',
  surf: '#0f1626',
  card: '#0b1220',
  border: '#243450',
  // Secondary surfaces / UI chrome
  gd: '#0c1524',
  gm: '#b68d2a',
  // Gold / warm amber accents (success / strong signals)
  g: '#d4af37',
  ga: '#f4d35e',
  am: '#f59e0b',
  amL: '#fbbf24',
  // Risk / negative signals
  red: '#ef4444',
  // Typography colors (muted blues)
  t1: '#e8eefc',
  t2: '#93a3b7',
  tm: '#6b7c93',
  td: '#2a344a',
  /** Brighter neutral for key metric values (big numbers) so they stand out */
  metric: '#b7d3ff',
  /** Glow shadows for key metrics — use with textShadow or boxShadow */
  glowG: '0 0 16px rgba(212,175,55,0.48)',
  glowGa: '0 0 20px rgba(244,211,94,0.45)',
  glowAm: '0 0 16px rgba(245,158,11,0.50)',
  glowRed: '0 0 14px rgba(239,68,68,0.45)',
  glowMetric: '0 0 12px rgba(183,211,255,0.35)',
};
