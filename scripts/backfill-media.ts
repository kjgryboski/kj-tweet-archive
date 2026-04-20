import { config } from "dotenv";
import { resolve, join } from "path";
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "fs";

config({ path: resolve(process.cwd(), ".env.local") });

import { insertMedia, getTweetById } from "../src/lib/db";

interface ScrapedMedia {
  media_key: string;
  media_type: "photo" | "video" | "animated_gif";
  url: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  display_order: number;
}

interface ScrapedTweet {
  id: string;
  media: ScrapedMedia[];
}

const MEDIA_ROOT = resolve(process.cwd(), "public", "scraped-media");

function extFromContentType(ct: string | null, url: string): string {
  if (ct?.includes("jpeg")) return "jpg";
  if (ct?.includes("png")) return "png";
  if (ct?.includes("webp")) return "webp";
  if (ct?.includes("gif")) return "gif";
  try {
    const u = new URL(url);
    const fmt = u.searchParams.get("format");
    if (fmt) return fmt.toLowerCase();
  } catch { /* ignore */ }
  return "jpg";
}

async function downloadPhoto(
  tweetId: string,
  mediaKey: string,
  sourceUrl: string,
): Promise<{ localPath: string; ext: string } | null> {
  // Try existing file first (skip download if already on disk)
  const tweetDir = join(MEDIA_ROOT, tweetId);
  for (const ext of ["jpg", "png", "webp", "gif"]) {
    const candidate = join(tweetDir, `${mediaKey}.${ext}`);
    if (existsSync(candidate) && statSync(candidate).size > 0) {
      return { localPath: `/scraped-media/${tweetId}/${mediaKey}.${ext}`, ext };
    }
  }

  const res = await fetch(sourceUrl);
  if (!res.ok) {
    console.warn(`  fetch ${res.status} for ${mediaKey}: ${sourceUrl}`);
    return null;
  }
  const ct = res.headers.get("content-type");
  const ext = extFromContentType(ct, sourceUrl);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    console.warn(`  empty body for ${mediaKey}`);
    return null;
  }
  mkdirSync(tweetDir, { recursive: true });
  const filePath = join(tweetDir, `${mediaKey}.${ext}`);
  writeFileSync(filePath, buf);
  return { localPath: `/scraped-media/${tweetId}/${mediaKey}.${ext}`, ext };
}

async function main() {
  const inputPath = resolve(process.cwd(), "kj-scrape-full.json");
  const raw = JSON.parse(readFileSync(inputPath, "utf8")) as {
    total: number;
    tweets: ScrapedTweet[];
  };

  const candidates = raw.tweets.filter((t) => t.media && t.media.length > 0);
  console.log(`Tweets with media: ${candidates.length}`);
  mkdirSync(MEDIA_ROOT, { recursive: true });

  let downloaded = 0;
  let skippedMissingTweet = 0;
  let fetchFailed = 0;
  let dbUpserts = 0;
  let errors = 0;

  for (const t of candidates) {
    const tweet = await getTweetById(t.id);
    if (!tweet) {
      skippedMissingTweet++;
      continue;
    }
    for (const m of t.media) {
      if (m.media_type !== "photo") continue; // skip video/gif for now (only thumbnail would be saved)
      try {
        const result = await downloadPhoto(t.id, m.media_key, m.url);
        if (!result) {
          fetchFailed++;
          continue;
        }
        downloaded++;
        await insertMedia({
          x_tweet_id: t.id,
          media_key: m.media_key,
          media_type: m.media_type,
          url: result.localPath,
          thumbnail_url: m.thumbnail_url ?? null,
          width: m.width ?? null,
          height: m.height ?? null,
          display_order: m.display_order,
        });
        dbUpserts++;
      } catch (err) {
        errors++;
        console.error(`Failed ${t.id}/${m.media_key}:`, err);
      }
    }
  }

  console.log(
    `Done. downloaded=${downloaded} db_upserts=${dbUpserts} tweets_not_in_db=${skippedMissingTweet} fetch_failed=${fetchFailed} errors=${errors}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
