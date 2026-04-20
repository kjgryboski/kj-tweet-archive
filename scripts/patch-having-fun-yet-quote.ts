import { config } from "dotenv";
import { resolve } from "path";
import { existsSync, readdirSync, rmSync } from "fs";

config({ path: resolve(process.cwd(), ".env.local") });

import { sql } from "@vercel/postgres";
import { insertQuotedSnapshot, ensureSchema } from "../src/lib/db";

const OUTER_ID = "2036842208335204729";
const QUOTED_ID = "2019076229559677402";
const QUOTED_USERNAME = "KJFUTURES";
const QUOTED_NAME = "KJ";
const QUOTED_TEXT = "intraday traders in 2026.";
const QUOTED_URL = `https://x.com/${QUOTED_USERNAME}/status/${QUOTED_ID}`;
const QUOTED_CREATED_AT = "2026-02-04T00:00:00.000Z";

const APPLY = process.argv.includes("--apply");

async function main() {
  await ensureSchema();

  const outer = await sql`SELECT x_tweet_id, LEFT(message, 80) AS preview, quoted_tweet_id FROM tweets WHERE x_tweet_id = ${OUTER_ID}`;
  const quoted = await sql`SELECT x_tweet_id, LEFT(message, 80) AS preview FROM tweets WHERE x_tweet_id = ${QUOTED_ID}`;
  const outerMedia = await sql`SELECT media_key, media_type, url FROM tweet_media WHERE x_tweet_id = ${OUTER_ID} ORDER BY display_order`;
  const quotedMedia = await sql`SELECT media_key, media_type, url FROM tweet_media WHERE x_tweet_id = ${QUOTED_ID} ORDER BY display_order`;
  const existingSnapshot = await sql`SELECT x_tweet_id, quoted_tweet_id FROM quoted_tweet_snapshots WHERE x_tweet_id = ${OUTER_ID}`;

  console.log("Current state:");
  console.log("  Outer tweet:", outer.rows[0] ?? "NOT FOUND");
  console.log("  Quoted tweet:", quoted.rows[0] ?? "NOT FOUND");
  console.log("  Outer media rows:", outerMedia.rows.length, outerMedia.rows.map((r) => r.media_key));
  console.log("  Quoted media rows:", quotedMedia.rows.length, quotedMedia.rows.map((r) => r.media_key));
  console.log("  Existing snapshot:", existingSnapshot.rows[0] ?? "none");

  if (outer.rows.length === 0 || quoted.rows.length === 0) {
    console.error("Aborting: one or both tweets missing from tweets table.");
    process.exit(1);
  }

  const mediaDir = resolve(process.cwd(), "public", "scraped-media", OUTER_ID);
  const mediaFiles = existsSync(mediaDir) ? readdirSync(mediaDir) : [];
  console.log("  Local media dir:", mediaDir, "files:", mediaFiles);

  if (!APPLY) {
    console.log("\nDRY RUN. Re-run with --apply to perform changes.");
    console.log("Planned changes:");
    console.log(`  1. INSERT quoted_tweet_snapshots row (${OUTER_ID} -> ${QUOTED_ID})`);
    console.log(`  2. UPDATE tweets SET quoted_tweet_id = ${QUOTED_ID} WHERE x_tweet_id = ${OUTER_ID}`);
    console.log(`  3. DELETE tweet_media WHERE x_tweet_id = ${OUTER_ID} (${outerMedia.rows.length} rows)`);
    console.log(`  4. Remove local dir ${mediaDir} (${mediaFiles.length} files)`);
    return;
  }

  console.log("\nApplying...");

  await insertQuotedSnapshot({
    x_tweet_id: OUTER_ID,
    quoted_tweet_id: QUOTED_ID,
    quoted_username: QUOTED_USERNAME,
    quoted_name: QUOTED_NAME,
    quoted_text: QUOTED_TEXT,
    quoted_url: QUOTED_URL,
    quoted_created_at: QUOTED_CREATED_AT,
  });
  console.log("  [1/4] Inserted quoted_tweet_snapshots row");

  await sql`UPDATE tweets SET quoted_tweet_id = ${QUOTED_ID} WHERE x_tweet_id = ${OUTER_ID}`;
  console.log("  [2/4] Set quoted_tweet_id on outer tweet");

  const del = await sql`DELETE FROM tweet_media WHERE x_tweet_id = ${OUTER_ID}`;
  console.log(`  [3/4] Deleted ${del.rowCount} tweet_media row(s) for outer tweet`);

  if (existsSync(mediaDir)) {
    rmSync(mediaDir, { recursive: true, force: true });
    console.log(`  [4/4] Removed local media dir: ${mediaDir}`);
  } else {
    console.log("  [4/4] Local media dir did not exist, nothing to remove");
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
