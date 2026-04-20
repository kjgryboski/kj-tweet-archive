/**
 * X archive importer.
 *
 * Usage:
 *   npm run import-archive -- <path-to-unzipped-archive> [--dry-run] [--limit N]
 *
 * The <path> should point to the directory that contains `data/`. For a ZIP
 * from X, unzip it first — this script works on the extracted tree.
 *
 * Environment: reads POSTGRES_URL and BLOB_READ_WRITE_TOKEN from .env.local
 * (loaded automatically via dotenv).
 */
import "dotenv/config";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";

import {
  parseAccountJs,
  parseTweetsJs,
  normalizeTweets,
  filterAndResolveThreads,
  generateTitleFromText,
  ParsedMedia,
  ParsedTweet,
} from "../src/lib/x-archive-parser";
import {
  initDb,
  insertTweet,
  insertMedia,
  insertQuotedSnapshot,
  hasMedia,
} from "../src/lib/db";
import { uploadMedia, contentTypeForExt, blobPathForMedia } from "../src/lib/blob";

interface CliArgs {
  archivePath: string;
  dryRun: boolean;
  limit?: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const archivePath = args.find((a) => !a.startsWith("--"));
  if (!archivePath) {
    console.error(
      "Usage: import-x-archive <archive-dir> [--dry-run] [--limit N]",
    );
    process.exit(1);
  }
  const dryRun = args.includes("--dry-run");
  const limitFlag = args.find((a) => a.startsWith("--limit="));
  const limit = limitFlag ? parseInt(limitFlag.split("=")[1], 10) : undefined;
  return { archivePath, dryRun, limit };
}

function findTweetJsFiles(dataDir: string): string[] {
  return readdirSync(dataDir)
    .filter((f) => f === "tweets.js" || /^tweets-part\d+\.js$/.test(f))
    .sort()
    .map((f) => join(dataDir, f));
}

function indexMediaFolder(mediaDir: string): Map<string, string> {
  const byStem = new Map<string, string>();
  if (!existsSync(mediaDir)) return byStem;
  for (const name of readdirSync(mediaDir)) {
    const full = join(mediaDir, name);
    try {
      if (!statSync(full).isFile()) continue;
    } catch {
      continue;
    }
    const ext = extname(name).slice(1);
    const stem = basename(name, extname(name));
    const existing = byStem.get(stem);
    if (!existing || preferExt(ext, extname(existing).slice(1))) {
      byStem.set(stem, full);
    }
  }
  return byStem;
}

// When both a video and its thumbnail exist for the same stem, prefer the mp4.
function preferExt(candidate: string, current: string): boolean {
  const rank: Record<string, number> = { mp4: 3, webm: 2, gif: 1 };
  return (rank[candidate.toLowerCase()] ?? 0) > (rank[current.toLowerCase()] ?? 0);
}

async function uploadMediaFor(
  tweet: ParsedTweet,
  media: ParsedMedia,
  mediaIndex: Map<string, string>,
  dryRun: boolean,
): Promise<{ url: string; thumbnailUrl?: string; ext: string }> {
  const stem = `${tweet.idStr}-${media.mediaKey}`;
  const localPath = mediaIndex.get(stem);

  if (localPath) {
    const ext = extname(localPath).slice(1).toLowerCase() || "jpg";
    if (dryRun) {
      return { url: `blob://tweets/${tweet.idStr}/${media.mediaKey}.${ext}`, ext };
    }
    const buf = readFileSync(localPath);
    const url = await uploadMedia(
      blobPathForMedia(tweet.idStr, media.mediaKey, ext),
      buf,
      contentTypeForExt(ext),
    );

    if ((media.type === "video" || media.type === "animated_gif") && media.thumbnailUrl) {
      const thumbExt = media.thumbnailUrl.split(".").pop()?.split("?")[0] || "jpg";
      try {
        const thumbRes = await fetch(media.thumbnailUrl);
        if (thumbRes.ok) {
          const thumbBuf = Buffer.from(await thumbRes.arrayBuffer());
          const thumbUrl = await uploadMedia(
            blobPathForMedia(tweet.idStr, `${media.mediaKey}-thumb`, thumbExt),
            thumbBuf,
            contentTypeForExt(thumbExt),
          );
          return { url, thumbnailUrl: thumbUrl, ext };
        }
      } catch (err) {
        console.warn(`  [warn] failed to fetch thumbnail for ${stem}:`, err);
      }
    }
    return { url, ext };
  }

  // No local file — fall back to X's CDN URL. Unstable long-term but better
  // than dropping the media entirely. This usually only hits for very old
  // videos that the archive elided.
  const ext = extname(media.sourceUrl).slice(1).split("?")[0] || "jpg";
  console.warn(`  [warn] no local file for ${stem}, falling back to CDN URL`);
  return { url: media.sourceUrl, thumbnailUrl: media.thumbnailUrl, ext };
}

async function main() {
  const { archivePath, dryRun, limit } = parseArgs();
  const dataDir = join(archivePath, "data");
  if (!existsSync(dataDir)) {
    console.error(`data/ not found under ${archivePath}`);
    process.exit(1);
  }

  const accountPath = join(dataDir, "account.js");
  if (!existsSync(accountPath)) {
    console.error(`data/account.js not found`);
    process.exit(1);
  }

  console.log(`Importing from ${archivePath} (dryRun=${dryRun})`);
  const account = parseAccountJs(readFileSync(accountPath, "utf8"));
  console.log(
    `Account: @${account.username} (id=${account.accountId}, name="${account.displayName}")`,
  );

  const tweetFiles = findTweetJsFiles(dataDir);
  if (tweetFiles.length === 0) {
    console.error("no tweets.js / tweets-partN.js files found");
    process.exit(1);
  }
  console.log(`Tweet files: ${tweetFiles.map((f) => basename(f)).join(", ")}`);

  const raws = tweetFiles.flatMap((f) => parseTweetsJs(readFileSync(f, "utf8")));
  console.log(`Raw tweet entries: ${raws.length}`);

  const normalized = normalizeTweets(raws, account);
  const counts = normalized.reduce<Record<string, number>>((acc, t) => {
    acc[t.classification] = (acc[t.classification] || 0) + 1;
    return acc;
  }, {});
  console.log(`Classification counts:`, counts);

  const kept = filterAndResolveThreads(normalized);
  console.log(`Kept after filter (originals + quotes + self-reply threads): ${kept.length}`);

  const toImport = limit ? kept.slice(-limit) : kept;
  if (limit) console.log(`--limit=${limit} — importing ${toImport.length} most recent kept`);

  const mediaIndex = indexMediaFolder(join(dataDir, "tweet_media"));
  console.log(`Media files on disk: ${mediaIndex.size}`);

  if (!dryRun) {
    console.log("Running initDb() to ensure schema is up to date…");
    await initDb();
  }

  let imported = 0;
  let mediaCount = 0;
  let mediaSkipped = 0;
  let quoteCount = 0;

  for (const tweet of toImport) {
    const xLink = `https://x.com/${account.username}/status/${tweet.idStr}`;
    const title = generateTitleFromText(tweet.cleanText || tweet.fullText);
    const payload = {
      x_tweet_id: tweet.idStr,
      title,
      message: tweet.cleanText || tweet.fullText,
      x_link: xLink,
      username: account.username,
      name: account.displayName,
      created_at: tweet.createdAt,
      likes: tweet.favoriteCount,
      is_thread_part: tweet.isThreadPart,
      thread_root_id: tweet.threadRootId ?? null,
      in_reply_to_status_id: tweet.inReplyToStatusId ?? null,
      quoted_tweet_id: tweet.quotedTweetId ?? null,
      reply_count: tweet.replyCount,
      retweet_count: tweet.retweetCount,
      quote_count: tweet.quoteCount,
      source: "archive" as const,
    };

    if (dryRun) {
      console.log(
        `[dry] ${tweet.idStr} (${tweet.classification}) media=${tweet.media.length} quoted=${tweet.quotedTweetId ?? "-"}`,
      );
    } else {
      await insertTweet(payload);
    }
    imported++;

    for (let i = 0; i < tweet.media.length; i++) {
      const m = tweet.media[i];
      // Idempotency: skip re-upload if this exact (tweet, media_key) is
      // already persisted. Lets the importer be safely re-run after a
      // partial failure without redundantly pushing the same bytes to Blob.
      if (!dryRun && (await hasMedia(tweet.idStr, m.mediaKey))) {
        mediaSkipped++;
        continue;
      }
      const { url, thumbnailUrl } = await uploadMediaFor(tweet, m, mediaIndex, dryRun);
      if (!dryRun) {
        await insertMedia({
          x_tweet_id: tweet.idStr,
          media_key: m.mediaKey,
          media_type: m.type,
          url,
          thumbnail_url: thumbnailUrl ?? m.thumbnailUrl ?? null,
          width: m.width ?? null,
          height: m.height ?? null,
          duration_ms: m.durationMs ?? null,
          display_order: i,
        });
      }
      mediaCount++;
    }

    if (tweet.quotedTweetId && tweet.quotedTweetUrl) {
      if (!dryRun) {
        await insertQuotedSnapshot({
          x_tweet_id: tweet.idStr,
          quoted_tweet_id: tweet.quotedTweetId,
          quoted_username: tweet.quotedTweetUsername ?? null,
          quoted_name: null,
          quoted_text: null,
          quoted_url: tweet.quotedTweetUrl,
        });
      }
      quoteCount++;
    }

    if (imported % 50 === 0) {
      console.log(
        `  …${imported}/${toImport.length} tweets, ${mediaCount} media, ${quoteCount} quotes`,
      );
    }
  }

  console.log(
    `Done. tweets=${imported} media=${mediaCount} mediaSkipped=${mediaSkipped} quotes=${quoteCount} dryRun=${dryRun}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
