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
