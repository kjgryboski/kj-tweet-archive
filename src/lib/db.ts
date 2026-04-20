import { sql } from "@vercel/postgres";
import { TweetProps, TweetMedia, QuotedTweet } from "@/components/Tweet";

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS tweets (
      id SERIAL PRIMARY KEY,
      x_tweet_id VARCHAR(255) UNIQUE,
      title TEXT,
      message TEXT NOT NULL,
      x_link TEXT,
      username VARCHAR(255) DEFAULT 'KJFUTURES',
      name VARCHAR(255) DEFAULT 'KJ',
      created_at TIMESTAMP,
      scraped_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_tweets_created_at_id ON tweets(created_at DESC, id DESC)
  `;
  await sql`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tweets_likes_id ON tweets(likes DESC, id DESC)`;

  await sql`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS is_thread_part BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS thread_root_id VARCHAR(255)`;
  await sql`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS in_reply_to_status_id VARCHAR(255)`;
  await sql`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS quoted_tweet_id VARCHAR(255)`;
  await sql`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0`;
  await sql`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS retweet_count INTEGER DEFAULT 0`;
  await sql`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS quote_count INTEGER DEFAULT 0`;
  await sql`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'scraper'`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tweets_thread_root ON tweets(thread_root_id) WHERE thread_root_id IS NOT NULL`;

  await sql`
    CREATE TABLE IF NOT EXISTS tweet_media (
      id SERIAL PRIMARY KEY,
      x_tweet_id VARCHAR(255) NOT NULL,
      media_key VARCHAR(255) NOT NULL,
      media_type VARCHAR(20) NOT NULL,
      url TEXT NOT NULL,
      thumbnail_url TEXT,
      width INTEGER,
      height INTEGER,
      duration_ms INTEGER,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(x_tweet_id, media_key)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_tweet_media_tweet ON tweet_media(x_tweet_id, display_order)`;

  await sql`
    CREATE TABLE IF NOT EXISTS quoted_tweet_snapshots (
      x_tweet_id VARCHAR(255) PRIMARY KEY,
      quoted_tweet_id VARCHAR(255) NOT NULL,
      quoted_username VARCHAR(255),
      quoted_name VARCHAR(255),
      quoted_text TEXT,
      quoted_url TEXT,
      quoted_created_at TIMESTAMP,
      captured_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

/**
 * Memoized once-per-process schema guard. Cron handlers call this on every
 * invocation; on warm starts it's a cached no-op, on cold starts it runs
 * idempotent `CREATE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` DDL so the
 * scraper doesn't blow up when `tweet_media` or `quoted_tweet_snapshots`
 * haven't been created yet (e.g. fresh DB before the archive importer runs).
 */
let schemaReady: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = initDb().catch((err) => {
      // Reset so the next caller retries — don't poison the promise.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

export interface PaginatedTweets {
  tweets: TweetProps[];
  hasMore: boolean;
  nextCursor: string | null;
}

function mapRowToTweet(row: Record<string, unknown>): TweetProps {
  const createdAtVal = row.created_at;
  const createdAtIso =
    createdAtVal instanceof Date
      ? createdAtVal.toISOString()
      : typeof createdAtVal === "string"
        ? new Date(createdAtVal).toISOString()
        : new Date().toISOString();
  return {
    id: (row.x_tweet_id as string) || String(row.id),
    text: row.message as string,
    title: (row.title as string) || undefined,
    createdAt: createdAtIso,
    username: (row.username as string) || "KJFUTURES",
    name: (row.name as string) || "KJ",
    xLink: (row.x_link as string) || undefined,
    likes: (row.likes as number) || 0,
    isThreadPart: Boolean(row.is_thread_part),
    threadRootId: (row.thread_root_id as string) || undefined,
    replyCount: (row.reply_count as number) || 0,
    retweetCount: (row.retweet_count as number) || 0,
    quoteCount: (row.quote_count as number) || 0,
  };
}

async function hydrateTweets(tweets: TweetProps[]): Promise<TweetProps[]> {
  if (tweets.length === 0) return tweets;
  const ids = tweets.map((t) => t.id);

  const [mediaRes, quotedRes] = await Promise.all([
    sql`
      SELECT x_tweet_id, media_key, media_type, url, thumbnail_url,
             width, height, duration_ms, display_order
      FROM tweet_media
      WHERE x_tweet_id = ANY(${ids as unknown as string}::text[])
      ORDER BY x_tweet_id, display_order ASC, id ASC
    `,
    sql`
      SELECT x_tweet_id, quoted_tweet_id, quoted_username, quoted_name,
             quoted_text, quoted_url, quoted_created_at
      FROM quoted_tweet_snapshots
      WHERE x_tweet_id = ANY(${ids as unknown as string}::text[])
    `,
  ]);

  const mediaByTweet = new Map<string, TweetMedia[]>();
  for (const row of mediaRes.rows) {
    const list = mediaByTweet.get(row.x_tweet_id) || [];
    list.push({
      mediaKey: row.media_key,
      type: row.media_type,
      url: row.url,
      thumbnailUrl: row.thumbnail_url || undefined,
      width: row.width || undefined,
      height: row.height || undefined,
      durationMs: row.duration_ms || undefined,
    });
    mediaByTweet.set(row.x_tweet_id, list);
  }

  const quoteByTweet = new Map<string, QuotedTweet>();
  for (const row of quotedRes.rows) {
    const qCreated = row.quoted_created_at;
    quoteByTweet.set(row.x_tweet_id, {
      id: row.quoted_tweet_id,
      username: row.quoted_username || undefined,
      name: row.quoted_name || undefined,
      text: row.quoted_text || undefined,
      url: row.quoted_url || undefined,
      createdAt:
        qCreated instanceof Date
          ? qCreated.toISOString()
          : typeof qCreated === "string"
            ? new Date(qCreated).toISOString()
            : undefined,
    });
  }

  return tweets.map((t) => ({
    ...t,
    media: mediaByTweet.get(t.id),
    quotedTweet: quoteByTweet.get(t.id),
  }));
}

export async function getTweetsPaginated(
  cursor?: string,
  limit: number = 30,
  sort: "newest" | "oldest" | "likes" = "newest",
  q?: string
): Promise<PaginatedTweets> {
  const safeLimit = Math.min(Math.max(1, limit || 30), 100);
  const fetchLimit = safeLimit + 1;
  const pattern = q ? '%' + q + '%' : null;

  let rows;
  if (sort === "oldest") {
    if (cursor) {
      if (q) {
        ({ rows } = await sql`
          SELECT * FROM tweets
          WHERE (created_at, id) > (
            SELECT created_at, id FROM tweets WHERE x_tweet_id = ${cursor}
          )
          AND (message ILIKE ${pattern} OR title ILIKE ${pattern})
          ORDER BY created_at ASC, id ASC
          LIMIT ${fetchLimit}
        `);
      } else {
        ({ rows } = await sql`
          SELECT * FROM tweets
          WHERE (created_at, id) > (
            SELECT created_at, id FROM tweets WHERE x_tweet_id = ${cursor}
          )
          ORDER BY created_at ASC, id ASC
          LIMIT ${fetchLimit}
        `);
      }
    } else {
      if (q) {
        ({ rows } = await sql`
          SELECT * FROM tweets
          WHERE (message ILIKE ${pattern} OR title ILIKE ${pattern})
          ORDER BY created_at ASC, id ASC
          LIMIT ${fetchLimit}
        `);
      } else {
        ({ rows } = await sql`
          SELECT * FROM tweets
          ORDER BY created_at ASC, id ASC
          LIMIT ${fetchLimit}
        `);
      }
    }
  } else if (sort === "likes") {
    if (cursor) {
      if (q) {
        ({ rows } = await sql`
          SELECT * FROM tweets
          WHERE (likes, id) < (SELECT likes, id FROM tweets WHERE x_tweet_id = ${cursor})
          AND (message ILIKE ${pattern} OR title ILIKE ${pattern})
          ORDER BY likes DESC, id DESC
          LIMIT ${fetchLimit}
        `);
      } else {
        ({ rows } = await sql`
          SELECT * FROM tweets
          WHERE (likes, id) < (SELECT likes, id FROM tweets WHERE x_tweet_id = ${cursor})
          ORDER BY likes DESC, id DESC
          LIMIT ${fetchLimit}
        `);
      }
    } else {
      if (q) {
        ({ rows } = await sql`
          SELECT * FROM tweets
          WHERE (message ILIKE ${pattern} OR title ILIKE ${pattern})
          ORDER BY likes DESC, id DESC
          LIMIT ${fetchLimit}
        `);
      } else {
        ({ rows } = await sql`
          SELECT * FROM tweets ORDER BY likes DESC, id DESC LIMIT ${fetchLimit}
        `);
      }
    }
  } else {
    if (cursor) {
      if (q) {
        ({ rows } = await sql`
          SELECT * FROM tweets
          WHERE (created_at, id) < (
            SELECT created_at, id FROM tweets WHERE x_tweet_id = ${cursor}
          )
          AND (message ILIKE ${pattern} OR title ILIKE ${pattern})
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `);
      } else {
        ({ rows } = await sql`
          SELECT * FROM tweets
          WHERE (created_at, id) < (
            SELECT created_at, id FROM tweets WHERE x_tweet_id = ${cursor}
          )
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `);
      }
    } else {
      if (q) {
        ({ rows } = await sql`
          SELECT * FROM tweets
          WHERE (message ILIKE ${pattern} OR title ILIKE ${pattern})
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `);
      } else {
        ({ rows } = await sql`
          SELECT * FROM tweets
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `);
      }
    }
  }

  const hasMore = rows.length > safeLimit;
  const resultRows = hasMore ? rows.slice(0, safeLimit) : rows;

  const baseTweets = resultRows.map(mapRowToTweet);
  const tweets = await hydrateTweets(baseTweets);

  const lastTweet = resultRows[resultRows.length - 1];
  const nextCursor = hasMore && lastTweet
    ? (lastTweet.x_tweet_id || String(lastTweet.id))
    : null;

  return { tweets, hasMore, nextCursor };
}

export interface InsertTweetInput {
  x_tweet_id?: string;
  title: string;
  message: string;
  x_link?: string;
  username?: string;
  name?: string;
  created_at?: string;
  likes?: number;
  is_thread_part?: boolean;
  thread_root_id?: string | null;
  in_reply_to_status_id?: string | null;
  quoted_tweet_id?: string | null;
  reply_count?: number;
  retweet_count?: number;
  quote_count?: number;
  source?: "scraper" | "archive";
}

export async function insertTweet(tweet: InsertTweetInput) {
  await sql`
    INSERT INTO tweets (
      x_tweet_id, title, message, x_link, username, name, created_at, likes,
      is_thread_part, thread_root_id, in_reply_to_status_id, quoted_tweet_id,
      reply_count, retweet_count, quote_count, source
    )
    VALUES (
      ${tweet.x_tweet_id || null},
      ${tweet.title},
      ${tweet.message},
      ${tweet.x_link || null},
      ${tweet.username || "KJFUTURES"},
      ${tweet.name || "KJ"},
      ${tweet.created_at || new Date().toISOString()},
      ${tweet.likes || 0},
      ${tweet.is_thread_part ?? false},
      ${tweet.thread_root_id ?? null},
      ${tweet.in_reply_to_status_id ?? null},
      ${tweet.quoted_tweet_id ?? null},
      ${tweet.reply_count ?? 0},
      ${tweet.retweet_count ?? 0},
      ${tweet.quote_count ?? 0},
      ${tweet.source ?? "scraper"}
    )
    ON CONFLICT (x_tweet_id) DO UPDATE SET
      likes = EXCLUDED.likes,
      message = EXCLUDED.message,
      title = EXCLUDED.title,
      is_thread_part = EXCLUDED.is_thread_part,
      thread_root_id = EXCLUDED.thread_root_id,
      in_reply_to_status_id = EXCLUDED.in_reply_to_status_id,
      quoted_tweet_id = EXCLUDED.quoted_tweet_id,
      reply_count = GREATEST(tweets.reply_count, EXCLUDED.reply_count),
      retweet_count = GREATEST(tweets.retweet_count, EXCLUDED.retweet_count),
      quote_count = GREATEST(tweets.quote_count, EXCLUDED.quote_count),
      source = EXCLUDED.source
  `;
}

export interface InsertMediaInput {
  x_tweet_id: string;
  media_key: string;
  media_type: "photo" | "video" | "animated_gif";
  url: string;
  thumbnail_url?: string | null;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  display_order?: number;
}

export async function insertMedia(media: InsertMediaInput) {
  await sql`
    INSERT INTO tweet_media (
      x_tweet_id, media_key, media_type, url, thumbnail_url,
      width, height, duration_ms, display_order
    )
    VALUES (
      ${media.x_tweet_id},
      ${media.media_key},
      ${media.media_type},
      ${media.url},
      ${media.thumbnail_url ?? null},
      ${media.width ?? null},
      ${media.height ?? null},
      ${media.duration_ms ?? null},
      ${media.display_order ?? 0}
    )
    ON CONFLICT (x_tweet_id, media_key) DO UPDATE SET
      url = EXCLUDED.url,
      thumbnail_url = EXCLUDED.thumbnail_url,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      duration_ms = EXCLUDED.duration_ms,
      display_order = EXCLUDED.display_order
  `;
}

export interface InsertQuotedSnapshotInput {
  x_tweet_id: string;
  quoted_tweet_id: string;
  quoted_username?: string | null;
  quoted_name?: string | null;
  quoted_text?: string | null;
  quoted_url?: string | null;
  quoted_created_at?: string | null;
}

export async function insertQuotedSnapshot(snap: InsertQuotedSnapshotInput) {
  await sql`
    INSERT INTO quoted_tweet_snapshots (
      x_tweet_id, quoted_tweet_id, quoted_username, quoted_name,
      quoted_text, quoted_url, quoted_created_at
    )
    VALUES (
      ${snap.x_tweet_id},
      ${snap.quoted_tweet_id},
      ${snap.quoted_username ?? null},
      ${snap.quoted_name ?? null},
      ${snap.quoted_text ?? null},
      ${snap.quoted_url ?? null},
      ${snap.quoted_created_at ?? null}
    )
    ON CONFLICT (x_tweet_id) DO UPDATE SET
      quoted_tweet_id = EXCLUDED.quoted_tweet_id,
      quoted_username = EXCLUDED.quoted_username,
      quoted_name = EXCLUDED.quoted_name,
      quoted_text = EXCLUDED.quoted_text,
      quoted_url = EXCLUDED.quoted_url,
      quoted_created_at = EXCLUDED.quoted_created_at
  `;
}

export async function getTweetById(x_tweet_id: string): Promise<TweetProps | null> {
  const { rows } = await sql`
    SELECT * FROM tweets WHERE x_tweet_id = ${x_tweet_id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  const [hydrated] = await hydrateTweets([mapRowToTweet(rows[0])]);
  return hydrated;
}

export async function getTweetCount(): Promise<number> {
  const { rows } = await sql`SELECT COUNT(*) as count FROM tweets`;
  return parseInt(rows[0].count, 10);
}

export async function updateTweetLikes(x_tweet_id: string, likes: number) {
  await sql`UPDATE tweets SET likes = ${likes} WHERE x_tweet_id = ${x_tweet_id}`;
}