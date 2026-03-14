import type { NextApiRequest, NextApiResponse } from "next";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { updateTweetLikes } from "@/lib/db";
import { SELECTORS } from "@/lib/scraper-selectors";
import { sendAlert } from "@/lib/email";

export const config = { maxDuration: 120 };

const PROFILE_URL = "https://x.com/KJFUTURES";
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3000;
const MAX_SCROLLS = 10;
const SCROLL_DELAY_MS = 2000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    if (!secret) {
      console.error("[CRON] CRON_SECRET env var is not set — cron job cannot authenticate");
    }
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const combinedSelector = SELECTORS.tweetContainer.join(", ");
    const selectorConfig = {
      tweetContainer: [...SELECTORS.tweetContainer],
      likeButton: [...SELECTORS.likeButton],
      timeElement: [...SELECTORS.timeElement],
    };

    let lastError: unknown;

    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

        try {
          await page.goto(PROFILE_URL, { waitUntil: "networkidle2", timeout: 30000 });
          await page.waitForSelector(combinedSelector, { timeout: 15000 });

          // Scroll to load more tweets — loop until no new tweets appear
          let previousCount = 0;
          for (let scroll = 0; scroll < MAX_SCROLLS; scroll++) {
            await page.evaluate(() => window.scrollBy(0, 2000));
            await new Promise((r) => setTimeout(r, SCROLL_DELAY_MS));

            const currentCount = await page.evaluate(
              (sel: string) => document.querySelectorAll(sel).length,
              combinedSelector
            );

            if (currentCount === previousCount) break;
            previousCount = currentCount;
          }

          const metrics = await page.evaluate((selectors) => {
            function resolveChild(parent: Element, sels: string[]): Element | null {
              for (const sel of sels) {
                const el = parent.querySelector(sel);
                if (el) return el;
              }
              return null;
            }

            let tweetElements: Element[] = [];
            for (const sel of selectors.tweetContainer) {
              tweetElements = Array.from(document.querySelectorAll(sel));
              if (tweetElements.length > 0) break;
            }

            const results: { tweetId: string; likes: number }[] = [];

            tweetElements.forEach((el) => {
              const timeEl = resolveChild(el, selectors.timeElement);
              const linkEl = timeEl?.closest("a");
              const href = linkEl?.getAttribute("href") || "";
              const tweetIdMatch = href.match(/status\/(\d+)/);
              if (!tweetIdMatch) return;

              const likeEl = resolveChild(el, selectors.likeButton);
              let likes = 0;
              if (likeEl) {
                const ariaLabel = likeEl.getAttribute("aria-label") || "";
                const match = ariaLabel.match(/(\d+)/);
                if (match) likes = parseInt(match[1], 10);
              }

              results.push({ tweetId: tweetIdMatch[1], likes });
            });

            return results;
          }, selectorConfig);

          let updated = 0;
          for (const { tweetId, likes } of metrics) {
            await updateTweetLikes(tweetId, likes);
            updated++;
          }

          return res.status(200).json({ success: true, updated });
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
  } catch (error) {
    console.error("Refresh metrics error:", error);
    await sendAlert(
      "[KJ Tweets] Metrics refresh FAILED",
      `Weekly like count refresh failed at ${new Date().toISOString()}.\n\nError: ${String(error)}`
    );
    return res.status(500).json({ error: String(error) });
  }
}
