# KJ Tweet Archive — Comprehensive Audit

**Date:** 2026-03-14
**Scope:** Bugs, security, reliability, code quality, features & UX
**Methodology:** Categorized findings with P0–P3 priority ratings

---

## Category 1: Bugs & Security

### 1. [P0] Search only works on loaded tweets

**File:** `src/components/SearchBar.tsx`, `src/pages/index.tsx:165`

`SearchBar` filters the `tweets` array passed as a prop — which only contains the ~30 tweets loaded via infinite scroll. Searching for content in older tweets returns 0 results, silently misleading users.

**Fix:** Add a server-side search endpoint (`/api/tweets?q=`) with SQL `ILIKE` or full-text search, and have the UI call it instead of client-side filtering when a search term is entered.

### 2. [P1] `initDb()` runs DDL on every scrape invocation

**File:** `src/pages/api/cron/scrape-tweets.ts:218`

Every 6-hour cron run calls `initDb()`, executing `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `ALTER TABLE ADD COLUMN IF NOT EXISTS`. These DDL statements acquire locks and are wasteful on an already-initialized database.

**Fix:** Run `initDb()` once during deployment/migration, or gate it behind a flag/env var. Remove the call from the cron handler.

### 3. [P1] No rate limiting on `/api/tweets`

**File:** `src/pages/api/tweets.ts`

Public endpoint with no rate limiting. An attacker or misconfigured client can send unlimited requests, driving up Vercel Postgres connection costs.

**Fix:** Add Vercel's `@vercel/edge-config` rate limiting, or a simple in-memory token bucket, or use Vercel's built-in WAF/firewall rules.

### 4. [P1] Hardcoded email address in source

**File:** `src/lib/email.ts:4`

`kj@kj.ventures` is hardcoded. If the alert recipient changes, it requires a code change and redeploy.

**Fix:** Move to `ALERT_EMAIL` environment variable with the current value as default.

### 5. [P1] `CRON_SECRET` misconfiguration fails silently

**File:** `src/pages/api/cron/scrape-tweets.ts:213`, `src/pages/api/cron/refresh-metrics.ts:14`

If `CRON_SECRET` is missing from env, both crons return 401. No alert is sent because the alert logic is inside the `try` block after the auth check. A deployment config error silently breaks all scraping.

**Fix:** Log a warning when `CRON_SECRET` is falsy, or send an alert before returning 401.

### 6. [P2] Two `<h1>` elements on the page

**File:** `src/pages/index.tsx:134,145`

Both "KJ Tweets" and "The Archive" render as `<h1>`. Violates heading hierarchy (SEO penalty, a11y issue).

**Fix:** Change "The Archive" subtitle to `component="h2"`.

### 7. [P2] `Home.module.css` is dead code

**File:** `src/styles/Home.module.css`

169 lines of unused CSS from Next.js scaffolding. Not imported anywhere.

**Fix:** Delete the file.

---

## Category 2: Reliability

### 8. [P1] Scraper has no scroll pagination

**File:** `src/pages/api/cron/scrape-tweets.ts:66-67`

Single scroll of 2000px captures ~10-15 visible tweets. For a prolific account, many recent tweets are missed between 6-hour cron intervals.

**Fix:** Add a scroll loop that continues scrolling until no new tweet elements appear (with a max iteration cap and timeout guard).

### 9. [P1] `refresh-metrics` only updates visible tweets

**File:** `src/pages/api/cron/refresh-metrics.ts:28-29`

Same single-page-load issue as the scraper. Weekly likes refresh only updates the ~10 tweets visible on initial load. The majority of archived tweets never get their like counts updated.

**Fix:** Either scroll-paginate like the scraper fix, or query the DB for known tweet IDs and fetch their metrics via X's API (if available), or accept this limitation and document it.

### 10. [P1] Duplicated scraper logic between `scraper-utils.ts` and `scrape-tweets.ts`

**Files:** `src/lib/scraper-utils.ts`, `src/pages/api/cron/scrape-tweets.ts:70-171`

The `page.evaluate()` callback duplicates the parsing logic from `scraper-utils.ts` because browser context can't import Node modules. The file header explicitly warns about this. Any parsing change must be made in two places.

**Fix:** Extract the parsing logic into a self-contained function string that can be injected into `page.evaluate()` via `page.addScriptTag()` or `page.evaluateHandle()`, or generate the evaluate callback from the shared source at build time.

### 11. [P2] No error response validation in frontend

**File:** `src/pages/index.tsx:42`

`await res.json()` is called without checking `res.ok`. A 500 response body may not have `tweets`/`hasMore`/`nextCursor` fields, causing silent failures or crashes.

**Fix:** Check `res.ok` before parsing. On failure, set an error state and show a user-facing error message.

### 12. [P2] `refresh-metrics` has no retry logic

**File:** `src/pages/api/cron/refresh-metrics.ts`

Unlike `scrape-tweets` which has a 2-attempt retry loop, `refresh-metrics` fails immediately on any error. Browser launches on serverless are flaky — a single failure loses the entire weekly update.

**Fix:** Add retry logic matching `scrape-tweets` (2 attempts with delay).

### 13. [P3] No deduplication guard on infinite scroll

**File:** `src/pages/index.tsx:72-86`

The `IntersectionObserver` callback checks `loadingMore` and `hasMore`, but `loadingMore` is set asynchronously via `useState`. The observer is recreated when `loadingMore` changes (it's in the dependency array), so the race window is narrow — but still possible between `setLoadingMore(true)` and React's re-render flush. Cosmetic issue (duplicate tweets in list), not data integrity.

**Fix:** Use a `useRef` for the loading guard instead of state, or deduplicate tweets by ID when appending.

### 14. [P3] Scraper user-agent is stale

**Files:** `src/pages/api/cron/scrape-tweets.ts:51`, `src/pages/api/cron/refresh-metrics.ts:28`

Hardcoded `Chrome/120.0.0.0` user-agent. Current Chrome is 130+. X may start blocking outdated agents.

**Fix:** Update to a recent Chrome version string, or rotate user-agents.

---

## Category 3: Code Quality

### 15. [P2] MUI + Tailwind CSS conflict

**File:** `src/styles/globals.css:1-3`

`@tailwind base/components/utilities` is imported but the app uses MUI exclusively. Tailwind's CSS reset conflicts with MUI's `CssBaseline` — both reset `box-sizing`, margins, and link styles, potentially causing subtle visual bugs.

**Fix:** Remove the Tailwind imports from `globals.css` and uninstall `tailwindcss`, `@tailwindcss/postcss`, `autoprefixer`, and `postcss` (all incorrectly in `dependencies` instead of `devDependencies`, and not used at all). Note: the `@tailwind` directives are v3 syntax but the installed package is Tailwind v4, so the setup is doubly broken.

### 16. [P2] `eslint-plugin-next` ghost dependency

**File:** `package.json:47`

`"eslint-plugin-next": "^0.0.0"` is a placeholder package on npm, not the real `@next/eslint-plugin-next`. It does nothing and may confuse dependency audits.

**Fix:** Remove from `devDependencies`.

### 17. [P2] Theme context value recreated every render

**File:** `src/lib/theme-context.tsx:111-115`

The `value` object passed to `ThemeContext.Provider` is created inline every render, causing all consumers to re-render even when nothing changed.

**Fix:** Wrap `toggleColorMode` in `useCallback`, then wrap `value` in `useMemo` with `[colorMode, toggleColorMode, theme]` dependencies. Without stabilizing `toggleColorMode` first, the memo deps change every render, defeating the optimization.

### 18. [P3] `tweetExists` is dead code

**File:** `src/lib/db.ts:141-146`

Exported but never called in production code. Only referenced in test mocks.

**Fix:** Remove the function and its test mock references.

### 19. [P3] Weak test assertions

**Files:** `src/lib/db.test.ts` (multiple tests)

Many tests only assert `expect(mockSql).toHaveBeenCalled()` — they confirm the function ran but not what SQL was executed or what parameters were passed. Low confidence that the actual queries are correct.

**Fix:** Use `toHaveBeenCalledWith()` or snapshot the tagged template literal calls to verify SQL content.

### 20. [P3] Deprecated MUI `InputProps` usage

**File:** `src/components/SearchBar.tsx:138`

MUI v7 deprecates `InputProps` in favor of `slotProps.input`. Will produce console warnings and break in a future MUI major version.

**Fix:** Migrate to `slotProps={{ input: { ... } }}`.

---

## Category 4: Features & UX

### 21. [P1] No server-side search

**Files:** `src/pages/api/tweets.ts`, `src/components/SearchBar.tsx`

There is no search API endpoint. All search is client-side on loaded tweets only (~30). The archive's primary value proposition — finding old tweets — doesn't work.

**Fix:** Add `q` query parameter to `/api/tweets` that performs `WHERE message ILIKE $1 OR title ILIKE $1` with `%term%`. Update the frontend to call the API when searching instead of filtering locally. For better performance at scale, add a GIN index with `pg_trgm`.

### 22. [P2] No error/empty states for failed API calls

**File:** `src/pages/index.tsx`, `src/components/TweetList.tsx`

When the API returns an error, users see the generic "No tweets found" message with no indication that something went wrong or option to retry.

**Fix:** Add an `error` state to the home page. On API failure, show "Something went wrong" with a retry button.

### 23. [P2] No `sitemap.xml` or `robots.txt`

The site has OG meta tags but no sitemap or robots file. Low-hanging SEO improvement for a public archive.

**Fix:** Add `public/robots.txt` and a dynamic sitemap via `pages/sitemap.xml.ts` or Next.js metadata API.

### 24. [P2] Google Fonts loaded via external stylesheet

**File:** `src/pages/index.tsx:111-113`

Roboto Mono is loaded via `fonts.googleapis.com` `<link>` tag, which causes layout shift and an extra DNS lookup.

**Fix:** Use `next/font/google` with `Roboto_Mono` for automatic optimization, self-hosting, and zero layout shift.

### 25. [P3] No tweet count displayed

Users can't see how many tweets are in the archive. Adding a count to the header provides context about the archive's size.

**Fix:** Add a `count` field to the API response (or a separate `/api/tweets/count` endpoint) and display it in the header.

### 26. [P3] No keyboard shortcut for search

Common UX pattern missing. `Ctrl/Cmd+K` or `/` to focus the search bar.

**Fix:** Add a `useEffect` keydown listener that focuses the search input on the shortcut key.

### 27. [P3] Same avatar loaded per tweet card

**File:** `src/components/Tweet.tsx:197`

Each of the 30+ visible Tweet cards loads `/kj.jpg` via `<Avatar src="/kj.jpg">`. While browser caching handles this, it's cleaner to preload the image once or use a shared component.

**Fix:** Minor — add `<link rel="preload" as="image" href="/kj.jpg">` to `_document.tsx` Head.

### 28. [P3] No favicon in multiple formats

**File:** `src/pages/index.tsx:109`

Only `kj.jpg` used as favicon. Modern browsers expect `favicon.ico`, `apple-touch-icon.png`, and optionally a `site.webmanifest`.

**Fix:** Generate proper favicon set from `kj.jpg` and add to `public/` with appropriate `<link>` tags.

### 29. [P2] `eslint-config-next` is unused

**File:** `package.json`, `eslint.config.mjs`

`eslint-config-next` is installed as a devDependency but `eslint.config.mjs` uses flat config with `@eslint/js` and `typescript-eslint` only — `eslint-config-next` is never imported. Wasted dependency alongside the ghost `eslint-plugin-next`.

**Fix:** Remove `eslint-config-next` from `devDependencies`, or integrate it into the flat config if Next.js-specific lint rules are desired.

### 30. [P2] `ON CONFLICT` upsert only updates likes — edited tweets never sync

**File:** `src/lib/db.ts:133`

`ON CONFLICT (x_tweet_id) DO UPDATE SET likes = EXCLUDED.likes` means if a tweet's text is edited on X, the archive keeps the original text forever. Tweet editing is now common on X.

**Fix:** Expand the upsert to also update `message` and `title`: `DO UPDATE SET likes = EXCLUDED.likes, message = EXCLUDED.message, title = EXCLUDED.title`.

### 31. [P3] Google Analytics ID is hardcoded

**File:** `src/pages/index.tsx:94`

`gaId="G-TQ17DS73DL"` is inline. Similar to the hardcoded email, this should be an env var for flexibility across environments.

**Fix:** Move to `NEXT_PUBLIC_GA_ID` environment variable.

### 32. [P3] No React error boundary

**Files:** `src/pages/_app.tsx`, `src/components/Tweet.tsx:140`

No error boundary wraps the app. A runtime crash in any component (e.g., malformed date in `formatDistanceToNow`) takes down the entire page with no recovery.

**Fix:** Add an error boundary component wrapping `<Component>` in `_app.tsx`.

### 33. [P2] Build-time dependencies in production `dependencies`

**File:** `package.json:21-24`

`tailwindcss`, `@tailwindcss/postcss`, `autoprefixer`, and `postcss` are listed under `dependencies` instead of `devDependencies`. These are build-time-only tools that inflate the production install.

**Fix:** Move to `devDependencies` (or remove entirely per finding 15).

---

## Summary by Priority



| Priority | Count | Description |
|----------|-------|-------------|
| **P0** | 1 | Search fundamentally broken |
| **P1** | 7 | Rate limiting, scraper coverage, duplicated logic, DDL on every run, server search, hardcoded email, silent cron failure |
| **P2** | 14 | CSS conflicts, heading hierarchy, upsert gaps, unused deps, performance, SEO, dead code, error handling, build deps |
| **P3** | 11 | Stale UA, weak tests, deprecated APIs, minor UX enhancements, error boundary, hardcoded GA ID, scroll dedup |

**Total findings: 33**

## Recommended Implementation Order

1. **P0 — Server-side search** (findings 1, 21) — core feature is broken
2. **P1 — Scraper reliability** (findings 5, 8, 9, 10) — data collection integrity + silent failure detection
3. **P1 — Security/ops** (findings 2, 3, 4) — reduce risk and cost
4. **P2 — Code quality quick wins** (findings 7, 15, 16, 17, 29, 33, 6) — cleanup dead code, broken configs, misplaced deps
5. **P2 — Data integrity** (finding 30) — upsert to sync edited tweets
6. **P2 — Frontend resilience** (findings 11, 22) — error states and retry
7. **P2 — SEO & performance** (findings 23, 24) — discoverability
8. **P3 — Remaining items** (findings 12, 13, 14, 18, 19, 20, 25, 26, 27, 28, 31, 32) — incremental improvements
