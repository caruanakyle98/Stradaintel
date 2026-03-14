# Anthropic API key — Vercel is the source of truth

Production **does not** read `.env.local` from the repo. Vercel injects env at runtime.

## 1. Set the key in Vercel (once)

1. [Vercel Dashboard](https://vercel.com) → your **Strada / Stradaintel** project  
2. **Settings** → **Environment Variables**  
3. Add:
   - **Name:** `ANTHROPIC_API_KEY`  
   - **Value:** your key (`sk-ant-api03-…`)  
   - **Environments:** Production, Preview, Development (as needed)  
4. **Save**, then **Redeploy** (or push a commit) so new builds pick it up.

`app/api/intelligence` and any other server route use `process.env.ANTHROPIC_API_KEY` — same as before.

## 2. Local dev = same key as Vercel

From the repo root (after [Vercel CLI](https://vercel.com/docs/cli) login):

```bash
npm run env:pull
```

This runs `vercel env pull .env.local` and **overwrites `.env.local`** with variables from the linked Vercel project (including `ANTHROPIC_API_KEY`). Then:

```bash
npm run dev
```

Link the folder once if needed:

```bash
npx vercel link
```

## 3. Repo / git

- **Commit:** `.env.example` only (placeholder).  
- **Never commit:** `.env.local` (gitignored).

## 4. Web search (recommended: Tavily)

Anthropic’s built-in **`web_search`** tool often returns **“credit balance too low”** even when normal Claude calls work. Strada uses **Tavily** for real web results, then Claude (text-only) turns them into scorecards.

1. Sign up at **[tavily.com](https://tavily.com)** → API key (`tvly-…`).
2. Vercel → Environment Variables → **`TAVILY_API_KEY`** = your key (Production + Preview).
3. Redeploy.

Optional: **`ANTHROPIC_WEB_SEARCH=1`** — also tries Claude native search when Tavily has no results (may still 400 on billing).

## 5. Optional manual `.env.local`

If you don’t use `env:pull`, you can still create `.env.local` by hand with the same `ANTHROPIC_API_KEY=` line — but **Vercel remains the canonical place** for production.
