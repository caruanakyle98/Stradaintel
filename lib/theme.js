/**
 * Single source of truth for UI colours. Sharper accents and glow utilities
 * so key metrics pop; keeps the intelligence/dashboard style (green/amber/red semantics).
 */
export const C = {
  bg: '#1c1f1c',
  surf: '#252925',
  card: '#2c322c',
  border: '#3d443d',
  gd: '#1e3320',
  gm: '#2d6b2d',
  g: '#4ade4a',
  ga: '#6ef06e',
  am: '#f59e0b',
  amL: '#fbbf24',
  red: '#ef4444',
  t1: '#e8efe8',
  t2: '#8aab8a',
  tm: '#5c6b5c',
  td: '#3d4a3d',
  /** Brighter neutral for key metric values (big numbers) so they stand out */
  metric: '#c8f0c8',
  /** Glow shadows for key metrics — use with textShadow or boxShadow */
  glowG: '0 0 14px rgba(74,222,74,0.5)',
  glowGa: '0 0 16px rgba(110,240,110,0.45)',
  glowAm: '0 0 14px rgba(245,158,11,0.5)',
  glowRed: '0 0 14px rgba(239,68,68,0.45)',
  glowMetric: '0 0 12px rgba(200,240,200,0.4)',
};
