# Scraper Resilience Design — kj-tweet-archive

**Date:** 2026-03-14
**Status:** Draft

## Overview

Make the tweet scraper resilient to X.com DOM changes by adding fallback selector chains, retry logic, and email alerting via Resend. The scraper currently hardcodes `data-testid` selectors that will break without warning when X changes their DOM.

## Fallback Selector System

### Module: `src/lib/scraper-selectors.ts`

A configuration file mapping each DOM query to a ranked list of CSS selectors. The scraper tries selectors in order and uses the first that returns results.

```ts
export const SELECTORS = {
  tweetContainer: ['[data-testid="tweet"]', 'article[role="article"]', 'article'],
  tweetText:      ['[data-testid="tweetText"]', 'div[lang][dir="ltr"]'],
  socialContext:   ['[data-testid="socialContext"]'],
  timeElement:    ['time[datetime]'],
};
```

**Selector notes:**

- `tweetText`: always resolved via `resolveChildSelector` scoped to the tweet container, never at document level. The `div[lang][dir="ltr"]` fallback is safe within a tweet article.
- `socialContext`: no meaningful fallback exists — if `data-testid="socialContext"` is removed, there's no reliable alternative selector for retweet indicators. **Degrades gracefully:** worst case, retweets get included in the archive (not data loss, just noise).
- `timeElement`: the `<time>` element is semantic HTML that X.com has used consistently. If it disappears, the tweet ID extraction (via the parent `<a>` href) also breaks, so a fallback here has no value in isolation.

### Return types

```ts
type SelectorResult = { selector: string; elements: Element[] } | null;

function resolveSelector(root: ParentNode, key: keyof typeof SELECTORS): SelectorResult;
function resolveChildSelector(parent: Element, key: keyof typeof SELECTORS): SelectorResult;
```

`resolveSelector` queries the DOM using each selector in sequence for the given key. Returns the first selector that matches at least one element, along with the matched elements. Returns `null` if all selectors fail.

`resolveChildSelector` does the same scoped to a parent element (for per-tweet queries like `tweetText` and `socialContext`).

Both functions track which selector was used, enabling degradation detection.

### Integration with scrape-tweets.ts

The `page.evaluate()` callback receives the selector config as a serializable argument (since it runs in browser context and can't import modules). The callback uses the same resolve-and-fallback logic inline.

The `parseTweetElements` in `scraper-utils.ts` is updated to accept selectors as a parameter instead of hardcoding them.

**Dual-maintenance note:** The parsing logic necessarily exists in two places — `scraper-utils.ts` (testable, server-side) and the inline `page.evaluate()` callback (browser context, can't import modules). Both copies must use the same selector config (passed as arguments) and the same parsing logic. The `scraper-utils.ts` copy is the source of truth for testing. The existing comment in `scraper-utils.ts` documents this constraint.

## Retry Logic

Wraps the entire `scrapeTweets()` function. On failure (page timeout, no tweets found, all selectors fail), retries once with a fresh page.

- **Max attempts:** 2 (constrained by Vercel's 120s timeout)
- **Delay between attempts:** 3 seconds
- **Fresh page per attempt:** each retry creates a new `browser.newPage()` to avoid stale state. Browser-level failures (Chromium crash, OOM) are not retried — they surface as the error response and trigger an alert.
- **Failure conditions that trigger retry:** page navigation timeout, `waitForSelector` timeout (no tweet containers found), zero tweets extracted after parsing

### Timing Budget

The 120s Vercel timeout constrains how aggressive retries can be. Per-attempt timeouts are reduced from the current values to fit two attempts:

| Phase | Current | With retry |
|-------|---------|------------|
| `page.goto` timeout | 60s | 30s |
| `waitForSelector` timeout | 30s | 15s |
| Scroll + extract | ~3s | ~3s |
| **Per-attempt max** | **~93s** | **~48s** |

With 3s delay between attempts: 48s + 3s + 48s = 99s, safely under 120s.

If the first attempt fails quickly (e.g., selector not found in 15s), the second attempt has plenty of time. If the first attempt runs close to 48s before failing, the second attempt is still feasible.

If both attempts fail, the scraper returns an error result (not an empty success) so the handler can trigger an alert.

## Email Alerting

### Module: `src/lib/email.ts`

Uses [Resend](https://resend.com) (free tier: 100 emails/day). Single function:

```ts
async function sendAlert(subject: string, body: string): Promise<void>
```

Sends to `kj@kj.ventures` from Resend's default sender (`onboarding@resend.dev`). Requires env var `RESEND_API_KEY`.

### Alert Conditions

The cron handler evaluates the scrape result and sends alerts for:

| Condition | Severity | Subject Line |
|-----------|----------|-------------|
| All retries exhausted, zero tweets | Error | `[KJ Tweets] Scraper FAILED — 0 tweets extracted` |
| Primary selector failed, fallback used | Warning | `[KJ Tweets] Selector degradation — fallback in use` |
| Fewer than 3 tweets scraped | Warning | `[KJ Tweets] Low tweet count — N tweets scraped` |

No alert is sent on successful scrapes with primary selectors.

Alert body includes: timestamp, selectors used (primary vs fallback), number of attempts, error message if applicable.

### Deduplication

To avoid alert fatigue (cron runs every 6 hours), the handler checks if the same alert condition was already triggered recently. Simple approach: store `lastAlertType` and `lastAlertTime` in a DB column or use a simple in-memory check per invocation. Since each cron invocation is a cold start on Vercel, the simplest approach is: always send the alert. At 4 invocations/day max, this means at most 4 emails/day during an outage — acceptable.

## Enriched Cron Response

The handler response becomes:

```json
{
  "success": true,
  "scraped": 12,
  "new": 3,
  "attempts": 1,
  "selectorsUsed": {
    "tweetContainer": "[data-testid=\"tweet\"]",
    "tweetText": "[data-testid=\"tweetText\"]"
  },
  "fallbacksTriggered": false
}
```

On failure:

```json
{
  "success": false,
  "error": "All selectors failed for tweetContainer",
  "attempts": 2,
  "alertSent": true
}
```

## File Structure

```
src/
  lib/
    scraper-selectors.ts      # NEW — selector chains + resolve functions
    scraper-selectors.test.ts  # NEW
    email.ts                   # NEW — Resend alert sender
    email.test.ts              # NEW
    scraper-utils.ts           # MODIFY — accept selectors param
    scraper-utils.test.ts      # MODIFY — pass selectors in tests
  pages/
    api/
      cron/
        scrape-tweets.ts       # MODIFY — retry logic, fallback selectors, alerting
        scrape-tweets.test.ts  # MODIFY — new test cases
```

## Dependencies

- `resend` — Resend SDK (npm package)

## Environment Variables

- `RESEND_API_KEY` — Resend API key (add to Vercel Production + Preview)

## Test Plan

### scraper-selectors.test.ts (~4 tests)

| Test | Description |
|------|-------------|
| resolveSelector returns first matching selector | Primary exists → returns primary |
| resolveSelector falls back when primary fails | Primary missing → returns fallback |
| resolveSelector returns null when all fail | No selectors match → null |
| resolveChildSelector scoped to parent element | Queries within parent, not document |

### email.test.ts (~3 tests)

Mock the Resend SDK.

| Test | Description |
|------|-------------|
| sendAlert calls Resend with correct params | Verifies to, from, subject, body |
| sendAlert does not throw on Resend error | Logs error but doesn't crash the cron |
| sendAlert is not called on successful scrape | No alert when everything works |

### Updated scrape-tweets.test.ts (~4 new tests)

| Test | Description |
|------|-------------|
| Retries on first attempt failure | First attempt throws → second attempt succeeds |
| Sends alert email on total failure | Both attempts fail → sendAlert called |
| Sends degradation alert on fallback use | Primary selector fails, fallback used → warning sent |
| Response includes selector metadata | Response body has selectorsUsed and attempts |

### Updated scraper-utils.test.ts (~1 new test)

| Test | Description |
|------|-------------|
| parseTweetElements accepts custom selectors | Non-default selectors passed → used correctly |

**Total new tests:** ~12
