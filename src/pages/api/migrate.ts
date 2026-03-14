import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@vercel/postgres";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await sql`ALTER TABLE tweets ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0`;
    await sql`CREATE INDEX IF NOT EXISTS idx_tweets_likes_id ON tweets(likes DESC, id DESC)`;

    return res.status(200).json({ success: true, message: "Migration complete: likes column and index added" });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
