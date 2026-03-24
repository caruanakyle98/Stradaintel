import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
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
        // eslint-disable-next-line no-await-in-loop
        html = await readFile(c, 'utf8');
        break;
      } catch (e) {
        lastErr = String(e?.message || e);
      }
    }
    if (!html) throw new Error(lastErr || 'kyle-caruana-ui.html not found in candidates');

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return new Response(`/* kyle-caruana-ui failed to load: ${String(e?.message || e)} */`, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
