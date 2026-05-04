'use client';
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CoverPage, ExpectPageA, ExpectPageB, CommunityA, CommunityB } from './components/Pages';
import {
  SalesTablePage,
  RentalTablePage,
  ListingPerfPage,
  SalesIndex6Mo,
  SalesIndex12Mo,
  RentalIndex3Mo,
  RentalIndexJan,
} from './components/Tables';
import { BackCoverPage } from './components/BackCover';
import TweaksPanel from './components/TweaksPanel';
import { SI } from './components/colors';
import { adaptReportData } from './data-adapter';

function ReportInner() {
  const params = useSearchParams();
  const area = params.get('area') || '';
  const community = params.get('community') || '';
  const building = params.get('building') || '';

  const initialMonth = useMemo(
    () =>
      new Date()
        .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        .toLowerCase(),
    [],
  );

  const [tweaks, setTweaks] = useState({
    building: building || community || 'VIDA residences',
    month: initialMonth,
    agentName: 'kyle caruana',
    agentRole: 'leasing associate',
    agentPhone: '+971 58 579 2599',
    agentEmail: 'kyle@stradaintel.com',
    dashboardUrl: 'stradaintel.info/dashboard',
  });

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/property-read').then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) })),
      fetch('/api/intelligence-read').then((r) => r.json()).catch(() => ({ ok: false })),
    ]).then(([prop, intel]) => {
      if (cancelled) return;
      if (!prop || prop.ok === false) {
        setError(prop?.error || 'Could not load property snapshot.');
        return;
      }
      setData(adaptReportData(prop, intel || {}, { area, community, building }));
    });
    return () => {
      cancelled = true;
    };
  }, [area, community, building]);

  const handleExportPdf = async () => {
    const html2pdf = (await import('html2pdf.js')).default;
    const root = document.getElementById('report-root');
    if (!root) return;
    const filename = `Strada-${(tweaks.building || 'report').replace(/[^\w]+/g, '-')}-${
      (tweaks.month || '').replace(/[^\w]+/g, '-')
    }.pdf`;
    await html2pdf()
      .set({
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, backgroundColor: '#06070a', useCORS: true },
        jsPDF: { unit: 'px', format: [768, 1000], orientation: 'portrait' },
        pagebreak: { mode: ['css'], before: '.report-page' },
      })
      .from(root)
      .save();
  };

  if (error) {
    return (
      <div style={{ background: SI.bg, color: SI.t1, padding: 40, minHeight: '100vh', fontFamily: "'Poppins',sans-serif" }}>
        <div style={{ maxWidth: 480 }}>
          <div style={{ color: SI.gold, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8 }}>
            Could not load report
          </div>
          <div style={{ color: SI.t2, fontSize: 13, lineHeight: 1.5 }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ background: SI.bg, color: SI.t1, padding: 40, minHeight: '100vh', fontFamily: "'Poppins',sans-serif" }}>
        <div style={{ color: SI.gold, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase' }}>
          Loading report data…
        </div>
      </div>
    );
  }

  const pages = [
    <CoverPage key="cover" idx={1} total={13} tweaks={tweaks} />,
    <ExpectPageA key="exp-a" idx={2} total={13} tweaks={tweaks} />,
    <ExpectPageB key="exp-b" idx={3} total={13} tweaks={tweaks} />,
    <CommunityA key="com-a" idx={4} total={13} tweaks={tweaks} />,
    <CommunityB key="com-b" idx={5} total={13} tweaks={tweaks} />,
    <SalesTablePage key="sales" idx={6} total={13} rows={data.salesRows} tweaks={tweaks} />,
    <RentalTablePage key="rentals" idx={7} total={13} rows={data.rentalRows} tweaks={tweaks} />,
    <ListingPerfPage key="listings" idx={8} total={13} listings={data.listingPerf} volume={data.rentVolumeByBed} tweaks={tweaks} />,
    <SalesIndex6Mo key="sales6" idx={9} total={13} bars={data.sales6mo} tweaks={tweaks} />,
    <SalesIndex12Mo key="sales12" idx={10} total={13} bars={data.sales12mo} kpi={data.sales12moKpi} tweaks={tweaks} />,
    <RentalIndex3Mo key="rent3" idx={11} total={13} bars={data.rental3mo} tweaks={tweaks} />,
    <RentalIndexJan key="rentmo" idx={12} total={13} bars={data.rentalMonth} kpi={data.rentalMonthKpi} tweaks={tweaks} />,
    <BackCoverPage key="back" idx={13} total={13} kpis={data.backCoverKpis} tweaks={tweaks} />,
  ];

  return (
    <div
      style={{
        background: SI.bg,
        minHeight: '100vh',
        padding: '36px 0 80px',
      }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&family=Poppins:wght@300;400;500;600;700;800;900&display=swap"
        rel="stylesheet"
      />
      <button
        onClick={handleExportPdf}
        className="no-print"
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 1000,
          background: SI.gold,
          color: '#06070a',
          border: 'none',
          borderRadius: 6,
          padding: '10px 18px',
          fontFamily: "'Montserrat',serif",
          fontWeight: 800,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          fontSize: 11,
          cursor: 'pointer',
          boxShadow: '0 8px 28px rgba(0,0,0,0.3)',
        }}
      >
        Download PDF
      </button>
      <div
        id="report-root"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 30,
        }}
      >
        {pages}
      </div>
      <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} />
      <style jsx global>{`
        @media print {
          body {
            background: #06070a !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div style={{ background: '#07080c', color: '#e8eefc', padding: 40 }}>Loading…</div>}>
      <ReportInner />
    </Suspense>
  );
}
