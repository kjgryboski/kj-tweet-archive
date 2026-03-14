# KJ Tweet Archive

A minimalist web app that automatically archives tweets from [@KJFUTURES](https://x.com/KJFUTURES) and displays them with smooth scroll-triggered animations.

**Live site:** [kjtweets.com](https://kjtweets.com)

## How It Works

1. A **Vercel Cron job** runs every 6 hours
2. A **headless browser** (Puppeteer) scrapes the X profile page with fallback selectors
3. New original tweets (no replies/retweets) are saved to **Vercel Postgres** with like counts
4. A **weekly cron** refreshes like counts for recent tweets
5. The Next.js frontend displays tweets with infinite scroll, search, and sorting

```
X Profile (@KJFUTURES) → Scraper (every 6h) → Vercel Postgres → kjtweets.com
                        → Metrics Refresh (weekly) ↗
```

## Features

- **Infinite scroll** — cursor-based pagination, 30 tweets per batch
- **Search** — client-side search with term highlighting and result navigation
- **Sort** — Newest, Oldest, or by Likes
- **Like counts** — scraped from X, displayed on tweet cards, refreshed weekly
- **Dark/light mode** — toggle with system preference detection
- **Scraper resilience** — fallback CSS selector chains, retry logic (2 attempts), email alerts via Resend on failure/degradation
- **CDN caching** — 6-hour Cache-Control on first page, Vercel Edge serves cached responses
- **Scroll animations** — Framer Motion fade-in on scroll
- **Back to top** — floating button after 500px scroll
- **Open Graph** — social sharing metadata for link previews

## Tech Stack

- **Framework:** Next.js 15 (Pages Router)
- **Database:** Vercel Postgres (Neon)
- **Scraper:** puppeteer-core + @sparticuz/chromium
- **Styling:** Material UI + Tailwind CSS
- **Animations:** Framer Motion
- **Testing:** Vitest + React Testing Library (77 tests)
- **Alerting:** Resend (email alerts for scraper failures)
- **Hosting:** Vercel (Pro)
- **Domain:** kjtweets.com (Squarespace DNS → Vercel)

## Project Structure

```
src/
  components/
    Tweet.tsx            # Tweet card (name, text, likes, media, search highlight)
    TweetList.tsx        # Responsive grid with loading states
    SearchBar.tsx        # Search with result navigation
    BackToTop.tsx        # Scroll-to-top floating button
    ThemeToggle.tsx      # Dark/light mode toggle
  lib/
    db.ts                # Postgres queries (getTweetsPaginated, insertTweet, updateTweetLikes)
    api.ts               # Server-side tweet fetcher
    theme-context.tsx    # Dark/light mode context provider
    scraper-selectors.ts # Fallback CSS selector chains for X DOM
    scraper-utils.ts     # Tweet parsing utilities (generateTitle, parseTweetElements)
    email.ts             # Resend alert sender
  pages/
    index.tsx            # Main page (infinite scroll, sort toggle, search)
    api/
      tweets.ts          # GET /api/tweets — paginated, sortable, cached
      cron/
        scrape-tweets.ts # Cron endpoint — scrapes X with retry + fallbacks
        refresh-metrics.ts # Weekly cron — refreshes like counts
vercel.json              # Cron schedule config
vitest.config.ts         # Test configuration
```

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Requires `POSTGRES_URL` in `.env.local` — run `vercel env pull` to get it.

### Testing

```bash
npm test          # Run all 77 tests
npm run test:watch # Watch mode
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `POSTGRES_URL` | Vercel Postgres connection string (auto-set by Vercel) |
| `CRON_SECRET` | Auth token for cron endpoints (auto-sent by Vercel) |
| `RESEND_API_KEY` | Resend API key for scraper failure alerts |

## API

### `GET /api/tweets`

Returns paginated tweets.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `cursor` | string | — | Tweet ID cursor for pagination |
| `limit` | number | 30 | Tweets per page (max 100) |
| `sort` | string | `newest` | Sort order: `newest`, `oldest`, or `likes` |

Response:
```json
{
  "tweets": [...],
  "hasMore": true,
  "nextCursor": "tweet_id"
}
```

## Cron Jobs

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/scrape-tweets` | Every 6 hours | Scrape new tweets from X |
| `/api/cron/refresh-metrics` | Weekly (Sunday midnight UTC) | Refresh like counts |

## Deployment

Auto-deploys on push to `main` via Vercel. Vercel Pro plan required for sub-daily cron intervals.
