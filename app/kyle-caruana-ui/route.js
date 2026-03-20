import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // #region agent log
  fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'blank-admin-pre',hypothesisId:'H1',location:'app/kyle-caruana-ui/route.js:8',message:'kyle-caruana-ui route hit',data:{},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    // Candidate paths (Vercel/serverless working dir can differ from local).
    const candidates = [
      path.join(process.cwd(), 'kyle-caruana-ui.html'),
      path.join(__dirname, '..', '..', 'kyle-caruana-ui.html'),
      path.join(__dirname, '..', '..', '..', 'kyle-caruana-ui.html'),
    ];

    let lastErr = '';
    let html = null;
    for (const c of candidates) {
      try {
        // #region agent log
        fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'blank-admin-pre',hypothesisId:'H1',location:'app/kyle-caruana-ui/route.js:candidate',message:'try read candidate',data:{candidateLen:String(c.length)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        // eslint-disable-next-line no-await-in-loop
        html = await readFile(c, 'utf8');
        break;
      } catch (e) {
        lastErr = String(e?.message || e);
      }
    }
    if (!html) throw new Error(lastErr || 'kyle-caruana-ui.html not found in candidates');

    // #region agent log
    fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'blank-admin-pre',hypothesisId:'H1',location:'app/kyle-caruana-ui/route.js:read-ok',message:'read ok',data:{htmlLen:html.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    // #region agent log
    fetch('http://127.0.0.1:7603/ingest/99cc14af-5ec3-4b0c-b7f2-77017c17c844',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'69d0ba'},body:JSON.stringify({sessionId:'69d0ba',runId:'blank-admin-pre',hypothesisId:'H1',location:'app/kyle-caruana-ui/route.js:19',message:'read html failed',data:{error:String(e?.message||e)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return new Response(`/* kyle-caruana-ui failed to load: ${String(e?.message || e)} */`, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

