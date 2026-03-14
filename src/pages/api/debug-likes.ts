import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@vercel/postgres";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Test 1: Check if likes column exists
    const { rows: cols } = await sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'tweets' AND column_name = 'likes'
    `;

    // Test 2: Check if index exists
    const { rows: idxs } = await sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'tweets' AND indexname = 'idx_tweets_likes_id'
    `;

    // Test 3: Try the actual query
    let queryResult;
    let queryError;
    try {
      const { rows } = await sql`SELECT x_tweet_id, likes FROM tweets ORDER BY likes DESC, id DESC LIMIT 3`;
      queryResult = rows;
    } catch (e: any) {
      queryError = e.message;
    }

    return res.status(200).json({
      likesColumn: cols,
      likesIndex: idxs,
      queryResult,
      queryError,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}
