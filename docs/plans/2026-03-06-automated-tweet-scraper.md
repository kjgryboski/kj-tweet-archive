# Automated Tweet Scraper Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Sanity CMS with Vercel Postgres + automated scraper that pulls original tweets from X every 6 hours.

**Architecture:** Vercel Cron triggers a serverless function that uses puppeteer-core + @sparticuz/chromium to scrape the X profile page, extracts original tweets, deduplicates against Postgres, and inserts new ones. Frontend reads from Postgres instead of Sanity.

**Tech Stack:** Next.js Pages Router, @vercel/postgres, puppeteer-core, @sparticuz/chromium, Vercel Cron

---

### Task 1: Set Up Vercel Postgres Database

**Files:**
- Modify: `package.json` (add @vercel/postgres)
- Create: `src/lib/db.ts`

**Step 1: Create the Postgres database on Vercel**

Run:
```bash
vercel postgres create kj-tweets-db
```

Then link it to the project:
```bash
vercel link
vercel env pull .env.local
```

This pulls the `POSTGRES_URL` (and related) env vars into `.env.local`.

**Step 2: Install @vercel/postgres**

Run:
```bash
npm install @vercel/postgres
```

**Step 3: Create `src/lib/db.ts`**

```typescript
import { sql } from "@vercel/postgres";
import { TweetProps } from "@/components/Tweet";

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS tweets (
      id SERIAL PRIMARY KEY,
      x_tweet_id VARCHAR(255) UNIQUE,
      title TEXT,
      message TEXT NOT NULL,
      x_link TEXT,
      username VARCHAR(255) DEFAULT 'KJFUTURES',
      name VARCHAR(255) DEFAULT 'KJ',
      created_at TIMESTAMP,
      scraped_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

export async function getTweets(): Promise<TweetProps[]> {
  const { rows } = await sql`
    SELECT * FROM tweets ORDER BY created_at DESC
  `;
  return rows.map((row) => ({
    id: row.x_tweet_id || String(row.id),
    text: row.message,
    title: row.title,
    createdAt: row.created_at?.toISOString() || new Date().toISOString(),
    username: row.username || "KJFUTURES",
    name: row.name || "KJ",
    xLink: row.x_link,
  }));
}

export async function insertTweet(tweet: {
  x_tweet_id?: string;
  title: string;
  message: string;
  x_link?: string;
  username?: string;
  name?: string;
  created_at?: string;
}) {
  await sql`
    INSERT INTO tweets (x_tweet_id, title, message, x_link, username, name, created_at)
    VALUES (
      ${tweet.x_tweet_id || null},
      ${tweet.title},
      ${tweet.message},
      ${tweet.x_link || null},
      ${tweet.username || "KJFUTURES"},
      ${tweet.name || "KJ"},
      ${tweet.created_at || new Date().toISOString()}
    )
    ON CONFLICT (x_tweet_id) DO NOTHING
  `;
}

export async function tweetExists(x_tweet_id: string): Promise<boolean> {
  const { rows } = await sql`
    SELECT 1 FROM tweets WHERE x_tweet_id = ${x_tweet_id} LIMIT 1
  `;
  return rows.length > 0;
}
```

**Step 4: Verify database connection locally**

Run: `npm run dev` and check for no startup errors.

**Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/db.ts
git commit -m "feat: add Vercel Postgres database layer"
```

---

### Task 2: Create Seed Endpoint to Migrate Old Tweets

**Files:**
- Create: `src/pages/api/seed.ts`
- Reference: `C:/Users/Kevin/kj-tweet-archive/old_tweets.json`

**Step 1: Copy old_tweets.json into the project**

```bash
cp "C:/Users/Kevin/kj-tweet-archive/old_tweets.json" "C:/Users/Kevin/kj-tweet-archive/kj-tweet-archive-main/old_tweets.json"
```

**Step 2: Create `src/pages/api/seed.ts`**

```typescript
import type { NextApiRequest, NextApiResponse } from "next";
import { initDb, insertTweet } from "@/lib/db";
import oldTweetsData from "../../../old_tweets.json";

interface SanityTweet {
  _id: string;
  title: string;
  message: string;
  xLink: string;
  createdAt: string;
  username: string | null;
  name: string | null;
}

function extractTweetId(xLink: string): string | undefined {
  // Extract tweet ID from URLs like https://x.com/KJFUTURES/status/1234567890
  const match = xLink?.match(/status\/(\d+)/);
  return match?.[1];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Simple auth check — use a secret to prevent accidental runs
  if (req.headers.authorization !== `Bearer ${process.env.SEED_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await initDb();

    const tweets = (oldTweetsData as { result: SanityTweet[] }).result;
    let inserted = 0;

    for (const tweet of tweets) {
      const x_tweet_id = extractTweetId(tweet.xLink);
      await insertTweet({
        x_tweet_id,
        title: tweet.title,
        message: tweet.message,
        x_link: tweet.xLink,
        username: tweet.username || "KJFUTURES",
        name: tweet.name || "KJ",
        created_at: tweet.createdAt,
      });
      inserted++;
    }

    return res.status(200).json({ success: true, inserted });
  } catch (error) {
    console.error("Seed error:", error);
    return res.status(500).json({ error: String(error) });
  }
}
```

**Step 3: Add `SEED_SECRET` env var to Vercel and .env.local**

Generate a random secret and add it:
```bash
SEED_SECRET=$(openssl rand -hex 16)
echo "SEED_SECRET=$SEED_SECRET" >> .env.local
echo "$SEED_SECRET" | vercel env add SEED_SECRET production
```

**Step 4: Enable JSON imports in tsconfig.json**

Check if `resolveJsonModule` is enabled. If not, add it:
```json
{
  "compilerOptions": {
    "resolveJsonModule": true
  }
}
```

**Step 5: Commit**

```bash
git add src/pages/api/seed.ts old_tweets.json tsconfig.json
git commit -m "feat: add seed endpoint for migrating old tweets"
```

---

### Task 3: Update Frontend to Read from Postgres

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/pages/index.tsx` (switch to getServerSideProps or keep client-side via API)

**Step 1: Rewrite `src/lib/api.ts`**

Replace the Sanity-based fetch with Postgres:

```typescript
import { TweetProps } from "../components/Tweet";
import { getTweets } from "./db";

export async function fetchUserTweets(): Promise<TweetProps[]> {
  try {
    return await getTweets();
  } catch (error) {
    console.error("Error fetching tweets:", error);
    return [];
  }
}
```

**Step 2: Update `/api/tweets` endpoint**

Rewrite `src/pages/api/tweets.ts` to use db directly:

```typescript
import type { NextApiRequest, NextApiResponse } from "next";
import { getTweets } from "@/lib/db";
import { TweetProps } from "@/components/Tweet";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TweetProps[] | { error: string }>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const tweets = await getTweets();
    return res.status(200).json(tweets);
  } catch (error) {
    console.error("Error fetching tweets:", error);
    return res.status(500).json({ error: "Failed to fetch tweets" });
  }
}
```

**Step 3: Update `src/pages/index.tsx` to fetch from the API route**

Change `loadTweets` to call `/api/tweets` instead of importing `fetchUserTweets` directly (since `@vercel/postgres` uses server-side env vars that aren't available client-side):

```typescript
const loadTweets = async () => {
  setIsLoading(true);
  try {
    const res = await fetch("/api/tweets");
    const fetchedTweets = await res.json();
    setTweets(fetchedTweets);
  } catch (error) {
    console.error("Error loading tweets:", error);
    setTweets([]);
  } finally {
    setIsLoading(false);
  }
};
```

Remove the `import { fetchUserTweets } from "@/lib/api"` line.

**Step 4: Verify locally**

Run `npm run dev`, open http://localhost:3000, confirm no errors (will show empty until seed runs).

**Step 5: Commit**

```bash
git add src/lib/api.ts src/pages/api/tweets.ts src/pages/index.tsx
git commit -m "feat: switch frontend from Sanity to Postgres"
```

---

### Task 4: Remove Sanity Dependencies

**Files:**
- Delete: `src/lib/sanity.ts`
- Delete: `src/lib/schema.ts`
- Delete: `src/types/sanity.d.ts`
- Delete: `sanity.config.ts`
- Delete: `src/pages/api/sanity-test.ts`
- Modify: `package.json` (remove sanity packages)
- Modify: `.env.local` (remove Sanity env vars)

**Step 1: Delete Sanity files**

```bash
rm src/lib/sanity.ts src/lib/schema.ts src/types/sanity.d.ts sanity.config.ts src/pages/api/sanity-test.ts
```

**Step 2: Remove Sanity packages**

```bash
npm uninstall @sanity/client @sanity/image-url next-sanity
```

Note: `sanity` and `@sanity/vision` are not in package.json (they were referenced in sanity.config.ts but never installed as deps). If they are, remove them too.

**Step 3: Remove Sanity env vars from `.env.local`**

Remove these lines from `.env.local`:
- `NEXT_PUBLIC_SANITY_PROJECT_ID=...`
- `NEXT_PUBLIC_SANITY_DATASET=...`
- `SANITY_API_TOKEN=...`

**Step 4: Remove Sanity env vars from Vercel**

```bash
vercel env rm NEXT_PUBLIC_SANITY_PROJECT_ID production --yes
vercel env rm NEXT_PUBLIC_SANITY_DATASET production --yes
vercel env rm SANITY_API_TOKEN production --yes
```

**Step 5: Verify build**

```bash
npm run build
```

Should succeed with no Sanity references.

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove Sanity CMS dependencies"
```

---

### Task 5: Create the Tweet Scraper

**Files:**
- Create: `src/pages/api/cron/scrape-tweets.ts`
- Modify: `package.json` (add puppeteer-core, @sparticuz/chromium)

**Step 1: Install scraper dependencies**

```bash
npm install puppeteer-core @sparticuz/chromium
```

**Step 2: Create `src/pages/api/cron/scrape-tweets.ts`**

```typescript
import type { NextApiRequest, NextApiResponse } from "next";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { initDb, insertTweet, tweetExists } from "@/lib/db";

const PROFILE_URL = "https://x.com/KJFUTURES";

interface ScrapedTweet {
  tweetId: string;
  text: string;
  timestamp: string;
  url: string;
}

async function scrapeTweets(): Promise<ScrapedTweet[]> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(PROFILE_URL, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for tweets to load
    await page.waitForSelector('[data-testid="tweet"]', { timeout: 30000 });

    // Scroll down a bit to load more tweets
    await page.evaluate(() => window.scrollBy(0, 2000));
    await new Promise((r) => setTimeout(r, 2000));

    // Extract tweets from the page
    const tweets = await page.evaluate(() => {
      const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
      const results: ScrapedTweet[] = [];

      tweetElements.forEach((el) => {
        // Skip retweets (they have a "Retweeted" indicator)
        const socialContext = el.querySelector('[data-testid="socialContext"]');
        if (socialContext?.textContent?.includes("reposted")) return;

        // Skip replies (they have "Replying to" text)
        const replyIndicator = el.querySelector('[data-testid="tweet"] [dir="ltr"]');
        if (el.querySelector('div[data-testid="tweet"] > div > div > div > div > div > a[href*="/status/"]')?.closest('div')?.textContent?.includes("Replying to")) return;

        // Get tweet link to extract ID
        const timeEl = el.querySelector("time");
        const linkEl = timeEl?.closest("a");
        const href = linkEl?.getAttribute("href") || "";
        const tweetIdMatch = href.match(/status\/(\d+)/);
        if (!tweetIdMatch) return;

        // Get tweet text
        const tweetTextEl = el.querySelector('[data-testid="tweetText"]');
        const text = tweetTextEl?.textContent || "";
        if (!text.trim()) return;

        // Get timestamp
        const timestamp = timeEl?.getAttribute("datetime") || "";

        results.push({
          tweetId: tweetIdMatch[1],
          text: text.trim(),
          timestamp,
          url: `https://x.com${href}`,
        });
      });

      return results;
    });

    return tweets;
  } finally {
    await browser.close();
  }
}

function generateTitle(text: string): string {
  // Use first sentence or first N chars as title
  const firstSentence = text.split(/[.!?\n]/)[0]?.trim();
  if (firstSentence && firstSentence.length <= 80) return firstSentence;
  return text.substring(0, 60).trim() + "...";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify cron secret (Vercel sends this automatically for cron jobs)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await initDb();

    const tweets = await scrapeTweets();
    let newCount = 0;

    for (const tweet of tweets) {
      const exists = await tweetExists(tweet.tweetId);
      if (exists) continue;

      await insertTweet({
        x_tweet_id: tweet.tweetId,
        title: generateTitle(tweet.text),
        message: tweet.text,
        x_link: tweet.url,
        username: "KJFUTURES",
        name: "KJ",
        created_at: tweet.timestamp || new Date().toISOString(),
      });
      newCount++;
    }

    return res.status(200).json({
      success: true,
      scraped: tweets.length,
      new: newCount,
    });
  } catch (error) {
    console.error("Scraper error:", error);
    return res.status(500).json({ error: String(error) });
  }
}
```

**Step 3: Commit**

```bash
git add package.json package-lock.json src/pages/api/cron/scrape-tweets.ts
git commit -m "feat: add tweet scraper cron endpoint"
```

---

### Task 6: Configure Vercel Cron and Deploy

**Files:**
- Modify: `vercel.json`

**Step 1: Update `vercel.json` with cron schedule**

```json
{
  "buildCommand": "npm run build",
  "installCommand": "npm install",
  "framework": "nextjs",
  "devCommand": "npm run dev",
  "crons": [
    {
      "path": "/api/cron/scrape-tweets",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

**Step 2: Add `CRON_SECRET` to Vercel**

```bash
vercel env add CRON_SECRET production
```

Use the value from Vercel's auto-generated cron secret, or set one manually.

**Step 3: Deploy to production**

```bash
git add vercel.json
git commit -m "feat: configure 6-hour cron schedule for scraper"
git push
vercel --prod --yes
```

**Step 4: Verify deployment succeeds**

Check the Vercel dashboard for successful build.

---

### Task 7: Run Migration and Verify

**Step 1: Initialize the database**

Hit the seed endpoint to migrate all 143 old tweets:

```bash
curl -X POST https://kjtweets.com/api/seed \
  -H "Authorization: Bearer $SEED_SECRET"
```

Expected: `{"success":true,"inserted":143}`

**Step 2: Verify the site**

Open https://kjtweets.com — should display all 143 tweets from Postgres.

**Step 3: Test the scraper manually (optional)**

```bash
curl https://kjtweets.com/api/cron/scrape-tweets \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: `{"success":true,"scraped":N,"new":0}` (0 new since all existing tweets should already be in DB)

**Step 4: Clean up**

Remove the seed endpoint after migration is complete (optional — it's protected by auth):

```bash
rm src/pages/api/seed.ts
rm old_tweets.json
git add -A
git commit -m "chore: remove seed endpoint after migration"
```

---

## Risks and Fallbacks

- **X blocks the scraper:** X may detect headless Chrome and block it. If this happens, alternatives include:
  - Adding more realistic browser fingerprinting (cookies, viewport, scroll behavior)
  - Using a proxy service
  - Falling back to manual "add tweet by URL" endpoint
- **X changes DOM structure:** The `data-testid` selectors may change. Monitor scraper logs and update selectors as needed.
- **Serverless timeout:** The scraper should complete well within 300s (Pro limit). If not, reduce scroll/wait times.
