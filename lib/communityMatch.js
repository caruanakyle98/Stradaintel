/**
 * Cross-CSV community/area matching (sales vs rental vs listings).
 * Listing exports often shorten names ("Greens" vs "The Greens").
 */

/**
 * Normalize a community name for comparison: trim, lowercase, collapse spaces,
 * strip a leading English "The " (so "The Greens" and "Greens" align).
 * @param {string} s
 * @returns {string}
 */
export function normalizeCommunityKey(s) {
  let t = String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  t = t.replace(/^the\s+/i, '').trim();
  return t;
}

/**
 * Build a map: normalized alias -> canonical key (first element of each group, normalized).
 * @param {string[][]} groups
 * @returns {Map<string, string>|null}
 */
export function buildAliasMapFromGroups(groups) {
  if (!groups || !Array.isArray(groups)) return null;
  const map = new Map();
  for (const g of groups) {
    if (!Array.isArray(g) || g.length === 0) continue;
    const canonical = normalizeCommunityKey(g[0]);
    for (const m of g) {
      map.set(normalizeCommunityKey(m), canonical);
    }
  }
  return map.size > 0 ? map : null;
}

/**
 * @param {string} s
 * @param {Map<string, string>|null|undefined} aliasMap
 * @returns {string}
 */
export function resolveCommunityMatchKey(s, aliasMap) {
  const n = normalizeCommunityKey(s);
  if (!aliasMap || !aliasMap.has(n)) return n;
  return aliasMap.get(n);
}

/**
 * @param {string} a
 * @param {string} b
 * @param {Map<string, string>|null|undefined} aliasMap
 * @returns {boolean}
 */
export function communitiesMatch(a, b, aliasMap) {
  const ka = resolveCommunityMatchKey(a, aliasMap);
  const kb = resolveCommunityMatchKey(b, aliasMap);
  return ka === kb;
}

let _cachedAliasMap = null;
let _aliasEnvSeen = false;

/**
 * Optional env: COMMUNITY_ALIAS_JSON = [["JVC","Jumeirah Village Circle"],...]
 * Parsed once per server process. Unused in the browser (no env).
 * @returns {Map<string, string>|null}
 */
export function getCommunityAliasMapFromEnv() {
  if (typeof process === 'undefined') return null;
  if (_aliasEnvSeen) return _cachedAliasMap;
  _aliasEnvSeen = true;
  const raw = process.env?.COMMUNITY_ALIAS_JSON?.trim();
  if (!raw) return null;
  try {
    const groups = JSON.parse(raw);
    _cachedAliasMap = buildAliasMapFromGroups(groups);
  } catch {
    _cachedAliasMap = null;
  }
  return _cachedAliasMap;
}
