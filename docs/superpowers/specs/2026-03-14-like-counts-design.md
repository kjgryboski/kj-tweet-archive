# Like Counts Design — kj-tweet-archive

**Date:** 2026-03-14
**Status:** Draft

## Overview

Add like count tracking to tweets. Scraper captures likes on new tweets, a weekly cron refreshes counts for visible tweets. Like counts displayed on tweet cards and available as a sort option.

## DB Changes

Add `likes` column to `tweets` table:

```sql
ALTER TABLE tweets ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
```

Added to `initDb()` as a migration after the CREATE TABLE statement.

## Scraper Changes

### ScrapedTweet interface

Add `likes: number` to `ScrapedTweet` in `scraper-utils.ts`:

```ts
export interface ScrapedTweet {
  tweetId: string;
  text: string;
  timestamp: string;
  url: string;
  likes: number;
}
```

### Like count extraction

The `page.evaluate` callback and `parseTweetElements` both extract like counts from tweet elements. X renders like counts in elements near `data-testid="like"` with an `aria-label` like "42 Likes" or the text content of a nearby span.

Extraction strategy (inside the tweet element):
1. Find element with `data-testid="like"` (or fallback `[aria-label*="Like"]`)
2. Parse the numeric value from `aria-label` (e.g., "42 Likes" → 42) or from the text content of child spans
3. Default to 0 if not found or unparseable

### Like selectors

Add to `scraper-selectors.ts`:
```ts
likeButton: ['[data-testid="like"]', '[aria-label*="Like"]'],
```

This follows the existing fallback-selector pattern and enables degradation detection for like count extraction.

### Dual-maintenance note

Like extraction logic must be added to BOTH `parseTweetElements` in `scraper-utils.ts` (testable copy) and the inline `page.evaluate` callback in `scrape-tweets.ts` (browser context). Same constraint as existing tweet parsing — see header comment in `scraper-utils.ts`.

### insertTweet update

Add `likes` field to the insert function:

```ts
await sql`
  INSERT INTO tweets (x_tweet_id, title, message, x_link, username, name, created_at, likes)
  VALUES (..., ${tweet.likes || 0})
  ON CONFLICT (x_tweet_id) DO UPDATE SET likes = EXCLUDED.likes
`;
```

Uses `DO UPDATE SET likes` so the scraper opportunistically updates like counts for tweets it re-encounters, keeping counts fresher between weekly refreshes.

## Weekly Metrics Refresh

### Endpoint: `/api/cron/refresh-metrics`

New cron endpoint that:
1. Authenticates with `CRON_SECRET` (same as scraper)
2. Launches Puppeteer, navigates to the X profile
3. Extracts tweet IDs + like counts for visible tweets (no scrolling — covers the ~20-30 most recent tweets on the profile page, which is sufficient since these are the tweets most likely to have changing like counts)
4. Updates existing DB rows: `UPDATE tweets SET likes = $likes WHERE x_tweet_id = $id`
5. Returns `{ success: true, updated: N }`

### Vercel cron config

Add to `vercel.json`:
```json
{
  "path": "/api/cron/refresh-metrics",
  "schedule": "0 0 * * 0"
}
```
Runs weekly on Sunday at midnight UTC.

### DB function

New `updateTweetLikes(x_tweet_id: string, likes: number)` in `db.ts`:

```sql
UPDATE tweets SET likes = ${likes} WHERE x_tweet_id = ${x_tweet_id}
```

## API Changes

### Sort option

`getTweetsPaginated` accepts `sort: "newest" | "oldest" | "likes"`:

- `likes` sort: `ORDER BY likes DESC, id DESC`
- Cursor comparison for likes: `WHERE (likes, id) < (SELECT likes, id FROM tweets WHERE x_tweet_id = $cursor)`

**Note:** An index `CREATE INDEX IF NOT EXISTS idx_tweets_likes_id ON tweets(likes DESC, id DESC)` supports the likes sort. Added to `initDb()`.

### TweetProps

Add `likes: number` to the `TweetProps` interface in `Tweet.tsx`. The row-to-TweetProps mapping in `db.ts` includes `likes: row.likes || 0`.

## Frontend Changes

### Tweet card

Display like count on each tweet card with a heart icon and number. Small, muted text below the tweet body or in the header area. Uses MUI's `FavoriteBorderIcon` (outlined heart).

```tsx
<Box sx={{ display: "flex", alignItems: "center", mt: "auto", pt: 1 }}>
  <FavoriteBorderIcon sx={{ fontSize: 16, mr: 0.5, color: "text.secondary" }} />
  <Typography variant="caption" color="text.secondary" fontFamily='"Roboto Mono", monospace'>
    {likes}
  </Typography>
</Box>
```

### Sort toggle

Add "Likes" as third option in the existing `ToggleButtonGroup`:

```tsx
<ToggleButton value="likes">Likes</ToggleButton>
```

Sort state type changes from `"newest" | "oldest"` to `"newest" | "oldest" | "likes"`.

### Sort validation in tweets.ts

The current sort validation:
```ts
const sort = (req.query.sort as string) === "oldest" ? "oldest" : "newest";
```
Changes to:
```ts
const sortParam = req.query.sort as string;
const sort = (["newest", "oldest", "likes"] as const).includes(sortParam as any)
  ? (sortParam as "newest" | "oldest" | "likes")
  : "newest";
```

### getTweets() update

The existing `getTweets()` function (used by the scraper) is updated to include `likes: row.likes || 0` in its row mapping for consistency. No other changes needed.

## Files Changed

```
src/
  lib/
    db.ts                    # ADD likes column migration, updateTweetLikes, likes sort, likes index
    db.test.ts               # ADD 2 tests (updateTweetLikes, likes sort)
    scraper-utils.ts         # UPDATE ScrapedTweet interface + parseTweetElements for likes
    scraper-utils.test.ts    # UPDATE fixture to include likes
  pages/
    api/
      tweets.ts              # UPDATE sort param accepts "likes"
      tweets.test.ts         # ADD 1 test (likes sort passthrough)
      cron/
        scrape-tweets.ts     # UPDATE page.evaluate to extract likes
        refresh-metrics.ts   # NEW — weekly likes refresh endpoint
        refresh-metrics.test.ts # NEW — 1 test
    index.tsx                # UPDATE sort toggle with "Likes" option
  components/
    Tweet.tsx                # UPDATE add likes display
    Tweet.test.tsx           # ADD 1 test (renders like count)
```

## Dependencies

None new — uses existing Puppeteer + Chromium + MUI.

## Test Plan

| Test | File | Description |
|------|------|-------------|
| updateTweetLikes updates likes column | db.test.ts | Calls sql with correct UPDATE |
| getTweetsPaginated respects sort=likes | db.test.ts | Verify sql called with likes sort |
| getTweets includes likes in mapping | db.test.ts | likes: row.likes returned |
| Passes sort=likes to getTweetsPaginated | tweets.test.ts | sort query param passed through |
| parseTweetElements extracts likes from DOM | scraper-utils.test.ts | Fixture with like element → likes parsed |
| refresh-metrics returns 401 without auth | refresh-metrics.test.ts | Auth check works |
| refresh-metrics updates likes for visible tweets | refresh-metrics.test.ts | Happy path — calls updateTweetLikes |
| Tweet renders like count | Tweet.test.tsx | Heart icon + number visible |

**Total new tests:** ~8
