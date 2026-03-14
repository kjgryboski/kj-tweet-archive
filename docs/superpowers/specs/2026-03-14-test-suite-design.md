# Test Suite Design — kj-tweet-archive

**Date:** 2026-03-14
**Status:** Draft

## Overview

Add comprehensive test coverage to kj-tweet-archive using Vitest + React Testing Library. Covers database layer, API routes, scraper parsing logic, and all UI components. Target: ~35-40 tests across all layers.

**Out of scope:** `HandleInput.tsx` — unused component, not imported anywhere. Should be deleted rather than tested.

## Tooling

- **Vitest** — test runner
- **@testing-library/react** + **@testing-library/jest-dom** — component rendering and assertions
- **jsdom** — DOM environment for component tests
- **vitest.config.ts** — at project root, with `@/` path alias mapped to `./src/`
- Global mock of `@vercel/postgres` `sql` tagged template

## Test Plan

### Backend: Database Layer (`src/lib/db.test.ts`)

Mock `sql` from `@vercel/postgres`.

| Test | Description |
|------|-------------|
| `initDb` calls CREATE TABLE sql | Verifies sql called with expected CREATE TABLE statement |
| `getTweets` returns mapped TweetProps | Verifies row-to-TweetProps mapping with correct field names |
| `getTweets` falls back to row.id when x_tweet_id missing | `x_tweet_id` null → uses `String(row.id)` for id field |
| `getTweets` applies defaults for missing fields | Missing `username`, `name`, `created_at` get defaults |
| `insertTweet` calls sql with correct values | Verifies all fields passed to INSERT |
| `insertTweet` applies defaults for optional fields | Missing `username`/`name`/`created_at` filled in |
| `tweetExists` returns true when found | Rows returned → true |
| `tweetExists` returns false when not found | Empty rows → false |

### Backend: Fetch Wrapper (`src/lib/api.test.ts`)

Mock `getTweets` from `@/lib/db`.

| Test | Description |
|------|-------------|
| `fetchUserTweets` returns tweets on success | Delegates to `getTweets`, returns result |
| `fetchUserTweets` returns [] on error | `getTweets` throws → returns empty array, no throw |

### Backend: API Route (`src/pages/api/tweets.test.ts`)

Mock `getTweets` from `@/lib/db`.

| Test | Description |
|------|-------------|
| GET returns 200 with tweets | Happy path |
| Non-GET returns 405 | Method not allowed |
| Returns 500 on db error | `getTweets` throws → 500 with error message |

### Backend: Cron Handler (`src/pages/api/cron/scrape-tweets.test.ts`)

Mock db functions (`initDb`, `tweetExists`, `insertTweet`) and the scraper function.

| Test | Description |
|------|-------------|
| Returns 401 without valid bearer token | Missing/wrong `Authorization` header |
| Calls initDb before processing | Ensures table exists |
| Skips existing tweets | `tweetExists` returns true → no insert |
| Inserts new tweets with correct data | `tweetExists` returns false → `insertTweet` called |
| Returns correct scraped/new counts | Response body matches actual inserts |
| Returns 500 when scraper throws | Error in scraper → 500 with error string |

### Backend: Scraper Utilities (`src/lib/scraper-utils.ts` + `src/lib/scraper-utils.test.ts`)

Extract `generateTitle` and tweet DOM parsing logic from `scrape-tweets.ts` into a pure module.

**`generateTitle` tests:**

| Test | Description |
|------|-------------|
| Short first sentence returned as-is | Text under 80 chars with period |
| Long text truncated at 60 + "..." | No sentence boundary within 80 chars |
| Splits on sentence boundaries | Handles `.`, `!`, `?`, `\n` |
| Empty/whitespace input returns "..." | Falsy first sentence falls through to truncation |
| Boundary: exactly 80 char first sentence | Returned as-is (<=80 check) |

**`parseTweetElements` tests (HTML fixture input):**

| Test | Description |
|------|-------------|
| Extracts tweet ID, text, timestamp, URL | Standard tweet element |
| Skips retweets | Element has socialContext with "reposted" |
| Skips replies | Element contains "Replying to @" |
| Skips empty text tweets | No tweetText content |

### Frontend: Theme Context (`src/lib/theme-context.test.tsx`)

| Test | Description |
|------|-------------|
| `useThemeContext` throws outside provider | Calling hook without `ThemeProvider` wrapper throws |
| `toggleColorMode` switches light→dark | Initial light, toggle, verify dark |
| Persists mode to localStorage | After toggle, `localStorage.getItem("colorMode")` matches |

### Frontend: Tweet Component (`src/components/Tweet.test.tsx`)

| Test | Description |
|------|-------------|
| Renders name, username, date, title, text | All props displayed |
| Highlights search term in text and title | `searchTerm` prop produces HighlightedText spans |
| No highlight markup when searchTerm empty | Clean render without highlight wrappers |
| Renders media image when mediaUrls provided | `<img>` present with correct src |

### Frontend: TweetList Component (`src/components/TweetList.test.tsx`)

| Test | Description |
|------|-------------|
| Shows loading spinner when isLoading=true | CircularProgress visible, "Loading tweets..." text |
| Shows empty state when tweets=[] | "No tweets found" message |
| Renders correct number of tweet cards | N tweets → N rendered cards |

### Frontend: SearchBar Component (`src/components/SearchBar.test.tsx`)

| Test | Description |
|------|-------------|
| Enter key triggers onSearch with input value | Type + Enter → callback fires |
| Clear button resets and calls onSearch("") | Click clear → input empty, callback with "" |
| Shows result count after matching search | "X of Y results" text visible |
| Navigation buttons cycle through results | Click next/prev updates current index |
| Works without onSearch callback | No crash when onSearch prop omitted |

### Frontend: ThemeToggle Component (`src/components/ThemeToggle.test.tsx`)

| Test | Description |
|------|-------------|
| Calls toggleColorMode on click | Click → callback fires |
| Renders correct icon for mode | "light" → moon icon (offers dark), "dark" → sun icon (offers light) |

### Frontend: BackToTop Component (`src/components/BackToTop.test.tsx`)

| Test | Description |
|------|-------------|
| Hidden before scroll threshold | Not visible initially |
| Visible after scrolling past threshold | Appears after 500px scroll |

## File Structure

```
src/
  lib/
    api.test.ts
    db.test.ts
    scraper-utils.ts          # NEW — extracted pure functions
    scraper-utils.test.ts
    theme-context.test.tsx
  pages/
    api/
      tweets.test.ts
      cron/
        scrape-tweets.test.ts
  components/
    Tweet.test.tsx
    TweetList.test.tsx
    SearchBar.test.tsx
    ThemeToggle.test.tsx
    BackToTop.test.tsx
vitest.config.ts              # NEW
```

## Dependencies to Add

**Dev dependencies:**
- `vitest`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`
- `jsdom`

## NPM Scripts to Add

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

## Refactoring Required

One extraction from `src/pages/api/cron/scrape-tweets.ts`:

1. Move `generateTitle()` to `src/lib/scraper-utils.ts`
2. Extract the `page.evaluate()` callback logic into a `parseTweetElements()` function in the same file
3. Import both back into `scrape-tweets.ts` (no behavior change)

This keeps the scraper endpoint thin and makes the fragile DOM parsing testable with fixture HTML.

## Cleanup

- Delete unused `src/components/HandleInput.tsx`
- Remove `cdn.sanity.io` from `next.config.ts` image domains (legacy, no longer needed)
