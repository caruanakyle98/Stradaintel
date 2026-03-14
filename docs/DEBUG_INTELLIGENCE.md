# How to run the intelligence debug again

## What the log means (your lines 164–167)

| Line | Meaning |
|------|--------|
| **164–165** | **Tavily OK** — `ok: true`, `resultCount: 8`. Web search works. |
| **166–167** | **Claude never ran** — `newsErr: "Anthropic key missing"`. Tavily only fetches text; **Anthropic** still builds the three scorecards + EIBOR/PMI JSON. |

**Fix:** Set **`ANTHROPIC_API_KEY`** wherever you run the app (same as before). Locally: second line in `.env.local` or `npm run env:pull` so Vercel gives you both keys.

## Local (recommended)

```bash
cd /path/to/Stradaintel
npm run env:pull          # writes .env.local from Vercel (both keys)
npm run dev
# Browser: http://localhost:3000  → triggers /api/intelligence
```

Server-side debug file logging was removed after verification. Use Vercel **Logs** for production, or temporarily `console.log` if needed.

## Vercel deployment (password-protected)

Normal `curl` gets an auth page. With CLI:

```bash
cd Stradaintel
npx vercel login
npx vercel link              # once, pick team + project
npx vercel curl https://YOUR-PROJECT.vercel.app/api/intelligence
```

Replace with your real production URL. Ensure **Vercel → Environment variables** has **both** `ANTHROPIC_API_KEY` and `TAVILY_API_KEY` for **Production** (and **Preview** if you test previews).

## CLI error: “scope does not exist”

```bash
npx vercel teams ls
npx vercel link --scope YOUR_TEAM_SLUG
```

Or log in again: `npx vercel login`
