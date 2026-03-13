/**
 * Full dashboard-style PDF: dark theme, every intelligence + property metric.
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const BG = '#080a08';
const CARD = '#141a14';
const SURF = '#0f130f';
const BORDER = '#1c261c';
const GM = '#2a5e2a';
const G = '#52a352';
const GA = '#78c278';
const T1 = '#e4ede4';
const T2 = '#7fa07f';
const TM = '#6b8a6b';
const AM = '#d49535';
const RED = '#c94f4f';

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingHorizontal: 40,
    paddingBottom: 48,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: T1,
    backgroundColor: BG,
  },
  foot: {
    position: 'absolute',
    bottom: 22,
    left: 40,
    right: 40,
    fontSize: 6,
    color: TM,
    textAlign: 'center',
  },
  brand: { fontSize: 7, letterSpacing: 1.4, color: G, marginBottom: 4 },
  h1: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: GA, marginBottom: 2 },
  sub: { fontSize: 7, color: TM, marginBottom: 14 },
  section: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: GM,
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  card: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
    marginBottom: 8,
  },
  cardLeft: { borderLeftWidth: 3, borderLeftColor: G },
  pillarTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: T1, marginBottom: 2 },
  pillarQ: { fontSize: 7, color: TM, fontStyle: 'italic', marginBottom: 6 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  scoreBig: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: GA },
  badge: { fontSize: 6, color: G, marginBottom: 6 },
  body: { fontSize: 8, color: T1, lineHeight: 1.4, marginBottom: 6 },
  bullet: { fontSize: 7, color: T2, lineHeight: 1.35, marginBottom: 3, paddingLeft: 8 },
  label: { fontSize: 6, color: AM, marginTop: 4, marginBottom: 2 },
  metricRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: BORDER, paddingVertical: 5 },
  metricL: { flex: 2.2, fontSize: 7, color: T1 },
  metricR: { flex: 1.3, fontSize: 7, color: T2, textAlign: 'right' },
  metricX: { flex: 2, fontSize: 6, color: TM, marginTop: 2 },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: SURF,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: GM,
  },
  th: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: GM, flex: 1 },
  th2: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: GM, width: 52, textAlign: 'center' },
  th3: { fontSize: 6, fontFamily: 'Helvetica-Bold', color: GM, flex: 1.2 },
  tr: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  td1: { flex: 1, fontSize: 7, color: T1, lineHeight: 1.3 },
  td2: { width: 52, fontSize: 6, color: G, textAlign: 'center' },
  td3: { flex: 1.2, fontSize: 7, color: T2, lineHeight: 1.3 },
});

const PILLARS = {
  security: { title: 'Is the Region Stable?', q: 'Are conflicts or instability affecting investor confidence?' },
  oil: { title: 'Gulf Oil Wealth', q: 'Do Gulf states have money to invest in Dubai property?' },
  equities: { title: 'Dubai Company Health', q: "Are Dubai's biggest property companies doing well?" },
  macro: { title: 'Are Mortgages Affordable?', q: 'Are global rates and borrowing costs working for or against buyers?' },
  buyer_demand: { title: 'Foreign Buyer Appetite', q: 'Are buyers from India, China and abroad still active?' },
  aviation: { title: 'Tourism & People Moving to Dubai', q: 'Is Dubai still growing as a place to live and invest?' },
  property: { title: 'Dubai Property Market Mood', q: 'How are buyers and sellers feeling right now?' },
};

const PILLAR_ORDER = ['security', 'oil', 'equities', 'macro', 'buyer_demand', 'aviation', 'property'];

function verdictLabel(score) {
  if (score >= 4.3) return 'Exceptional Conditions';
  if (score >= 3.8) return 'Strong Market';
  if (score >= 3.3) return 'Stable & Steady';
  if (score >= 2.8) return 'Mixed Signals — Caution';
  if (score >= 2.2) return 'Market Under Pressure';
  if (score >= 1.6) return 'Significant Risk';
  return 'Defensive Mode';
}

function pillarVerdict(sig, score) {
  if (sig === 'positive' || score >= 4) return 'SUPPORTING YOUR PROPERTY VALUE';
  if (sig === 'negative' || score <= 2) return 'ADDING PRESSURE ON THE MARKET';
  return 'NO MAJOR IMPACT RIGHT NOW';
}

const ALERTS = [
  ['A confirmed military strike or attack inside UAE', 'Act Today', 'Stop all new purchases immediately.'],
  ['US or UK government warns against travel to UAE', 'Act Today', 'Western buyer demand will pause within 48 hours.'],
  ['Strait of Hormuz blocked or disrupted', 'Act Today', 'Maximum defensive position — no new moves.'],
  ['Dubai biggest developer (Emaar) shows financial stress', 'Pause & Watch', 'Stop buying off-plan; completed units only.'],
  ['Dubai airport visitors drop 25%+ vs last year', 'Pause & Watch', 'Short-let and holiday homes most at risk.'],
  ['Dubai transaction volumes drop 30% for 2+ weeks', 'Pause & Watch', 'Price falls likely in 60–90 days.'],
  ['Global stock markets crash 10%+ in a single week', 'Pause & Watch', 'International buyers pause 4–8 weeks.'],
  ['Oil below $65 for 2+ weeks', 'Keep Watching', 'Gulf investors have less money.'],
  ['US stock market falls 10%+ over a month', 'Keep Watching', 'Luxury properties most affected.'],
];

function S({ children, style }) {
  return <Text style={style}>{children}</Text>;
}

function fullStr(v) {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

export function IntelligencePdfDocument({ intel, prop }) {
  const pl = intel?.pillars || {};
  const mkt = intel?.markets || {};
  const comp = intel?.composite ?? '—';
  const vLabel = verdictLabel(Number(comp) || 3);

  const dataCards = [
    ['Emaar (AED)', mkt.emaar?.price && `AED ${mkt.emaar.price}`, `${mkt.emaar?.chg || ''} ${mkt.emaar?.pct || ''}`, "Developer stock — leads property ~2–3 months."],
    ['DFM General Index', mkt.dfmgi?.price, `${mkt.dfmgi?.chg || ''} ${mkt.dfmgi?.pct || ''}`, 'Dubai listed companies.'],
    ['DFM Real Estate Index', mkt.dfmrei?.price && `AED ${mkt.dfmrei.price}`, `${mkt.dfmrei?.chg || ''} ${mkt.dfmrei?.pct || ''}`, 'Listed real estate sector.'],
    ['Emirates NBD', mkt.enbd?.price && `AED ${mkt.enbd.price}`, `${mkt.enbd?.chg || ''} ${mkt.enbd?.pct || ''}`, 'Mortgage lending conditions.'],
    ['Dubai Islamic Bank', mkt.dib?.price && `AED ${mkt.dib.price}`, `${mkt.dib?.chg || ''} ${mkt.dib?.pct || ''}`, 'Islamic mortgage demand.'],
    ['Brent (USD/bbl)', mkt.brent?.price && `$${mkt.brent.price}`, `${mkt.brent?.chg || ''} ${mkt.brent?.pct || ''}`, 'Gulf budgets / buyer wealth.'],
    ['Gold (USD/oz)', mkt.gold?.price && `$${mkt.gold.price}`, `${mkt.gold?.chg || ''} ${mkt.gold?.pct || ''}`, 'Safe-haven demand.'],
    ['S&P 500', mkt.sp500?.price, `${mkt.sp500?.chg || ''} ${mkt.sp500?.pct || ''}`, intel?.sp30d ? `30d: ${intel.sp30d.chgPct}` : ''],
    ['VIX', mkt.vix?.price, `${mkt.vix?.chg || ''} ${mkt.vix?.pct || ''}`, 'Global fear gauge.'],
    ['US 10Y %', mkt.us10y?.price && `${mkt.us10y.price}%`, `${mkt.us10y?.chg || ''} ${mkt.us10y?.pct || ''}`, 'Global borrowing costs.'],
    ['Sensex', mkt.sensex?.price, `${mkt.sensex?.chg || ''} ${mkt.sensex?.pct || ''}`, 'Indian buyer wealth.'],
    ['Hang Seng', mkt.hsi?.price, `${mkt.hsi?.chg || ''} ${mkt.hsi?.pct || ''}`, 'Chinese buyer sentiment.'],
    ['INR/AED', mkt.inraed?.price, `${mkt.inraed?.chg || ''} ${mkt.inraed?.pct || ''}`, intel?.inr30d ? `30d ${intel.inr30d.chgPct}` : ''],
    ['CNY/AED', mkt.cnyaed?.price, `${mkt.cnyaed?.chg || ''} ${mkt.cnyaed?.pct || ''}`, intel?.cny30d ? `30d ${intel.cny30d.chgPct}` : ''],
  ];

  return (
    <Document title="Strada Dubai Market Monitor" author="Strada Real Estate">
      {/* —— Cover + verdict —— */}
      <Page size="A4" style={styles.page}>
        <S style={styles.brand}>STRADA REAL ESTATE · DUBAI PROPERTY INTELLIGENCE</S>
        <S style={styles.h1}>Market Monitor</S>
        <S style={styles.sub}>
          {intel?.ts ? `${intel.ts} · ` : ''}
          {intel?.priceSource || ''}
          {prop?.filter_area ? ` · Area filter: ${prop.filter_area}` : ''}
        </S>
        <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: G }]}>
          <S style={{ fontSize: 6, color: GM, letterSpacing: 1, marginBottom: 4 }}>TODAY&apos;S MARKET VERDICT</S>
          <S style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: GA, marginBottom: 4 }}>{vLabel}</S>
          <S style={styles.body}>Overall score {comp}/5 · {fullStr(intel?.label)}</S>
          <S style={{ fontSize: 6, color: AM, marginTop: 6 }}>STRADA&apos;S RECOMMENDATION</S>
          <S style={styles.body}>{fullStr(intel?.action) || '—'}</S>
        </View>
        <S style={styles.section}>01 · DUBAI PROPERTY — SUMMARY</S>
        <View style={styles.card}>
          <S style={{ fontSize: 6, color: GA, marginBottom: 4 }}>MARKET SUMMARY · {fullStr(prop?.data_freshness)}</S>
          <S style={styles.body}>{fullStr(prop?.owner_briefing) || '—'}</S>
          {prop?.sources_used?.length ? (
            <S style={{ fontSize: 6, color: TM, marginTop: 6 }}>Sources: {prop.sources_used.join(' · ')}</S>
          ) : null}
        </View>
        <S style={styles.section}>WEEKLY TRANSACTION METRICS</S>
        {[
          ['Properties sold', prop?.weekly?.sale_volume],
          ['Total sales value', prop?.weekly?.sale_value_aed],
          ['New rental contracts', prop?.weekly?.rent_volume],
          ['Rental contract value', prop?.weekly?.rent_value_aed],
        ].map(([name, o]) => (
          <View key={name} style={styles.metricRow} wrap={false}>
            <S style={styles.metricL}>{name}</S>
            <S style={styles.metricR}>{fullStr(o?.value) || '—'}</S>
            <View style={{ flex: 2.5 }}>
              <S style={styles.metricX}>WoW {fullStr(o?.chg_wow)} · {fullStr(o?.period)}</S>
            </View>
          </View>
        ))}
        <S style={styles.foot}>Strada Real Estate · Not investment advice · {intel?.ts || ''}</S>
      </Page>

      {/* —— Property prices + split + pulse —— */}
      <Page size="A4" style={styles.page}>
        <S style={styles.section}>PRICES & MARKET SPLIT</S>
        <View style={styles.card}>
          <S style={styles.body}>
            Apartments PSF AED {fullStr(prop?.prices?.apt_psf_aed)} · Avg deal {fullStr(prop?.prices?.apt_avg_aed)}
          </S>
          <S style={styles.body}>
            Villas PSF AED {fullStr(prop?.prices?.villa_psf_aed)} · Avg deal {fullStr(prop?.prices?.villa_avg_aed)}
          </S>
          <S style={{ ...styles.body, marginTop: 6 }}>
            Off-plan {fullStr(prop?.market_split?.offplan_pct)}% · Secondary {fullStr(prop?.market_split?.secondary_pct)}%
          </S>
          <S style={styles.metricX}>{fullStr(prop?.market_split?.note)}</S>
        </View>
        <S style={styles.section}>30-DAY TREND (CHART DATA SUMMARY)</S>
        <View style={styles.card}>
          <S style={styles.body}>{fullStr(prop?.charts_30d?.window_label)}</S>
          <S style={styles.metricX}>
            Weekly volume WoW: {prop?.charts_30d?.wow_volume_pct != null ? `${prop.charts_30d.wow_volume_pct}%` : 'N/A'} · Median PSF WoW:{' '}
            {prop?.charts_30d?.wow_psf_pct != null ? `${prop.charts_30d.wow_psf_pct}%` : 'N/A'}
          </S>
          <S style={styles.metricX}>
            Last day sale count: {prop?.charts_30d?.sale_volume?.[29]?.value ?? '—'} · Last day 7d-MA vol:{' '}
            {prop?.charts_30d?.sale_volume_ma7?.[29]?.value ?? '—'}
          </S>
        </View>
        <S style={styles.section}>YIELDS · RENTAL · SUPPLY · MORTGAGE</S>
        <View style={styles.card}>
          <S style={styles.body}>
            Apt gross / net yield: {fullStr(prop?.yields?.apt_gross_yield)} / {fullStr(prop?.yields?.apt_net_yield)} · Villa:{' '}
            {fullStr(prop?.yields?.villa_gross_yield)} / {fullStr(prop?.yields?.villa_net_yield)}
          </S>
          <S style={styles.body}>{fullStr(prop?.rental?.note) || fullStr(prop?.rental?.rental_period)}</S>
          <S style={styles.body}>
            Supply: launches {fullStr(prop?.supply?.new_launches_this_month)} · completions {fullStr(prop?.supply?.completions_ytd)} ·{' '}
            {fullStr(prop?.supply?.oversupply_risk)}
          </S>
          <S style={styles.body}>Mortgage: {fullStr(prop?.mortgage?.typical_rate_pct)} · {fullStr(prop?.mortgage?.financing_conditions)}</S>
        </View>
        <S style={styles.section}>TOP AREAS {prop?.top_areas_mode === 'sub_community' ? '(SUB-COMMUNITY)' : '(AREA)'}</S>
        {(prop?.top_areas || []).slice(0, 8).map((a, i) => (
          <View key={i} style={styles.metricRow} wrap={false}>
            <S style={styles.metricL}>{fullStr(a.area)}</S>
            <S style={styles.metricR}>{fullStr(a.vol)} deals · PSF {fullStr(a.avg_psf)}</S>
          </View>
        ))}
        <S style={styles.foot}>Strada Real Estate</S>
      </Page>

      {/* —— Seven forces full —— */}
      <Page size="A4" style={styles.page}>
        <S style={styles.section}>02 · WHAT&apos;S DRIVING THE MARKET (FULL)</S>
        {PILLAR_ORDER.map(key => {
          const p = pl[key];
          const meta = PILLARS[key];
          if (!p || !meta) return null;
          const pv = pillarVerdict(p.sig, p.score);
          return (
            <View key={key} style={[styles.card, styles.cardLeft]} wrap={false}>
              <S style={styles.pillarTitle}>{meta.title}</S>
              <S style={styles.pillarQ}>{meta.q}</S>
              <View style={styles.scoreRow}>
                <S style={styles.badge}>{pv}</S>
                <S style={styles.scoreBig}>{p.score}/5</S>
              </View>
              {p.headline ? <S style={styles.body}>{fullStr(p.headline)}</S> : null}
              {(p.bullets || []).map((b, i) => (
                <S key={i} style={styles.bullet}>
                  › {fullStr(b)}
                </S>
              ))}
              {p.risk ? (
                <>
                  <S style={styles.label}>WHAT WOULD CHANGE THIS SIGNAL</S>
                  <S style={styles.body}>{fullStr(p.risk)}</S>
                </>
              ) : null}
              {p.action ? (
                <>
                  <S style={styles.label}>WHAT THIS MEANS FOR YOUR PROPERTY</S>
                  <S style={styles.body}>{fullStr(p.action)}</S>
                </>
              ) : null}
            </View>
          );
        })}
        <S style={styles.foot}>Strada Real Estate</S>
      </Page>

      {/* —— Outcomes + EIBOR PMI —— */}
      <Page size="A4" style={styles.page}>
        <S style={styles.section}>03 · THREE POSSIBLE OUTCOMES</S>
        <View style={styles.card}>
          <S style={styles.body}>Stable baseline ~{intel?.base ?? '—'}%</S>
          <S style={styles.body}>Stress ~{intel?.down ?? '—'}%</S>
          <S style={styles.body}>Upside ~{intel?.up ?? '—'}%</S>
          <S style={{ ...styles.body, marginTop: 8, fontFamily: 'Helvetica-Bold' }}>Scenario label: {fullStr(intel?.label)}</S>
        </View>
        <S style={styles.section}>UAE MORTGAGE (EIBOR) & BUSINESS CONFIDENCE (PMI)</S>
        <View style={styles.card}>
          <S style={styles.body}>
            EIBOR 3M: {fullStr(intel?.eibor?.rate_pct)}% · Was {fullStr(intel?.eibor?.prev_3m_pct)}% · Trend {fullStr(intel?.eibor?.trend)}
          </S>
          <S style={styles.metricX}>{fullStr(intel?.eibor?.interpretation)}</S>
          <S style={styles.metricX}>
            {fullStr(intel?.eibor?.period)} · {fullStr(intel?.eibor?.source)}
          </S>
          <S style={{ ...styles.body, marginTop: 8 }}>
            UAE PMI: {fullStr(intel?.uae_pmi?.headline)} · New orders {fullStr(intel?.uae_pmi?.new_orders)}
          </S>
          <S style={styles.metricX}>{fullStr(intel?.uae_pmi?.interpretation)}</S>
          <S style={styles.metricX}>
            {fullStr(intel?.uae_pmi?.month_label)} · {fullStr(intel?.uae_pmi?.source)}
          </S>
        </View>
        <S style={styles.section}>04 · WARNING SIGNS — KNOW WHEN TO ACT</S>
        <View style={styles.tableHead}>
          <S style={styles.th}>TRIGGER</S>
          <S style={styles.th2}>LEVEL</S>
          <S style={styles.th3}>ACTION</S>
        </View>
        {ALERTS.map(([a, b, c], i) => (
          <View key={i} style={styles.tr} wrap={false}>
            <S style={styles.td1}>{a}</S>
            <S style={styles.td2}>{b}</S>
            <S style={styles.td3}>{c}</S>
          </View>
        ))}
        <S style={styles.foot}>Strada Real Estate</S>
      </Page>

      {/* —— All market numbers —— */}
      <Page size="A4" style={styles.page}>
        <S style={styles.section}>05 · THE DATA BEHIND THE ANALYSIS (ALL TICKERS)</S>
        {dataCards.map(([label, price, chg, note]) => (
          <View key={label} style={[styles.card, { marginBottom: 6 }]} wrap={false}>
            <S style={{ fontSize: 6, color: GM, marginBottom: 2 }}>{label}</S>
            <S style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: T1 }}>{price || '—'}</S>
            <S style={{ fontSize: 7, color: T2 }}>{chg || '—'}</S>
            {note ? <S style={styles.metricX}>{note}</S> : null}
          </View>
        ))}
        <S style={styles.foot}>Strada Real Estate · Kyle Caruana · STRADAUAE.COM</S>
      </Page>
    </Document>
  );
}

export async function downloadIntelligencePdf(intel, prop) {
  const { pdf } = await import('@react-pdf/renderer');
  const blob = await pdf(<IntelligencePdfDocument intel={intel} prop={prop || null} />).toBlob();
  const name = `Strada-Dubai-Full-Snapshot-${String(intel?.ts || new Date().toISOString().slice(0, 16)).replace(/[/:,\s]+/g, '-')}.pdf`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
