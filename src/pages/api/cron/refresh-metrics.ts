import type { NextApiRequest, NextApiResponse } from "next";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { updateTweetLikes } from "@/lib/db";
import { SELECTORS } from "@/lib/scraper-selectors";

export const config = { maxDuration: 120 };

const PROFILE_URL = "https://x.com/KJFUTURES";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
      await page.goto(PROFILE_URL, { waitUntil: "networkidle2", timeout: 30000 });

      const combinedSelector = SELECTORS.tweetContainer.join(", ");
      await page.waitForSelector(combinedSelector, { timeout: 15000 });

      const selectorConfig = {
        tweetContainer: [...SELECTORS.tweetContainer],
        likeButton: [...SELECTORS.likeButton],
        timeElement: [...SELECTORS.timeElement],
      };

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
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error("Refresh metrics error:", error);
    return res.status(500).json({ error: String(error) });
  }
}
