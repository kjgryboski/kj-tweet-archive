# KJ Tweet Archive

A minimalist web app that automatically archives tweets from [@KJFUTURES](https://x.com/KJFUTURES) and displays them with smooth scroll-triggered animations.

**Live site:** [kjtweets.com](https://kjtweets.com)

## How It Works

1. A **Vercel Cron job** runs every 6 hours
2. A **headless browser** (Puppeteer) scrapes the X profile page with fallback selectors and scroll pagination
3. New original tweets (no replies/retweets) are upserted to **Vercel Postgres** with like counts, syncing edits
4. A **weekly cron** refreshes like counts for visible tweets
5. The Next.js frontend displays tweets with infinite scroll, server-side search, and sorting

```
X Profile (@KJFUTURES) → Scraper (every 6h) → Vercel Postgres → kjtweets.com
                        → Metrics Refresh (weekly) ↗
```

## Features

- **Server-side search** — debounced ILIKE search (300ms) across all archived tweets, result count display, search highlighting
- **Infinite scroll** — cursor-based pagination, 30 tweets per batch, ref-guarded dedup
- **Sort** — Newest, Oldest, or by Likes — URL-persisted (`?sort=likes` survives refresh/sharing)
- **Individual tweet pages** — `/tweet/[id]` with SSR, OG meta, share button (copy to clipboard), and full untruncated text
- **Dynamic "Read more"** — overflow detection via `scrollHeight > clientHeight`, only shows when content is actually truncated
- **Skeleton loading** — shimmer skeleton cards matching card layout for perceived performance
- **Animated transitions** — Framer Motion AnimatePresence with staggered fade on sort changes
- **Card hover effects** — subtle lift and shadow on hover
- **Fade gradient** — truncated tweet text fades out with a gradient matching the background color
- **Like counts** — scraped from X, displayed on tweet cards, refreshed weekly
- **Dark/light mode** — toggle with system preference detection and localStorage persistence
- **Rate limiting** — in-memory sliding-window rate limiter (60 req/min/IP) on the tweets API
- **Error boundary** — graceful crash recovery with plain HTML fallback
- **Error states** — API failure shows "Something went wrong" with retry button
- **Scraper resilience** — fallback CSS selector chains, scroll pagination (up to 10 scrolls), retry logic (2 attempts), email alerts via Resend on failure/degradation
- **CDN caching** — 6-hour Cache-Control on first page, Vercel Edge serves cached responses
- **Keyboard shortcuts** — Ctrl+K or `/` to focus search
- **Back to top** — floating button after 500px scroll
- **OG social card** — branded 1200x630 image for link previews
- **Self-hosted font** — Roboto Mono via next/font (zero layout shift)
- **SEO** — robots.txt, apple-touch-icon, proper heading hierarchy (h1/h2)
- **Tweet count** — displayed in header and footer

## Tech Stack

- **Framework:** Next.js 15 (Pages Router)
- **Database:** Vercel Postgres (Neon)
- **Scraper:** puppeteer-core + @sparticuz/chromium
- **Styling:** Material UI v7
- **Animations:** Framer Motion
- **Testing:** Vitest + React Testing Library (84 tests across 14 files)
- **Alerting:** Resend (email alerts for scraper failures)
- **Hosting:** Vercel (Pro)
- **Domain:** kjtweets.com (Squarespace DNS → Vercel)

## Project Structure

```
src/
  components/
    Tweet.tsx            # Tweet card (name, text, likes, search highlight, fullText mode)
    TweetList.tsx        # Responsive grid with loading/error/empty states
    SearchBar.tsx        # Server-side search with result count and keyboard shortcuts
    BackToTop.tsx        # Scroll-to-top floating button
    ThemeToggle.tsx      # Dark/light mode toggle
    ErrorBoundary.tsx    # React error boundary with plain HTML fallback
  lib/
    db.ts                # Postgres queries (getTweetsPaginated, getTweetById, getTweetCount, insertTweet, updateTweetLikes)
    rate-limit.ts        # In-memory sliding-window rate limiter
    theme-context.tsx    # Dark/light mode context provider (memoized)
    scraper-selectors.ts # Fallback CSS selector chains for X DOM
    scraper-utils.ts     # Tweet parsing utilities (generateTitle, parseTweetElements)
    email.ts             # Resend alert sender (ALERT_EMAIL env var)
  pages/
    index.tsx            # Main page (infinite scroll, sort toggle, server search)
    tweet/[id].tsx       # Individual tweet page (SSR, shareable, OG meta)
    api/
      tweets.ts          # GET /api/tweets — paginated, sortable, searchable, rate-limited
      cron/
        scrape-tweets.ts # Cron endpoint — scrapes X with scroll pagination + retry
        refresh-metrics.ts # Weekly cron — refreshes like counts with retry
  styles/
    globals.css          # Global styles, scrollbar, search highlight animations
public/
  og-card.png            # Branded 1200x630 social card
  robots.txt             # SEO robots file
  kj.jpg                 # Profile avatar
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
npm test          # Run all 84 tests
npm run test:watch # Watch mode
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `POSTGRES_URL` | Vercel Postgres connection string (auto-set by Vercel) |
| `CRON_SECRET` | Auth token for cron endpoints (auto-sent by Vercel) |
| `RESEND_API_KEY` | Resend API key for scraper failure alerts |
| `ALERT_EMAIL` | Alert recipient (defaults to `kj@kj.ventures`) |
| `NEXT_PUBLIC_GA_ID` | Google Analytics measurement ID |

## API

### `GET /api/tweets`

Returns paginated tweets. Rate-limited to 60 requests/min/IP.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `cursor` | string | — | Tweet ID cursor for pagination |
| `limit` | number | 30 | Tweets per page (max 100) |
| `sort` | string | `newest` | Sort order: `newest`, `oldest`, or `likes` |
| `q` | string | — | Search query (ILIKE on message and title) |

Response:
```json
{
  "tweets": [...],
  "hasMore": true,
  "nextCursor": "tweet_id",
  "totalCount": 150
}
```

### `GET /tweet/[id]`

Server-rendered individual tweet page with OG meta tags for social sharing.

## Cron Jobs

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/scrape-tweets` | Every 6 hours | Scrape new tweets from X (scroll pagination, 2 retries) |
| `/api/cron/refresh-metrics` | Weekly (Sunday midnight UTC) | Refresh like counts (scroll pagination, 2 retries) |

## Deployment

Auto-deploys on push to `main` via Vercel. Vercel Pro plan required for sub-daily cron intervals.
