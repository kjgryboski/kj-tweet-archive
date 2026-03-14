# Test Suite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ~35-40 tests covering all layers of kj-tweet-archive (database, API, scraper utils, components).

**Architecture:** Vitest + jsdom for test runner, React Testing Library for component tests. Mock `@vercel/postgres` sql tagged template for DB tests. Extract scraper parsing into pure functions for testability.

**Tech Stack:** Vitest, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom

**Spec:** `docs/superpowers/specs/2026-03-14-test-suite-design.md`

---

## Chunk 1: Setup + Cleanup + Scraper Extraction

### Task 1: Install dependencies and configure Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
cd /c/Users/Kevin/kj-tweet-archive/kj-tweet-archive-main
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Add test scripts to package.json**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Verify vitest runs (no tests yet)**

Run: `npm test`
Expected: "No test files found" or similar, exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest and testing library dependencies"
```

---

### Task 2: Cleanup — delete unused files and legacy config

**Files:**
- Delete: `src/components/HandleInput.tsx`
- Modify: `next.config.ts`

- [ ] **Step 1: Delete HandleInput.tsx**

```bash
rm src/components/HandleInput.tsx
```

- [ ] **Step 2: Remove cdn.sanity.io from next.config.ts**

Change the images config in `next.config.ts` from:
```ts
images: {
  domains: ["pbs.twimg.com", "cdn.sanity.io"],
},
```
To:
```ts
images: {
  domains: ["pbs.twimg.com"],
},
```

- [ ] **Step 3: Verify build still works**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused HandleInput component and legacy Sanity config"
```

---

### Task 3: Extract scraper-utils from scrape-tweets.ts

**Files:**
- Create: `src/lib/scraper-utils.ts`
- Modify: `src/pages/api/cron/scrape-tweets.ts`

- [ ] **Step 1: Create src/lib/scraper-utils.ts**

```ts
/**
 * Scraper utility functions extracted for testability.
 *
 * NOTE: `parseTweetElements` mirrors the inline `page.evaluate()` logic in
 * `src/pages/api/cron/scrape-tweets.ts`. The browser-context callback cannot
 * import modules, so the logic exists in two places. Changes to tweet parsing
 * must be reflected in BOTH this file and the `page.evaluate()` callback.
 */

export interface ScrapedTweet {
  tweetId: string;
  text: string;
  timestamp: string;
  url: string;
}

export function generateTitle(text: string): string {
  const firstSentence = text.split(/[.!?\n]/)[0]?.trim();
  if (firstSentence && firstSentence.length <= 80) return firstSentence;
  return text.substring(0, 60).trim() + "...";
}

export function parseTweetElements(root: ParentNode): ScrapedTweet[] {
  const tweetElements = root.querySelectorAll('[data-testid="tweet"]');
  const results: ScrapedTweet[] = [];

  tweetElements.forEach((el) => {
    // Skip retweets
    const socialContext = el.querySelector('[data-testid="socialContext"]');
    if (socialContext?.textContent?.includes("reposted")) return;

    // Get tweet link to extract ID
    const timeEl = el.querySelector("time");
    const linkEl = timeEl?.closest("a");
    const href = linkEl?.getAttribute("href") || "";
    const tweetIdMatch = href.match(/status\/(\d+)/);
    if (!tweetIdMatch) return;

    // Skip replies
    const allText = el.textContent || "";
    if (allText.includes("Replying to @")) return;

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
}
```

- [ ] **Step 2: Update scrape-tweets.ts to import from scraper-utils**

Replace the local `ScrapedTweet` interface and `generateTitle` function in `src/pages/api/cron/scrape-tweets.ts`. Import them from `@/lib/scraper-utils` instead. The `page.evaluate()` callback stays in scrape-tweets.ts (it runs in browser context and can't import modules), but `generateTitle` is used server-side and can be imported.

Remove lines 12-17 (ScrapedTweet interface) and lines 94-98 (generateTitle function) from scrape-tweets.ts. Add at top:
```ts
import { generateTitle, type ScrapedTweet } from "@/lib/scraper-utils";
```

- [ ] **Step 3: Verify build still works**

Run: `npm run build`
Expected: Build succeeds. No behavior change.

- [ ] **Step 4: Commit**

```bash
git add src/lib/scraper-utils.ts src/pages/api/cron/scrape-tweets.ts
git commit -m "refactor: extract generateTitle and parseTweetElements into scraper-utils"
```

---

## Chunk 2: Backend Tests

### Task 4: Database layer tests (src/lib/db.test.ts)

**Files:**
- Create: `src/lib/db.test.ts`

- [ ] **Step 1: Write all db tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @vercel/postgres
const mockSql = vi.fn();
vi.mock("@vercel/postgres", () => ({
  sql: mockSql,
}));

import { initDb, getTweets, insertTweet, tweetExists } from "./db";

beforeEach(() => {
  mockSql.mockReset();
});

describe("initDb", () => {
  it("calls sql with CREATE TABLE statement", async () => {
    mockSql.mockResolvedValue({});
    await initDb();
    expect(mockSql).toHaveBeenCalled();
  });
});

describe("getTweets", () => {
  it("returns mapped TweetProps from rows", async () => {
    const mockDate = new Date("2026-01-15T12:00:00Z");
    mockSql.mockResolvedValue({
      rows: [
        {
          id: 1,
          x_tweet_id: "123456",
          message: "Hello world",
          title: "Hello",
          created_at: mockDate,
          username: "KJFUTURES",
          name: "KJ",
          x_link: "https://x.com/KJFUTURES/status/123456",
        },
      ],
    });

    const tweets = await getTweets();
    expect(tweets).toEqual([
      {
        id: "123456",
        text: "Hello world",
        title: "Hello",
        createdAt: mockDate.toISOString(),
        username: "KJFUTURES",
        name: "KJ",
        xLink: "https://x.com/KJFUTURES/status/123456",
      },
    ]);
  });

  it("falls back to row.id when x_tweet_id is missing", async () => {
    mockSql.mockResolvedValue({
      rows: [
        {
          id: 42,
          x_tweet_id: null,
          message: "Test",
          title: null,
          created_at: null,
          username: null,
          name: null,
          x_link: null,
        },
      ],
    });

    const tweets = await getTweets();
    expect(tweets[0].id).toBe("42");
  });

  it("applies defaults for missing fields", async () => {
    mockSql.mockResolvedValue({
      rows: [
        {
          id: 1,
          x_tweet_id: "789",
          message: "Test",
          title: null,
          created_at: null,
          username: null,
          name: null,
          x_link: null,
        },
      ],
    });

    const tweets = await getTweets();
    expect(tweets[0].username).toBe("KJFUTURES");
    expect(tweets[0].name).toBe("KJ");
    expect(tweets[0].createdAt).toBeDefined();
  });
});

describe("insertTweet", () => {
  it("calls sql with correct values", async () => {
    mockSql.mockResolvedValue({});
    await insertTweet({
      x_tweet_id: "111",
      title: "Test title",
      message: "Test message",
      x_link: "https://x.com/test/status/111",
      username: "testuser",
      name: "Test",
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(mockSql).toHaveBeenCalled();
  });

  it("applies defaults for optional fields", async () => {
    mockSql.mockResolvedValue({});
    await insertTweet({
      title: "Title",
      message: "Message",
    });
    expect(mockSql).toHaveBeenCalled();
  });
});

describe("tweetExists", () => {
  it("returns true when tweet found", async () => {
    mockSql.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const exists = await tweetExists("123");
    expect(exists).toBe(true);
  });

  it("returns false when tweet not found", async () => {
    mockSql.mockResolvedValue({ rows: [] });
    const exists = await tweetExists("999");
    expect(exists).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/lib/db.test.ts`
Expected: 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.test.ts
git commit -m "test: add database layer tests"
```

---

### Task 5: Fetch wrapper tests (src/lib/api.test.ts)

**Files:**
- Create: `src/lib/api.test.ts`

- [ ] **Step 1: Write api tests**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("./db", () => ({
  getTweets: vi.fn(),
}));

import { fetchUserTweets } from "./api";
import { getTweets } from "./db";

const mockGetTweets = vi.mocked(getTweets);

describe("fetchUserTweets", () => {
  it("returns tweets on success", async () => {
    const mockTweets = [
      { id: "1", text: "Hello", createdAt: "2026-01-01", username: "KJ", name: "KJ" },
    ];
    mockGetTweets.mockResolvedValue(mockTweets as any);

    const result = await fetchUserTweets();
    expect(result).toEqual(mockTweets);
  });

  it("returns empty array on error", async () => {
    mockGetTweets.mockRejectedValue(new Error("DB down"));

    const result = await fetchUserTweets();
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/lib/api.test.ts`
Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.test.ts
git commit -m "test: add fetch wrapper tests"
```

---

### Task 6: Scraper utils tests (src/lib/scraper-utils.test.ts)

**Files:**
- Create: `src/lib/scraper-utils.test.ts`

- [ ] **Step 1: Write all scraper-utils tests**

Note: `parseTweetElements` tests use `document.createElement` + setting element content via DOM APIs in jsdom test environment. This is safe test-only fixture code, not user-facing.

```ts
import { describe, it, expect } from "vitest";
import { generateTitle, parseTweetElements } from "./scraper-utils";

describe("generateTitle", () => {
  it("returns short first sentence as-is", () => {
    expect(generateTitle("Hello world. More text here.")).toBe("Hello world");
  });

  it("truncates long text at 60 chars with ellipsis", () => {
    const longText = "A".repeat(100);
    const result = generateTitle(longText);
    expect(result).toBe("A".repeat(60) + "...");
  });

  it("splits on sentence boundaries (. ! ? newline)", () => {
    expect(generateTitle("Wow! That is great.")).toBe("Wow");
    expect(generateTitle("Really? Yes.")).toBe("Really");
    expect(generateTitle("Line one\nLine two")).toBe("Line one");
  });

  it("returns '...' for empty/whitespace input", () => {
    expect(generateTitle("")).toBe("...");
    expect(generateTitle("   ")).toBe("...");
  });

  it("returns first sentence when exactly 80 chars", () => {
    const sentence = "A".repeat(80);
    expect(generateTitle(sentence + ". More.")).toBe(sentence);
  });
});

function buildTweetArticle(container: HTMLElement, options: {
  tweetId?: string;
  text?: string;
  timestamp?: string;
  isRetweet?: boolean;
  isReply?: boolean;
  isEmpty?: boolean;
}) {
  const {
    tweetId = "12345",
    text = "Sample tweet text",
    timestamp = "2026-01-15T12:00:00.000Z",
    isRetweet = false,
    isReply = false,
    isEmpty = false,
  } = options;

  const article = document.createElement("article");
  article.setAttribute("data-testid", "tweet");

  if (isRetweet) {
    const ctx = document.createElement("div");
    ctx.setAttribute("data-testid", "socialContext");
    ctx.textContent = "User reposted";
    article.appendChild(ctx);
  }

  if (isReply) {
    const replySpan = document.createElement("span");
    replySpan.textContent = "Replying to @someone";
    article.appendChild(replySpan);
  }

  const link = document.createElement("a");
  link.setAttribute("href", `/KJFUTURES/status/${tweetId}`);
  const time = document.createElement("time");
  time.setAttribute("datetime", timestamp);
  time.textContent = "Jan 15";
  link.appendChild(time);
  article.appendChild(link);

  const tweetTextEl = document.createElement("div");
  tweetTextEl.setAttribute("data-testid", "tweetText");
  if (!isEmpty) {
    tweetTextEl.textContent = text;
  }
  article.appendChild(tweetTextEl);

  container.appendChild(article);
}

describe("parseTweetElements", () => {
  it("extracts tweet ID, text, timestamp, and URL", () => {
    const container = document.createElement("div");
    buildTweetArticle(container, {
      tweetId: "99999",
      text: "Hello from KJ",
      timestamp: "2026-03-01T10:00:00.000Z",
    });

    const results = parseTweetElements(container);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      tweetId: "99999",
      text: "Hello from KJ",
      timestamp: "2026-03-01T10:00:00.000Z",
      url: "https://x.com/KJFUTURES/status/99999",
    });
  });

  it("skips retweets", () => {
    const container = document.createElement("div");
    buildTweetArticle(container, { isRetweet: true });

    const results = parseTweetElements(container);
    expect(results).toHaveLength(0);
  });

  it("skips replies", () => {
    const container = document.createElement("div");
    buildTweetArticle(container, { isReply: true });

    const results = parseTweetElements(container);
    expect(results).toHaveLength(0);
  });

  it("skips tweets with empty text", () => {
    const container = document.createElement("div");
    buildTweetArticle(container, { isEmpty: true });

    const results = parseTweetElements(container);
    expect(results).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/lib/scraper-utils.test.ts`
Expected: 9 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scraper-utils.test.ts
git commit -m "test: add scraper utils tests (generateTitle + parseTweetElements)"
```

---

### Task 7: API route tests (src/pages/api/tweets.test.ts)

**Files:**
- Create: `src/pages/api/tweets.test.ts`

- [ ] **Step 1: Write tweets API tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

vi.mock("@/lib/db", () => ({
  getTweets: vi.fn(),
}));

import handler from "./tweets";
import { getTweets } from "@/lib/db";

const mockGetTweets = vi.mocked(getTweets);

function createMockReqRes(method = "GET") {
  const req = { method } as NextApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
  return { req, res };
}

beforeEach(() => {
  mockGetTweets.mockReset();
});

describe("GET /api/tweets", () => {
  it("returns 200 with tweets", async () => {
    const tweets = [{ id: "1", text: "Hello", createdAt: "2026-01-01", username: "KJ", name: "KJ" }];
    mockGetTweets.mockResolvedValue(tweets as any);

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(tweets);
  });

  it("returns 405 for non-GET methods", async () => {
    const { req, res } = createMockReqRes("POST");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 500 on database error", async () => {
    mockGetTweets.mockRejectedValue(new Error("DB error"));

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to fetch tweets" });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/pages/api/tweets.test.ts`
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/tweets.test.ts
git commit -m "test: add tweets API route tests"
```

---

### Task 8: Cron handler tests (src/pages/api/cron/scrape-tweets.test.ts)

**Files:**
- Create: `src/pages/api/cron/scrape-tweets.test.ts`

- [ ] **Step 1: Write cron handler tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock db functions
vi.mock("@/lib/db", () => ({
  initDb: vi.fn(),
  insertTweet: vi.fn(),
  tweetExists: vi.fn(),
}));

// Mock scraper-utils
vi.mock("@/lib/scraper-utils", () => ({
  generateTitle: vi.fn((text: string) => text.substring(0, 20)),
  ScrapedTweet: {},
}));

// Mock puppeteer + chromium to avoid loading heavy deps
vi.mock("puppeteer-core", () => ({
  default: {
    launch: vi.fn(),
  },
}));

vi.mock("@sparticuz/chromium", () => ({
  default: {
    args: [],
    executablePath: vi.fn().mockResolvedValue("/fake/chromium"),
  },
}));

import { initDb, insertTweet, tweetExists } from "@/lib/db";
import puppeteer from "puppeteer-core";

const mockInitDb = vi.mocked(initDb);
const mockInsertTweet = vi.mocked(insertTweet);
const mockTweetExists = vi.mocked(tweetExists);
const mockLaunch = vi.mocked(puppeteer.launch);

function createMockReqRes(authHeader?: string) {
  const req = {
    method: "POST",
    headers: {
      authorization: authHeader,
    },
  } as unknown as NextApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
  return { req, res };
}

const CRON_SECRET = "test-secret";

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
});

// Dynamic import to pick up mocks
async function getHandler() {
  const mod = await import("./scrape-tweets");
  return mod.default;
}

describe("POST /api/cron/scrape-tweets", () => {
  it("returns 401 without valid bearer token", async () => {
    const handler = await getHandler();
    const { req, res } = createMockReqRes("Bearer wrong-token");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("calls initDb before processing tweets", async () => {
    const handler = await getHandler();
    const mockPage = {
      setUserAgent: vi.fn(),
      goto: vi.fn(),
      waitForSelector: vi.fn(),
      evaluate: vi.fn().mockResolvedValue([]),
      close: vi.fn(),
    };
    const mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn(),
    };
    mockLaunch.mockResolvedValue(mockBrowser as any);
    mockInitDb.mockResolvedValue(undefined);

    const { req, res } = createMockReqRes(`Bearer ${CRON_SECRET}`);
    await handler(req, res);

    expect(mockInitDb).toHaveBeenCalled();
  });

  it("skips existing tweets", async () => {
    const handler = await getHandler();
    const mockPage = {
      setUserAgent: vi.fn(),
      goto: vi.fn(),
      waitForSelector: vi.fn(),
      evaluate: vi.fn()
        .mockResolvedValueOnce(undefined) // scroll
        .mockResolvedValueOnce([
          { tweetId: "111", text: "Old tweet", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/111" },
        ]),
      close: vi.fn(),
    };
    const mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn(),
    };
    mockLaunch.mockResolvedValue(mockBrowser as any);
    mockInitDb.mockResolvedValue(undefined);
    mockTweetExists.mockResolvedValue(true);

    const { req, res } = createMockReqRes(`Bearer ${CRON_SECRET}`);
    await handler(req, res);

    expect(mockTweetExists).toHaveBeenCalledWith("111");
    expect(mockInsertTweet).not.toHaveBeenCalled();
  });

  it("inserts new tweets with correct data", async () => {
    const handler = await getHandler();
    const mockPage = {
      setUserAgent: vi.fn(),
      goto: vi.fn(),
      waitForSelector: vi.fn(),
      evaluate: vi.fn()
        .mockResolvedValueOnce(undefined) // scroll
        .mockResolvedValueOnce([
          { tweetId: "222", text: "New tweet content", timestamp: "2026-02-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/222" },
        ]),
      close: vi.fn(),
    };
    const mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn(),
    };
    mockLaunch.mockResolvedValue(mockBrowser as any);
    mockInitDb.mockResolvedValue(undefined);
    mockTweetExists.mockResolvedValue(false);
    mockInsertTweet.mockResolvedValue(undefined);

    const { req, res } = createMockReqRes(`Bearer ${CRON_SECRET}`);
    await handler(req, res);

    expect(mockInsertTweet).toHaveBeenCalledWith(
      expect.objectContaining({
        x_tweet_id: "222",
        message: "New tweet content",
        username: "KJFUTURES",
      })
    );
  });

  it("returns correct scraped/new counts", async () => {
    const handler = await getHandler();
    const mockPage = {
      setUserAgent: vi.fn(),
      goto: vi.fn(),
      waitForSelector: vi.fn(),
      evaluate: vi.fn()
        .mockResolvedValueOnce(undefined) // scroll
        .mockResolvedValueOnce([
          { tweetId: "333", text: "Tweet A", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/333" },
          { tweetId: "444", text: "Tweet B", timestamp: "2026-01-02T00:00:00Z", url: "https://x.com/KJFUTURES/status/444" },
        ]),
      close: vi.fn(),
    };
    const mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn(),
    };
    mockLaunch.mockResolvedValue(mockBrowser as any);
    mockInitDb.mockResolvedValue(undefined);
    mockTweetExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mockInsertTweet.mockResolvedValue(undefined);

    const { req, res } = createMockReqRes(`Bearer ${CRON_SECRET}`);
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      scraped: 2,
      new: 1,
    });
  });

  it("returns 500 when scraper throws", async () => {
    const handler = await getHandler();
    mockInitDb.mockResolvedValue(undefined);
    mockLaunch.mockRejectedValue(new Error("Browser failed"));

    const { req, res } = createMockReqRes(`Bearer ${CRON_SECRET}`);
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/pages/api/cron/scrape-tweets.test.ts`
Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/cron/scrape-tweets.test.ts
git commit -m "test: add cron scraper handler tests"
```

---

## Chunk 3: Frontend Tests

### Task 9: Theme context tests (src/lib/theme-context.test.tsx)

**Files:**
- Create: `src/lib/theme-context.test.tsx`

- [ ] **Step 1: Write theme context tests**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider, useThemeContext } from "./theme-context";
import React from "react";

beforeEach(() => {
  localStorage.clear();
});

describe("useThemeContext", () => {
  it("throws when used outside ThemeProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => useThemeContext());
    }).toThrow("useThemeContext must be used within a ThemeProvider");
    spy.mockRestore();
  });

  it("toggleColorMode switches light to dark", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useThemeContext(), { wrapper });

    expect(result.current.colorMode).toBe("light");

    act(() => {
      result.current.toggleColorMode();
    });

    expect(result.current.colorMode).toBe("dark");
  });

  it("persists mode to localStorage", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    );
    const { result } = renderHook(() => useThemeContext(), { wrapper });

    act(() => {
      result.current.toggleColorMode();
    });

    expect(localStorage.getItem("colorMode")).toBe("dark");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/lib/theme-context.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/theme-context.test.tsx
git commit -m "test: add theme context tests"
```

---

### Task 10: Tweet component tests (src/components/Tweet.test.tsx)

**Files:**
- Create: `src/components/Tweet.test.tsx`

- [ ] **Step 1: Write Tweet tests**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import Tweet from "./Tweet";
import { ThemeProvider } from "@/lib/theme-context";
import React from "react";

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: any, ref: any) => (
      <div ref={ref} {...props}>{children}</div>
    )),
  },
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));

const defaultProps = {
  id: "123",
  text: "This is a test tweet about trading futures",
  title: "Test Tweet",
  createdAt: new Date().toISOString(),
  username: "KJFUTURES",
  name: "KJ",
};

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("Tweet", () => {
  it("renders name, username, title, and text", () => {
    renderWithTheme(<Tweet {...defaultProps} />);

    expect(screen.getByText("KJ")).toBeInTheDocument();
    expect(screen.getByText(/KJFUTURES/)).toBeInTheDocument();
    expect(screen.getByText("Test Tweet")).toBeInTheDocument();
    expect(screen.getByText("This is a test tweet about trading futures")).toBeInTheDocument();
  });

  it("highlights search term in text and title", () => {
    renderWithTheme(<Tweet {...defaultProps} searchTerm="trading" />);

    const highlights = screen.getAllByText("trading");
    expect(highlights.length).toBeGreaterThan(0);
  });

  it("does not add highlight markup when searchTerm is empty", () => {
    renderWithTheme(<Tweet {...defaultProps} searchTerm="" />);
    expect(screen.getByText("This is a test tweet about trading futures")).toBeInTheDocument();
  });

  it("renders media image when mediaUrls provided", () => {
    renderWithTheme(
      <Tweet {...defaultProps} mediaUrls={["https://pbs.twimg.com/media/test.jpg"]} />
    );

    const img = screen.getByAltText("Tweet media");
    expect(img).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/components/Tweet.test.tsx`
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/Tweet.test.tsx
git commit -m "test: add Tweet component tests"
```

---

### Task 11: TweetList component tests (src/components/TweetList.test.tsx)

**Files:**
- Create: `src/components/TweetList.test.tsx`

- [ ] **Step 1: Write TweetList tests**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import TweetList from "./TweetList";
import { ThemeProvider } from "@/lib/theme-context";
import React from "react";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: React.forwardRef(({ children, ...props }: any, ref: any) => (
      <div ref={ref} {...props}>{children}</div>
    )),
  },
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const mockTweets = [
  { id: "1", text: "Tweet one", title: "One", createdAt: "2026-01-01T00:00:00Z", username: "KJFUTURES", name: "KJ" },
  { id: "2", text: "Tweet two", title: "Two", createdAt: "2026-01-02T00:00:00Z", username: "KJFUTURES", name: "KJ" },
  { id: "3", text: "Tweet three", title: "Three", createdAt: "2026-01-03T00:00:00Z", username: "KJFUTURES", name: "KJ" },
];

describe("TweetList", () => {
  it("shows loading spinner when isLoading is true", () => {
    renderWithTheme(<TweetList tweets={[]} isLoading={true} />);
    expect(screen.getByText("Loading tweets...")).toBeInTheDocument();
  });

  it("shows empty state when tweets array is empty", () => {
    renderWithTheme(<TweetList tweets={[]} isLoading={false} />);
    expect(screen.getByText("No tweets found")).toBeInTheDocument();
  });

  it("renders correct number of tweet cards", () => {
    renderWithTheme(<TweetList tweets={mockTweets} isLoading={false} />);
    expect(screen.getByText("Tweet one")).toBeInTheDocument();
    expect(screen.getByText("Tweet two")).toBeInTheDocument();
    expect(screen.getByText("Tweet three")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/components/TweetList.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/TweetList.test.tsx
git commit -m "test: add TweetList component tests"
```

---

### Task 12: SearchBar component tests (src/components/SearchBar.test.tsx)

**Files:**
- Create: `src/components/SearchBar.test.tsx`

- [ ] **Step 1: Write SearchBar tests**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import SearchBar from "./SearchBar";
import { ThemeProvider } from "@/lib/theme-context";
import React from "react";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const mockTweets = [
  { id: "1", text: "Trading futures today", title: "Trading", createdAt: "2026-01-01T00:00:00Z", username: "KJFUTURES", name: "KJ" },
  { id: "2", text: "Market analysis report", title: "Market", createdAt: "2026-01-02T00:00:00Z", username: "KJFUTURES", name: "KJ" },
  { id: "3", text: "Trading strategies for beginners", title: "Strategies", createdAt: "2026-01-03T00:00:00Z", username: "KJFUTURES", name: "KJ" },
];

describe("SearchBar", () => {
  it("triggers onSearch with input value on Enter", async () => {
    const onSearch = vi.fn();
    renderWithTheme(<SearchBar tweets={mockTweets} onSearch={onSearch} />);

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await userEvent.type(input, "trading{Enter}");

    expect(onSearch).toHaveBeenCalledWith("trading");
  });

  it("clear button resets and calls onSearch with empty string", async () => {
    const onSearch = vi.fn();
    renderWithTheme(<SearchBar tweets={mockTweets} onSearch={onSearch} />);

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await userEvent.type(input, "trading{Enter}");
    onSearch.mockClear();

    const clearButton = screen.getByLabelText("clear search");
    await userEvent.click(clearButton);

    expect(onSearch).toHaveBeenCalledWith("");
  });

  it("shows result count after matching search", async () => {
    renderWithTheme(<SearchBar tweets={mockTweets} onSearch={vi.fn()} />);

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await userEvent.type(input, "trading{Enter}");

    expect(screen.getByText(/1 of 2 results/)).toBeInTheDocument();
  });

  it("navigation buttons cycle through results", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderWithTheme(<SearchBar tweets={mockTweets} onSearch={vi.fn()} />);

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await userEvent.type(input, "trading{Enter}");

    expect(screen.getByText(/1 of 2 results/)).toBeInTheDocument();

    // Find and click next button — MUI renders KeyboardArrowDown inside the button
    const buttons = screen.getAllByRole("button");
    const nextButton = buttons.find(
      (b) => !b.hasAttribute("disabled") && b.querySelector("svg[data-testid='KeyboardArrowDownIcon']")
    );
    expect(nextButton).toBeDefined();
    await userEvent.click(nextButton!);
    expect(screen.getByText(/2 of 2 results/)).toBeInTheDocument();
  });

  it("works without onSearch callback", async () => {
    renderWithTheme(<SearchBar tweets={mockTweets} />);

    const input = screen.getByPlaceholderText("SEARCH TWEET");
    await userEvent.type(input, "trading{Enter}");

    expect(screen.getByText(/1 of 2 results/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/components/SearchBar.test.tsx`
Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/SearchBar.test.tsx
git commit -m "test: add SearchBar component tests"
```

---

### Task 13: ThemeToggle component tests (src/components/ThemeToggle.test.tsx)

**Files:**
- Create: `src/components/ThemeToggle.test.tsx`

- [ ] **Step 1: Write ThemeToggle tests**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import ThemeToggle from "./ThemeToggle";
import { ThemeProvider } from "@/lib/theme-context";
import React from "react";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("ThemeToggle", () => {
  it("calls toggleColorMode on click", async () => {
    const toggle = vi.fn();
    renderWithTheme(<ThemeToggle toggleColorMode={toggle} mode="light" />);

    const button = screen.getByLabelText("Switch to dark mode");
    await userEvent.click(button);

    expect(toggle).toHaveBeenCalledOnce();
  });

  it("renders moon icon in light mode (offers dark)", () => {
    renderWithTheme(<ThemeToggle toggleColorMode={vi.fn()} mode="light" />);
    expect(screen.getByLabelText("Switch to dark mode")).toBeInTheDocument();
  });

  it("renders sun icon in dark mode (offers light)", () => {
    renderWithTheme(<ThemeToggle toggleColorMode={vi.fn()} mode="dark" />);
    expect(screen.getByLabelText("Switch to light mode")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/components/ThemeToggle.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/ThemeToggle.test.tsx
git commit -m "test: add ThemeToggle component tests"
```

---

### Task 14: BackToTop component tests (src/components/BackToTop.test.tsx)

**Files:**
- Create: `src/components/BackToTop.test.tsx`

- [ ] **Step 1: Write BackToTop tests**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import BackToTop from "./BackToTop";
import { ThemeProvider } from "@/lib/theme-context";
import React from "react";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("BackToTop", () => {
  it("is hidden before scroll threshold", () => {
    renderWithTheme(<BackToTop />);
    const button = screen.getByLabelText("Back to top");
    // MUI Zoom with in={false} hides the element
    expect(button).toBeInTheDocument();
  });

  it("is visible after scrolling past 500px", () => {
    renderWithTheme(<BackToTop />);

    act(() => {
      Object.defineProperty(window, "scrollY", { value: 600, writable: true, configurable: true });
      fireEvent.scroll(window);
    });

    const button = screen.getByLabelText("Back to top");
    expect(button).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- src/components/BackToTop.test.tsx`
Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/BackToTop.test.tsx
git commit -m "test: add BackToTop component tests"
```

---

### Task 15: Run full test suite and verify

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: ~35-40 tests pass across all files, 0 failures.

- [ ] **Step 2: Run build to ensure no regressions**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "test: complete test suite — all tests passing"
```
