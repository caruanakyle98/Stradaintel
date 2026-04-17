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

/**
 * Normalize location hierarchy across an entire CSV's records.
 *
 * DLD exports have 3 location columns but their semantic roles vary by area:
 *
 *   2-level  (e.g. Dubai Studio City):  col2 = building,  col3 = empty
 *   3-level  (normal, e.g. Downtown):   col2 = district,  col3 = building
 *   3-level  (inverted, e.g. Dubai Harbour): col2 = building, col3 = district
 *
 * Detection: count distinct values per area in each column. The column with
 * fewer distinct values is the broader grouping (district); more distinct = building.
 * When col3 is empty for all records in an area → 2-level, col2 is the building.
 *
 * Adds two normalized fields to every record:
 *   normDistrict  — development/community name (null for 2-level areas)
 *   normBuilding  — specific tower/building name (null when not resolvable)
 *
 * @param {object[]} records
 * @param {string} col2Field  field name for Community/Building column
 * @param {string} col3Field  field name for Sub Community/Building.1 column
 * @param {string} [areaField='area']  field name for the top-level area
 * @returns {object[]} same records with normDistrict and normBuilding added
 */
export function normalizeLocationHierarchy(records, col2Field, col3Field, areaField = 'area') {
  // ── Pass 1: count distinct non-empty, non-area-duplicate values per area ──
  const col2Sets = new Map(); // areaNorm → Set<string>
  const col3Sets = new Map(); // areaNorm → Set<string>

  for (const r of records) {
    const area     = String(r[areaField] || '').trim();
    const areaNorm = normalizeCommunityKey(area);
    const v2       = String(r[col2Field] || '').trim();
    const v3       = String(r[col3Field] || '').trim();

    if (!col2Sets.has(areaNorm)) { col2Sets.set(areaNorm, new Set()); col3Sets.set(areaNorm, new Set()); }

    // Skip values that duplicate the area name — not meaningful as a sub-level
    if (v2 && normalizeCommunityKey(v2) !== areaNorm) col2Sets.get(areaNorm).add(normalizeCommunityKey(v2));
    if (v3 && normalizeCommunityKey(v3) !== areaNorm) col3Sets.get(areaNorm).add(normalizeCommunityKey(v3));
  }

  // ── Pass 2: determine column roles per area ──────────────────────────────
  // districtIsCol2:  true  → col2 = district, col3 = building  (normal)
  //                  false → col2 = building, col3 = district  (inverted)
  //                  null  → 2-level: no district, col2 = building
  const areaRoles = new Map();
  for (const [areaNorm, c2] of col2Sets) {
    const c3 = col3Sets.get(areaNorm) || new Set();
    if (c3.size === 0) {
      areaRoles.set(areaNorm, null);          // 2-level
    } else if (c2.size <= c3.size) {
      areaRoles.set(areaNorm, true);          // normal: col2 fewer distinct → district
    } else {
      areaRoles.set(areaNorm, false);         // inverted: col2 more distinct → building
    }
  }

  // ── Pass 3: annotate records ──────────────────────────────────────────────
  return records.map((r) => {
    const area     = String(r[areaField] || '').trim();
    const areaNorm = normalizeCommunityKey(area);
    const role     = areaRoles.has(areaNorm) ? areaRoles.get(areaNorm) : true; // default normal
    // Suppress values that duplicate the area name — same rule as Pass 1.
    // e.g. Dubai Marina records often have col D = "Dubai Marina", which is not a
    // meaningful district sub-level; treating it as null lets each tower appear
    // as its own top-level building option rather than being hidden inside a single
    // "Dubai Marina" community entry.
    const v2raw    = String(r[col2Field] || '').trim() || null;
    const v3raw    = String(r[col3Field] || '').trim() || null;
    const v2       = (v2raw && normalizeCommunityKey(v2raw) !== areaNorm) ? v2raw : null;
    const v3       = (v3raw && normalizeCommunityKey(v3raw) !== areaNorm) ? v3raw : null;

    let normDistrict, normBuilding;
    if (role === null) {
      // 2-level: no distinct middle tier
      normDistrict = null;
      normBuilding = v2;
    } else if (role === true) {
      // Normal: col2 = district, col3 = building
      normDistrict = v2;
      normBuilding = v3;
    } else {
      // Inverted: col2 = building, col3 = district
      normDistrict = v3;
      normBuilding = v2;
    }

    return { ...r, normDistrict, normBuilding };
  });
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
