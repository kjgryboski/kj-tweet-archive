# Comprehensive Audit Fixes — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 33 audit findings from the comprehensive audit spec, ordered by priority (P0 first, P3 last).

**Architecture:** Changes span the API layer (server-side search, rate limiting, upsert fix), cron handlers (scroll pagination, retry, auth logging), frontend (error states, search rewrite, a11y), and project config (dependency cleanup, dead code removal). Each task is self-contained and commits independently.

**Tech Stack:** Next.js Pages Router, Vercel Postgres (`@vercel/postgres` tagged templates), Puppeteer + Chromium, MUI v7, Vitest + Testing Library, Resend email.

**Spec:** `docs/superpowers/specs/2026-03-14-comprehensive-audit-design.md`

---

## Chunk 1: Server-Side Search (P0 — Findings 1, 21)

### Task 1: Add search query to DB layer

**Files:**
- Modify: `src/lib/db.ts` — add `q` parameter to `getTweetsPaginated`
- Test: `src/lib/db.test.ts`

- [ ] **Step 1: Write failing test for search query**

In `src/lib/db.test.ts`, add to the `getTweetsPaginated` describe block:

```typescript
it("applies ILIKE filter when q param is provided", async () => {
  mockSql.mockResolvedValue({ rows: [] });
  await getTweetsPaginated(undefined, 5, "newest", "bitcoin");
  expect(mockSql).toHaveBeenCalled();
  // Verify the mock was called (tagged template — we check the query includes the param)
  const call = mockSql.mock.calls[mockSql.mock.calls.length - 1];
  // Tagged template: first arg is string array, second is the interpolated values
  // For now just verify it was called with the search term somewhere in the args
  expect(JSON.stringify(call)).toContain("bitcoin");
});

it("applies ILIKE filter with cursor and search", async () => {
  mockSql.mockResolvedValue({ rows: [] });
  await getTweetsPaginated("cursor123", 5, "newest", "bitcoin");
  expect(mockSql).toHaveBeenCalled();
  const call = mockSql.mock.calls[mockSql.mock.calls.length - 1];
  expect(JSON.stringify(call)).toContain("bitcoin");
  expect(JSON.stringify(call)).toContain("cursor123");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/db.test.ts`
Expected: FAIL — `getTweetsPaginated` does not accept a 4th argument

- [ ] **Step 3: Add `q` parameter to `getTweetsPaginated`**

In `src/lib/db.ts`, update the function signature and add search branches. The function needs 6 branches: 3 sort modes × (with/without cursor), and each branch needs a search variant. To keep it DRY, add the search filter as a CTE or subquery approach.

Update the signature:

```typescript
export async function getTweetsPaginated(
  cursor?: string,
  limit: number = 30,
  sort: "newest" | "oldest" | "likes" = "newest",
  q?: string
): Promise<PaginatedTweets> {
```

For each of the 6 existing SQL branches, add an `if (q)` variant that includes `AND (message ILIKE ${'%' + q + '%'} OR title ILIKE ${'%' + q + '%'})` in the WHERE clause. For the no-cursor branches, use `WHERE` instead of `AND`.

Example for the `newest` no-cursor branch:

```typescript
if (q) {
  const pattern = `%${q}%`;
  ({ rows } = await sql`
    SELECT * FROM tweets
    WHERE (message ILIKE ${pattern} OR title ILIKE ${pattern})
    ORDER BY created_at DESC, id DESC
    LIMIT ${fetchLimit}
  `);
} else {
  ({ rows } = await sql`
    SELECT * FROM tweets
    ORDER BY created_at DESC, id DESC
    LIMIT ${fetchLimit}
  `);
}
```

Apply the same pattern to all 6 branches (newest/oldest/likes × cursor/no-cursor).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/db.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "feat: add server-side search (q param) to getTweetsPaginated"
```

---

### Task 2: Add search query param to tweets API

**Files:**
- Modify: `src/pages/api/tweets.ts` — pass `q` to DB layer
- Test: `src/pages/api/tweets.test.ts`

- [ ] **Step 1: Write failing test**

In `src/pages/api/tweets.test.ts`, add:

```typescript
it("passes q search param to getTweetsPaginated", async () => {
  mockGetTweetsPaginated.mockResolvedValue({ tweets: [], hasMore: false, nextCursor: null } as any);
  const { req, res } = createMockReqRes("GET", { q: "bitcoin" });
  await handler(req, res);
  expect(mockGetTweetsPaginated).toHaveBeenCalledWith(undefined, 30, "newest", "bitcoin");
});

it("does not pass q when not provided", async () => {
  mockGetTweetsPaginated.mockResolvedValue({ tweets: [], hasMore: false, nextCursor: null } as any);
  const { req, res } = createMockReqRes("GET");
  await handler(req, res);
  expect(mockGetTweetsPaginated).toHaveBeenCalledWith(undefined, 30, "newest", undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/api/tweets.test.ts`
Expected: FAIL — handler doesn't pass `q`

- [ ] **Step 3: Update tweets API handler**

In `src/pages/api/tweets.ts`, add after line 15 (`const sortParam`):

```typescript
const q = (req.query.q as string) || undefined;
```

Update the `getTweetsPaginated` call on line 20:

```typescript
const result = await getTweetsPaginated(cursor, limit, sort, q);
```

Also: skip the Cache-Control header when `q` is present (search results shouldn't be cached):

```typescript
if (!cursor && sort === "newest" && !q) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/api/tweets.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/tweets.ts src/pages/api/tweets.test.ts
git commit -m "feat: add q search param to /api/tweets endpoint"
```

---

### Task 3: Rewrite SearchBar to use server-side search

**Files:**
- Modify: `src/components/SearchBar.tsx` — call API instead of filtering props
- Modify: `src/pages/index.tsx` — pass search handler that calls API, update props
- Test: `src/components/SearchBar.test.tsx`

- [ ] **Step 1: Read current SearchBar test to understand test patterns**

Read `src/components/SearchBar.test.tsx` to understand existing patterns before modifying.

- [ ] **Step 2: Update SearchBar to accept an `onServerSearch` callback**

In `src/components/SearchBar.tsx`:

1. Change the interface:

```typescript
interface SearchBarProps {
  onServerSearch: (term: string) => void;
  onClear: () => void;
  totalResults?: number;
  currentResult?: number;
  onNavigate?: (direction: "prev" | "next") => void;
}
```

2. Remove the `tweets` prop dependency. The `executeSearch` function should call `onServerSearch(inputValue)` instead of filtering locally. Remove the local `searchResults`, `currentResult` state and the `scrollToTweet` logic — search navigation will work via the highlighted results in the server-returned list.

3. Simplified component body:

```typescript
export default function SearchBar({ onServerSearch, onClear, totalResults, currentResult, onNavigate }: SearchBarProps) {
  const [inputValue, setInputValue] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const executeSearch = () => {
    if (!inputValue.trim()) {
      onClear();
      return;
    }
    onServerSearch(inputValue.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      executeSearch();
    }
  };

  const clearSearch = () => {
    setInputValue("");
    onClear();
  };
  // ... rest of render stays similar but uses props for results count
```

- [ ] **Step 3: Update `index.tsx` to wire server search**

In `src/pages/index.tsx`:

1. Add a `searchTerm` state (already exists) and a `searchResults` state:

```typescript
const [searchResults, setSearchResults] = useState<TweetProps[] | null>(null);
```

2. Add search handler:

```typescript
const handleServerSearch = useCallback(async (term: string) => {
  setSearchTerm(term);
  setIsLoading(true);
  try {
    const params = new URLSearchParams({ q: term, limit: "100" });
    const res = await fetch(`/api/tweets?${params}`);
    if (!res.ok) throw new Error("Search failed");
    const data = await res.json();
    setSearchResults(data.tweets);
  } catch (error) {
    console.error("Search error:", error);
    setSearchResults([]);
  } finally {
    setIsLoading(false);
  }
}, []);

const handleClearSearch = useCallback(() => {
  setSearchTerm("");
  setSearchResults(null);
}, []);
```

3. Pass `searchResults ?? tweets` to `TweetList`:

```typescript
<TweetList
  tweets={searchResults ?? tweets}
  isLoading={isLoading}
  searchTerm={searchTerm}
  loadingMore={loadingMore}
/>
```

4. Hide infinite scroll sentinel when searching:

```typescript
{hasMore && !isLoading && !searchResults && <div ref={sentinelRef} style={{ height: 1 }} />}
```

5. Update `SearchBar` props:

```typescript
<SearchBar onServerSearch={handleServerSearch} onClear={handleClearSearch} />
```

- [ ] **Step 4: Update SearchBar tests**

Update `src/components/SearchBar.test.tsx` to test the new callback-based interface instead of the old local filtering.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/SearchBar.tsx src/components/SearchBar.test.tsx src/pages/index.tsx
git commit -m "feat: rewrite search to use server-side API instead of client-side filtering"
```

---

## Chunk 2: Scraper Reliability (P1 — Findings 5, 8, 9, 10, 12, 14)

### Task 4: Add scroll pagination to scraper

**Files:**
- Modify: `src/pages/api/cron/scrape-tweets.ts` — replace single scroll with loop
- Test: `src/pages/api/cron/scrape-tweets.test.ts`

- [ ] **Step 1: Write test for multi-scroll behavior**

In `src/pages/api/cron/scrape-tweets.test.ts`, add:

```typescript
it("scrolls multiple times to load more tweets", async () => {
  process.env.CRON_SECRET = "my-secret";
  // Simulate: first evaluate is scroll (returns undefined), second is extract
  const scrollEval = vi.fn().mockResolvedValue(undefined);
  const extractEval = vi.fn().mockResolvedValue({
    tweets: [
      { tweetId: "500", text: "Scroll tweet", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/500", likes: 0 },
    ],
    selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
  });
  // The page.evaluate will be called multiple times for scrolling, then once for extraction
  mockEvaluate
    .mockResolvedValueOnce(undefined)   // first scroll
    .mockResolvedValueOnce(10)          // first count check
    .mockResolvedValueOnce(undefined)   // second scroll
    .mockResolvedValueOnce(10)          // second count check (same = stop)
    .mockResolvedValueOnce({            // extraction
      tweets: [{ tweetId: "500", text: "t", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/500", likes: 0 }],
      selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
    });

  const { req, res } = createMockReqRes("Bearer my-secret");
  await runHandler(req, res);

  expect(res.status).toHaveBeenCalledWith(200);
  // evaluate called more than 2 times = scrolling happened
  expect(mockEvaluate.mock.calls.length).toBeGreaterThan(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/api/cron/scrape-tweets.test.ts`
Expected: FAIL

- [ ] **Step 3: Replace single scroll with scroll loop**

In `src/pages/api/cron/scrape-tweets.ts`, replace lines 66-67:

```typescript
// Scroll to load more tweets
await page.evaluate(() => window.scrollBy(0, 2000));
await new Promise((r) => setTimeout(r, 2000));
```

With a scroll loop:

```typescript
// Scroll to load more tweets — loop until no new tweets appear
const MAX_SCROLLS = 10;
const SCROLL_DELAY_MS = 2000;
let previousCount = 0;

for (let scroll = 0; scroll < MAX_SCROLLS; scroll++) {
  await page.evaluate(() => window.scrollBy(0, 2000));
  await new Promise((r) => setTimeout(r, SCROLL_DELAY_MS));

  const currentCount = await page.evaluate(
    (sel: string) => document.querySelectorAll(sel).length,
    SELECTORS.tweetContainer.join(", ")
  );

  if (currentCount === previousCount) break; // No new tweets loaded
  previousCount = currentCount;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/api/cron/scrape-tweets.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/cron/scrape-tweets.ts src/pages/api/cron/scrape-tweets.test.ts
git commit -m "feat: add scroll pagination to tweet scraper (max 10 scrolls)"
```

---

### Task 5: Add scroll pagination + retry to refresh-metrics

**Files:**
- Modify: `src/pages/api/cron/refresh-metrics.ts` — add scroll loop and retry
- Test: `src/pages/api/cron/refresh-metrics.test.ts`

- [ ] **Step 1: Write test for retry on failure**

In `src/pages/api/cron/refresh-metrics.test.ts`, add:

```typescript
it("retries on first attempt failure", async () => {
  process.env.CRON_SECRET = "secret";
  const mockPage1 = {
    setUserAgent: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockRejectedValue(new Error("Timeout")),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockPage2 = {
    setUserAgent: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn()
      .mockResolvedValueOnce(undefined) // scroll
      .mockResolvedValueOnce(1)         // count
      .mockResolvedValueOnce(undefined) // scroll
      .mockResolvedValueOnce(1)         // count (same = stop)
      .mockResolvedValue([{ tweetId: "111", likes: 5 }]), // extract
  };
  const mockNewPageFn = vi.fn()
    .mockResolvedValueOnce(mockPage1)
    .mockResolvedValueOnce(mockPage2);
  mockLaunch.mockResolvedValue({
    newPage: mockNewPageFn,
    close: vi.fn().mockResolvedValue(undefined),
  });

  const { req, res } = createMockReqRes("Bearer secret");
  await handler(req, res);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(mockUpdateTweetLikes).toHaveBeenCalledWith("111", 5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/api/cron/refresh-metrics.test.ts`
Expected: FAIL

- [ ] **Step 3: Add retry loop and scroll pagination to refresh-metrics**

In `src/pages/api/cron/refresh-metrics.ts`:

1. Add constants at top:

```typescript
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3000;
const MAX_SCROLLS = 10;
const SCROLL_DELAY_MS = 2000;
```

2. Wrap the page logic in a retry loop similar to `scrape-tweets.ts`
3. Add scroll loop before the `page.evaluate` extraction (same pattern as Task 4)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/api/cron/refresh-metrics.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/cron/refresh-metrics.ts src/pages/api/cron/refresh-metrics.test.ts
git commit -m "feat: add retry logic and scroll pagination to refresh-metrics"
```

---

### Task 6: Log warning on missing CRON_SECRET

**Files:**
- Modify: `src/pages/api/cron/scrape-tweets.ts`
- Modify: `src/pages/api/cron/refresh-metrics.ts`

- [ ] **Step 1: Add console.error before 401 returns**

In both cron handlers, before the `return res.status(401)` line, add:

```typescript
if (!secret) {
  console.error("[CRON] CRON_SECRET env var is not set — cron job cannot authenticate");
}
```

- [ ] **Step 2: Run existing tests to verify no regressions**

Run: `npx vitest run src/pages/api/cron/`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/cron/scrape-tweets.ts src/pages/api/cron/refresh-metrics.ts
git commit -m "fix: log error when CRON_SECRET env var is missing"
```

---

### Task 7: Update stale user-agent string

**Files:**
- Modify: `src/pages/api/cron/scrape-tweets.ts`
- Modify: `src/pages/api/cron/refresh-metrics.ts`

- [ ] **Step 1: Update user-agent in both files**

Replace `Chrome/120.0.0.0` with `Chrome/131.0.0.0` in both:
- `src/pages/api/cron/scrape-tweets.ts:51`
- `src/pages/api/cron/refresh-metrics.ts:28`

Full string: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36`

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/pages/api/cron/`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/cron/scrape-tweets.ts src/pages/api/cron/refresh-metrics.ts
git commit -m "fix: update scraper user-agent to Chrome 131"
```

---

### Task 7b: Deduplicate scraper logic (Finding 10)

**Files:**
- Modify: `src/pages/api/cron/scrape-tweets.ts` — use `page.addScriptTag` or `page.exposeFunction` to inject shared parsing
- Modify: `src/lib/scraper-utils.ts` — export a serializable version of the parsing logic

The `page.evaluate()` callback in `scrape-tweets.ts` (lines 70-171) duplicates the parsing logic from `scraper-utils.ts`. The file header explicitly warns about this.

**Note:** This is inherently tricky because `page.evaluate` runs in browser context and cannot import Node modules. The pragmatic approach is:

- [ ] **Step 1: Extract the `page.evaluate` callback into a named function in scraper-utils**

In `src/lib/scraper-utils.ts`, export a function that returns the evaluate callback as a string:

```typescript
export function getEvaluateScript(): string {
  // This returns the IIFE string that will be injected via page.addScriptTag
  return `window.__parseTweets = ${parseTweetsBrowserFn.toString()}`;
}
```

Alternatively, the simpler approach: keep the duplication but add a shared test that runs both paths against the same HTML fixture to ensure they stay in sync. Add a test in `src/lib/scraper-utils.test.ts` that validates the parsing logic, and document that the `page.evaluate` must match.

- [ ] **Step 2: Add a sync-check comment with the exact lines to keep in sync**

At minimum, update the comment in `scraper-utils.ts` to reference the exact line range in `scrape-tweets.ts` and vice versa, so changes are less likely to drift.

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/scraper-utils.ts src/pages/api/cron/scrape-tweets.ts
git commit -m "docs: improve sync markers between scraper-utils and page.evaluate logic"
```

---

## Chunk 3: Security & Ops (P1 — Findings 2, 3, 4)

### Task 8: Remove `initDb()` from cron handler

**Files:**
- Modify: `src/pages/api/cron/scrape-tweets.ts` — remove `initDb()` call
- Test: `src/pages/api/cron/scrape-tweets.test.ts` — update test

- [ ] **Step 1: Remove `initDb()` call from handler**

In `src/pages/api/cron/scrape-tweets.ts`, remove line 218:

```typescript
await initDb();
```

Also remove the `initDb` import from line 4.

- [ ] **Step 2: Update test that checks initDb is called**

In `src/pages/api/cron/scrape-tweets.test.ts`, update the test "calls initDb before processing tweets" — either remove it or change it to verify `initDb` is NOT called:

```typescript
it("does not call initDb during cron run", async () => {
  // ... same setup ...
  expect(mockInitDb).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/pages/api/cron/scrape-tweets.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/cron/scrape-tweets.ts src/pages/api/cron/scrape-tweets.test.ts
git commit -m "fix: remove DDL initDb() call from cron handler"
```

---

### Task 9: Add rate limiting to /api/tweets

**Files:**
- Create: `src/lib/rate-limit.ts`
- Create: `src/lib/rate-limit.test.ts`
- Modify: `src/pages/api/tweets.ts`
- Test: `src/pages/api/tweets.test.ts`

- [ ] **Step 1: Write failing test for rate limiter**

Create `src/lib/rate-limit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { rateLimit } from "./rate-limit";

beforeEach(() => {
  vi.useFakeTimers();
});

describe("rateLimit", () => {
  it("allows requests under the limit", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 3 });
    expect(limiter("127.0.0.1").allowed).toBe(true);
    expect(limiter("127.0.0.1").allowed).toBe(true);
    expect(limiter("127.0.0.1").allowed).toBe(true);
  });

  it("blocks requests over the limit", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 2 });
    limiter("127.0.0.1");
    limiter("127.0.0.1");
    expect(limiter("127.0.0.1").allowed).toBe(false);
  });

  it("resets after window expires", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 1 });
    limiter("127.0.0.1");
    expect(limiter("127.0.0.1").allowed).toBe(false);
    vi.advanceTimersByTime(60001);
    expect(limiter("127.0.0.1").allowed).toBe(true);
  });

  it("tracks IPs independently", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 1 });
    limiter("1.1.1.1");
    expect(limiter("2.2.2.2").allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/rate-limit.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement rate limiter**

Create `src/lib/rate-limit.ts`:

```typescript
interface RateLimitConfig {
  windowMs: number;
  max: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export function rateLimit({ windowMs, max }: RateLimitConfig) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function check(ip: string): RateLimitResult {
    const now = Date.now();
    const entry = hits.get(ip);

    // Prune expired entries periodically (every 100 checks)
    if (hits.size > 100) {
      for (const [key, val] of hits) {
        if (now > val.resetAt) hits.delete(key);
      }
    }

    if (!entry || now > entry.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: max - 1 };
    }

    entry.count++;
    if (entry.count > max) {
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: max - entry.count };
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/rate-limit.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Wire rate limiter into tweets API**

In `src/pages/api/tweets.ts`, add at top:

```typescript
import { rateLimit } from "@/lib/rate-limit";

const checkRateLimit = rateLimit({ windowMs: 60_000, max: 60 });
```

At the start of the handler, before method check:

```typescript
const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
  || req.socket?.remoteAddress
  || "unknown";
const { allowed, remaining } = checkRateLimit(ip);
if (!allowed) {
  res.setHeader("Retry-After", "60");
  return res.status(429).json({ error: "Too many requests" });
}
res.setHeader("X-RateLimit-Remaining", String(remaining));
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/rate-limit.ts src/lib/rate-limit.test.ts src/pages/api/tweets.ts
git commit -m "feat: add in-memory rate limiting to /api/tweets (60 req/min/IP)"
```

---

### Task 10: Move hardcoded email to env var

**Files:**
- Modify: `src/lib/email.ts`
- Test: `src/lib/email.test.ts`

- [ ] **Step 1: Write test for env var usage**

In `src/lib/email.test.ts`, add:

```typescript
it("uses ALERT_EMAIL env var when set", async () => {
  process.env.ALERT_EMAIL = "custom@example.com";
  mockSend.mockResolvedValue({ id: "456" });

  await sendAlert("Test", "Body");

  expect(mockSend).toHaveBeenCalledWith(
    expect.objectContaining({ to: "custom@example.com" })
  );

  delete process.env.ALERT_EMAIL;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/email.test.ts`
Expected: FAIL

- [ ] **Step 3: Update email.ts**

```typescript
const ALERT_TO = process.env.ALERT_EMAIL || "kj@kj.ventures";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/email.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts src/lib/email.test.ts
git commit -m "fix: move alert email to ALERT_EMAIL env var with fallback"
```

---

## Chunk 4: Code Quality Quick Wins (P2 — Findings 6, 7, 15, 16, 17, 18, 29, 30, 33)

### Task 11: Fix heading hierarchy (h1 → h2)

**Files:**
- Modify: `src/pages/index.tsx`

- [ ] **Step 1: Change "The Archive" from h1 to h2**

In `src/pages/index.tsx`, change line 145:

```typescript
component="h2"
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.tsx
git commit -m "fix: change subtitle to h2 for proper heading hierarchy"
```

---

### Task 12: Delete dead code (Home.module.css, tweetExists)

**Files:**
- Delete: `src/styles/Home.module.css`
- Modify: `src/lib/db.ts` — remove `tweetExists`
- Modify: `src/lib/db.test.ts` — remove `tweetExists` tests
- Modify: `src/pages/api/cron/scrape-tweets.test.ts` — remove `tweetExists` mock

- [ ] **Step 1: Delete Home.module.css**

```bash
rm src/styles/Home.module.css
```

- [ ] **Step 2: Remove `tweetExists` from db.ts**

Remove the function (lines 141-146) and its export. Also remove `tweetExists` from the import on line 9 of `src/lib/db.test.ts`.

- [ ] **Step 3: Remove `tweetExists` tests from db.test.ts**

Remove the entire `describe("tweetExists")` block.

- [ ] **Step 4: Remove `tweetExists` mock from scrape-tweets.test.ts**

Remove `mockTweetExists` from the hoisted mocks and all `mockTweetExists.mockResolvedValue(...)` calls in the test file. Also remove it from the `vi.mock("@/lib/db")` return object.

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove dead code (Home.module.css, tweetExists)"
```

---

### Task 13: Remove Tailwind and fix CSS conflicts

**Files:**
- Modify: `src/styles/globals.css` — remove `@tailwind` directives
- Modify: `package.json` — remove Tailwind + related deps

- [ ] **Step 1: Remove @tailwind directives from globals.css**

Remove the first 3 lines from `src/styles/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 2: Uninstall Tailwind and related packages**

```bash
npm uninstall tailwindcss @tailwindcss/postcss autoprefixer postcss
```

- [ ] **Step 3: Run build to verify nothing breaks**

```bash
npx next build
```

Expected: Build succeeds (Tailwind was never actually used for styling)

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove unused Tailwind CSS and fix MUI CssBaseline conflict"
```

---

### Task 14: Remove ghost/unused ESLint deps

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Uninstall unused ESLint packages**

```bash
npm uninstall eslint-plugin-next eslint-config-next
```

- [ ] **Step 2: Run lint to verify nothing breaks**

```bash
npx eslint src/ --max-warnings=999
```

Expected: Lint runs successfully (these packages weren't imported in `eslint.config.mjs`)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove unused eslint-plugin-next and eslint-config-next"
```

---

### Task 15: Fix theme context re-render issue

**Files:**
- Modify: `src/lib/theme-context.tsx`
- Test: `src/lib/theme-context.test.tsx`

- [ ] **Step 1: Wrap `toggleColorMode` in `useCallback` and `value` in `useMemo`**

In `src/lib/theme-context.tsx`:

1. Add `useCallback` to the import (line 1):

```typescript
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
```

2. Wrap `toggleColorMode` (replace lines 97-105):

```typescript
const toggleColorMode = useCallback(() => {
  setColorMode((prevMode) => {
    const newMode = prevMode === "light" ? "dark" : "light";
    if (typeof window !== "undefined") {
      localStorage.setItem("colorMode", newMode);
    }
    return newMode;
  });
}, []);
```

3. Wrap `value` in `useMemo` (replace lines 111-115):

```typescript
const value = useMemo(() => ({
  colorMode,
  toggleColorMode,
  theme,
}), [colorMode, toggleColorMode, theme]);
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/lib/theme-context.test.tsx`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/theme-context.tsx
git commit -m "perf: memoize theme context value to prevent unnecessary re-renders"
```

---

### Task 16: Fix upsert to sync edited tweets

**Files:**
- Modify: `src/lib/db.ts`
- Test: `src/lib/db.test.ts`

- [ ] **Step 1: Write test for upsert updating message and title**

In `src/lib/db.test.ts`, add to the `insertTweet` describe:

```typescript
it("upsert updates message and title on conflict", async () => {
  mockSql.mockResolvedValue({});
  await insertTweet({
    x_tweet_id: "111",
    title: "Updated title",
    message: "Updated message",
    likes: 10,
  });
  expect(mockSql).toHaveBeenCalled();
  // Verify the SQL includes message and title in the ON CONFLICT clause
  const call = mockSql.mock.calls[mockSql.mock.calls.length - 1];
  const sqlString = JSON.stringify(call);
  expect(sqlString).toContain("Updated title");
  expect(sqlString).toContain("Updated message");
});
```

- [ ] **Step 2: Update the ON CONFLICT clause**

In `src/lib/db.ts`, line 133, change:

```typescript
ON CONFLICT (x_tweet_id) DO UPDATE SET likes = EXCLUDED.likes
```

To:

```typescript
ON CONFLICT (x_tweet_id) DO UPDATE SET
  likes = EXCLUDED.likes,
  message = EXCLUDED.message,
  title = EXCLUDED.title
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/lib/db.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "fix: upsert now syncs edited tweet text and title on conflict"
```

---

## Chunk 5: Frontend Resilience (P2 — Findings 11, 22)

### Task 17: Add error state and response validation

**Files:**
- Modify: `src/pages/index.tsx` — add error state, check `res.ok`
- Modify: `src/components/TweetList.tsx` — add error UI

- [ ] **Step 1: Add error state to index.tsx**

In `src/pages/index.tsx`, add state:

```typescript
const [error, setError] = useState<string | null>(null);
```

- [ ] **Step 2: Update `loadTweets` to validate response**

```typescript
const res = await fetch(`/api/tweets?${params}`);
if (!res.ok) {
  throw new Error(`API error: ${res.status}`);
}
const data = await res.json();
setError(null);
```

In the catch block:

```typescript
} catch (error) {
  console.error("Error loading tweets:", error);
  setError("Failed to load tweets. Please try again.");
  if (!cursor) setTweets([]);
}
```

- [ ] **Step 3: Pass error and retry to TweetList**

```typescript
<TweetList
  tweets={searchResults ?? tweets}
  isLoading={isLoading}
  searchTerm={searchTerm}
  loadingMore={loadingMore}
  error={error}
  onRetry={() => { setError(null); loadTweets(); }}
/>
```

- [ ] **Step 4: Update TweetList to show error state**

In `src/components/TweetList.tsx`, update the interface:

```typescript
interface TweetListProps {
  tweets: TweetProps[];
  isLoading: boolean;
  searchTerm?: string;
  loadingMore?: boolean;
  error?: string | null;
  onRetry?: () => void;
}
```

Add error render between `isLoading` and `tweets.length === 0` checks:

```typescript
if (error) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "50vh",
        gap: 2,
      }}
    >
      <MonoTypography variant="h6">Something went wrong</MonoTypography>
      <MonoTypography variant="body2" color="text.secondary">{error}</MonoTypography>
      {onRetry && (
        <Box
          component="button"
          onClick={onRetry}
          sx={{
            fontFamily: '"Roboto Mono", monospace',
            padding: "8px 24px",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            background: "transparent",
            color: "text.primary",
            cursor: "pointer",
            "&:hover": { opacity: 0.7 },
          }}
        >
          Try Again
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 5: Update TweetList tests**

Add test for error state rendering in `src/components/TweetList.test.tsx`.

- [ ] **Step 6: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/pages/index.tsx src/components/TweetList.tsx src/components/TweetList.test.tsx
git commit -m "feat: add error state with retry button and validate API responses"
```

---

## Chunk 6: SEO & Performance (P2 — Findings 23, 24)

### Task 18: Add robots.txt and sitemap

**Files:**
- Create: `public/robots.txt`

- [ ] **Step 1: Create robots.txt**

Create `public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://kjtweets.com/sitemap.xml
```

- [ ] **Step 2: Commit**

```bash
git add public/robots.txt
git commit -m "feat: add robots.txt for SEO"
```

---

### Task 19: Switch to next/font for Roboto Mono

**Files:**
- Modify: `src/pages/_app.tsx` — import and apply next/font
- Modify: `src/pages/index.tsx` — remove Google Fonts `<link>`

- [ ] **Step 1: Add next/font to _app.tsx**

In `src/pages/_app.tsx`:

```typescript
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ThemeProvider } from "@/lib/theme-context";
import { Roboto_Mono } from "next/font/google";

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-roboto-mono",
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={robotoMono.variable}>
      <ThemeProvider>
        <Component {...pageProps} />
      </ThemeProvider>
    </div>
  );
}
```

- [ ] **Step 2: Remove Google Fonts `<link>` from index.tsx**

Remove lines 110-113 from `src/pages/index.tsx`:

```html
<link
  href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
```

- [ ] **Step 3: Update globals.css to use the CSS variable**

In `src/styles/globals.css`, update the body font-family:

```css
body {
  font-family: var(--font-roboto-mono), "Roboto Mono", "Courier New", monospace;
```

- [ ] **Step 4: Run build to verify**

```bash
npx next build
```

Expected: Build succeeds, font is self-hosted

- [ ] **Step 5: Commit**

```bash
git add src/pages/_app.tsx src/pages/index.tsx src/styles/globals.css
git commit -m "perf: switch to next/font for self-hosted Roboto Mono (zero layout shift)"
```

---

## Chunk 7: P3 Remaining Items (Findings 13, 20, 25, 26, 27, 31, 32)

### Task 20: Add infinite scroll dedup guard

**Files:**
- Modify: `src/pages/index.tsx`

- [ ] **Step 1: Add ref-based loading guard**

In `src/pages/index.tsx`, add:

```typescript
const loadingRef = useRef(false);
```

Update `loadTweets`:

```typescript
const loadTweets = useCallback(async (cursor?: string) => {
  if (cursor && loadingRef.current) return;
  loadingRef.current = true;
  // ... existing logic ...
  finally {
    setIsLoading(false);
    setLoadingMore(false);
    loadingRef.current = false;
  }
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.tsx
git commit -m "fix: add ref guard to prevent duplicate infinite scroll fetches"
```

---

### Task 21: Migrate deprecated InputProps to slotProps (Finding 20)

**Note:** Task 3 rewrites SearchBar significantly. When implementing the rewrite in Task 3, use `slotProps.input` instead of the deprecated `InputProps` from the start. This task exists as a reminder — if Task 3 was already done with `InputProps`, update it here.

**Files:**
- Modify: `src/components/SearchBar.tsx`

- [ ] **Step 1: Verify SearchBar uses `slotProps.input` (not `InputProps`)**

If Task 3's rewrite still uses `InputProps`, replace with:

```typescript
slotProps={{
  input: {
    startAdornment: ( ... ),
    endAdornment: ( ... ),
    sx: { ... },
  },
}}
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/components/SearchBar.test.tsx`
Expected: All tests PASS

- [ ] **Step 3: Commit (only if changes were needed)**

```bash
git add src/components/SearchBar.tsx
git commit -m "fix: migrate deprecated MUI InputProps to slotProps.input"
```

---

### Task 22: Add tweet count to API and header

**Files:**
- Modify: `src/lib/db.ts` — add `getTweetCount` function
- Modify: `src/pages/api/tweets.ts` — add `totalCount` to response
- Modify: `src/pages/index.tsx` — display count in header
- Test: `src/lib/db.test.ts`

- [ ] **Step 1: Write test for getTweetCount**

```typescript
describe("getTweetCount", () => {
  it("returns the count from SQL", async () => {
    mockSql.mockResolvedValue({ rows: [{ count: "42" }] });
    const count = await getTweetCount();
    expect(count).toBe(42);
  });
});
```

- [ ] **Step 2: Implement getTweetCount**

In `src/lib/db.ts`:

```typescript
export async function getTweetCount(): Promise<number> {
  const { rows } = await sql`SELECT COUNT(*) as count FROM tweets`;
  return parseInt(rows[0].count, 10);
}
```

- [ ] **Step 3: Add totalCount to tweets API response**

In `src/pages/api/tweets.ts`, import `getTweetCount` and add to the response:

```typescript
const [result, totalCount] = await Promise.all([
  getTweetsPaginated(cursor, limit, sort, q),
  !cursor ? getTweetCount() : Promise.resolve(undefined),
]);

return res.status(200).json({ ...result, totalCount });
```

- [ ] **Step 4: Display count in header**

In `src/pages/index.tsx`, add state and display:

```typescript
const [totalCount, setTotalCount] = useState<number | null>(null);
```

Update `loadTweets` to capture count from first page:

```typescript
if (data.totalCount !== undefined) setTotalCount(data.totalCount);
```

Display below "The Archive":

```typescript
{totalCount !== null && (
  <Typography variant="body2" color="text.secondary" textAlign="center" fontFamily='"Roboto Mono", monospace'>
    {totalCount.toLocaleString()} tweets archived
  </Typography>
)}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts src/pages/api/tweets.ts src/pages/index.tsx
git commit -m "feat: display total tweet count in archive header"
```

---

### Task 23: Add keyboard shortcut for search

**Files:**
- Modify: `src/components/SearchBar.tsx`

- [ ] **Step 1: Add ref and keyboard listener**

In `SearchBar`, add a `ref` to the `TextField` and a `useEffect`:

```typescript
const inputRef = useRef<HTMLInputElement>(null);

useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      inputRef.current?.focus();
    }
    if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
      e.preventDefault();
      inputRef.current?.focus();
    }
  };
  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, []);
```

Add `inputRef={inputRef}` to the `TextField`.

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/SearchBar.tsx
git commit -m "feat: add Ctrl+K and / keyboard shortcuts to focus search"
```

---

### Task 24: Preload avatar image

**Files:**
- Modify: `src/pages/_document.tsx`

- [ ] **Step 1: Add preload link**

In `src/pages/_document.tsx`, inside the `<Head>`:

```typescript
<link rel="preload" as="image" href="/kj.jpg" />
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/_document.tsx
git commit -m "perf: preload avatar image to avoid per-card fetch delay"
```

---

### Task 25: Move GA ID to env var

**Files:**
- Modify: `src/pages/index.tsx`

- [ ] **Step 1: Replace hardcoded GA ID**

In `src/pages/index.tsx`, change:

```typescript
<GoogleAnalytics gaId="G-TQ17DS73DL" />
```

To:

```typescript
{process.env.NEXT_PUBLIC_GA_ID && <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/index.tsx
git commit -m "fix: move Google Analytics ID to NEXT_PUBLIC_GA_ID env var"
```

---

### Task 26: Add React error boundary

**Files:**
- Create: `src/components/ErrorBoundary.tsx`
- Modify: `src/pages/_app.tsx`

- [ ] **Step 1: Create ErrorBoundary component**

Create `src/components/ErrorBoundary.tsx`.

**Important:** The ErrorBoundary wraps ThemeProvider in `_app.tsx`, so its fallback UI must NOT use MUI components (they need ThemeProvider to be active). Use plain HTML + inline styles:

```typescript
import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          gap: "16px",
          fontFamily: '"Roboto Mono", "Courier New", monospace',
        }}>
          <h2 style={{ margin: 0 }}>Something went wrong</h2>
          <p style={{ margin: 0, color: "#666" }}>
            Please refresh the page to try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              fontFamily: "inherit",
              padding: "8px 24px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              background: "transparent",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Refresh
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

- [ ] **Step 2: Wrap app in ErrorBoundary**

In `src/pages/_app.tsx`, import and wrap:

```typescript
import ErrorBoundary from "@/components/ErrorBoundary";

// In the render:
<ErrorBoundary>
  <ThemeProvider>
    <Component {...pageProps} />
  </ThemeProvider>
</ErrorBoundary>
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/ErrorBoundary.tsx src/pages/_app.tsx
git commit -m "feat: add React error boundary for graceful crash recovery"
```

---

### Task 27: Strengthen weak DB test assertions (Finding 19)

**Files:**
- Modify: `src/lib/db.test.ts`

- [ ] **Step 1: Update initDb test to verify SQL calls**

Replace `expect(mockSql).toHaveBeenCalled()` with checks that verify the number of calls (initDb makes 4 SQL calls: CREATE TABLE, CREATE INDEX x2, ALTER TABLE):

```typescript
it("calls sql with CREATE TABLE and indexes", async () => {
  mockSql.mockResolvedValue({});
  await initDb();
  expect(mockSql).toHaveBeenCalledTimes(4);
});
```

- [ ] **Step 2: Update insertTweet tests to verify params**

For the "calls sql with correct values" test, add assertions on the interpolated values:

```typescript
const call = mockSql.mock.calls[mockSql.mock.calls.length - 1];
expect(JSON.stringify(call)).toContain("111");
expect(JSON.stringify(call)).toContain("Test message");
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/lib/db.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.test.ts
git commit -m "test: strengthen DB test assertions to verify SQL params"
```

---

### Task 28: Add favicon in multiple formats (Finding 28)

**Files:**
- Modify: `src/pages/_document.tsx` — add apple-touch-icon and manifest links

- [ ] **Step 1: Add favicon meta tags**

Since we don't have tooling to generate favicon.ico from jpg in this context, add the best available links in `_document.tsx` Head:

```typescript
<link rel="icon" href="/kj.jpg" type="image/jpeg" />
<link rel="apple-touch-icon" href="/kj.jpg" />
```

And remove the favicon link from `index.tsx` (line 109) since `_document.tsx` is the correct place for it.

- [ ] **Step 2: Commit**

```bash
git add src/pages/_document.tsx src/pages/index.tsx
git commit -m "fix: move favicon to _document and add apple-touch-icon"
```

---

### Task 29: Final test run and verification

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: All tests PASS

- [ ] **Step 2: Run build**

```bash
npx next build
```

Expected: Build succeeds with no errors

- [ ] **Step 3: Run lint**

```bash
npx eslint src/ --max-warnings=999
```

Expected: No errors
