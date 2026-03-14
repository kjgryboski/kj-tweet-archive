/**
 * Scraper utility functions extracted for testability.
 *
 * NOTE: `parseTweetElements` mirrors the inline `page.evaluate()` logic in
 * `src/pages/api/cron/scrape-tweets.ts`. The browser-context callback cannot
 * import modules, so the logic exists in two places. Changes to tweet parsing
 * must be reflected in BOTH this file and the `page.evaluate()` callback.
 */

import { SELECTORS as DEFAULT_SELECTORS, type SelectorKey } from "./scraper-selectors";

export interface ScrapedTweet {
  tweetId: string;
  text: string;
  timestamp: string;
  url: string;
  likes: number;
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

export function parseTweetElements(
  root: ParentNode,
  selectors: SelectorConfig = DEFAULT_SELECTORS
): ScrapedTweet[] {
  // Collect tweet elements using the first selector that yields results
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
    // Skip retweets
    const socialContext = resolveChild(el, selectors.socialContext);
    if (socialContext?.textContent?.includes("reposted")) return;

    // Get tweet link to extract ID
    const timeEl = resolveChild(el, selectors.timeElement);
    const linkEl = timeEl?.closest("a");
    const href = linkEl?.getAttribute("href") || "";
    const tweetIdMatch = href.match(/status\/(\d+)/);
    if (!tweetIdMatch) return;

    // Skip replies
    const allText = el.textContent || "";
    if (allText.includes("Replying to @")) return;

    // Get tweet text
    const tweetTextEl = resolveChild(el, selectors.tweetText);
    const text = tweetTextEl?.textContent || "";
    if (!text.trim()) return;

    // Get timestamp
    const timestamp = timeEl?.getAttribute("datetime") || "";

    // Get likes
    const likeEl = resolveChild(el, selectors.likeButton);
    let likes = 0;
    if (likeEl) {
      const ariaLabel = likeEl.getAttribute("aria-label") || "";
      const match = ariaLabel.match(/(\d+)/);
      if (match) likes = parseInt(match[1], 10);
    }

    results.push({
      tweetId: tweetIdMatch[1],
      text: text.trim(),
      timestamp,
      url: `https://x.com${href}`,
      likes,
    });
  });

  return results;
}
