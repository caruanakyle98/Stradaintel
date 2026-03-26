/**
 * Property type for hot-listing benchmarks: building + bed + {apt|villa|townhouse}.
 * Shared by listings CSV, rental CSV, and sales CSV (no cross-import cycles).
 */

/** @typedef {'apt'|'villa'|'townhouse'} HotUnitTypeKey */

/**
 * Parse free-text unit / property type (listings + rental exports).
 * Defaults to apartment when empty or unknown (typical Dubai listing mix).
 * @param {string|null|undefined} raw
 * @returns {HotUnitTypeKey}
 */
export function normalizeUnitTypeKeyFromString(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (!s) return 'apt';
  if (/\btown\s*house\b/.test(s) || s.includes('townhouse')) return 'townhouse';
  if (/\bvilla\b/.test(s)) return 'villa';
  if (
    /\bapartment\b/.test(s) ||
    /\bflat\b/.test(s) ||
    /\bhotel apartment\b/.test(s) ||
    /\bpenthouse\b/.test(s) ||
    /\boffice\b/.test(s)
  ) {
    return 'apt';
  }
  if (s === 'apt' || s === 'apartments' || s === 'unit') return 'apt';
  return 'apt';
}

/**
 * Map sales CSV record unitType into hot-list key.
 * @param {string} [unitType] apt | villa | townhouse | other
 * @returns {HotUnitTypeKey}
 */
export function hotUnitTypeKeyFromSales(unitType) {
  if (unitType === 'villa') return 'villa';
  if (unitType === 'townhouse') return 'townhouse';
  return 'apt';
}

/**
 * @param {HotUnitTypeKey} k
 * @returns {string}
 */
export function hotUnitTypeLabel(k) {
  if (k === 'villa') return 'Villa';
  if (k === 'townhouse') return 'Townhouse';
  return 'Apartment';
}
