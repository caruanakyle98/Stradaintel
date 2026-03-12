'use client';
import { useState, useCallback } from 'react';

const C = {
  bg:'#080a08', surf:'#0f130f', card:'#141a14', border:'#1c261c',
  gd:'#162816', gm:'#2a5e2a', g:'#52a352', ga:'#78c278',
  am:'#d49535', amL:'#f0b84a', red:'#c94f4f',
  t1:'#e4ede4', t2:'#7fa07f', tm:'#445544', td:'#26332a',
};

// ── Helpers ─────────────────────────────────────────────────
const str = v => {
  if (v===null||v===undefined) return null;
  if (typeof v==='object') { if (v.value!==undefined) return String(v.value); if (v.price!==undefined) return String(v.price); return null; }
  return String(v);
};
const na = v => { const s=str(v); return (!s||s==='N/A'||s==='null'||s==='undefined')?'—':s; };
const trendCol   = t => t==='up'?C.g : t==='down'?C.red : C.t2;
const trendArrow = t => t==='up'?'↑' : t==='down'?'↓' : '→';
const barPct     = s => s ? Math.round(((Math.min(Math.max(s,1),5)-1)/4)*100) : 0;

// ── Plain-English pillar definitions ─────────────────────────
const PILLARS = {
  security:     { icon:'🌍', title:'Is the Region Stable?',            q:'Are conflicts or instability affecting investor confidence?' },
  oil:          { icon:'🛢️', title:'Gulf Oil Wealth',                   q:'Do Gulf states have money to invest in Dubai property?' },
  equities:     { icon:'🏗️', title:'Dubai Company Health',             q:'Are Dubai\'s biggest property companies doing well?' },
  macro:        { icon:'💰', title:'Are Mortgages Affordable?',         q:'Are global interest rates and borrowing costs working for or against buyers?' },
  buyer_demand: { icon:'🌏', title:'Foreign Buyer Appetite',            q:'Are buyers from India, China and abroad still active in the market?' },
  aviation:     { icon:'✈️', title:'Tourism & People Moving to Dubai',  q:'Is Dubai still growing as a place to live and invest?' },
  property:     { icon:'🏠', title:'Dubai Property Market Mood',        q:'How are buyers and sellers feeling about the market right now?' },
};

// ── Score → plain-English overall verdict ────────────────────
const VERDICT = s =>
  s>=4.3 ? { label:'Exceptional Conditions',   sub:'Rare buying window — nearly every signal is positive',                          col:C.ga }:
  s>=3.8 ? { label:'Strong Market',             sub:'Most signals are healthy — a good time to hold and invest in Dubai',            col:C.g  }:
  s>=3.3 ? { label:'Stable & Steady',           sub:'Market is in good shape — hold what you have and be selective with new buys',   col:C.g  }:
  s>=2.8 ? { label:'Mixed Signals — Caution',   sub:'Some warning signs emerging — slow down on new commitments',                    col:C.am }:
  s>=2.2 ? { label:'Market Under Pressure',     sub:'Multiple concerns — pause new purchases and protect your existing properties',  col:C.am }:
  s>=1.6 ? { label:'Significant Risk',          sub:'Conditions are deteriorating — focus on protecting what you own',              col:C.red}:
           { label:'Defensive Mode',             sub:'Serious risk conditions — hold cash, do not buy anything right now',           col:C.red};

// ── Per-pillar verdict ────────────────────────────────────────
const PILLAR_VERDICT = (sig, score) =>
  sig==='positive'||score>=4 ? { label:'Supporting your property value', col:C.g,  dot:'●' }:
  sig==='negative'||score<=2 ? { label:'Adding pressure on the market',  col:C.red,dot:'●' }:
                                { label:'No major impact right now',      col:C.t2, dot:'●' };

const css = `
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:${C.bg}}
  a{color:${C.g};text-decoration:none}a:hover{color:${C.ga}}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.surf}}
  ::-webkit-scrollbar-thumb{background:${C.gm};border-radius:2px}
  .fade-in{animation:fade .5s ease}
`;

// ── Primitives ───────────────────────────────────────────────
function Bar({ score, color, style={} }) {
  const col = color || (score>=3.5?C.g:score>=2.5?C.am:C.red);
  return (
    <div style={{ height:3, background:C.border, borderRadius:2, overflow:'hidden', ...style }}>
      <div style={{ width:`${barPct(score)}%`, height:'100%', background:col, borderRadius:2, transition:'width 1.4s ease' }}/>
    </div>
  );
}
function Skel({ w='100%', h=12, mb=0 }) {
  return <div style={{ width:w, height:h, marginBottom:mb, background:C.border, borderRadius:2, animation:'pulse 1.4s ease-in-out infinite' }}/>;
}
function Tag({ children, color=C.tm }) {
  return <div style={{ fontFamily:'monospace', fontSize:7, letterSpacing:'.18em', color, marginBottom:4, textTransform:'uppercase' }}>{children}</div>;
}
function SectionHead({ n, title, desc }) {
  return (
    <div style={{ paddingBottom:12, borderBottom:`1px solid ${C.border}`, marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:desc?6:0 }}>
        <span style={{ fontFamily:'monospace', fontSize:9, color:C.gm }}>{n}</span>
        <h2 style={{ fontFamily:'Georgia,serif', fontSize:17, fontWeight:700, color:C.t1 }}>{title}</h2>
      </div>
      {desc && <p style={{ fontSize:11, color:C.tm, lineHeight:1.55 }}>{desc}</p>}
    </div>
  );
}

// ── Property transaction card ─────────────────────────────────
function TxCard({ label, value, wowChg, yoyChg, trend, loading, period, source }) {
  const tc = trendCol(trend);
  const isMonthly = period&&(period.toLowerCase().includes('month')||/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(period));
  return (
    <div style={{ flex:1, minWidth:160, background:C.card, border:`1px solid ${C.border}`, borderLeft:`3px solid ${tc}`, borderRadius:2, padding:'16px 18px' }}>
      <Tag>{label}</Tag>
      {loading?<><Skel h={30} mb={6}/><Skel w="70%" h={9}/></>:<>
        <div style={{ fontFamily:'Georgia,serif', fontSize:28, fontWeight:700, color:value&&value!=='—'?tc:C.tm, lineHeight:1.1, marginBottom:6 }}>
          {na(value)} <span style={{fontSize:14}}>{trendArrow(trend)}</span>
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:4 }}>
          {wowChg&&wowChg!=='N/A'&&<span style={{ fontSize:10, color:C.t2 }}>vs last week: <span style={{color:wowChg.startsWith('+')?C.g:C.red,fontWeight:600}}>{wowChg}</span></span>}
          {yoyChg&&yoyChg!=='N/A'&&<span style={{ fontSize:10, color:C.t2 }}>vs last year: <span style={{color:yoyChg.startsWith('+')?C.g:C.red,fontWeight:600}}>{yoyChg}</span></span>}
        </div>
        {(period||source)&&(
          <div style={{ marginTop:5, paddingTop:5, borderTop:`1px solid ${C.border}` }}>
            {period&&<div style={{ fontFamily:'monospace', fontSize:8, color:isMonthly?C.am:C.tm }}>{isMonthly?'⚠ Monthly figure (not weekly): ':''}{period}</div>}
            {source&&<div style={{ fontFamily:'monospace', fontSize:7, color:C.td, marginTop:1 }}>{source}</div>}
          </div>
        )}
      </>}
    </div>
  );
}

function StatRow({ label, value, sub, highlight, last, source }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:last?'none':`1px solid ${C.border}` }}>
      <div>
        <span style={{ fontSize:11, color:C.t2 }}>{label}</span>
        {source&&<div style={{ fontFamily:'monospace', fontSize:7, color:C.td, marginTop:1 }}>{source}</div>}
      </div>
      <div style={{ textAlign:'right' }}>
        <div style={{ fontFamily:'Georgia,serif', fontSize:13, fontWeight:700, color:highlight||C.t1 }}>{na(value)}</div>
        {sub&&<div style={{ fontFamily:'monospace', fontSize:9, color:C.tm, marginTop:1 }}>{sub}</div>}
      </div>
    </div>
  );
}

function AreaRow({ rank, area, vol, psf, trend, maxVol, last }) {
  const pct = maxVol?Math.round((parseInt(vol?.replace(/,/g,''))||0)/maxVol*100):0;
  const tc = trendCol(trend);
  return (
    <div style={{ padding:'10px 0', borderBottom:last?'none':`1px solid ${C.border}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontFamily:'monospace', fontSize:8, color:C.tm, width:14 }}>{rank}</span>
          <span style={{ fontSize:12, color:C.t1, fontWeight:500 }}>{area}</span>
          <span style={{ fontSize:10 }}>{trendArrow(trend)}</span>
        </div>
        <div style={{ display:'flex', gap:14, alignItems:'center' }}>
          <span style={{ fontSize:9, color:C.t2 }}>{na(vol)} deals</span>
          <span style={{ fontFamily:'Georgia,serif', fontSize:12, color:tc, fontWeight:600 }}>AED {na(psf)}/sqft</span>
        </div>
      </div>
      <div style={{ height:2, background:C.border, borderRadius:1 }}>
        <div style={{ width:`${pct}%`, height:'100%', background:`${tc}60`, borderRadius:1, transition:'width 1.2s ease' }}/>
      </div>
    </div>
  );
}

function YieldGauge({ label, gross, net, loading }) {
  const g = parseFloat(gross)||0;
  const pct = Math.min((g/12)*100,100);
  const col = g>=7?C.g:g>=5?C.ga:g>=4?C.am:C.red;
  return (
    <div style={{ flex:1, minWidth:160, background:C.card, border:`1px solid ${C.border}`, borderRadius:2, padding:'16px 18px', textAlign:'center' }}>
      <Tag>{label}</Tag>
      {loading?<><Skel h={40} mb={6}/><Skel w="60%" h={10}/></>:<>
        <div style={{ position:'relative', width:80, height:40, margin:'8px auto 4px' }}>
          <svg width="80" height="40" viewBox="0 0 80 40">
            <path d="M 4 38 A 36 36 0 0 1 76 38" stroke={C.border} strokeWidth="6" fill="none" strokeLinecap="round"/>
            <path d="M 4 38 A 36 36 0 0 1 76 38" stroke={col} strokeWidth="6" fill="none" strokeLinecap="round"
              strokeDasharray={`${pct*1.13} 113`} style={{ transition:'stroke-dasharray 1.4s ease' }}/>
          </svg>
          <div style={{ position:'absolute', bottom:0, left:0, right:0, textAlign:'center', fontFamily:'Georgia,serif', fontSize:18, fontWeight:700, color:col }}>{g>0?`${g}%`:'—'}</div>
        </div>
        <div style={{ fontFamily:'monospace', fontSize:8, color:C.tm }}>ANNUAL RENTAL RETURN</div>
        {net&&<div style={{ fontFamily:'monospace', fontSize:9, color:C.t2, marginTop:4 }}>After costs: ~{net}</div>}
        <div style={{ fontSize:9, color:col, marginTop:4 }}>
          {g>=7?'Excellent return':g>=5?'Good return':g>=4?'Average return':g>0?'Low return':''}
        </div>
      </>}
    </div>
  );
}

function SplitBar({ offplan, secondary, loading }) {
  const op = parseInt(offplan)||0;
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
        <div>
          <span style={{ fontFamily:'monospace', fontSize:8, color:C.g }}>NEW BUILDS (OFF-PLAN) · {op}%</span>
          <div style={{ fontSize:9, color:C.tm, marginTop:2 }}>Buying directly from a developer before construction finishes</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <span style={{ fontFamily:'monospace', fontSize:8, color:C.t2 }}>EXISTING PROPERTIES · {100-op}%</span>
          <div style={{ fontSize:9, color:C.tm, marginTop:2 }}>Resale of already-built homes</div>
        </div>
      </div>
      {loading?<Skel h={8}/>:
        <div style={{ height:8, background:C.border, borderRadius:4, overflow:'hidden' }}>
          <div style={{ width:`${op}%`, height:'100%', background:`linear-gradient(90deg,${C.gm},${C.g})`, borderRadius:4, transition:'width 1.4s ease' }}/>
        </div>
      }
    </div>
  );
}

// ── One of the 7 factor cards ─────────────────────────────────
function FactorCard({ data, loading }) {
  if (!data) return null;
  const meta    = PILLARS[data.key] || { icon:'📊', title:data.title, q:'' };
  const verdict = PILLAR_VERDICT(data.sig, data.score);
  const col     = verdict.col;

  return (
    <div className="fade-in" style={{ background:C.card, border:`1px solid ${C.border}`, borderLeft:`3px solid ${col}`, borderRadius:2, padding:20 }}>

      {/* Header row */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div style={{ flex:1, paddingRight:12 }}>
          <div style={{ fontSize:20, marginBottom:5 }}>{meta.icon}</div>
          <div style={{ fontFamily:'Georgia,serif', fontSize:14, fontWeight:700, color:C.t1 }}>{meta.title}</div>
          <div style={{ fontSize:10, color:C.tm, marginTop:3, fontStyle:'italic' }}>{meta.q}</div>
        </div>
        {data.score && (
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:'Georgia,serif', fontSize:26, fontWeight:700, color:col, lineHeight:1 }}>{data.score}<span style={{fontSize:9,color:C.tm}}>/5</span></div>
          </div>
        )}
      </div>

      {/* Strength bar */}
      {data.score && <Bar score={data.score} color={col} style={{ marginBottom:10 }}/>}

      {/* Verdict badge */}
      <div style={{ padding:'5px 9px', background:`${col}14`, border:`1px solid ${col}30`, borderRadius:2, marginBottom:10, display:'inline-block' }}>
        <span style={{ fontFamily:'monospace', fontSize:8, color:col }}>{verdict.dot} {verdict.label.toUpperCase()}</span>
      </div>

      {loading && <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}><Skel/><Skel w="85%"/><Skel w="70%"/></div>}

      {/* Headline — what AI found */}
      {data.headline && (
        <div style={{ fontSize:11, color:C.t1, lineHeight:1.6, paddingBottom:10, marginBottom:10, borderBottom:`1px solid ${C.border}`, fontStyle:'italic' }}>
          {data.headline}
        </div>
      )}

      {/* Detail bullets */}
      {data.bullets && (
        <ul style={{ listStyle:'none', padding:0, marginBottom:10 }}>
          {data.bullets.map((b,i) => (
            <li key={i} style={{ fontSize:11, color:C.t2, padding:'5px 0 5px 14px', position:'relative', borderBottom:i<data.bullets.length-1?`1px solid ${C.border}`:'none', lineHeight:1.5 }}>
              <span style={{ position:'absolute', left:0, color:C.gm }}>›</span>{b}
            </li>
          ))}
        </ul>
      )}

      {/* What would change this + What it means for you */}
      {(data.risk||data.action) && (
        <div style={{ padding:'10px 12px', background:C.surf, border:`1px solid ${C.border}`, borderRadius:2 }}>
          {data.risk && (
            <div style={{ marginBottom:data.action?8:0 }}>
              <Tag color={C.am}>What would change this signal</Tag>
              <div style={{ fontSize:10, color:C.t2, lineHeight:1.5 }}>{data.risk}</div>
            </div>
          )}
          {data.action && (
            <div>
              <Tag color={C.g}>What this means for your property</Tag>
              <div style={{ fontSize:10, color:C.t1, lineHeight:1.5 }}>{data.action}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Small market number card (for Supporting Data section) ────
function DataCard({ label, price, chg, up, loading, explain }) {
  const col = up===true?C.g : up===false?C.red : C.t2;
  return (
    <div style={{ flex:1, minWidth:160, background:C.card, border:`1px solid ${C.border}`, borderRadius:2, padding:'12px 14px' }}>
      <Tag color={C.td}>{label}</Tag>
      {loading?<><Skel h={18} mb={4}/><Skel w="55%" h={8}/></>:<>
        <div style={{ fontFamily:'Georgia,serif', fontSize:18, fontWeight:700, color:price?col:C.tm, lineHeight:1 }}>{price||'—'}</div>
        {chg&&<div style={{ fontFamily:'monospace', fontSize:9, color:col, marginTop:3 }}>{chg}</div>}
        {explain&&<div style={{ fontSize:9, color:C.td, marginTop:5, lineHeight:1.4, borderTop:`1px solid ${C.border}`, paddingTop:4 }}>{explain}</div>}
      </>}
    </div>
  );
}

// ── Warning signs table ───────────────────────────────────────
const ALERTS = [
  ['A confirmed military strike or attack inside UAE','🔴 Act Today','Stop all new purchases immediately. Move to a cash-preferred position.',C.red],
  ['US or UK government warns against travel to UAE','🔴 Act Today','Western buyer demand will pause within 48 hours. Hold all listings.',C.red],
  ['Strait of Hormuz blocked or disrupted','🔴 Act Today','Direct impact on UAE economy. Maximum defensive position — no new moves.',C.red],
  ['Dubai\'s biggest developer (Emaar) shows financial stress','🟠 Pause & Watch','Stop buying off-plan projects. Switch to completed, rented properties only.',C.am],
  ['Dubai airport visitor numbers drop 25%+ vs last year','🟠 Pause & Watch','Tourism demand is weakening. Short-let and holiday home property most at risk.',C.am],
  ['Dubai property transaction volumes drop 30% for 2+ weeks','🟠 Pause & Watch','Market has gone quiet. Price falls likely in 60–90 days. Hold any listings.',C.am],
  ['Global stock markets crash 10%+ in a single week','🟠 Pause & Watch','International buyers pause immediately. Foreign demand drops for 4–8 weeks.',C.am],
  ['Oil price stays below $65 for 2+ weeks','👀 Keep Watching','Gulf investors — your biggest buyer group — have less money. Monitor volumes.',C.t2],
  ['US stock market falls 10%+ over a month','👀 Keep Watching','Wealthy foreign buyers feel poorer. Dubai luxury properties most affected.',C.t2],
];

const CHECKLIST = [
  ['News & Security · 07:30',[['Reuters Middle East','https://reuters.com/world/middle-east'],['Al Arabiya English','https://alarabiya.net'],['UK FCO UAE Travel Advice','https://gov.uk/foreign-travel-advice/uae']]],
  ['Property Market · 08:00',[['DLD Transactions (Official)','https://dubailand.gov.ae'],['Property Monitor Reports','https://propertymonitor.ae/insights'],['Bayut Research','https://bayut.com/research']]],
  ['Dubai Airport & Tourism · 08:30',[['Emirates Newsroom','https://emirates.com/media-centre/news'],['Dubai Airport Stats','https://dubaiairports.ae']]],
  ['Financial Markets · 09:00',[['DFM Live Market Data','https://dfm.ae/market-data'],['UAE Central Bank','https://centralbank.ae']]],
];

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function Page() {
  const [intel,     setIntel]     = useState(null);
  const [prop,      setProp]      = useState(null);
  const [loadIntel, setLoadIntel] = useState(false);
  const [loadProp,  setLoadProp]  = useState(false);
  const [error,     setError]     = useState(null);
  const [propError, setPropError] = useState(null);
  const [ts,          setTs]          = useState(null);
  const [showData,    setShowData]    = useState(false); // Supporting data collapsed by default
  const [salesCsvPath,setSalesCsvPath]= useState('');

  const refreshIntel = useCallback(async () => {
    setLoadIntel(true); setError(null);
    try {
      const r = await fetch('/api/intelligence');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setIntel(d); setTs(d.ts);
    } catch(e) { setError(e.message); }
    finally { setLoadIntel(false); }
  }, []);

  const refreshProp = useCallback(async () => {
    setLoadProp(true); setPropError(null);
    try {
      const customPath = salesCsvPath.trim();
      const propUrl = customPath ? `/api/property?salesCsv=${encodeURIComponent(customPath)}` : '/api/property';
      const r = await fetch(propUrl);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setProp(d);
    } catch(e) { setPropError(e.message); }
    finally { setLoadProp(false); }
  }, [salesCsvPath]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshIntel(), refreshProp()]);
  }, [refreshIntel, refreshProp]);

  const mkt  = intel?.markets;
  const pl   = intel?.pillars;
  const pillarOrder  = ['security','oil','equities','macro','buyer_demand','aviation','property'];
  const pillarsWithKey = pillarOrder.map(k => pl?.[k] ? { ...pl[k], key:k } : null);

  const maxVol   = prop?.top_areas ? Math.max(...prop.top_areas.map(a=>parseInt(a.vol?.replace(/,/g,''))||0)) : 1;
  const brentRaw = mkt?.brent?.raw || 0;
  const vixRaw   = mkt?.vix?.raw   || 0;
  const r10Raw   = mkt?.us10y?.raw  || 0;
  const eiborRate= parseFloat(intel?.eibor?.rate_pct||0);
  const pmiVal   = parseFloat(intel?.uae_pmi?.headline||0);

  return (
    <div style={{ background:C.bg, minHeight:'100vh', color:C.t1, fontFamily:'-apple-system,"Segoe UI",sans-serif', fontWeight:300, fontSize:14 }}>
      <style>{css}</style>

      {/* ── HEADER ──────────────────────────────────────── */}
      <div style={{ padding:'28px 48px 22px', borderBottom:`1px solid ${C.border}` }}>
        <div style={{ fontFamily:'monospace', fontSize:9, letterSpacing:'.22em', color:C.g, marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ width:7, height:7, background:C.g, borderRadius:'50%', animation:'pulse 2s ease-in-out infinite', boxShadow:`0 0 8px ${C.g}` }}/>
          STRADA REAL ESTATE · DUBAI PROPERTY INTELLIGENCE
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:14 }}>
          <div>
            <h1 style={{ fontFamily:'Georgia,serif', fontSize:'clamp(22px,3vw,40px)', fontWeight:700, lineHeight:1.1 }}>
              Dubai Property<br/><em style={{color:C.ga}}>Market Monitor</em>
            </h1>
            <div style={{ fontFamily:'monospace', fontSize:9, color:C.tm, marginTop:8 }}>EVERYTHING AFFECTING YOUR PROPERTY'S VALUE · UPDATED ON DEMAND</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
            <button onClick={refreshAll} disabled={loadIntel||loadProp}
              style={{ padding:'12px 22px', background:(loadIntel||loadProp)?C.gd:C.gm, border:`1px solid ${(loadIntel||loadProp)?C.gm:C.g}`, borderRadius:2, color:C.t1, fontFamily:'monospace', fontSize:10, letterSpacing:'.1em', cursor:(loadIntel||loadProp)?'wait':'pointer', display:'flex', alignItems:'center', gap:8 }}>
              {(loadIntel||loadProp)&&<span style={{ width:10, height:10, border:`2px solid ${C.g}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin .7s linear infinite' }}/>}
              {(loadIntel||loadProp)?'UPDATING...':'⟳  GET LATEST INTELLIGENCE'}
            </button>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={refreshIntel} disabled={loadIntel} style={{ padding:'7px 13px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:2, color:C.t2, fontFamily:'monospace', fontSize:9, cursor:loadIntel?'wait':'pointer' }}>
                {loadIntel?'…':'Market signals only'}
              </button>
              <button onClick={refreshProp} disabled={loadProp} style={{ padding:'7px 13px', background:'transparent', border:`1px solid ${C.border}`, borderRadius:2, color:C.t2, fontFamily:'monospace', fontSize:9, cursor:loadProp?'wait':'pointer' }}>
                {loadProp?'…':'Property data only'}
              </button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, width:'min(460px,100%)' }}>
              <input
                value={salesCsvPath}
                onChange={(e)=>setSalesCsvPath(e.target.value)}
                placeholder="Optional CSV path override (sales only)"
                style={{ width:'100%', padding:'8px 10px', background:C.surf, color:C.t1, border:`1px solid ${C.border}`, borderRadius:2, fontFamily:'monospace', fontSize:10 }}
              />
              <div style={{ fontFamily:'monospace', fontSize:8, color:C.tm }}>
                Off-plan is inferred from <span style={{ color:C.ga }}>Select Data Points = Oqood</span>. Active source: {prop?.sources_used?.[0] || 'default sales.csv path'}
              </div>
            </div>
            <div style={{ fontFamily:'monospace', fontSize:9, color:C.tm }}>
              {ts?`LAST UPDATED · ${ts} GST`:'PRESS "GET LATEST INTELLIGENCE" TO BEGIN'}
            </div>
          </div>
        </div>
        {error     && <div style={{ marginTop:10, padding:'9px 14px', background:'#1a0a0a', border:`1px solid ${C.red}30`, borderRadius:2, fontFamily:'monospace', fontSize:10, color:C.red }}>⚠ {error}</div>}
        {propError && <div style={{ marginTop:6,  padding:'9px 14px', background:'#1a0a0a', border:`1px solid ${C.red}30`, borderRadius:2, fontFamily:'monospace', fontSize:10, color:C.red }}>⚠ {propError}</div>}
      </div>

      <div style={{ padding:'0 48px 80px' }}>

        {/* ══════════════════════════════════════════════ */}
        {/* ── TODAY'S VERDICT ── */}
        {/* ══════════════════════════════════════════════ */}
        {(intel||loadIntel) && (() => {
          const v = VERDICT(intel?.composite||3);
          return (
            <div className="fade-in" style={{ marginTop:28, padding:'22px 26px', background:`${v.col}14`, border:`1px solid ${v.col}40`, borderLeft:`5px solid ${v.col}`, borderRadius:2 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'monospace', fontSize:8, letterSpacing:'.14em', color:v.col, marginBottom:6 }}>TODAY'S MARKET VERDICT</div>
                  {loadIntel ? <Skel h={32} mb={8} w="60%"/> :
                    <div style={{ fontFamily:'Georgia,serif', fontSize:26, fontWeight:700, color:v.col, marginBottom:6 }}>{v.label}</div>
                  }
                  {loadIntel ? <Skel h={14} w="80%"/> :
                    <div style={{ fontSize:13, color:C.t2, lineHeight:1.55, maxWidth:520 }}>{v.sub}</div>
                  }
                  {intel?.action && !loadIntel && (
                    <div style={{ marginTop:14, padding:'10px 14px', background:`${C.bg}aa`, border:`1px solid ${v.col}28`, borderRadius:2, maxWidth:520 }}>
                      <div style={{ fontFamily:'monospace', fontSize:8, color:C.am, marginBottom:4 }}>STRADA'S RECOMMENDATION</div>
                      <div style={{ fontSize:12, color:C.t1, lineHeight:1.6 }}>{intel.action}</div>
                    </div>
                  )}
                </div>
                {!loadIntel && intel?.composite && (
                  <div style={{ textAlign:'center', minWidth:90 }}>
                    <div style={{ fontFamily:'monospace', fontSize:8, color:C.tm, marginBottom:4 }}>OVERALL SCORE</div>
                    <div style={{ fontFamily:'Georgia,serif', fontSize:64, fontWeight:700, color:v.col, lineHeight:1 }}>{intel.composite}</div>
                    <div style={{ fontFamily:'monospace', fontSize:9, color:C.tm }}>OUT OF 5</div>
                  </div>
                )}
              </div>
              {!loadIntel && intel?.composite && <>
                <Bar score={intel.composite} color={v.col} style={{ marginTop:16, marginBottom:5 }}/>
                <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'monospace', fontSize:7, color:C.td }}>
                  <span>CRISIS</span><span>HIGH RISK</span><span>STABLE</span><span>STRONG</span><span>EXCELLENT</span>
                </div>
              </>}
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════ */}
        {/* ── 01 DUBAI PROPERTY MARKET — THE NUMBERS ── */}
        {/* ══════════════════════════════════════════════ */}
        <div style={{ marginTop:48 }}>
          <SectionHead n="01" title="Dubai Property Market — The Numbers"
            desc="Live transaction data from Dubai Land Department, rental yields, asking prices and the most active areas this week."/>

          {/* Owner briefing */}
          {(prop?.owner_briefing||loadProp) && (
            <div className="fade-in" style={{ marginBottom:20, padding:'16px 20px', background:C.gd, border:`1px solid ${C.gm}`, borderLeft:`4px solid ${C.g}`, borderRadius:2 }}>
              <Tag color={C.ga}>Strada's Market Summary · {prop?.data_freshness||'Latest data'}</Tag>
              {loadProp?<><Skel h={14} mb={6}/><Skel w="80%" h={14}/></>:
                <p style={{ fontSize:13, color:C.t1, lineHeight:1.7, marginTop:4 }}>{na(prop?.owner_briefing)}</p>
              }
              {prop?.sources_used&&<div style={{ marginTop:8, fontFamily:'monospace', fontSize:8, color:C.tm }}>Sources: {prop.sources_used.join(' · ')}</div>}
            </div>
          )}

          {/* Transactions this week */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontFamily:'monospace', fontSize:8, color:C.gm, marginBottom:8, letterSpacing:'.1em' }}>HOW MANY DEALS ARE HAPPENING · {prop?.weekly?.period_label||'Latest week'}</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <TxCard label="Properties Sold" value={prop?.weekly?.sale_volume?.value} wowChg={prop?.weekly?.sale_volume?.chg_wow} yoyChg={prop?.weekly?.sale_volume?.chg_yoy} trend={prop?.weekly?.sale_volume?.trend} period={prop?.weekly?.sale_volume?.period} source={prop?.weekly?.sale_volume?.source} loading={loadProp}/>
              <TxCard label="Total Sales Value" value={prop?.weekly?.sale_value_aed?.value} wowChg={prop?.weekly?.sale_value_aed?.chg_wow} yoyChg={prop?.weekly?.sale_value_aed?.chg_yoy} trend={prop?.weekly?.sale_value_aed?.trend} period={prop?.weekly?.sale_value_aed?.period} source={prop?.weekly?.sale_value_aed?.source} loading={loadProp}/>
              <TxCard label="New Rental Contracts" value={prop?.weekly?.rent_volume?.value} wowChg={prop?.weekly?.rent_volume?.chg_wow} yoyChg={prop?.weekly?.rent_volume?.chg_yoy} trend={prop?.weekly?.rent_volume?.trend} period={prop?.weekly?.rent_volume?.period} source={prop?.weekly?.rent_volume?.source} loading={loadProp}/>
              <TxCard label="Rental Contract Value" value={prop?.weekly?.rent_value_aed?.value} wowChg={prop?.weekly?.rent_value_aed?.chg_wow} yoyChg={prop?.weekly?.rent_value_aed?.chg_yoy} trend={prop?.weekly?.rent_value_aed?.trend} period={prop?.weekly?.rent_value_aed?.period} source={prop?.weekly?.rent_value_aed?.source} loading={loadProp}/>
            </div>
          </div>

          {/* Prices & Off-plan split */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>

            {/* Prices */}
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:2, padding:'18px 20px' }}>
              <div style={{ fontFamily:'monospace', fontSize:8, color:C.gm, marginBottom:12, letterSpacing:'.1em' }}>AVERAGE ASKING PRICE PER SQUARE FOOT · {na(prop?.prices?.price_source)}</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[
                  ['Apartments', prop?.prices?.apt_psf_aed, prop?.prices?.apt_avg_aed, prop?.prices?.apt_chg_yoy||prop?.prices?.price_index_chg_yoy],
                  ['Villas',     prop?.prices?.villa_psf_aed, prop?.prices?.villa_avg_aed, prop?.prices?.villa_chg_yoy||prop?.prices?.price_index_chg_yoy],
                ].map(([type,psf,avg,yoy]) => (
                  <div key={type} style={{ padding:'10px 12px', background:C.surf, borderRadius:2 }}>
                    <div style={{ fontFamily:'monospace', fontSize:8, color:C.tm, marginBottom:6 }}>{type.toUpperCase()}</div>
                    <div style={{ fontFamily:'Georgia,serif', fontSize:22, fontWeight:700, color:C.t1 }}>AED {na(psf)}<span style={{fontSize:9,color:C.tm}}>/sqft</span></div>
                    {avg&&<div style={{ fontFamily:'monospace', fontSize:9, color:C.t2, marginTop:3 }}>Avg deal: AED {na(avg)}</div>}
                    {yoy&&<div style={{ fontFamily:'monospace', fontSize:9, color:yoy.toString().startsWith('+')?C.g:C.red, marginTop:3 }}>{yoy} vs last year</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Off-plan vs resale */}
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:2, padding:'18px 20px' }}>
              <div style={{ fontFamily:'monospace', fontSize:8, color:C.gm, marginBottom:8, letterSpacing:'.1em' }}>WHAT KIND OF PROPERTY IS SELLING? · {na(prop?.market_split?.split_period)}</div>
              {loadProp?<Skel h={60}/>:prop?.market_split&&(
                <>
                  <SplitBar offplan={na(prop.market_split.offplan_pct)} secondary={na(prop.market_split.secondary_pct)} loading={loadProp}/>
                  <div style={{ marginTop:12, padding:'8px 10px', background:C.surf, borderRadius:2 }}>
                    <div style={{ fontFamily:'monospace', fontSize:8, color:C.tm, marginBottom:3 }}>WHAT THIS MEANS</div>
                    <div style={{ fontSize:10, color:C.t2, lineHeight:1.5 }}>
                      {parseInt(prop.market_split.offplan_pct)>=65 ? 'New-build off-plan is dominating — developers have pricing power. Good if you own land or new builds; watch for oversupply risk.' :
                       parseInt(prop.market_split.offplan_pct)<=35 ? 'Resale market is stronger — existing homeowners are in a solid position.' :
                       prop.market_split.note || 'Balanced market between new builds and resales — healthy sign for all property types.'}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Rental yields */}
          {(prop?.yields||loadProp) && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontFamily:'monospace', fontSize:8, color:C.gm, marginBottom:8, letterSpacing:'.1em' }}>ANNUAL RENTAL YIELD — HOW MUCH INCOME YOUR PROPERTY GENERATES</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <YieldGauge label="Apartments · Gross Yield"  gross={na(prop?.yields?.apt_gross_yield)}  net={na(prop?.yields?.apt_net_yield)}   loading={loadProp}/>
                <YieldGauge label="Villas · Gross Yield"      gross={na(prop?.yields?.villa_gross_yield)} net={na(prop?.yields?.villa_net_yield)}  loading={loadProp}/>
                
              </div>
            </div>
          )}

          {/* Hottest areas */}
          {(prop?.top_areas||loadProp) && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:2, padding:'18px 20px' }}>
                <div style={{ fontFamily:'monospace', fontSize:8, color:C.gm, marginBottom:4, letterSpacing:'.1em' }}>MOST ACTIVE AREAS THIS WEEK</div>
                <div style={{ fontFamily:'monospace', fontSize:8, color:C.td, marginBottom:12 }}>Ranked by number of deals</div>
                {loadProp?[1,2,3,4,5].map(i=><Skel key={i} h={32} mb={8}/>):
                  prop?.top_areas?.slice(0,5).map((a,i)=>(
                    <AreaRow key={i} rank={`#${i+1}`} area={na(a.area)} vol={na(a.vol)} psf={na(a.avg_psf||a.psf)} trend={a.trend} maxVol={maxVol} last={i===Math.min((prop.top_areas?.length||1),5)-1}/>
                  ))
                }
              </div>
              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:2, padding:'18px 20px' }}>
                <div style={{ fontFamily:'monospace', fontSize:8, color:C.gm, marginBottom:12, letterSpacing:'.1em' }}>SUPPLY & MARKET DYNAMICS</div>
                {loadProp?[1,2,3,4,5].map(i=><Skel key={i} h={20} mb={8}/>):<>
                  <StatRow label="New project launches this month" value={na(prop?.supply?.new_launches_this_month)}/>
                  <StatRow label="Notable new launches" value={na(prop?.supply?.notable_launches)}/>
                  <StatRow label="Units completing this year" value={na(prop?.supply?.completions_ytd)}/>
                  <StatRow label="Oversupply risk" value={na(prop?.supply?.oversupply_risk)} highlight={prop?.supply?.oversupply_risk==='low'?C.g:prop?.supply?.oversupply_risk==='high'?C.red:C.am}/>
                  <StatRow label="Market power (landlord vs tenant)" value={na(prop?.rental?.landlord_vs_tenant)} highlight={prop?.rental?.landlord_vs_tenant==='landlord'?C.g:C.am} last/>
                </>}
              </div>
            </div>
          )}

          {/* Rental rates */}
          {(prop?.rental||loadProp) && (
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:2, padding:'18px 20px', marginBottom:12 }}>
              <div style={{ fontFamily:'monospace', fontSize:8, color:C.gm, marginBottom:12, letterSpacing:'.1em' }}>WHAT TENANTS ARE PAYING RIGHT NOW</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
                {[
                  ['Studio (avg rent)', prop?.rental?.apt_1br_avg_aed, '/year'],
                  ['1-Bed (avg rent)',  prop?.rental?.apt_1br_avg_aed,'/year'],
                  ['2-Bed (avg rent)',  prop?.rental?.apt_2br_avg_aed,'/year'],
                  ['Villa (avg rent)',  prop?.rental?.villa_3br_avg_aed,  '/year'],
                ].map(([label,val,unit]) => val&&na(val)!=='—' ? (
                  <div key={label} style={{ padding:'10px 12px', background:C.surf, borderRadius:2 }}>
                    <div style={{ fontFamily:'monospace', fontSize:8, color:C.tm, marginBottom:5 }}>{label.toUpperCase()}</div>
                    <div style={{ fontFamily:'Georgia,serif', fontSize:17, fontWeight:700, color:C.t1 }}>AED {na(val)}<span style={{fontSize:9,color:C.tm}}>{unit}</span></div>
                  </div>
                ):null)}
              </div>
              {prop?.rental?.rental_index_chg_yoy&&(
                <div style={{ marginTop:10, fontFamily:'monospace', fontSize:9, color:parseFloat(prop.rental.rental_index_chg_yoy)>=0?C.g:C.red }}>
                  Rents are {parseFloat(prop.rental.rental_index_chg_yoy)>=0?'up':'down'} {prop.rental.rental_index_chg_yoy} year-on-year
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════ */}
        {/* ── 02 WHAT'S DRIVING THE MARKET ── */}
        {/* ══════════════════════════════════════════════ */}
        <div style={{ marginTop:48 }}>
          <SectionHead n="02" title="What's Driving the Market?"
            desc="Seven forces that determine where Dubai property prices go next — each searched, scored and explained in plain English. Green means it's helping your property value. Red means it's adding pressure."/>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:10 }}>
            {pillarsWithKey.map((p,i) => p ? <FactorCard key={i} data={p} loading={loadIntel}/> : null)}
          </div>
        </div>

        {/* ══════════════════════════════════════════════ */}
        {/* ── 03 THREE POSSIBLE OUTCOMES ── */}
        {/* ══════════════════════════════════════════════ */}
        {(intel||loadIntel) && (
        <div style={{ marginTop:48 }}>
          <SectionHead n="03" title="Three Possible Outcomes"
            desc="Based on today's data, here are the three most likely ways the Dubai property market could move over the next 3–6 months."/>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>

            {/* Probabilities */}
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:2, padding:24 }}>
              <div style={{ fontFamily:'monospace', fontSize:8, color:C.gm, letterSpacing:'.1em', marginBottom:16 }}>LIKELIHOOD OF EACH SCENARIO</div>
              {loadIntel?[1,2,3].map(i=><Skel key={i} h={40} mb={14}/>):[
                ['Most likely — market stays broadly stable', intel?.base, C.g, 'Geopolitical risk stays contained. Oil steady. Foreign buyers active.'],
                ['Negative — conditions deteriorate',         intel?.down, C.am, 'Conflict escalates or oil drops sharply. Buyers pause.'],
                ['Positive — surge of safe-haven demand',     intel?.up,   C.ga, 'De-escalation and confidence surge. Dubai benefits as safe haven.'],
              ].map(([lbl,pct,col,detail],i)=>(
                <div key={i} style={{ marginBottom:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
                    <span style={{ fontSize:11, color:C.t2, flex:1, paddingRight:10, lineHeight:1.4 }}>{lbl}</span>
                    <span style={{ fontFamily:'Georgia,serif', fontSize:20, fontWeight:700, color:col }}>~{pct||'—'}%</span>
                  </div>
                  <div style={{ height:4, background:C.border, borderRadius:2, marginBottom:5 }}>
                    <div style={{ width:`${pct||0}%`, height:'100%', background:col, borderRadius:2, transition:'width 1.4s ease' }}/>
                  </div>
                  <div style={{ fontSize:9, color:C.td, lineHeight:1.4 }}>{detail}</div>
                </div>
              ))}
            </div>

            {/* Score card */}
            <div style={{ background:C.gd, border:`1px solid ${C.gm}`, borderRadius:2, padding:28, display:'flex', flexDirection:'column', justifyContent:'center' }}>
              {loadIntel?<Skel h={120}/>:<>
                <div style={{ fontFamily:'monospace', fontSize:8, color:C.gm, letterSpacing:'.1em', marginBottom:8 }}>OVERALL MARKET SCORE</div>
                <div style={{ fontFamily:'Georgia,serif', fontSize:80, fontWeight:700, color:intel?.col||C.tm, lineHeight:1, marginBottom:4 }}>
                  {intel?.composite||'—'}<span style={{fontSize:16,color:C.tm}}>/5</span>
                </div>
                <div style={{ fontFamily:'monospace', fontSize:11, letterSpacing:'.14em', color:intel?.col||C.tm, marginBottom:14 }}>
                  {intel?.label}
                </div>
                <Bar score={intel?.composite} color={intel?.col} style={{ marginBottom:8 }}/>
                <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'monospace', fontSize:7, color:C.tm, marginBottom:16 }}>
                  <span>CRISIS</span><span>CAUTION</span><span>STABLE</span><span>STRONG</span><span>EXCELLENT</span>
                </div>
                <div style={{ padding:'12px 14px', background:C.surf, border:`1px solid ${C.border}`, borderRadius:2 }}>
                  <div style={{ fontFamily:'monospace', fontSize:8, color:C.am, marginBottom:4 }}>STRADA'S RECOMMENDATION</div>
                  <div style={{ fontSize:12, color:C.t1, lineHeight:1.7 }}>{intel?.action}</div>
                </div>
                {/* Factor breakdown */}
                <div style={{ marginTop:16, paddingTop:12, borderTop:`1px solid ${C.border}` }}>
                  {pillarsWithKey.filter(Boolean).map(p => {
                    const meta = PILLARS[p.key]||{icon:'📊',title:p.title};
                    const col  = p.score>=4?C.g:p.score<=2?C.red:C.am;
                    return (
                      <div key={p.key} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:`1px solid ${C.border}`, alignItems:'center' }}>
                        <span style={{ fontSize:10, color:C.t2 }}>{meta.icon} {meta.title}</span>
                        <span style={{ fontFamily:'Georgia,serif', fontSize:13, fontWeight:700, color:col }}>{p.score||'—'}<span style={{fontSize:8,color:C.tm}}>/5</span></span>
                      </div>
                    );
                  })}
                </div>
              </>}
            </div>
          </div>
        </div>
        )}

        {/* ══════════════════════════════════════════════ */}
        {/* ── 04 WARNING SIGNS ── */}
        {/* ══════════════════════════════════════════════ */}
        <div style={{ marginTop:48 }}>
          <SectionHead n="04" title="Warning Signs — Know When to Act"
            desc="Bookmark this page. If any of these occur, check the relevant column for what to do. Nothing on this list is currently triggered unless it glows red or amber."/>
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:2, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 1fr', background:C.surf, padding:'8px 16px', borderBottom:`1px solid ${C.border}` }}>
              {['WHAT TO WATCH FOR','URGENCY LEVEL','WHAT TO DO'].map(h=><span key={h} style={{ fontFamily:'monospace', fontSize:7, letterSpacing:'.1em', color:C.tm }}>{h}</span>)}
            </div>
            {ALERTS.map(([trigger,level,action,col],i)=>(
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 120px 1fr', padding:'11px 16px', borderBottom:i<ALERTS.length-1?`1px solid ${C.border}`:'none', alignItems:'center' }}>
                <span style={{ fontSize:11, color:C.t1, paddingRight:12, lineHeight:1.5 }}>{trigger}</span>
                <span style={{ fontFamily:'monospace', fontSize:8, padding:'3px 6px', borderRadius:2, textAlign:'center', color:col, background:`${col}14`, border:`1px solid ${col}35`, lineHeight:1.5 }}>{level}</span>
                <span style={{ fontSize:11, color:C.t2, paddingLeft:12, lineHeight:1.5 }}>{action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════════ */}
        {/* ── 05 SUPPORTING DATA (collapsed by default) ── */}
        {/* ══════════════════════════════════════════════ */}
        <div style={{ marginTop:48 }}>
          <div
            onClick={() => setShowData(!showData)}
            style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', background:C.card, border:`1px solid ${C.border}`, borderRadius:2, cursor:'pointer', userSelect:'none' }}>
            <div>
              <div style={{ fontFamily:'Georgia,serif', fontSize:15, fontWeight:700, color:C.t1 }}>
                05 · The Data Behind Our Analysis
              </div>
              <div style={{ fontSize:11, color:C.tm, marginTop:4 }}>
                The raw market numbers used to calculate the scores above — for those who want to go deeper
              </div>
            </div>
            <span style={{ fontFamily:'monospace', fontSize:11, color:C.gm, marginLeft:16 }}>{showData?'▲ HIDE':'▼ SHOW'}</span>
          </div>

          {showData && (
            <div className="fade-in" style={{ border:`1px solid ${C.border}`, borderTop:'none', borderRadius:'0 0 2px 2px', padding:'24px 20px', background:C.surf }}>

              {/* Dubai developers + banks */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontFamily:'monospace', fontSize:8, color:C.gm, letterSpacing:'.1em', marginBottom:4 }}>DUBAI DEVELOPER & BANK STOCKS</div>
                <div style={{ fontSize:10, color:C.td, marginBottom:8 }}>When these rise, property prices tend to follow 2–3 months later</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <DataCard label="Emaar Properties (stock)" price={mkt?.emaar?.price?`AED ${mkt.emaar.price}`:null} chg={`${mkt?.emaar?.chg||''} ${mkt?.emaar?.pct||''}`} up={mkt?.emaar?.up} loading={loadIntel} explain="Dubai's biggest developer. A rising stock price leads property prices by 2–3 months."/>
                  <DataCard label="Dubai Stock Market" price={mkt?.dfmgi?.price} chg={`${mkt?.dfmgi?.chg||''} ${mkt?.dfmgi?.pct||''}`} up={mkt?.dfmgi?.up} loading={loadIntel} explain="Overall health of Dubai's public companies."/>
                  <DataCard label="Emirates NBD Bank" price={mkt?.enbd?.price?`AED ${mkt.enbd.price}`:null} chg={`${mkt?.enbd?.chg||''} ${mkt?.enbd?.pct||''}`} up={mkt?.enbd?.up} loading={loadIntel} explain="Dubai's biggest bank. Rising = better mortgage lending conditions."/>
                  <DataCard label="Dubai Islamic Bank" price={mkt?.dib?.price?`AED ${mkt.dib.price}`:null} chg={`${mkt?.dib?.chg||''} ${mkt?.dib?.pct||''}`} up={mkt?.dib?.up} loading={loadIntel} explain="Main Islamic mortgage lender. Signals end-user demand."/>
                </div>
              </div>

              {/* Energy & global */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontFamily:'monospace', fontSize:8, color:C.gm, letterSpacing:'.1em', marginBottom:4 }}>GLOBAL CONDITIONS</div>
                <div style={{ fontSize:10, color:C.td, marginBottom:8 }}>World economy signals that drive foreign investor confidence and Gulf oil wealth</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <DataCard label="Oil Price (per barrel)" price={mkt?.brent?.price?`$${mkt.brent.price}`:null} chg={`${mkt?.brent?.chg||''} ${mkt?.brent?.pct||''}`} up={mkt?.brent?.up} loading={loadIntel} explain={brentRaw>=75?"Above $75 — Gulf states have strong budgets, wealthy Gulf buyers remain active":brentRaw>0&&brentRaw<65?"Below $65 — Gulf government budgets tighten, fewer Gulf investors buying":"Below $65 = trigger point for reduced Gulf buyer activity"}/>
                  <DataCard label="Gold Price" price={mkt?.gold?.price?`$${mkt.gold.price}/oz`:null} chg={`${mkt?.gold?.chg||''} ${mkt?.gold?.pct||''}`} up={mkt?.gold?.up} loading={loadIntel} explain="Rising gold means investors are nervous globally — Dubai property often benefits as a safe-haven alternative."/>
                  <DataCard label="US Stock Market (S&P 500)" price={mkt?.sp500?.price} chg={`${mkt?.sp500?.chg||''} ${mkt?.sp500?.pct||''}`} up={mkt?.sp500?.up} loading={loadIntel} explain={intel?.sp500_30d?`30-day move: ${intel.sp500_30d.chgPct}. ${intel.sp500_30d.rawPct<=-10?'⚠ Down 10%+ — foreign buyers pausing.':'Healthy range.'}`:undefined}/>
                  <DataCard label="Global Anxiety Level" price={mkt?.vix?.price} chg={`${mkt?.vix?.chg||''} ${mkt?.vix?.pct||''}`} up={mkt?.vix?.up===true?false:mkt?.vix?.up===false?true:null} loading={loadIntel} explain={vixRaw<20?"Below 20 = calm. International buyers are confident.":vixRaw<35?"Moderate anxiety. Some caution among foreign buyers.":"Above 35 = high fear. International buyer activity will slow temporarily."}/>
                  <DataCard label="Global Borrowing Costs" price={mkt?.us10y?.price?`${mkt.us10y.price}%`:null} chg={`${mkt?.us10y?.chg||''} ${mkt?.us10y?.pct||''}`} up={mkt?.us10y?.up===true?false:mkt?.us10y?.up===false?true:null} loading={loadIntel} explain={r10Raw<4.5?"Low — cheap global borrowing encourages property investment.":r10Raw<5?"Moderate — some pressure on leveraged buyers.":"High — expensive borrowing worldwide, dampens foreign investment appetite."}/>
                </div>
              </div>

              {/* Buyer origin */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontFamily:'monospace', fontSize:8, color:C.gm, letterSpacing:'.1em', marginBottom:4 }}>INDIA & CHINA — TOP BUYER NATIONALITIES AT DUBAI LAND DEPARTMENT</div>
                <div style={{ fontSize:10, color:C.td, marginBottom:8 }}>Indian and Chinese nationals are consistently the #1 and #2 foreign buyer groups in Dubai</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <DataCard label="India Stock Market" price={mkt?.sensex?.price} chg={`${mkt?.sensex?.chg||''} ${mkt?.sensex?.pct||''}`} up={mkt?.sensex?.up} loading={loadIntel} explain={mkt?.sensex?.up===true?"Rising — Indian HNW investors feel wealthy, Dubai purchases increase in 4–6 weeks.":"Falling — Indian buyer confidence easing, watch DLD Indian buyer volumes."}/>
                  <DataCard label="Hong Kong / China Market" price={mkt?.hsi?.price} chg={`${mkt?.hsi?.chg||''} ${mkt?.hsi?.pct||''}`} up={mkt?.hsi?.up} loading={loadIntel} explain={mkt?.hsi?.up===true?"Rising — Chinese capital seeking offshore investments like Dubai increases.":"Falling — Chinese buyer activity may soften 60–90 days from now."}/>
                  <DataCard label="Indian Rupee → AED" price={mkt?.inraed?.price} chg={`${mkt?.inraed?.chg||''} ${mkt?.inraed?.pct||''}`} up={mkt?.inraed?.up} loading={loadIntel} explain={`30-day: ${intel?.inr30d?.chgPct||'N/A'}. ${(intel?.inr30d?.rawPct||0)>=0?'Rupee strengthening — Dubai gets cheaper for Indian buyers.':'Rupee weakening — Dubai gets more expensive for Indian buyers.'}`}/>
                  <DataCard label="Chinese Yuan → AED" price={mkt?.cnyaed?.price} chg={`${mkt?.cnyaed?.chg||''} ${mkt?.cnyaed?.pct||''}`} up={mkt?.cnyaed?.up} loading={loadIntel} explain={`30-day: ${intel?.cny30d?.chgPct||'N/A'}. ${(intel?.cny30d?.rawPct||0)>=0?'Yuan firming — Chinese buyers have more purchasing power.':'Yuan weakening — Chinese buyer purchasing power is squeezed.'}`}/>
                </div>
              </div>

              {/* UAE Mortgage rate & Business confidence */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontFamily:'monospace', fontSize:8, color:C.gm, letterSpacing:'.1em', marginBottom:4 }}>UAE MORTGAGE RATE & BUSINESS CONFIDENCE</div>
                <div style={{ fontSize:10, color:C.td, marginBottom:8 }}>The interest rate Dubai banks charge on mortgages, and a measure of how confident businesses are</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {/* Mortgage rate */}
                  {(() => {
                    const e = intel?.eibor;
                    const rate = parseFloat(e?.rate_pct||0);
                    const col  = rate===0?C.tm:rate<5?C.g:rate<5.5?C.am:C.red;
                    return (
                      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:2, padding:'14px 16px' }}>
                        <Tag color={C.gm}>UAE Mortgage Interest Rate (3-month)</Tag>
                        {loadIntel?<Skel h={28} mb={6}/>:<>
                          <div style={{ fontFamily:'Georgia,serif', fontSize:26, fontWeight:700, color:col, lineHeight:1.1, marginBottom:6 }}>
                            {rate>0?`${e.rate_pct}%`:'—'}
                          </div>
                          {e?.prev_3m_pct&&<div style={{ fontFamily:'monospace', fontSize:9, color:C.t2, marginBottom:6 }}>3 months ago: {e.prev_3m_pct}%</div>}
                          <div style={{ fontSize:10, color:C.t2, lineHeight:1.5 }}>
                            {rate<5?'Below 5% — mortgages are affordable. End-user buyers are active.':rate<5.5?'5–5.5% — moderate cost. Cash buyers now preferred over mortgage buyers.':rate>0?'Above 5.5% — high mortgage cost. Reduces number of buyers who can qualify.':'Searching for current rate...'}
                          </div>
                          {e?.period&&<div style={{ fontFamily:'monospace', fontSize:7, color:C.td, marginTop:6 }}>{e.period} · {e.source||'UAE Central Bank'}</div>}
                        </>}
                      </div>
                    );
                  })()}
                  {/* Business confidence */}
                  {(() => {
                    const p   = intel?.uae_pmi;
                    const val = parseFloat(p?.headline||0);
                    const col = val===0?C.tm:val>=54?C.g:val>=50?C.am:C.red;
                    return (
                      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:2, padding:'14px 16px' }}>
                        <Tag color={C.gm}>Dubai Business Confidence Index</Tag>
                        {loadIntel?<Skel h={28} mb={6}/>:<>
                          <div style={{ fontFamily:'Georgia,serif', fontSize:26, fontWeight:700, color:col, lineHeight:1.1, marginBottom:6 }}>
                            {val>0?p.headline:'—'} <span style={{ fontSize:10, color:C.tm }}>{val>=50?'(growing)':'(shrinking)'}</span>
                          </div>
                          {p?.new_orders&&<div style={{ fontFamily:'monospace', fontSize:9, color:C.t2, marginBottom:4 }}>New business orders: {p.new_orders}</div>}
                          <div style={{ fontSize:10, color:C.t2, lineHeight:1.5 }}>
                            {val>=56?'Very strong — corporate relocations and new residents flowing in. Leads property demand by ~6 months.':val>=54?'Healthy — business confidence solid. Property demand supported.':val>=50?'Moderate — growth slowing. Watch for deceleration.':val>0?'Contracting — business confidence falling. Property demand may soften in 2 quarters.':'Searching for latest data...'}
                          </div>
                          {p?.month_label&&<div style={{ fontFamily:'monospace', fontSize:7, color:C.td, marginTop:6 }}>{p.month_label} · {p.source||'S&P Global'}</div>}
                        </>}
                      </div>
                    );
                  })()}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ── 06 MORNING CHECKLIST ── */}
        <div style={{ marginTop:36 }}>
          <SectionHead n="06" title="Your 5-Minute Morning Checklist"
            desc="For those who want to go deeper — these are the best sources to check each morning. Bookmark this page."/>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:10 }}>
            {CHECKLIST.map(([cat,items])=>(
              <div key={cat} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:2, padding:'15px 17px' }}>
                <div style={{ fontFamily:'monospace', fontSize:8, letterSpacing:'.14em', color:C.g, marginBottom:10, paddingBottom:7, borderBottom:`1px solid ${C.border}` }}>{cat}</div>
                {items.map(([name,url])=>(
                  <div key={name} style={{ padding:'6px 0', borderBottom:`1px solid ${C.border}` }}>
                    <a href={url} target="_blank" style={{ fontSize:11 }}>{name}</a>
                    <div style={{ fontFamily:'monospace', fontSize:9, color:C.gm, marginTop:1 }}>{url.replace('https://','')}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

      </div>

      <div style={{ padding:'18px 48px', borderTop:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
        <div style={{ fontFamily:'Georgia,serif', fontSize:11, fontStyle:'italic', color:C.tm }}>"The market rewards those who see clearly, earlier."</div>
        <div style={{ fontFamily:'monospace', fontSize:8, color:C.td, textAlign:'right', lineHeight:1.9 }}>STRADA REAL ESTATE · KYLE CARUANA · +971 58 579 2599 · STRADAUAE.COM</div>
      </div>
    </div>
  );
}
