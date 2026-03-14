import { sql } from "@vercel/postgres";
import { TweetProps } from "@/components/Tweet";

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
}

export interface PaginatedTweets {
  tweets: TweetProps[];
  hasMore: boolean;
  nextCursor: string | null;
}

export async function getTweetsPaginated(
  cursor?: string,
  limit: number = 30,
  sort: "newest" | "oldest" = "newest"
): Promise<PaginatedTweets> {
  const safeLimit = Math.min(Math.max(1, limit || 30), 100);
  const fetchLimit = safeLimit + 1;

  let rows;
  if (sort === "oldest") {
    if (cursor) {
      ({ rows } = await sql`
        SELECT * FROM tweets
        WHERE (created_at, id) > (
          SELECT created_at, id FROM tweets WHERE x_tweet_id = ${cursor}
        )
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
  } else {
    if (cursor) {
      ({ rows } = await sql`
        SELECT * FROM tweets
        WHERE (created_at, id) < (
          SELECT created_at, id FROM tweets WHERE x_tweet_id = ${cursor}
        )
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

  const hasMore = rows.length > safeLimit;
  const resultRows = hasMore ? rows.slice(0, safeLimit) : rows;

  const tweets = resultRows.map((row) => ({
    id: row.x_tweet_id || String(row.id),
    text: row.message,
    title: row.title,
    createdAt: row.created_at?.toISOString() || new Date().toISOString(),
    username: row.username || "KJFUTURES",
    name: row.name || "KJ",
    xLink: row.x_link,
  }));

  const lastTweet = resultRows[resultRows.length - 1];
  const nextCursor = hasMore && lastTweet
    ? (lastTweet.x_tweet_id || String(lastTweet.id))
    : null;

  return { tweets, hasMore, nextCursor };
}

export async function getTweets(): Promise<TweetProps[]> {
  const { rows } = await sql`
    SELECT * FROM tweets ORDER BY created_at DESC
  `;
  return rows.map((row) => ({
    id: row.x_tweet_id || String(row.id),
    text: row.message,
    title: row.title,
    createdAt: row.created_at?.toISOString() || new Date().toISOString(),
    username: row.username || "KJFUTURES",
    name: row.name || "KJ",
    xLink: row.x_link,
  }));
}

export async function insertTweet(tweet: {
  x_tweet_id?: string;
  title: string;
  message: string;
  x_link?: string;
  username?: string;
  name?: string;
  created_at?: string;
}) {
  await sql`
    INSERT INTO tweets (x_tweet_id, title, message, x_link, username, name, created_at)
    VALUES (
      ${tweet.x_tweet_id || null},
      ${tweet.title},
      ${tweet.message},
      ${tweet.x_link || null},
      ${tweet.username || "KJFUTURES"},
      ${tweet.name || "KJ"},
      ${tweet.created_at || new Date().toISOString()}
    )
    ON CONFLICT (x_tweet_id) DO NOTHING
  `;
}

export async function tweetExists(x_tweet_id: string): Promise<boolean> {
  const { rows } = await sql`
    SELECT 1 FROM tweets WHERE x_tweet_id = ${x_tweet_id} LIMIT 1
  `;
  return rows.length > 0;
}
