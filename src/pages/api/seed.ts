import type { NextApiRequest, NextApiResponse } from "next";
import { initDb, insertTweet } from "@/lib/db";
import oldTweetsData from "../../../old_tweets.json";

interface SanityTweet {
  _id: string;
  title: string;
  message: string;
  xLink: string;
  createdAt: string;
  username: string | null;
  name: string | null;
}

function extractTweetId(xLink: string): string | undefined {
  const match = xLink?.match(/status\/(\d+)/);
  return match?.[1];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.headers.authorization !== `Bearer ${process.env.SEED_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await initDb();

    const tweets = (oldTweetsData as { result: SanityTweet[] }).result;
    let inserted = 0;

    for (const tweet of tweets) {
      const x_tweet_id = extractTweetId(tweet.xLink);
      await insertTweet({
        x_tweet_id,
        title: tweet.title,
        message: tweet.message,
        x_link: tweet.xLink,
        username: tweet.username || "KJFUTURES",
        name: tweet.name || "KJ",
        created_at: tweet.createdAt,
      });
      inserted++;
    }

    return res.status(200).json({ success: true, inserted });
  } catch (error) {
    console.error("Seed error:", error);
    return res.status(500).json({ error: String(error) });
  }
}
