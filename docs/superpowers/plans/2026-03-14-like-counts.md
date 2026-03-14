# Like Counts Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add like count tracking to tweets — scrape likes, display on cards, sort by likes, weekly refresh cron.

**Architecture:** Add `likes` column to DB, update scraper to extract like counts from X DOM, add `likeButton` to selector chains, new `/api/cron/refresh-metrics` weekly endpoint, add "Likes" sort option to pagination, display heart icon + count on tweet cards.

**Tech Stack:** @vercel/postgres, Puppeteer, MUI (FavoriteBorderIcon), Vitest

**Spec:** `docs/superpowers/specs/2026-03-14-like-counts-design.md`

---

## Chunk 1: DB + Selectors + Scraper Utils

### Task 1: DB migration + updateTweetLikes + likes sort + tests

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/db.test.ts`

- [ ] **Step 1: Add migration, index, updateTweetLikes, and likes sort to db.ts**

In `initDb()`, after the existing index, add:
```ts
await sql`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0`;
await sql`CREATE INDEX IF NOT EXISTS idx_tweets_likes_id ON tweets(likes DESC, id DESC)`;
```

Add new function:
```ts
export async function updateTweetLikes(x_tweet_id: string, likes: number) {
  await sql`UPDATE tweets SET likes = ${likes} WHERE x_tweet_id = ${x_tweet_id}`;
}
```

Update `getTweets()` row mapping to include `likes: row.likes || 0`.

Update `getTweetsPaginated` signature to accept `"likes"`:
```ts
sort: "newest" | "oldest" | "likes" = "newest"
```

Add likes sort branches (similar to existing newest/oldest pattern):
```ts
} else if (sort === "likes") {
  if (cursor) {
    ({ rows } = await sql`
      SELECT * FROM tweets
      WHERE (likes, id) < (
        SELECT likes, id FROM tweets WHERE x_tweet_id = ${cursor}
      )
      ORDER BY likes DESC, id DESC
      LIMIT ${fetchLimit}
    `);
  } else {
    ({ rows } = await sql`
      SELECT * FROM tweets
      ORDER BY likes DESC, id DESC
      LIMIT ${fetchLimit}
    `);
  }
}
```

Update row mapping in `getTweetsPaginated` to include `likes: row.likes || 0`.

Update `insertTweet` to accept `likes?: number` and include it in the INSERT with `ON CONFLICT DO UPDATE SET likes = EXCLUDED.likes`:
```ts
await sql`
  INSERT INTO tweets (x_tweet_id, title, message, x_link, username, name, created_at, likes)
  VALUES (
    ${tweet.x_tweet_id || null},
    ${tweet.title},
    ${tweet.message},
    ${tweet.x_link || null},
    ${tweet.username || "KJFUTURES"},
    ${tweet.name || "KJ"},
    ${tweet.created_at || new Date().toISOString()},
    ${tweet.likes || 0}
  )
  ON CONFLICT (x_tweet_id) DO UPDATE SET likes = EXCLUDED.likes
`;
```

- [ ] **Step 2: Add tests to db.test.ts**

```ts
describe("updateTweetLikes", () => {
  it("calls sql with correct UPDATE", async () => {
    mockSql.mockResolvedValue({});
    await updateTweetLikes("tweet123", 42);
    expect(mockSql).toHaveBeenCalled();
  });
});
```

Add to the existing `getTweetsPaginated` describe:
```ts
it("respects sort=likes parameter", async () => {
  mockSql.mockResolvedValue({ rows: [] });
  await getTweetsPaginated(undefined, 5, "likes");
  expect(mockSql).toHaveBeenCalled();
});
```

Update the existing `getTweets` "returns mapped TweetProps from rows" test to include `likes` in both the mock row data (`likes: 5`) and the expected output (`likes: 5`). Also update the "falls back to row.id" and "applies defaults" tests to include `likes: 0` in mock rows (since `row.likes` will be undefined → defaults to 0).

Add to existing `getTweets` describe:
```ts
it("includes likes in row mapping", async () => {
  mockSql.mockResolvedValue({
    rows: [{
      id: 1, x_tweet_id: "999", message: "Test", title: null,
      created_at: new Date(), username: "KJ", name: "KJ",
      x_link: null, likes: 15,
    }],
  });
  const tweets = await getTweets();
  expect(tweets[0].likes).toBe(15);
});
```

Update imports to include `updateTweetLikes`.

- [ ] **Step 3: Run tests**

Run: `npm test -- src/lib/db.test.ts`
Expected: All tests pass (existing + 3 new).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "feat: add likes column, updateTweetLikes, and likes sort to DB layer"
```

---

### Task 2: Add likeButton selector + update scraper-utils for likes

**Files:**
- Modify: `src/lib/scraper-selectors.ts`
- Modify: `src/lib/scraper-utils.ts`
- Modify: `src/lib/scraper-utils.test.ts`

- [ ] **Step 1: Add likeButton to scraper-selectors.ts**

Add to the SELECTORS object:
```ts
likeButton: ['[data-testid="like"]', '[aria-label*="Like"]'],
```

- [ ] **Step 2: Update ScrapedTweet interface and parseTweetElements**

In `scraper-utils.ts`, add `likes: number` to `ScrapedTweet` interface.

In `parseTweetElements`, add like extraction after the timestamp extraction:
```ts
// Get likes
const likeEl = resolveChild(el, selectors.likeButton);
let likes = 0;
if (likeEl) {
  const ariaLabel = likeEl.getAttribute("aria-label") || "";
  const match = ariaLabel.match(/(\d+)/);
  if (match) {
    likes = parseInt(match[1], 10);
  }
}
```

Include `likes` in the result push:
```ts
results.push({
  tweetId: tweetIdMatch[1],
  text: text.trim(),
  timestamp,
  url: `https://x.com${href}`,
  likes,
});
```

Update the `SelectorConfig` type and `DEFAULT_SELECTORS` import to include the new `likeButton` key.

- [ ] **Step 3: Update scraper-utils tests**

Update the `buildTweetArticle` helper to accept an optional `likes` param and render a like button element:
```ts
if (options.likes !== undefined) {
  const likeBtn = document.createElement("div");
  likeBtn.setAttribute("data-testid", "like");
  likeBtn.setAttribute("aria-label", `${options.likes} Likes`);
  article.appendChild(likeBtn);
}
```

Update existing tests:
- All `toEqual` assertions for `parseTweetElements` results must include `likes: 0` (e.g., the "extracts tweet ID, text, timestamp, and URL" test expected object needs `likes: 0` added).
- The "accepts custom selectors parameter" test's `customSelectors` object must include `likeButton: ['[data-testid="like"]']` to satisfy the updated `SelectorConfig` type.
- Update `buildTweetArticle` helper to accept an optional `likes` param.

Add new test:
```ts
it("extracts likes from DOM", () => {
  const container = document.createElement("div");
  buildTweetArticle(container, { tweetId: "77777", text: "Popular tweet", likes: 42 });

  const results = parseTweetElements(container);
  expect(results).toHaveLength(1);
  expect(results[0].likes).toBe(42);
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/scraper-utils.test.ts src/lib/scraper-selectors.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scraper-selectors.ts src/lib/scraper-utils.ts src/lib/scraper-utils.test.ts
git commit -m "feat: add like count extraction to scraper utils and selectors"
```

---

## Chunk 2: API + Scraper + Refresh Cron + Frontend

### Task 3: Update tweets API for likes sort + update scraper page.evaluate

**Files:**
- Modify: `src/pages/api/tweets.ts`
- Modify: `src/pages/api/tweets.test.ts`
- Modify: `src/pages/api/cron/scrape-tweets.ts`

- [ ] **Step 1: Update tweets.ts sort validation**

Change sort validation from two-way to three-way:
```ts
const sortParam = req.query.sort as string;
const sort = (["newest", "oldest", "likes"] as const).includes(sortParam as any)
  ? (sortParam as "newest" | "oldest" | "likes")
  : "newest";
```

- [ ] **Step 2: Add test for likes sort passthrough**

```ts
it("passes sort=likes to getTweetsPaginated", async () => {
  mockGetTweetsPaginated.mockResolvedValue({ tweets: [], hasMore: false, nextCursor: null } as any);
  const { req, res } = createMockReqRes("GET", { sort: "likes" });
  await handler(req, res);
  expect(mockGetTweetsPaginated).toHaveBeenCalledWith(undefined, 30, "likes");
});
```

- [ ] **Step 3: Update scrape-tweets.ts page.evaluate to extract likes**

Read `src/pages/api/cron/scrape-tweets.ts` first. In the `page.evaluate` callback, add like extraction logic after the tweet text extraction. The `selectorConfig` passed to `page.evaluate` must include the `likeButton` selectors. Add `likes` to the return objects.

The inline `resolveChild` helper already exists in the callback. Add:
```ts
// Get likes
const likeEl = resolveChild(el, selectors.likeButton);
let likes = 0;
if (likeEl) {
  const ariaLabel = likeEl.getAttribute("aria-label") || "";
  const likeMatch = ariaLabel.match(/(\d+)/);
  if (likeMatch) likes = parseInt(likeMatch[1], 10);
}
```

Update the `selectorConfig` object to include `likeButton`:
```ts
likeButton: [...SELECTORS.likeButton],
```

Include `likes` in the results push and the return type.

The handler's `insertTweet` call should pass `likes`:
```ts
await insertTweet({
  ...existing fields...,
  likes: tweet.likes || 0,
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/pages/api/tweets.test.ts src/pages/api/cron/scrape-tweets.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/tweets.ts src/pages/api/tweets.test.ts src/pages/api/cron/scrape-tweets.ts
git commit -m "feat: add likes sort to API and like extraction to scraper"
```

---

### Task 4: Weekly refresh-metrics cron endpoint

**Files:**
- Create: `src/pages/api/cron/refresh-metrics.ts`
- Create: `src/pages/api/cron/refresh-metrics.test.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create refresh-metrics.ts**

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { updateTweetLikes } from "@/lib/db";
import { SELECTORS } from "@/lib/scraper-selectors";

export const config = {
  maxDuration: 120,
};

const PROFILE_URL = "https://x.com/KJFUTURES";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      await page.goto(PROFILE_URL, { waitUntil: "networkidle2", timeout: 30000 });

      const combinedSelector = SELECTORS.tweetContainer.join(", ");
      await page.waitForSelector(combinedSelector, { timeout: 15000 });

      const selectorConfig = {
        tweetContainer: [...SELECTORS.tweetContainer],
        likeButton: [...SELECTORS.likeButton],
        timeElement: [...SELECTORS.timeElement],
      };

      const metrics = await page.evaluate((selectors) => {
        function resolveChild(parent: Element, sels: string[]): Element | null {
          for (const sel of sels) {
            const el = parent.querySelector(sel);
            if (el) return el;
          }
          return null;
        }

        let tweetElements: Element[] = [];
        for (const sel of selectors.tweetContainer) {
          tweetElements = Array.from(document.querySelectorAll(sel));
          if (tweetElements.length > 0) break;
        }

        const results: { tweetId: string; likes: number }[] = [];

        tweetElements.forEach((el) => {
          const timeEl = resolveChild(el, selectors.timeElement);
          const linkEl = timeEl?.closest("a");
          const href = linkEl?.getAttribute("href") || "";
          const tweetIdMatch = href.match(/status\/(\d+)/);
          if (!tweetIdMatch) return;

          const likeEl = resolveChild(el, selectors.likeButton);
          let likes = 0;
          if (likeEl) {
            const ariaLabel = likeEl.getAttribute("aria-label") || "";
            const match = ariaLabel.match(/(\d+)/);
            if (match) likes = parseInt(match[1], 10);
          }

          results.push({ tweetId: tweetIdMatch[1], likes });
        });

        return results;
      }, selectorConfig);

      let updated = 0;
      for (const { tweetId, likes } of metrics) {
        await updateTweetLikes(tweetId, likes);
        updated++;
      }

      return res.status(200).json({ success: true, updated });
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error("Refresh metrics error:", error);
    return res.status(500).json({ error: String(error) });
  }
}
```

- [ ] **Step 2: Create refresh-metrics.test.ts**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

const { mockUpdateTweetLikes, mockLaunch, mockExecutablePath } = vi.hoisted(() => ({
  mockUpdateTweetLikes: vi.fn().mockResolvedValue(undefined),
  mockLaunch: vi.fn(),
  mockExecutablePath: vi.fn().mockResolvedValue("/usr/bin/chromium"),
}));

vi.mock("@/lib/db", () => ({
  updateTweetLikes: mockUpdateTweetLikes,
}));

vi.mock("puppeteer-core", () => ({
  default: { launch: mockLaunch },
}));

vi.mock("@sparticuz/chromium", () => ({
  default: { args: [], executablePath: mockExecutablePath },
}));

vi.mock("@/lib/scraper-selectors", () => ({
  SELECTORS: {
    tweetContainer: ['[data-testid="tweet"]'],
    likeButton: ['[data-testid="like"]'],
    timeElement: ['time[datetime]'],
  },
}));

import handler from "./refresh-metrics";

function createMockReqRes(authHeader?: string) {
  const req = {
    method: "GET",
    headers: { authorization: authHeader },
  } as unknown as NextApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
  return { req, res };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockUpdateTweetLikes.mockResolvedValue(undefined);
});

describe("GET /api/cron/refresh-metrics", () => {
  it("returns 401 without valid bearer token", async () => {
    process.env.CRON_SECRET = "secret";
    const { req, res } = createMockReqRes("Bearer wrong");
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("updates likes for visible tweets", async () => {
    process.env.CRON_SECRET = "secret";
    vi.useFakeTimers();

    const mockPage = {
      setUserAgent: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue([
        { tweetId: "111", likes: 10 },
        { tweetId: "222", likes: 25 },
      ]),
    };
    mockLaunch.mockResolvedValue({
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
    });

    const { req, res } = createMockReqRes("Bearer secret");
    await handler(req, res);

    expect(mockUpdateTweetLikes).toHaveBeenCalledWith("111", 10);
    expect(mockUpdateTweetLikes).toHaveBeenCalledWith("222", 25);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, updated: 2 });

    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Update vercel.json**

Add the weekly cron:
```json
{
  "path": "/api/cron/refresh-metrics",
  "schedule": "0 0 * * 0"
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/pages/api/cron/refresh-metrics.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/cron/refresh-metrics.ts src/pages/api/cron/refresh-metrics.test.ts vercel.json
git commit -m "feat: add weekly refresh-metrics cron endpoint"
```

---

### Task 5: Frontend — likes on Tweet card + Likes sort option

**Files:**
- Modify: `src/components/Tweet.tsx`
- Modify: `src/components/Tweet.test.tsx`
- Modify: `src/pages/index.tsx`

- [ ] **Step 1: Update TweetProps and Tweet component**

In `Tweet.tsx`, add `likes?: number` to the `TweetProps` interface.

Add import: `import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";`

Add `likes = 0` to the destructured props.

Add likes display after the `TweetText` element (before the media section):
```tsx
<Box sx={{ display: "flex", alignItems: "center", mt: "auto", pt: 1 }}>
  <FavoriteBorderIcon sx={{ fontSize: 16, mr: 0.5, color: "text.secondary" }} />
  <Typography
    variant="caption"
    color="text.secondary"
    fontFamily='"Roboto Mono", "Courier New", monospace'
  >
    {likes}
  </Typography>
</Box>
```

- [ ] **Step 2: Add Tweet test for likes**

```tsx
it("renders like count", () => {
  renderWithTheme(<Tweet {...defaultProps} likes={42} />);
  expect(screen.getByText("42")).toBeInTheDocument();
});
```

- [ ] **Step 3: Update index.tsx sort state and toggle**

Change sort state type from `"newest" | "oldest"` to `"newest" | "oldest" | "likes"`.

Update `handleSortChange` type accordingly.

Add third ToggleButton after "Oldest":
```tsx
<ToggleButton value="likes" sx={{ fontFamily: '"Roboto Mono", monospace', textTransform: "none", px: 2 }}>
  Likes
</ToggleButton>
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass (~77 total).

- [ ] **Step 5: Commit**

```bash
git add src/components/Tweet.tsx src/components/Tweet.test.tsx src/pages/index.tsx
git commit -m "feat: display likes on tweet cards and add Likes sort option"
```

---

### Task 6: Full suite verification

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass, 0 failures.

- [ ] **Step 2: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve any remaining test issues"
```
