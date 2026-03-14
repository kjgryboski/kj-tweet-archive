# Individual Tweet Page + OG Social Card — Design Spec

**Date:** 2026-03-14

---

## 1. Individual Tweet Page

**Route:** `src/pages/tweet/[id].tsx` (Pages Router dynamic route)

**Purpose:** Shareable URL for individual tweets. Not linked from the homepage — cards continue linking to X.com. This page is for direct links/embedding only.

### Data Layer

Add `getTweetById(id: string)` to `src/lib/db.ts`:

```sql
SELECT * FROM tweets WHERE x_tweet_id = $1 LIMIT 1
```

Returns a single `TweetProps` object or `null` if not found.

### Page Behavior

- Server-side rendered via `getServerSideProps` — fetches tweet by `x_tweet_id`
- If tweet not found, return `{ notFound: true }` (Next.js 404)
- Cache-Control: `public, s-maxage=86400, stale-while-revalidate=3600` (tweets don't change often)

### Layout

- "Back to Archive" link at top (links to `/`)
- Single centered tweet, max-width 600px
- Uses the existing `Tweet` component but renders the full text without the `TweetTextWrapper` truncation/fade
- Add a `fullText` prop to `Tweet` that disables the wrapper's `maxHeight` and fade gradient
- "View on X" link below the tweet card
- Footer matches homepage

### Meta Tags

```html
<title>{title} — KJ Tweets</title>
<meta property="og:title" content="{title}" />
<meta property="og:description" content="{first 200 chars of text}" />
<meta property="og:image" content="https://kjtweets.com/og-card.png" />
<meta property="og:url" content="https://kjtweets.com/tweet/{id}" />
<meta property="og:type" content="article" />
<meta name="twitter:card" content="summary_large_image" />
```

---

## 2. OG Social Card

**File:** `public/og-card.png` (1200x630)

### Design

- Black background (#000000)
- "KJ Tweets" in large white Roboto Mono, centered
- "The Archive" smaller below, slightly muted (#999999)
- Clean and minimal — matches the site aesthetic
- No profile photo — text-only branding

### Generation

Create the image using a simple HTML-to-image approach or manually in a design tool. Since this is a static image that rarely changes, generate it once and commit to `public/`.

### Usage

- Homepage: `<meta property="og:image" content="https://kjtweets.com/og-card.png" />`
- Tweet pages: same image (dynamic per-tweet OG images are out of scope)
- Replace the existing `kj.jpg` OG reference in `index.tsx`

---

## Files to Create/Modify

- **Create:** `src/pages/tweet/[id].tsx` — individual tweet page
- **Create:** `public/og-card.png` — branded social card
- **Modify:** `src/lib/db.ts` — add `getTweetById`
- **Modify:** `src/lib/db.test.ts` — test for `getTweetById`
- **Modify:** `src/components/Tweet.tsx` — add `fullText` prop to disable truncation
- **Modify:** `src/pages/index.tsx` — update OG image URL to `/og-card.png`
