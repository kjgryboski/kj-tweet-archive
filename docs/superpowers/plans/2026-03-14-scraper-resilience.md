# Scraper Resilience Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tweet scraper resilient to X.com DOM changes with fallback selectors, retry logic, and email alerting.

**Architecture:** Add a selector chain system that tries multiple CSS selectors per DOM query. Wrap scraping in retry logic (2 attempts, reduced timeouts). Send email alerts via Resend on failure/degradation. All new code is testable with existing Vitest + jsdom setup.

**Tech Stack:** Vitest, Resend, puppeteer-core, @sparticuz/chromium (existing)

**Spec:** `docs/superpowers/specs/2026-03-14-scraper-resilience-design.md`

---

## Chunk 1: Selector System + Email Module

### Task 1: Install Resend dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install resend**

```bash
cd /c/Users/Kevin/kj-tweet-archive/kj-tweet-archive-main
npm install resend
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add resend dependency for scraper alerts"
```

---

### Task 2: Scraper selectors module (src/lib/scraper-selectors.ts)

**Files:**
- Create: `src/lib/scraper-selectors.ts`
- Create: `src/lib/scraper-selectors.test.ts`

- [ ] **Step 1: Write selector tests**

```ts
import { describe, it, expect } from "vitest";
import { SELECTORS, resolveSelector, resolveChildSelector } from "./scraper-selectors";

describe("resolveSelector", () => {
  it("returns first matching selector (primary)", () => {
    const container = document.createElement("div");
    const article = document.createElement("article");
    article.setAttribute("data-testid", "tweet");
    container.appendChild(article);

    const result = resolveSelector(container, "tweetContainer");
    expect(result).not.toBeNull();
    expect(result!.selector).toBe('[data-testid="tweet"]');
    expect(result!.elements).toHaveLength(1);
  });

  it("falls back when primary selector fails", () => {
    const container = document.createElement("div");
    const article = document.createElement("article");
    article.setAttribute("role", "article");
    // No data-testid="tweet" — primary will fail
    container.appendChild(article);

    const result = resolveSelector(container, "tweetContainer");
    expect(result).not.toBeNull();
    expect(result!.selector).toBe('article[role="article"]');
    expect(result!.elements).toHaveLength(1);
  });

  it("returns null when all selectors fail", () => {
    const container = document.createElement("div");
    // Empty div — no matching elements for any selector
    const result = resolveSelector(container, "tweetContainer");
    expect(result).toBeNull();
  });
});

describe("resolveChildSelector", () => {
  it("queries within parent element, not document", () => {
    const parent = document.createElement("article");
    const textDiv = document.createElement("div");
    textDiv.setAttribute("data-testid", "tweetText");
    textDiv.textContent = "Hello";
    parent.appendChild(textDiv);

    // Also add a tweetText outside the parent (on document body)
    const outsideDiv = document.createElement("div");
    outsideDiv.setAttribute("data-testid", "tweetText");
    outsideDiv.textContent = "Outside";
    document.body.appendChild(outsideDiv);

    const result = resolveChildSelector(parent, "tweetText");
    expect(result).not.toBeNull();
    expect(result!.elements).toHaveLength(1);
    expect(result!.elements[0].textContent).toBe("Hello");

    // Cleanup
    document.body.removeChild(outsideDiv);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/scraper-selectors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
export const SELECTORS = {
  tweetContainer: ['[data-testid="tweet"]', 'article[role="article"]', 'article'],
  tweetText: ['[data-testid="tweetText"]', 'div[lang][dir="ltr"]'],
  socialContext: ['[data-testid="socialContext"]'],
  timeElement: ['time[datetime]'],
} as const;

export type SelectorKey = keyof typeof SELECTORS;

export type SelectorResult = {
  selector: string;
  elements: Element[];
} | null;

/**
 * Try each selector in the chain for the given key against root.
 * Returns the first selector that matches at least one element, or null.
 */
export function resolveSelector(
  root: ParentNode,
  key: SelectorKey
): SelectorResult {
  for (const selector of SELECTORS[key]) {
    const elements = Array.from(root.querySelectorAll(selector));
    if (elements.length > 0) {
      return { selector, elements };
    }
  }
  return null;
}

/**
 * Same as resolveSelector but scoped to a parent element.
 * Used for per-tweet queries (tweetText, socialContext).
 */
export function resolveChildSelector(
  parent: Element,
  key: SelectorKey
): SelectorResult {
  for (const selector of SELECTORS[key]) {
    const elements = Array.from(parent.querySelectorAll(selector));
    if (elements.length > 0) {
      return { selector, elements };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/scraper-selectors.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scraper-selectors.ts src/lib/scraper-selectors.test.ts
git commit -m "feat: add scraper selector chains with fallback resolution"
```

---

### Task 3: Email alert module (src/lib/email.ts)

**Files:**
- Create: `src/lib/email.ts`
- Create: `src/lib/email.test.ts`

- [ ] **Step 1: Write email tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

import { sendAlert } from "./email";

beforeEach(() => {
  mockSend.mockReset();
  process.env.RESEND_API_KEY = "test-key";
});

describe("sendAlert", () => {
  it("calls Resend with correct params", async () => {
    mockSend.mockResolvedValue({ id: "123" });

    await sendAlert("[KJ Tweets] Test", "Test body");

    expect(mockSend).toHaveBeenCalledWith({
      from: "KJ Tweets Alerts <onboarding@resend.dev>",
      to: "kj@kj.ventures",
      subject: "[KJ Tweets] Test",
      text: "Test body",
    });
  });

  it("does not throw on Resend error", async () => {
    mockSend.mockRejectedValue(new Error("Resend down"));

    // Should not throw — logs and continues
    await expect(sendAlert("Subject", "Body")).resolves.toBeUndefined();
  });

  it("skips sending when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;

    await sendAlert("Subject", "Body");

    expect(mockSend).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/email.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
import { Resend } from "resend";

const ALERT_TO = "kj@kj.ventures";
const ALERT_FROM = "KJ Tweets Alerts <onboarding@resend.dev>";

/**
 * Send an alert email via Resend. Never throws — logs errors and continues.
 */
export async function sendAlert(subject: string, body: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set, skipping alert email");
    return;
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: ALERT_FROM,
      to: ALERT_TO,
      subject,
      text: body,
    });
  } catch (error) {
    console.error("Failed to send alert email:", error);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/email.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts src/lib/email.test.ts
git commit -m "feat: add email alert module using Resend"
```

---

## Chunk 2: Update Scraper Utils + Scrape Handler

### Task 4: Update parseTweetElements to accept selectors

**Files:**
- Modify: `src/lib/scraper-utils.ts`
- Modify: `src/lib/scraper-utils.test.ts`

- [ ] **Step 1: Add test for custom selectors**

Add this test to the existing `parseTweetElements` describe block in `src/lib/scraper-utils.test.ts`:

```ts
it("accepts custom selectors parameter", () => {
  const container = document.createElement("div");

  // Build article with custom attributes instead of data-testid
  const article = document.createElement("article");
  article.setAttribute("role", "article");

  const link = document.createElement("a");
  link.setAttribute("href", "/KJFUTURES/status/55555");
  const time = document.createElement("time");
  time.setAttribute("datetime", "2026-03-10T08:00:00.000Z");
  time.textContent = "Mar 10";
  link.appendChild(time);
  article.appendChild(link);

  const textDiv = document.createElement("div");
  textDiv.setAttribute("lang", "en");
  textDiv.setAttribute("dir", "ltr");
  textDiv.textContent = "Custom selector tweet";
  article.appendChild(textDiv);

  container.appendChild(article);

  const customSelectors = {
    tweetContainer: ['article[role="article"]'],
    tweetText: ['div[lang][dir="ltr"]'],
    socialContext: ['[data-testid="socialContext"]'],
    timeElement: ['time[datetime]'],
  };

  const results = parseTweetElements(container, customSelectors);
  expect(results).toHaveLength(1);
  expect(results[0].text).toBe("Custom selector tweet");
  expect(results[0].tweetId).toBe("55555");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/scraper-utils.test.ts`
Expected: FAIL — parseTweetElements does not accept second argument / uses wrong selectors.

- [ ] **Step 3: Update parseTweetElements to accept optional selectors**

Update `src/lib/scraper-utils.ts`. Change the `parseTweetElements` function signature and body to accept an optional selectors parameter. When not provided, use the default `SELECTORS` from `scraper-selectors.ts`.

```ts
import { SELECTORS as DEFAULT_SELECTORS, type SelectorKey } from "./scraper-selectors";

// Add this type for the selectors parameter
export type SelectorConfig = Record<SelectorKey, readonly string[]>;

// Helper to resolve first matching selector within a parent
function resolveChild(parent: Element, selectors: readonly string[]): Element | null {
  for (const sel of selectors) {
    const el = parent.querySelector(sel);
    if (el) return el;
  }
  return null;
}
```

Update the `parseTweetElements` signature:

```ts
export function parseTweetElements(
  root: ParentNode,
  selectors: SelectorConfig = DEFAULT_SELECTORS
): ScrapedTweet[] {
```

Replace hardcoded selectors in the body:
- `root.querySelectorAll('[data-testid="tweet"]')` → resolve using `selectors.tweetContainer`
- `el.querySelector('[data-testid="socialContext"]')` → `resolveChild(el, selectors.socialContext)`
- `el.querySelector('[data-testid="tweetText"]')` → `resolveChild(el, selectors.tweetText)`
- `el.querySelector("time")` stays as `resolveChild(el, selectors.timeElement)`

The full updated function:

```ts
export function parseTweetElements(
  root: ParentNode,
  selectors: SelectorConfig = DEFAULT_SELECTORS
): ScrapedTweet[] {
  // Resolve tweet containers using selector chain
  let tweetElements: Element[] = [];
  for (const sel of selectors.tweetContainer) {
    tweetElements = Array.from(root.querySelectorAll(sel));
    if (tweetElements.length > 0) break;
  }

  const results: ScrapedTweet[] = [];

  tweetElements.forEach((el) => {
    // Skip retweets
    const socialContext = resolveChild(el, selectors.socialContext);
    if (socialContext?.textContent?.includes("reposted")) return;

    // Get tweet link to extract ID
    const timeEl = resolveChild(el, selectors.timeElement);
    const linkEl = timeEl?.closest("a");
    const href = linkEl?.getAttribute("href") || "";
    const tweetIdMatch = href.match(/status\/(\d+)/);
    if (!tweetIdMatch) return;

    // Skip replies
    const allText = el.textContent || "";
    if (allText.includes("Replying to @")) return;

    // Get tweet text
    const tweetTextEl = resolveChild(el, selectors.tweetText);
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

- [ ] **Step 4: Run all scraper-utils tests**

Run: `npm test -- src/lib/scraper-utils.test.ts`
Expected: All 10 tests pass (9 existing + 1 new). Existing tests still pass because `selectors` defaults to `DEFAULT_SELECTORS`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scraper-utils.ts src/lib/scraper-utils.test.ts
git commit -m "feat: parseTweetElements accepts configurable selectors"
```

---

### Task 5: Rewrite scrape-tweets.ts with retry, fallbacks, and alerting

**Files:**
- Modify: `src/pages/api/cron/scrape-tweets.ts`

- [ ] **Step 1: Rewrite scrape-tweets.ts**

The handler gets significant changes. Read the current file first, then replace with:

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { initDb, insertTweet, tweetExists } from "@/lib/db";
import { generateTitle, type ScrapedTweet } from "@/lib/scraper-utils";
import { SELECTORS } from "@/lib/scraper-selectors";
import { sendAlert } from "@/lib/email";

export const config = {
  maxDuration: 120,
};

const PROFILE_URL = "https://x.com/KJFUTURES";
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3000;
const GOTO_TIMEOUT = 30000;
const SELECTOR_TIMEOUT = 15000;
const LOW_TWEET_THRESHOLD = 3;

interface ScrapeResult {
  tweets: ScrapedTweet[];
  selectorsUsed: Record<string, string>;
  fallbacksTriggered: boolean;
  attempts: number;
}

async function scrapeTweetsWithRetry(): Promise<ScrapeResult> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  let lastError: Error | null = null;

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const page = await browser.newPage();

        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );

        await page.goto(PROFILE_URL, {
          waitUntil: "networkidle2",
          timeout: GOTO_TIMEOUT,
        });

        // Wait for any tweet container selector to appear (combined selector
        // keeps total wait to SELECTOR_TIMEOUT, not multiplied per fallback)
        const combinedSelector = SELECTORS.tweetContainer.join(", ");
        let fallbacksTriggered = false;

        try {
          await page.waitForSelector(combinedSelector, {
            timeout: SELECTOR_TIMEOUT,
          });
        } catch {
          throw new Error("All selectors failed for tweetContainer");
        }

        // Scroll to load more tweets
        await page.evaluate(() => window.scrollBy(0, 2000));
        await new Promise((r) => setTimeout(r, 2000));

        // Pass serializable selector config into page.evaluate
        const selectorConfig = {
          tweetContainer: [...SELECTORS.tweetContainer],
          tweetText: [...SELECTORS.tweetText],
          socialContext: [...SELECTORS.socialContext],
          timeElement: [...SELECTORS.timeElement],
        };

        const { tweets, selectorsUsed: innerSelectors } = await page.evaluate(
          (selectors) => {
            // Inline resolve helper (browser context — can't import)
            function resolveChild(
              parent: Element,
              sels: string[]
            ): Element | null {
              for (const sel of sels) {
                const el = parent.querySelector(sel);
                if (el) return el;
              }
              return null;
            }

            // Find tweet containers
            let tweetElements: Element[] = [];
            let usedContainerSelector = "";
            for (const sel of selectors.tweetContainer) {
              tweetElements = Array.from(document.querySelectorAll(sel));
              if (tweetElements.length > 0) {
                usedContainerSelector = sel;
                break;
              }
            }

            const results: {
              tweetId: string;
              text: string;
              timestamp: string;
              url: string;
            }[] = [];

            let usedTextSelector = "";

            tweetElements.forEach((el) => {
              const socialContext = resolveChild(el, selectors.socialContext);
              if (socialContext?.textContent?.includes("reposted")) return;

              const timeEl = resolveChild(el, selectors.timeElement);
              const linkEl = timeEl?.closest("a");
              const href = linkEl?.getAttribute("href") || "";
              const tweetIdMatch = href.match(/status\/(\d+)/);
              if (!tweetIdMatch) return;

              const allText = el.textContent || "";
              if (allText.includes("Replying to @")) return;

              const tweetTextEl = resolveChild(el, selectors.tweetText);
              if (tweetTextEl && !usedTextSelector) {
                // Record which text selector worked
                for (const sel of selectors.tweetText) {
                  if (el.querySelector(sel) === tweetTextEl) {
                    usedTextSelector = sel;
                    break;
                  }
                }
              }
              const text = tweetTextEl?.textContent || "";
              if (!text.trim()) return;

              const timestamp = timeEl?.getAttribute("datetime") || "";

              results.push({
                tweetId: tweetIdMatch[1],
                text: text.trim(),
                timestamp,
                url: `https://x.com${href}`,
              });
            });

            return {
              tweets: results,
              selectorsUsed: {
                tweetContainer: usedContainerSelector,
                tweetText: usedTextSelector,
              },
            };
          },
          selectorConfig
        );

        if (tweets.length === 0) {
          throw new Error("Zero tweets extracted after parsing");
        }

        // Check if any non-primary selectors were used
        const selectorsUsed = innerSelectors;
        if (
          selectorsUsed.tweetContainer !== SELECTORS.tweetContainer[0] ||
          (selectorsUsed.tweetText && selectorsUsed.tweetText !== SELECTORS.tweetText[0])
        ) {
          fallbacksTriggered = true;
        }

        return {
          tweets,
          selectorsUsed,
          fallbacksTriggered,
          attempts: attempt,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }

    throw lastError || new Error("Scraping failed after all attempts");
  } finally {
    await browser.close();
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await initDb();

    const result = await scrapeTweetsWithRetry();
    let newCount = 0;

    for (const tweet of result.tweets) {
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

    // Check for alert conditions
    if (result.fallbacksTriggered) {
      await sendAlert(
        "[KJ Tweets] Selector degradation — fallback in use",
        `Scraper used fallback selectors at ${new Date().toISOString()}.\n\nSelectors used:\n${JSON.stringify(result.selectorsUsed, null, 2)}\n\nAttempts: ${result.attempts}\nTweets scraped: ${result.tweets.length}`
      );
    }

    if (result.tweets.length < LOW_TWEET_THRESHOLD) {
      await sendAlert(
        `[KJ Tweets] Low tweet count — ${result.tweets.length} tweets scraped`,
        `Scraper returned only ${result.tweets.length} tweets at ${new Date().toISOString()}.\n\nSelectors used:\n${JSON.stringify(result.selectorsUsed, null, 2)}\n\nAttempts: ${result.attempts}`
      );
    }

    return res.status(200).json({
      success: true,
      scraped: result.tweets.length,
      new: newCount,
      attempts: result.attempts,
      selectorsUsed: result.selectorsUsed,
      fallbacksTriggered: result.fallbacksTriggered,
    });
  } catch (error) {
    console.error("Scraper error:", error);

    await sendAlert(
      "[KJ Tweets] Scraper FAILED — 0 tweets extracted",
      `Scraper failed at ${new Date().toISOString()}.\n\nError: ${String(error)}\n\nAll retry attempts exhausted.`
    );

    return res.status(500).json({
      success: false,
      error: String(error),
      attempts: MAX_ATTEMPTS,
      alertSent: true,
    });
  }
}
```

- [ ] **Step 2: Run existing cron tests to check what breaks**

Run: `npm test -- src/pages/api/cron/scrape-tweets.test.ts`
Expected: Some tests may need updating due to changed response format and new imports.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/cron/scrape-tweets.ts
git commit -m "feat: add retry logic, fallback selectors, and alerting to scraper"
```

---

### Task 6: Update cron handler tests

**Files:**
- Modify: `src/pages/api/cron/scrape-tweets.test.ts`

- [ ] **Step 1: Rewrite the test file**

The test file needs significant updates. Read the current file first, then apply these changes:

**A. Add new mocks** (in the `vi.hoisted` block, add `mockSendAlert`):
```ts
const mockSendAlert = vi.fn().mockResolvedValue(undefined);
```

Add new mock registrations:
```ts
vi.mock("@/lib/email", () => ({
  sendAlert: mockSendAlert,
}));

vi.mock("@/lib/scraper-selectors", () => ({
  SELECTORS: {
    tweetContainer: ['[data-testid="tweet"]', 'article[role="article"]', 'article'],
    tweetText: ['[data-testid="tweetText"]', 'div[lang][dir="ltr"]'],
    socialContext: ['[data-testid="socialContext"]'],
    timeElement: ['time[datetime]'],
  },
}));
```

Add `mockSendAlert.mockReset()` to the `beforeEach` block.

**B. Update `mockEvaluate` return values in existing tests.** The extraction evaluate now returns `{ tweets: [...], selectorsUsed: {...} }` instead of a plain array. For every existing test that mocks `mockEvaluate`, change the second `.mockResolvedValueOnce(scrapedTweets)` to:
```ts
.mockResolvedValueOnce({
  tweets: scrapedTweets,
  selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
})
```

**C. Update "calls initDb" test.** This test currently mocks evaluate to return `[]` (zero tweets). The new handler throws on zero tweets and retries. Change this test to return 1 tweet so initDb is testable without triggering retry:
```ts
it("calls initDb before processing tweets", async () => {
  process.env.CRON_SECRET = "my-secret";
  mockEvaluate
    .mockResolvedValueOnce(undefined) // scroll
    .mockResolvedValueOnce({
      tweets: [{ tweetId: "100", text: "Test", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/100" }],
      selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
    });
  mockTweetExists.mockResolvedValue(true);

  const { req, res } = createMockReqRes("Bearer my-secret");
  await runHandler(req, res);

  expect(mockInitDb).toHaveBeenCalledTimes(1);
});
```

**D. Update "returns correct scraped/new counts" test.** Change expected response:
```ts
expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
  success: true, scraped: 2, new: 1,
}));
```

**E. Update "returns 500 when scraper throws" test.** Change expected response:
```ts
expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
  success: false,
  error: expect.stringContaining("Puppeteer failed"),
}));
expect(mockSendAlert).toHaveBeenCalled();
```

**F. Add these new tests:**

```ts
it("retries on first attempt failure, succeeds on second", async () => {
  // First attempt: waitForSelector throws
  // Second attempt: succeeds
  // Mock page for first attempt — waitForSelector rejects
  const mockPage1 = {
    setUserAgent: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockRejectedValue(new Error("Timeout")),
  };
  const mockPage2 = {
    setUserAgent: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn()
      .mockResolvedValueOnce(undefined) // scroll
      .mockResolvedValueOnce({
        tweets: [{ tweetId: "777", text: "Retry tweet", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/777" }],
        selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
      }),
  };
  mockNewPage
    .mockResolvedValueOnce(mockPage1)
    .mockResolvedValueOnce(mockPage2);

  mockTweetExists.mockResolvedValue(false);

  const { req, res } = createMockReqRes("Bearer my-secret");
  await runHandler(req, res);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    attempts: 2,
  }));
});

it("sends alert email on total failure", async () => {
  mockLaunch.mockRejectedValue(new Error("Browser crashed"));

  const { req, res } = createMockReqRes("Bearer my-secret");
  await runHandler(req, res);

  expect(res.status).toHaveBeenCalledWith(500);
  expect(mockSendAlert).toHaveBeenCalledWith(
    "[KJ Tweets] Scraper FAILED — 0 tweets extracted",
    expect.stringContaining("Browser crashed")
  );
});

it("sends degradation alert when fallback selector used", async () => {
  mockEvaluate
    .mockResolvedValueOnce(undefined) // scroll
    .mockResolvedValueOnce({
      tweets: [{ tweetId: "888", text: "Fallback tweet", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/888" }],
      selectorsUsed: { tweetContainer: 'article[role="article"]', tweetText: '[data-testid="tweetText"]' },
    });

  mockTweetExists.mockResolvedValue(false);

  const { req, res } = createMockReqRes("Bearer my-secret");
  await runHandler(req, res);

  expect(mockSendAlert).toHaveBeenCalledWith(
    "[KJ Tweets] Selector degradation — fallback in use",
    expect.stringContaining("fallback")
  );
});

it("response includes selector metadata and attempts", async () => {
  mockEvaluate
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({
      tweets: [{ tweetId: "999", text: "Meta tweet", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/999" }],
      selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
    });

  mockTweetExists.mockResolvedValue(false);

  const { req, res } = createMockReqRes("Bearer my-secret");
  await runHandler(req, res);

  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    attempts: 1,
    selectorsUsed: expect.objectContaining({
      tweetContainer: '[data-testid="tweet"]',
    }),
    fallbacksTriggered: false,
  }));
});
```

- [ ] **Step 2: Run all cron tests**

Run: `npm test -- src/pages/api/cron/scrape-tweets.test.ts`
Expected: All tests pass (6 existing updated + 4 new = ~10 tests).

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/cron/scrape-tweets.test.ts
git commit -m "test: update cron handler tests for retry, fallbacks, and alerting"
```

---

### Task 7: Run full test suite and verify

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass (~60 tests across all files), 0 failures.

- [ ] **Step 2: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve any remaining test issues"
```
