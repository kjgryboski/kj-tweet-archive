import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";

config({ path: resolve(process.cwd(), ".env.local") });

import { insertTweet, getTweetById } from "../src/lib/db";
import { generateTitle } from "../src/lib/scraper-utils";

interface ScrapedTweet {
  id: string;
  text: string;
  time: string;
  href: string;
  likes: number;
  socialContext: string;
}

async function main() {
  const inputPath = resolve(process.cwd(), "scraped-tweets.json");
  const raw = JSON.parse(readFileSync(inputPath, "utf8")) as {
    total: number;
    tweets: ScrapedTweet[];
  };

  const candidates = raw.tweets.filter((t) => {
    const ctx = t.socialContext || "";
    if (ctx && !ctx.includes("Pinned")) return false;
    return t.text && t.text.trim().length > 0;
  });

  console.log(`Considering ${candidates.length} non-reply tweets with body text`);

  let inserted = 0;
  let updated = 0;
  for (const t of candidates) {
    try {
      const before = await getTweetById(t.id);
      await insertTweet({
        x_tweet_id: t.id,
        title: generateTitle(t.text),
        message: t.text,
        x_link: `https://x.com${t.href}`,
        username: "KJFUTURES",
        name: "KJ",
        created_at: t.time,
        likes: t.likes,
        source: "scraper",
      });
      if (before) updated++;
      else inserted++;
    } catch (err) {
      console.error(`Failed on ${t.id}:`, err);
    }
  }

  console.log(`Done. Inserted: ${inserted}, Updated: ${updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
