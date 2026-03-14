import type { NextApiRequest, NextApiResponse } from "next";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { insertTweet } from "@/lib/db";
import { generateTitle, type ScrapedTweet } from "@/lib/scraper-utils";
import { SELECTORS } from "@/lib/scraper-selectors";
import { sendAlert } from "@/lib/email";

export const config = {
  maxDuration: 120, // 2 minutes max for Pro plan
};

const PROFILE_URL = "https://x.com/KJFUTURES";
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3000;
const GOTO_TIMEOUT = 30000;
const SELECTOR_TIMEOUT = 15000;
const LOW_TWEET_THRESHOLD = 3;

interface ScrapeResult {
  tweets: ScrapedTweet[];
  selectorsUsed: Record<string, string>;
  fallbacksTriggered: boolean;
  attempts: number;
}

async function scrapeTweetsWithRetry(): Promise<ScrapeResult> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  // Build a plain serializable selector config to pass into page.evaluate
  const selectorConfig = {
    tweetContainer: [...SELECTORS.tweetContainer],
    tweetText: [...SELECTORS.tweetText],
    socialContext: [...SELECTORS.socialContext],
    timeElement: [...SELECTORS.timeElement],
    likeButton: [...SELECTORS.likeButton],
  };

  let lastError: unknown;

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const page = await browser.newPage();

      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      );

      try {
        await page.goto(PROFILE_URL, {
          waitUntil: "networkidle2",
          timeout: GOTO_TIMEOUT,
        });

        // Wait for tweets using combined selector
        await page.waitForSelector(SELECTORS.tweetContainer.join(", "), {
          timeout: SELECTOR_TIMEOUT,
        });

        // Scroll to load more tweets — loop until no new tweets appear
        const MAX_SCROLLS = 10;
        const SCROLL_DELAY_MS = 2000;
        let previousCount = 0;

        for (let scroll = 0; scroll < MAX_SCROLLS; scroll++) {
          await page.evaluate(() => window.scrollBy(0, 2000));
          await new Promise((r) => setTimeout(r, SCROLL_DELAY_MS));

          const currentCount = await page.evaluate(
            (sel: string) => document.querySelectorAll(sel).length,
            SELECTORS.tweetContainer.join(", ")
          );

          if (currentCount === previousCount) break;
          previousCount = currentCount;
        }

        // Extract tweets — pass serializable config as argument
        const evalResult = await page.evaluate(
          (cfg: {
            tweetContainer: string[];
            tweetText: string[];
            socialContext: string[];
            timeElement: string[];
            likeButton: string[];
          }) => {
            // Inline resolveChild — cannot import modules in browser context
            function resolveChild(
              parent: Element,
              sels: string[]
            ): Element | null {
              for (const sel of sels) {
                const el = parent.querySelector(sel);
                if (el) return el;
              }
              return null;
            }

            // Find tweet elements using the first matching container selector
            let tweetElements: Element[] = [];
            let usedContainerSelector = "";
            for (const sel of cfg.tweetContainer) {
              const found = Array.from(document.querySelectorAll(sel));
              if (found.length > 0) {
                tweetElements = found;
                usedContainerSelector = sel;
                break;
              }
            }

            const results: {
              tweetId: string;
              text: string;
              timestamp: string;
              url: string;
              likes: number;
            }[] = [];

            let usedTextSelector = "";

            tweetElements.forEach((el) => {
              // Skip retweets
              const socialContext = resolveChild(el, cfg.socialContext);
              if (socialContext?.textContent?.includes("reposted")) return;

              // Get tweet link to extract ID
              const timeEl = resolveChild(el, cfg.timeElement);
              const linkEl = timeEl?.closest("a");
              const href = linkEl?.getAttribute("href") || "";
              const tweetIdMatch = href.match(/status\/(\d+)/);
              if (!tweetIdMatch) return;

              // Skip replies
              const allText = el.textContent || "";
              if (allText.includes("Replying to @")) return;

              // Get tweet text using first matching text selector
              let text = "";
              let matchedTextSel = "";
              for (const sel of cfg.tweetText) {
                const tweetTextEl = el.querySelector(sel);
                if (tweetTextEl?.textContent?.trim()) {
                  text = tweetTextEl.textContent.trim();
                  matchedTextSel = sel;
                  break;
                }
              }
              if (!text) return;
              if (!usedTextSelector) usedTextSelector = matchedTextSel;

              // Get timestamp
              const timestamp = timeEl?.getAttribute("datetime") || "";

              // Get likes
              const likeEl = resolveChild(el, cfg.likeButton);
              let likes = 0;
              if (likeEl) {
                const ariaLabel = likeEl.getAttribute("aria-label") || "";
                const likeMatch = ariaLabel.match(/(\d+)/);
                if (likeMatch) likes = parseInt(likeMatch[1], 10);
              }

              results.push({
                tweetId: tweetIdMatch[1],
                text,
                timestamp,
                url: `https://x.com${href}`,
                likes,
              });
            });

            return {
              tweets: results,
              selectorsUsed: {
                tweetContainer: usedContainerSelector,
                tweetText: usedTextSelector,
              },
            };
          },
          selectorConfig
        );

        if (evalResult.tweets.length === 0) {
          throw new Error("Zero tweets extracted");
        }

        // Detect fallback usage: primary selector is the first in each list
        const fallbacksTriggered =
          (evalResult.selectorsUsed.tweetContainer !== "" &&
            evalResult.selectorsUsed.tweetContainer !==
              SELECTORS.tweetContainer[0]) ||
          (evalResult.selectorsUsed.tweetText !== "" &&
            evalResult.selectorsUsed.tweetText !== SELECTORS.tweetText[0]);

        return {
          tweets: evalResult.tweets,
          selectorsUsed: evalResult.selectorsUsed,
          fallbacksTriggered,
          attempts: attempt,
        };
      } catch (err) {
        lastError = err;
        await page.close().catch(() => {});
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }
  } finally {
    await browser.close();
  }

  throw lastError;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify cron secret (Vercel sends this automatically for cron jobs)
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    if (!secret) {
      console.error("[CRON] CRON_SECRET env var is not set — cron job cannot authenticate");
    }
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await scrapeTweetsWithRetry();

    for (const tweet of result.tweets) {
      await insertTweet({
        x_tweet_id: tweet.tweetId,
        title: generateTitle(tweet.text),
        message: tweet.text,
        x_link: tweet.url,
        username: "KJFUTURES",
        name: "KJ",
        created_at: tweet.timestamp || new Date().toISOString(),
        likes: tweet.likes || 0,
      });
    }

    // Degradation alert if fallback selectors were used
    if (result.fallbacksTriggered) {
      await sendAlert(
        "[KJ Tweets] Selector degradation — fallback in use",
        `Scraper used fallback selectors during run.\nSelectors used: ${JSON.stringify(result.selectorsUsed, null, 2)}\nTweets scraped: ${result.tweets.length}`
      );
    }

    // Low tweet count alert
    if (result.tweets.length < LOW_TWEET_THRESHOLD) {
      await sendAlert(
        `[KJ Tweets] Low tweet count — only ${result.tweets.length} tweets extracted`,
        `Expected at least ${LOW_TWEET_THRESHOLD} tweets but got ${result.tweets.length}.\nSelectors used: ${JSON.stringify(result.selectorsUsed, null, 2)}`
      );
    }

    return res.status(200).json({
      success: true,
      scraped: result.tweets.length,
      attempts: result.attempts,
      selectorsUsed: result.selectorsUsed,
      fallbacksTriggered: result.fallbacksTriggered,
    });
  } catch (error) {
    console.error("Scraper error:", error);
    await sendAlert(
      "[KJ Tweets] Scraper FAILED — 0 tweets extracted",
      `Scraper failed after ${MAX_ATTEMPTS} attempts.\nError: ${String(error)}`
    );
    return res.status(500).json({
      success: false,
      error: String(error),
      attempts: MAX_ATTEMPTS,
      alertSent: true,
    });
  }
}
