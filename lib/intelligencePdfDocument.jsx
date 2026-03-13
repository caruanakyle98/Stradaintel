/**
 * Presentation PDF for the intelligence dashboard (@react-pdf/renderer).
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingHorizontal: 48,
    paddingBottom: 56,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1a2420',
    backgroundColor: '#ffffff',
  },
  brand: {
    fontSize: 8,
    letterSpacing: 1.6,
    color: '#2d6b4f',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#0f2e22',
    marginBottom: 4,
  },
  tagline: { fontSize: 8, color: '#6b7a72', marginBottom: 20 },
  rule: { borderBottomWidth: 1, borderBottomColor: '#d4e8df', marginVertical: 14 },
  h2: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0f2e22',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  scoreBlock: {
    backgroundColor: '#f0f7f4',
    borderWidth: 1,
    borderColor: '#c5ddd2',
    padding: 16,
    marginBottom: 18,
  },
  scoreLabel: { fontSize: 7, color: '#4a6b5c', letterSpacing: 1, marginBottom: 4 },
  scoreBig: { fontSize: 42, fontFamily: 'Helvetica-Bold', color: '#0f2e22' },
  scenario: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0f2e22', marginTop: 6 },
  action: { fontSize: 9, lineHeight: 1.45, marginTop: 10, color: '#2a332f' },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5ebe8',
  },
  pillarName: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#0f2e22', marginBottom: 2 },
  pillarSub: { fontSize: 8, color: '#5c6b63', lineHeight: 1.35 },
  scoreCell: { width: 36, fontFamily: 'Helvetica-Bold', fontSize: 10, color: '#0f2e22', textAlign: 'right' },
  foot: {
    position: 'absolute',
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 7,
    color: '#8a9690',
    textAlign: 'center',
  },
  tableHead: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#0f2e22',
    marginBottom: 4,
  },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#0f2e22', flex: 1 },
  thR: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#0f2e22', width: 100, textAlign: 'right' },
  tdL: { flex: 1, fontSize: 9, color: '#2a332f' },
  tdR: { width: 100, fontSize: 9, textAlign: 'right', color: '#2a332f' },
});

const PILLAR_ORDER = [
  ['security', 'Region & geopolitical stability'],
  ['oil', 'Oil & GCC wealth flow'],
  ['equities', 'UAE equities & real estate index'],
  ['macro', 'Global macro · EIBOR · PMI'],
  ['buyer_demand', 'Foreign buyer markets'],
  ['aviation', 'Aviation & tourism'],
  ['property', 'Property market sentiment'],
];

function trunc(s, n) {
  const t = String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '—';
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export function IntelligencePdfDocument({ intel }) {
  const pl = intel?.pillars || {};
  const mkt = intel?.markets || {};

  return (
    <Document title="Strada Dubai Intelligence" author="Strada Real Estate">
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>Strada Real Estate · Dubai Property Intelligence</Text>
        <Text style={styles.title}>Intelligence snapshot</Text>
        <Text style={styles.tagline}>
          {intel?.ts ? `Generated ${intel.ts} (Dubai)` : ''}
          {intel?.priceSource ? ` · ${intel.priceSource}` : ''}
        </Text>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreLabel}>OVERALL MARKET SCORE</Text>
          <Text style={styles.scoreBig}>
            {intel?.composite ?? '—'}/5
          </Text>
          <Text style={styles.scenario}>{trunc(intel?.label, 80)}</Text>
          <Text style={styles.action}>{trunc(intel?.action, 420)}</Text>
        </View>
        <Text style={styles.h2}>Seven forces (scores 1–5)</Text>
        {PILLAR_ORDER.map(([key, label]) => {
          const p = pl[key];
          if (!p) return null;
          return (
            <View key={key} style={styles.row} wrap={false}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.pillarName}>{label}</Text>
                <Text style={styles.pillarSub}>{trunc(p.headline, 140)}</Text>
              </View>
              <Text style={styles.scoreCell}>{p.score}/5</Text>
            </View>
          );
        })}
        <Text style={styles.foot}>
          Confidential · For presentation · Not investment advice · Strada Real Estate
        </Text>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>Strada Real Estate</Text>
        <Text style={styles.title}>Market data</Text>
        <Text style={styles.tagline}>Indicative levels at snapshot time (Yahoo Finance where noted)</Text>
        <View style={styles.rule} />
        <View style={styles.tableHead}>
          <Text style={styles.th}>Instrument</Text>
          <Text style={styles.thR}>Level / change</Text>
        </View>
        {[
          ['Brent crude (USD/bbl)', mkt.brent?.price, mkt.brent?.pct],
          ['Gold (USD)', mkt.gold?.price, mkt.gold?.pct],
          ['VIX', mkt.vix?.price, mkt.vix?.pct],
          ['S&P 500', mkt.sp500?.price, mkt.sp500?.pct],
          ['US 10Y (%)', mkt.us10y?.price, mkt.us10y?.pct],
          ['Emaar (AED)', mkt.emaar?.price, mkt.emaar?.pct],
          ['DFM General Index', mkt.dfmgi?.price, mkt.dfmgi?.pct],
          ['DFM Real Estate Index (DFMREI)', mkt.dfmrei?.price, mkt.dfmrei?.pct],
          ['Hang Seng', mkt.hsi?.price, mkt.hsi?.pct],
          ['BSE Sensex', mkt.sensex?.price, mkt.sensex?.pct],
          ['EIBOR 3M (%)', intel?.eibor?.rate_pct, intel?.eibor?.trend],
          ['UAE non-oil PMI', intel?.uae_pmi?.headline, intel?.uae_pmi?.month_label],
        ].map(([name, v, extra]) => (
          <View key={name} style={styles.row} wrap={false}>
            <Text style={styles.tdL}>{name}</Text>
            <Text style={styles.tdR}>
              {v != null && v !== '' ? String(v) : '—'}
              {extra ? `  ${extra}` : ''}
            </Text>
          </View>
        ))}
        <View style={[styles.rule, { marginTop: 20 }]} />
        <Text style={styles.h2}>Scenario weights</Text>
        <Text style={{ fontSize: 9, lineHeight: 1.5, color: '#2a332f' }}>
          Stable baseline ~{intel?.base ?? '—'}% · Stress ~{intel?.down ?? '—'}% · Upside ~{intel?.up ?? '—'}%
        </Text>
        <Text style={styles.foot}>
          Data timing may differ from live site · Strada Real Estate
        </Text>
      </Page>
    </Document>
  );
}

export async function downloadIntelligencePdf(intel) {
  const { pdf } = await import('@react-pdf/renderer');
  const blob = await pdf(<IntelligencePdfDocument intel={intel} />).toBlob();
  const name = `Strada-Dubai-Intelligence-${String(intel?.ts || new Date().toISOString().slice(0, 16)).replace(/[/:,\s]+/g, '-')}.pdf`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
