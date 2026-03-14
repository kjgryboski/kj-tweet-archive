/**
 * Scraper utility functions extracted for testability.
 *
 * NOTE: `parseTweetElements` mirrors the inline `page.evaluate()` logic in
 * `src/pages/api/cron/scrape-tweets.ts`. The browser-context callback cannot
 * import modules, so the logic exists in two places. Changes to tweet parsing
 * must be reflected in BOTH this file and the `page.evaluate()` callback.
 */

export interface ScrapedTweet {
  tweetId: string;
  text: string;
  timestamp: string;
  url: string;
}

export function generateTitle(text: string): string {
  const firstSentence = text.split(/[.!?\n]/)[0]?.trim();
  if (firstSentence && firstSentence.length <= 80) return firstSentence;
  return text.substring(0, 60).trim() + "...";
}

export function parseTweetElements(root: ParentNode): ScrapedTweet[] {
  const tweetElements = root.querySelectorAll('[data-testid="tweet"]');
  const results: ScrapedTweet[] = [];

  tweetElements.forEach((el) => {
    // Skip retweets
    const socialContext = el.querySelector('[data-testid="socialContext"]');
    if (socialContext?.textContent?.includes("reposted")) return;

    // Get tweet link to extract ID
    const timeEl = el.querySelector("time");
    const linkEl = timeEl?.closest("a");
    const href = linkEl?.getAttribute("href") || "";
    const tweetIdMatch = href.match(/status\/(\d+)/);
    if (!tweetIdMatch) return;

    // Skip replies
    const allText = el.textContent || "";
    if (allText.includes("Replying to @")) return;

    // Get tweet text
    const tweetTextEl = el.querySelector('[data-testid="tweetText"]');
    const text = tweetTextEl?.textContent || "";
    if (!text.trim()) return;

    // Get timestamp
    const timestamp = timeEl?.getAttribute("datetime") || "";

    results.push({
      tweetId: tweetIdMatch[1],
      text: text.trim(),
      timestamp,
      url: `https://x.com${href}`,
    });
  });

  return results;
}
