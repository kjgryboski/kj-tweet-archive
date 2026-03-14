# Pagination Design — kj-tweet-archive

**Date:** 2026-03-14
**Status:** Draft

## Overview

Replace the current "load all tweets at once" pattern with cursor-based API pagination and infinite scroll via Intersection Observer. 30 tweets per batch.

## API Changes

### `/api/tweets` query params

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `cursor` | string (optional) | none | `x_tweet_id` of the last tweet from the previous page. Omit for first page. |
| `limit` | number (optional) | 30 | Max tweets per page. Capped at 100. |

### Response shape

Changes from `TweetProps[]` to:

```json
{
  "tweets": [...],
  "hasMore": true,
  "nextCursor": "last_tweet_x_id"
}
```

`nextCursor` is the `x_tweet_id` (or fallback `id`) of the last tweet in the returned batch. `hasMore` is true when more tweets exist beyond the current batch.

### DB query changes (`db.ts`)

New function `getTweetsPaginated(cursor?, limit)` alongside existing `getTweets()` (kept for backward compatibility with scraper).

```sql
-- First page (no cursor):
SELECT * FROM tweets ORDER BY created_at DESC, id DESC LIMIT $limit + 1

-- Subsequent pages (composite cursor avoids duplicate-timestamp skipping):
SELECT * FROM tweets
WHERE (created_at, id) < (
  SELECT created_at, id FROM tweets WHERE x_tweet_id = $cursor
)
ORDER BY created_at DESC, id DESC LIMIT $limit + 1
```

Uses a composite cursor on `(created_at, id)` to handle tweets with identical timestamps. The `id` column (SERIAL) provides a guaranteed tiebreaker.

Fetches `limit + 1` rows to determine `hasMore`. If `limit + 1` rows returned, there's a next page — return only `limit` rows and set `hasMore: true`.

**Invalid cursor:** If the cursor `x_tweet_id` does not exist, the subquery returns no rows and the WHERE clause matches nothing. The API returns `{ tweets: [], hasMore: false, nextCursor: null }` — a graceful empty result rather than an error, since the cursor may have been valid when the client received it.

**Index:** Add a composite index to support the pagination query:
```sql
CREATE INDEX IF NOT EXISTS idx_tweets_created_at_id ON tweets(created_at DESC, id DESC);
```
This is added to `initDb()`.

**Limit validation:** Non-positive, non-numeric, or out-of-range limit values default to 30. Values above 100 are clamped to 100.

### Cache-Control

The existing `Cache-Control: public, s-maxage=21600, stale-while-revalidate=3600` header applies only to the first page (no cursor). Cursor-specific pages are not CDN-cached (they're only fetched once per session as the user scrolls).

## Frontend Changes

### `index.tsx`

- `loadTweets(cursor?)` — fetches `/api/tweets?limit=30` (first call) or `/api/tweets?cursor=X&limit=30` (subsequent calls)
- Appends new tweets to state instead of replacing
- Tracks `hasMore` and `nextCursor` in state
- Initial load unchanged (spinner, empty state)

### Intersection Observer

A sentinel `<div ref={sentinelRef}>` placed after the TweetList. When visible in the viewport, triggers `loadTweets(nextCursor)`. Disconnects when `hasMore` is false or a fetch is in progress.

### Loading states

| State | UI |
|-------|-----|
| Initial load | Existing spinner ("Loading tweets...") |
| Loading more | Small spinner below the tweet grid |
| All loaded | Sentinel removed, no more fetches |
| Error | Existing error handling (console.error, empty state) |

### TweetList changes

- New `loadingMore` prop — renders a bottom spinner when true
- TweetList remains a pure presentation component — no scroll logic inside it

### Sentinel placement

The Intersection Observer sentinel `<div>` lives in `index.tsx`, placed after `<TweetList>` (not inside it). This keeps scroll-loading concerns out of the presentation component.

### Search

Searches only currently loaded tweets. No change to SearchBar component. As the user scrolls and loads more tweets, those become searchable too.

**Limitation:** Users who search before scrolling will get incomplete results. The result count display ("X of Y results") naturally communicates that only loaded tweets are searched. Server-side search is a potential follow-up but out of scope for this change.

## Files Changed

```
src/
  lib/
    db.ts              # ADD getTweetsPaginated()
    db.test.ts         # ADD 3 new tests
  pages/
    api/
      tweets.ts        # UPDATE to use getTweetsPaginated, parse query params
      tweets.test.ts   # ADD 2 new tests
    index.tsx          # UPDATE loadTweets, add Intersection Observer, state changes
  components/
    TweetList.tsx      # UPDATE add loadingMore + sentinelRef props
```

## Test Plan

### db.test.ts (~3 new tests)

| Test | Description |
|------|-------------|
| getTweetsPaginated returns limited results | No cursor, limit=5 → returns 5 tweets max |
| getTweetsPaginated with cursor returns next page | Cursor provided → returns tweets after cursor |
| getTweetsPaginated sets hasMore correctly | limit+1 rows → hasMore true; fewer → hasMore false |

### tweets.test.ts (~2 new tests)

| Test | Description |
|------|-------------|
| Returns paginated response shape | Response has `tweets`, `hasMore`, `nextCursor` fields |
| Respects cursor and limit query params | Passes params through to getTweetsPaginated |

**Total new tests:** ~5
