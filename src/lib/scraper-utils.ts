/**
 * Scraper utility functions extracted for testability.
 *
 * NOTE: `parseTweetElements` mirrors the inline `page.evaluate()` logic in
 * `src/pages/api/cron/scrape-tweets.ts`. The browser-context callback cannot
 * import modules, so the logic exists in two places. Changes to tweet parsing
 * must be reflected in BOTH this file and the `page.evaluate()` callback.
 */

import { SELECTORS as DEFAULT_SELECTORS, type SelectorKey } from "./scraper-selectors";

export interface ScrapedPhoto {
  mediaKey: string;
  url: string;
}

export interface ScrapedTweet {
  tweetId: string;
  text: string;
  timestamp: string;
  url: string;
  likes: number;
  photos: ScrapedPhoto[];
  quotedTweetUrl?: string;
  quotedTweetUsername?: string;
  quotedTweetId?: string;
}

export type SelectorConfig = Record<SelectorKey, readonly string[]>;

function resolveChild(parent: Element, selectors: readonly string[]): Element | null {
  for (const sel of selectors) {
    const el = parent.querySelector(sel);
    if (el) return el;
  }
  return null;
}

export function generateTitle(text: string): string {
  const firstSentence = text.split(/[.!?\n]/)[0]?.trim();
  if (firstSentence && firstSentence.length <= 80) return firstSentence;
  return text.substring(0, 60).trim() + "...";
}

/**
 * Derives a stable media key from a pbs.twimg.com URL.
 *   https://pbs.twimg.com/media/Fabc123XYZ?format=jpg&name=large
 *     -> "Fabc123XYZ"
 * For video thumbnails (ext_tw_video_thumb, amplify_video_thumb) the path
 * contains a numeric id we use instead. Returns null if no key can be found.
 */
export function mediaKeyFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    const last = segs[segs.length - 1];
    if (!last) return null;
    const withoutExt = last.replace(/\.[a-z0-9]+$/i, "");
    return withoutExt || null;
  } catch {
    return null;
  }
}

/**
 * Returns the upgraded "name=large" variant of a pbs.twimg.com photo URL.
 * Profile timeline usually serves `name=small`; we want the largest we can
 * persist to Blob so the archive doesn't look grainier than x.com does.
 */
export function upgradeToLarge(url: string): string {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("twimg.com")) return url;
    u.searchParams.set("name", "large");
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Text of a tweet article WITHOUT any nested <article> (which is how X renders
 * quoted tweets). Used so reply/quote detection only looks at the outer tweet.
 */
function outerOnlyText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("article").forEach((a) => a.remove());
  return clone.textContent || "";
}

const STATUS_HREF_RE = /^\/([^/]+)\/status\/(\d+)/;

function detectQuote(
  el: Element,
  ownUsername: string,
): { url: string; username: string; id: string } | undefined {
  const nested = el.querySelector("article");
  if (!nested) return undefined;
  const anchors = Array.from(nested.querySelectorAll('a[href*="/status/"]'));
  for (const a of anchors) {
    const href = a.getAttribute("href") || "";
    const m = href.match(STATUS_HREF_RE);
    if (!m) continue;
    const [, username, id] = m;
    if (username.toLowerCase() === ownUsername.toLowerCase()) continue;
    return { url: `https://x.com${href}`, username, id };
  }
  return undefined;
}

function extractPhotos(el: Element): ScrapedPhoto[] {
  // Clone + drop nested articles so we don't pull in the quoted tweet's photos.
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("article").forEach((a) => a.remove());

  const photos = new Map<string, ScrapedPhoto>();
  const imgs = Array.from(clone.querySelectorAll('img[src*="pbs.twimg.com/media/"]'));
  for (const img of imgs) {
    const src = img.getAttribute("src");
    if (!src) continue;
    const key = mediaKeyFromUrl(src);
    if (!key) continue;
    const upgraded = upgradeToLarge(src);
    if (!photos.has(key)) photos.set(key, { mediaKey: key, url: upgraded });
  }
  return Array.from(photos.values());
}

export interface ParseOptions {
  ownUsername?: string;
}

export function parseTweetElements(
  root: ParentNode,
  selectors: SelectorConfig = DEFAULT_SELECTORS,
  options: ParseOptions = {},
): ScrapedTweet[] {
  const ownUsername = options.ownUsername || "KJFUTURES";
  let tweetElements: Element[] = [];
  for (const sel of selectors.tweetContainer) {
    const found = Array.from(root.querySelectorAll(sel));
    if (found.length > 0) {
      tweetElements = found;
      break;
    }
  }

  const results: ScrapedTweet[] = [];

  tweetElements.forEach((el) => {
    const socialContext = resolveChild(el, selectors.socialContext);
    if (socialContext?.textContent?.includes("reposted")) return;

    const timeEl = resolveChild(el, selectors.timeElement);
    const linkEl = timeEl?.closest("a");
    const href = linkEl?.getAttribute("href") || "";
    const tweetIdMatch = href.match(/status\/(\d+)/);
    if (!tweetIdMatch) return;

    // Scope the reply check to the outer tweet so quote-tweets of someone
    // else's reply aren't incorrectly dropped.
    if (outerOnlyText(el).includes("Replying to @")) return;

    const tweetTextEl = resolveChild(el, selectors.tweetText);
    const text = tweetTextEl?.textContent || "";
    if (!text.trim()) return;

    const timestamp = timeEl?.getAttribute("datetime") || "";

    const likeEl = resolveChild(el, selectors.likeButton);
    let likes = 0;
    if (likeEl) {
      const ariaLabel = likeEl.getAttribute("aria-label") || "";
      const match = ariaLabel.match(/(\d+)/);
      if (match) likes = parseInt(match[1], 10);
    }

    const photos = extractPhotos(el);
    const quote = detectQuote(el, ownUsername);

    results.push({
      tweetId: tweetIdMatch[1],
      text: text.trim(),
      timestamp,
      url: `https://x.com${href}`,
      likes,
      photos,
      quotedTweetUrl: quote?.url,
      quotedTweetUsername: quote?.username,
      quotedTweetId: quote?.id,
    });
  });

  return results;
}
