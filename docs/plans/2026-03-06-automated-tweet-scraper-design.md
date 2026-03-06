# KJ Tweet Archive — Automated Scraper Design

## Goal
Replace manual Sanity CMS entry with an automated scraper that pulls original tweets from the X profile every 6 hours.

## Architecture
- Drop Sanity CMS entirely — replace with Vercel Postgres
- Scraper cron job runs every 6 hours via Vercel Cron (`/api/cron/scrape-tweets`)
- Existing 143 tweets migrated from `old_tweets.json` into Postgres via a one-time seed script
- Frontend stays the same (Next.js Pages Router, MUI) — just reads from Postgres instead of Sanity

## Data Flow
```
X Profile -> Scraper (every 6h) -> Vercel Postgres -> Next.js site
```

## Scraper Approach
- Use Puppeteer/Playwright on a serverless function to load the X profile page
- Parse original tweets (skip replies, retweets)
- Compare against existing tweets in DB (deduplicate by tweet text or X tweet ID)
- Insert only new tweets

## Database Schema
```sql
CREATE TABLE tweets (
  id          SERIAL PRIMARY KEY,
  x_tweet_id  VARCHAR(255) UNIQUE,
  title       TEXT,
  message     TEXT NOT NULL,
  x_link      TEXT,
  username    VARCHAR(255) DEFAULT 'KJFUTURES',
  name        VARCHAR(255) DEFAULT 'KJ',
  created_at  TIMESTAMP,
  scraped_at  TIMESTAMP DEFAULT NOW()
);
```

## Cron Schedule
- Every 6 hours: `0 */6 * * *`
- Secured with `CRON_SECRET` env var (Vercel verifies automatically)

## What Gets Removed
- `@sanity/image-url`, `next-sanity`, `sanity`, `@sanity/vision` dependencies
- `src/lib/sanity.ts`, `sanity.config.ts`, `src/lib/schema.ts`
- Sanity env vars from Vercel and `.env.local`

## What Gets Added
- `@vercel/postgres` package
- `/api/cron/scrape-tweets` — the cron endpoint
- `/api/seed` — one-time migration endpoint
- `src/lib/db.ts` — database queries
- `vercel.json` — cron schedule config

## Migration
- Read existing 143 tweets from `old_tweets.json`
- Map Sanity fields to Postgres schema
- Insert via seed script (`/api/seed`)

## Risks
- X may change their page structure — scraper selectors would need updating
- Vercel serverless functions have a 300s timeout on Pro — sufficient for one profile page
