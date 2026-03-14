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
  await sql`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tweets_likes_id ON tweets(likes DESC, id DESC)`;
}

export interface PaginatedTweets {
  tweets: TweetProps[];
  hasMore: boolean;
  nextCursor: string | null;
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

  const tweets = resultRows.map((row) => ({
    id: row.x_tweet_id || String(row.id),
    text: row.message,
    title: row.title,
    createdAt: row.created_at?.toISOString() || new Date().toISOString(),
    username: row.username || "KJFUTURES",
    name: row.name || "KJ",
    xLink: row.x_link,
    likes: row.likes || 0,
  }));

  const lastTweet = resultRows[resultRows.length - 1];
  const nextCursor = hasMore && lastTweet
    ? (lastTweet.x_tweet_id || String(lastTweet.id))
    : null;

  return { tweets, hasMore, nextCursor };
}

export async function insertTweet(tweet: {
  x_tweet_id?: string;
  title: string;
  message: string;
  x_link?: string;
  username?: string;
  name?: string;
  created_at?: string;
  likes?: number;
}) {
  await sql`
    INSERT INTO tweets (x_tweet_id, title, message, x_link, username, name, created_at, likes)
    VALUES (
      ${tweet.x_tweet_id || null},
      ${tweet.title},
      ${tweet.message},
      ${tweet.x_link || null},
      ${tweet.username || "KJFUTURES"},
      ${tweet.name || "KJ"},
      ${tweet.created_at || new Date().toISOString()},
      ${tweet.likes || 0}
    )
    ON CONFLICT (x_tweet_id) DO UPDATE SET
      likes = EXCLUDED.likes,
      message = EXCLUDED.message,
      title = EXCLUDED.title
  `;
}

export async function updateTweetLikes(x_tweet_id: string, likes: number) {
  await sql`UPDATE tweets SET likes = ${likes} WHERE x_tweet_id = ${x_tweet_id}`;
}