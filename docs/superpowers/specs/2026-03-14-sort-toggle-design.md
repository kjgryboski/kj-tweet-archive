# Sort Toggle Design — kj-tweet-archive

**Date:** 2026-03-14
**Status:** Draft

## Overview

Add a Newest/Oldest sort toggle below the search bar. Changing sort resets the tweet list and reloads from page 1 with the new order.

## UI

A `ToggleButtonGroup` (MUI) with two options: "Newest" (default) and "Oldest". Placed in its own row below the search bar, same container width. Monospace font matching the site style.

## API Changes

New `sort` query param on `/api/tweets`:

| Value | Behavior |
|-------|----------|
| `newest` (default) | `ORDER BY created_at DESC, id DESC` |
| `oldest` | `ORDER BY created_at ASC, id ASC` |

Invalid values default to `newest`.

## DB Changes

`getTweetsPaginated(cursor?, limit, sort)` accepts a `sort` parameter (`"newest" | "oldest"`, default `"newest"`).

- When `sort=oldest`, the ORDER BY flips to `ASC` and the cursor comparison flips from `<` to `>`.
- The composite cursor `(created_at, id)` tiebreaker direction matches the sort.

```sql
-- newest (default):
WHERE (created_at, id) < (SELECT ...) ORDER BY created_at DESC, id DESC

-- oldest:
WHERE (created_at, id) > (SELECT ...) ORDER BY created_at ASC, id ASC
```

## Frontend Flow

1. `sort` state in `index.tsx`, default `"newest"`
2. Clicking a toggle button sets sort, then calls a reset function:
   - Clears `tweets` to `[]`
   - Resets `nextCursor` to `null`
   - Sets `hasMore` to `true`
   - Sets `isLoading` to `true`
   - Fetches `/api/tweets?limit=30&sort=<value>`
3. Infinite scroll passes the current `sort` value on all subsequent fetches

**Note:** `sort` must be added to the `loadTweets` `useCallback` dependency array to avoid a stale closure.

## Cache-Control

CDN cache (`s-maxage=21600`) only applies when: no cursor AND sort is `newest` (the default). All other combinations skip cache headers.

## Files Changed

```
src/
  lib/
    db.ts              # UPDATE getTweetsPaginated to accept sort param
    db.test.ts         # ADD 1 test for oldest sort
  pages/
    api/
      tweets.ts        # UPDATE parse sort query param
      tweets.test.ts   # ADD 1 test for sort passthrough
    index.tsx          # ADD sort state, toggle buttons, reset on change
```

## Test Plan

| Test | File | Description |
|------|------|-------------|
| getTweetsPaginated respects sort=oldest | db.test.ts | Verify sql is called (sort changes ORDER BY) |
| Passes sort param to getTweetsPaginated | tweets.test.ts | sort=oldest query param → passed through |

**Total new tests:** 2
