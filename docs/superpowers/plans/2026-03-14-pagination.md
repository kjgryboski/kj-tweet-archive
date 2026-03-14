# Pagination Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "load all tweets" with cursor-based pagination and infinite scroll (30 tweets per batch).

**Architecture:** New `getTweetsPaginated()` in db.ts with composite cursor `(created_at, id)`. API route parses `cursor`/`limit` query params and returns `{tweets, hasMore, nextCursor}`. Frontend uses Intersection Observer sentinel after TweetList to trigger loading more batches.

**Tech Stack:** @vercel/postgres, Next.js Pages Router, React Intersection Observer (native API), MUI

**Spec:** `docs/superpowers/specs/2026-03-14-pagination-design.md`

---

## Chunk 1: Backend (DB + API)

### Task 1: Add getTweetsPaginated to db.ts + index + tests

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/db.test.ts`

- [ ] **Step 1: Add tests for getTweetsPaginated**

Add to `src/lib/db.test.ts`, after the existing `getTweets` describe block:

```ts
describe("getTweetsPaginated", () => {
  it("returns limited results with hasMore flag", async () => {
    // Simulate limit+1 rows returned (hasMore = true)
    const rows = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      x_tweet_id: String(100 + i),
      message: `Tweet ${i}`,
      title: `Title ${i}`,
      created_at: new Date(`2026-01-${15 - i}T12:00:00Z`),
      username: "KJFUTURES",
      name: "KJ",
      x_link: `https://x.com/KJFUTURES/status/${100 + i}`,
    }));
    mockSql.mockResolvedValue({ rows });

    const result = await getTweetsPaginated(undefined, 3);
    expect(result.tweets).toHaveLength(3); // returns limit, not limit+1
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("103"); // last tweet's x_tweet_id
  });

  it("returns all results when fewer than limit", async () => {
    const rows = [
      {
        id: 1,
        x_tweet_id: "200",
        message: "Only tweet",
        title: "Only",
        created_at: new Date("2026-01-15T12:00:00Z"),
        username: "KJFUTURES",
        name: "KJ",
        x_link: "https://x.com/KJFUTURES/status/200",
      },
    ];
    mockSql.mockResolvedValue({ rows });

    const result = await getTweetsPaginated(undefined, 3);
    expect(result.tweets).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("calls sql with cursor when provided", async () => {
    mockSql.mockResolvedValue({ rows: [] });

    await getTweetsPaginated("cursor123", 5);
    // Verify sql was called (with cursor subquery)
    expect(mockSql).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/db.test.ts`
Expected: FAIL — `getTweetsPaginated` is not exported.

- [ ] **Step 3: Implement getTweetsPaginated and add index to initDb**

Add to `src/lib/db.ts`:

1. Add the index to `initDb()` — after the CREATE TABLE statement, add:
```ts
await sql`
  CREATE INDEX IF NOT EXISTS idx_tweets_created_at_id ON tweets(created_at DESC, id DESC)
`;
```

2. Add the new function:
```ts
export interface PaginatedTweets {
  tweets: TweetProps[];
  hasMore: boolean;
  nextCursor: string | null;
}

export async function getTweetsPaginated(
  cursor?: string,
  limit: number = 30
): Promise<PaginatedTweets> {
  const safeLimit = Math.min(Math.max(1, limit || 30), 100);
  const fetchLimit = safeLimit + 1;

  let rows;
  if (cursor) {
    ({ rows } = await sql`
      SELECT * FROM tweets
      WHERE (created_at, id) < (
        SELECT created_at, id FROM tweets WHERE x_tweet_id = ${cursor}
      )
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

  const hasMore = rows.length > safeLimit;
  const resultRows = hasMore ? rows.slice(0, safeLimit) : rows;

  const tweets = resultRows.map((row) => ({
    id: row.x_tweet_id || String(row.id),
    text: row.message,
    title: row.title,
    createdAt: row.created_at?.toISOString() || new Date().toISOString(),
    username: row.username || "KJFUTURES",
    name: row.name || "KJ",
    xLink: row.x_link,
  }));

  const lastTweet = resultRows[resultRows.length - 1];
  const nextCursor = hasMore && lastTweet
    ? (lastTweet.x_tweet_id || String(lastTweet.id))
    : null;

  return { tweets, hasMore, nextCursor };
}
```

- [ ] **Step 4: Update import in db.test.ts**

Change the import line to include `getTweetsPaginated`:
```ts
import { initDb, getTweets, insertTweet, tweetExists, getTweetsPaginated } from "./db";
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/lib/db.test.ts`
Expected: All 11 tests pass (8 existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "feat: add getTweetsPaginated with composite cursor and index"
```

---

### Task 2: Update /api/tweets to use pagination

**Files:**
- Modify: `src/pages/api/tweets.ts`
- Modify: `src/pages/api/tweets.test.ts`

- [ ] **Step 1: Add pagination tests**

Add to `src/pages/api/tweets.test.ts`. First update the mock to include `getTweetsPaginated`:

```ts
vi.mock("@/lib/db", () => ({
  getTweets: vi.fn(),
  getTweetsPaginated: vi.fn(),
}));
```

Update the import:
```ts
import { getTweets, getTweetsPaginated } from "@/lib/db";
const mockGetTweetsPaginated = vi.mocked(getTweetsPaginated);
```

Add `mockGetTweetsPaginated.mockReset()` to beforeEach.

Update `createMockReqRes` to accept query params:
```ts
function createMockReqRes(method = "GET", query: Record<string, string> = {}) {
  const req = { method, query } as unknown as NextApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  } as unknown as NextApiResponse;
  return { req, res };
}
```

Add new tests:

```ts
it("returns paginated response shape", async () => {
  const paginatedResult = {
    tweets: [{ id: "1", text: "Hello", createdAt: "2026-01-01", username: "KJ", name: "KJ" }],
    hasMore: true,
    nextCursor: "1",
  };
  mockGetTweetsPaginated.mockResolvedValue(paginatedResult as any);

  const { req, res } = createMockReqRes("GET");
  await handler(req, res);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(paginatedResult);
});

it("passes cursor and limit query params to getTweetsPaginated", async () => {
  mockGetTweetsPaginated.mockResolvedValue({ tweets: [], hasMore: false, nextCursor: null } as any);

  const { req, res } = createMockReqRes("GET", { cursor: "abc123", limit: "15" });
  await handler(req, res);

  expect(mockGetTweetsPaginated).toHaveBeenCalledWith("abc123", 15);
});
```

- [ ] **Step 2: Update existing tests**

The existing "returns 200 with tweets" and "sets Cache-Control header" tests use `mockGetTweets`. These need updating since the handler will now call `getTweetsPaginated` instead of `getTweets`. Update them to mock `getTweetsPaginated`:

For "returns 200 with tweets":
```ts
it("returns 200 with tweets", async () => {
  const paginatedResult = {
    tweets: [{ id: "1", text: "Hello", createdAt: "2026-01-01", username: "KJ", name: "KJ" }],
    hasMore: false,
    nextCursor: null,
  };
  mockGetTweetsPaginated.mockResolvedValue(paginatedResult as any);

  const { req, res } = createMockReqRes("GET");
  await handler(req, res);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(paginatedResult);
});
```

For "sets Cache-Control header" — this should only set cache headers when there's no cursor:
```ts
it("sets Cache-Control header on first page (no cursor)", async () => {
  mockGetTweetsPaginated.mockResolvedValue({ tweets: [], hasMore: false, nextCursor: null } as any);

  const { req, res } = createMockReqRes("GET");
  await handler(req, res);

  expect(res.setHeader).toHaveBeenCalledWith(
    "Cache-Control",
    "public, s-maxage=21600, stale-while-revalidate=3600"
  );
});

it("does not set Cache-Control header on cursor pages", async () => {
  mockGetTweetsPaginated.mockResolvedValue({ tweets: [], hasMore: false, nextCursor: null } as any);

  const { req, res } = createMockReqRes("GET", { cursor: "abc" });
  await handler(req, res);

  expect(res.setHeader).not.toHaveBeenCalled();
});
```

For "returns 500 on database error" — update to use `mockGetTweetsPaginated`:
```ts
it("returns 500 on database error", async () => {
  mockGetTweetsPaginated.mockRejectedValue(new Error("DB error"));

  const { req, res } = createMockReqRes("GET");
  await handler(req, res);

  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith({ error: "Failed to fetch tweets" });
});
```

- [ ] **Step 3: Rewrite tweets.ts handler**

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getTweetsPaginated } from "@/lib/db";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 30;

    const result = await getTweetsPaginated(cursor, limit);

    // Only cache first page (no cursor) — CDN serves it for 6 hours
    if (!cursor) {
      res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=3600");
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching tweets:", error);
    return res.status(500).json({ error: "Failed to fetch tweets" });
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/pages/api/tweets.test.ts`
Expected: All 7 tests pass (3 updated + 4 new, minus the old cache test replaced by 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/tweets.ts src/pages/api/tweets.test.ts
git commit -m "feat: update tweets API for cursor-based pagination"
```

---

## Chunk 2: Frontend (Infinite Scroll)

### Task 3: Add loadingMore prop to TweetList

**Files:**
- Modify: `src/components/TweetList.tsx`
- Modify: `src/components/TweetList.test.tsx`

- [ ] **Step 1: Add test for loadingMore**

Add to the existing `TweetList` describe block in `src/components/TweetList.test.tsx`:

```ts
it("shows bottom spinner when loadingMore is true", () => {
  renderWithTheme(<TweetList tweets={mockTweets} isLoading={false} loadingMore={true} />);
  // The main tweet grid should render, plus a loading spinner at the bottom
  expect(screen.getByText("Tweet one")).toBeInTheDocument();
  expect(screen.getByText("Loading more...")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/TweetList.test.tsx`
Expected: FAIL — `loadingMore` prop not recognized / "Loading more..." not found.

- [ ] **Step 3: Update TweetList component**

In `src/components/TweetList.tsx`:

1. Add `loadingMore` to the interface:
```ts
interface TweetListProps {
  tweets: TweetProps[];
  isLoading: boolean;
  searchTerm?: string;
  loadingMore?: boolean;
}
```

2. Update the function signature:
```ts
export default function TweetList({ tweets, isLoading, searchTerm = "", loadingMore = false }: TweetListProps) {
```

3. Add a bottom spinner after the grid `</Box>` (inside the Container, after the grid Box closes):
```tsx
{loadingMore && (
  <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 4 }}>
    <CircularProgress size={20} sx={{ mr: 1 }} />
    <MonoTypography variant="body2">Loading more...</MonoTypography>
  </Box>
)}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/components/TweetList.test.tsx`
Expected: All 4 tests pass (3 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/components/TweetList.tsx src/components/TweetList.test.tsx
git commit -m "feat: add loadingMore prop to TweetList"
```

---

### Task 4: Update index.tsx with pagination and Intersection Observer

**Files:**
- Modify: `src/pages/index.tsx`

- [ ] **Step 1: Rewrite index.tsx**

Read the current file first, then apply these changes:

1. Add `useRef, useCallback` to React imports:
```ts
import { useState, useEffect, useRef, useCallback } from "react";
```

2. Add new state variables:
```ts
const [hasMore, setHasMore] = useState(true);
const [nextCursor, setNextCursor] = useState<string | null>(null);
const [loadingMore, setLoadingMore] = useState(false);
const sentinelRef = useRef<HTMLDivElement>(null);
```

3. Replace `loadTweets` with cursor-aware version:
```ts
const loadTweets = useCallback(async (cursor?: string) => {
  if (cursor) {
    setLoadingMore(true);
  } else {
    setIsLoading(true);
  }

  try {
    const params = new URLSearchParams({ limit: "30" });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`/api/tweets?${params}`);
    const data = await res.json();

    if (cursor) {
      setTweets((prev) => [...prev, ...data.tweets]);
    } else {
      setTweets(data.tweets);
    }
    setHasMore(data.hasMore);
    setNextCursor(data.nextCursor);
  } catch (error) {
    console.error("Error loading tweets:", error);
    if (!cursor) setTweets([]);
  } finally {
    setIsLoading(false);
    setLoadingMore(false);
  }
}, []);
```

4. Add Intersection Observer effect (after the initial load useEffect):
```ts
useEffect(() => {
  if (!sentinelRef.current || !hasMore || loadingMore || isLoading) return;

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && nextCursor) {
        loadTweets(nextCursor);
      }
    },
    { threshold: 0.1 }
  );

  observer.observe(sentinelRef.current);
  return () => observer.disconnect();
}, [hasMore, loadingMore, isLoading, nextCursor, loadTweets]);
```

5. Update the TweetList usage to pass `loadingMore`:
```tsx
<TweetList tweets={tweets} isLoading={isLoading} searchTerm={searchTerm} loadingMore={loadingMore} />
```

6. Add the sentinel div after TweetList (before BackToTop):
```tsx
{hasMore && !isLoading && <div ref={sentinelRef} style={{ height: 1 }} />}
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass. The index.tsx changes are not unit-tested (they're UI integration — the API and component layers are covered).

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.tsx
git commit -m "feat: add infinite scroll with Intersection Observer"
```

---

### Task 5: Full suite verification

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All ~66 tests pass, 0 failures.

- [ ] **Step 2: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve any remaining test issues"
```
