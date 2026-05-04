'use client';
import React, { useEffect, useRef, useState } from 'react';

const PANEL_CSS = `
.twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
  max-height:calc(100vh - 32px);display:flex;flex-direction:column;
  background:rgba(250,249,247,.78);color:#29261b;
  -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
  border:.5px solid rgba(255,255,255,.6);border-radius:14px;
  box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
  font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
.twk-hd{display:flex;align-items:center;justify-content:space-between;
  padding:10px 8px 10px 14px;cursor:move;user-select:none}
.twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
.twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
  width:22px;height:22px;border-radius:6px;cursor:pointer;font-size:13px;line-height:1}
.twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
.twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
  overflow-y:auto;overflow-x:hidden;min-height:0}
.twk-row{display:flex;flex-direction:column;gap:5px}
.twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
  color:rgba(41,38,27,.72)}
.twk-lbl>span:first-child{font-weight:500}
.twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
  color:rgba(41,38,27,.45);padding:10px 0 0}
.twk-sect:first-child{padding-top:0}
.twk-field{appearance:none;width:100%;height:26px;padding:0 8px;
  border:.5px solid rgba(0,0,0,.1);border-radius:7px;
  background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none;
  box-sizing:border-box}
.twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
.twk-toggle-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
  background:#c9a84c;color:#06070a;font-weight:600;cursor:pointer;font-size:11px;
  letter-spacing:0.04em}
@media print { .twk-panel, .twk-toggle-btn { display:none !important; } }
`;

export default function TweaksPanel({ tweaks, setTweaks }) {
  const [open, setOpen] = useState(false);
  const dragRef = useRef(null);
  const offsetRef = useRef({ x: 16, y: 16 });
  const PAD = 16;

  // Clamp panel within viewport on resize.
  const clampToViewport = () => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  };

  useEffect(() => {
    if (!open) return;
    clampToViewport();
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, [open]);

  const onDragStart = (e) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const update = (key) => (e) => setTweaks((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <>
      <style>{PANEL_CSS}</style>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="twk-toggle-btn no-print"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: 2147483646,
          }}
        >
          Edit details
        </button>
      )}
      {open && (
        <div ref={dragRef} className="twk-panel no-print" style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
          <div className="twk-hd" onMouseDown={onDragStart}>
            <b>Report details</b>
            <button className="twk-x" aria-label="Close" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <div className="twk-body">
            <div className="twk-sect">Report meta</div>
            <Field label="Building / community" value={tweaks.building} onChange={update('building')} />
            <Field label="Month / year" value={tweaks.month} onChange={update('month')} />

            <div className="twk-sect">Agent</div>
            <Field label="Name" value={tweaks.agentName} onChange={update('agentName')} />
            <Field label="Role" value={tweaks.agentRole} onChange={update('agentRole')} />
            <Field label="Phone" value={tweaks.agentPhone} onChange={update('agentPhone')} />
            <Field label="Email" value={tweaks.agentEmail} onChange={update('agentEmail')} />

            <div className="twk-sect">Dashboard</div>
            <Field label="URL" value={tweaks.dashboardUrl} onChange={update('dashboardUrl')} />
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div className="twk-row">
      <div className="twk-lbl">
        <span>{label}</span>
      </div>
      <input className="twk-field" type="text" value={value || ''} onChange={onChange} />
    </div>
  );
}
