# KJ Tweet Archive

A minimalist web app that automatically archives tweets from [@KJFUTURES](https://x.com/KJFUTURES) and displays them with smooth scroll-triggered animations.

**Live site:** [kjtweets.com](https://kjtweets.com)

## How It Works

1. A **Vercel Cron job** runs every 6 hours
2. A **headless browser** (Puppeteer) scrapes the X profile page
3. New original tweets (no replies/retweets) are saved to **Vercel Postgres**
4. The Next.js frontend reads from Postgres and displays them

```
X Profile (@KJFUTURES) → Scraper (every 6h) → Vercel Postgres → kjtweets.com
```

## Tech Stack

- **Framework:** Next.js 15 (Pages Router)
- **Database:** Vercel Postgres (Neon)
- **Scraper:** puppeteer-core + @sparticuz/chromium
- **Styling:** Material UI
- **Animations:** Framer Motion
- **Hosting:** Vercel (Pro)
- **Domain:** kjtweets.com (Squarespace DNS → Vercel)

## Project Structure

```
src/
  components/       # Tweet, TweetList, SearchBar, BackToTop, ThemeToggle
  lib/
    db.ts            # Postgres queries (getTweets, insertTweet, etc.)
    api.ts           # Server-side tweet fetcher
    theme-context.tsx # Dark/light mode
  pages/
    index.tsx        # Main page
    api/
      tweets.ts      # GET /api/tweets — returns all tweets as JSON
      cron/
        scrape-tweets.ts  # Cron endpoint — scrapes X profile
vercel.json          # Cron schedule config
```

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Requires `POSTGRES_URL` in `.env.local` — run `vercel env pull` to get it.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `POSTGRES_URL` | Vercel Postgres connection string (auto-set by Vercel) |
| `CRON_SECRET` | Auth token for cron endpoint (auto-sent by Vercel) |

## Deployment

Auto-deploys on push to `main` via Vercel.

```bash
vercel --prod
```

## Cron Schedule

The scraper runs every 6 hours (`0 */6 * * *`), configured in `vercel.json`. Vercel Pro plan required for sub-daily cron intervals.
