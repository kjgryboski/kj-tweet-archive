import type { NextApiRequest, NextApiResponse } from "next";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { initDb, insertTweet, tweetExists } from "@/lib/db";
import { generateTitle, type ScrapedTweet } from "@/lib/scraper-utils";

export const config = {
  maxDuration: 120, // 2 minutes max for Pro plan
};

const PROFILE_URL = "https://x.com/KJFUTURES";

async function scrapeTweets(): Promise<ScrapedTweet[]> {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(PROFILE_URL, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for tweets to load
    await page.waitForSelector('[data-testid="tweet"]', { timeout: 30000 });

    // Scroll to load more tweets
    await page.evaluate(() => window.scrollBy(0, 2000));
    await new Promise((r) => setTimeout(r, 2000));

    // Extract tweets
    const tweets = await page.evaluate(() => {
      const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
      const results: {
        tweetId: string;
        text: string;
        timestamp: string;
        url: string;
      }[] = [];

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

        // Skip replies - check if this tweet is a reply by looking for "Replying to" text
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
    });

    return tweets;
  } finally {
    await browser.close();
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify cron secret (Vercel sends this automatically for cron jobs)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await initDb();

    const tweets = await scrapeTweets();
    let newCount = 0;

    for (const tweet of tweets) {
      const exists = await tweetExists(tweet.tweetId);
      if (exists) continue;

      await insertTweet({
        x_tweet_id: tweet.tweetId,
        title: generateTitle(tweet.text),
        message: tweet.text,
        x_link: tweet.url,
        username: "KJFUTURES",
        name: "KJ",
        created_at: tweet.timestamp || new Date().toISOString(),
      });
      newCount++;
    }

    return res.status(200).json({
      success: true,
      scraped: tweets.length,
      new: newCount,
    });
  } catch (error) {
    console.error("Scraper error:", error);
    return res.status(500).json({ error: String(error) });
  }
}
