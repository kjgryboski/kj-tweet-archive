import type { NextApiRequest, NextApiResponse } from "next";
import { getTweets } from "@/lib/db";
import { TweetProps } from "@/components/Tweet";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TweetProps[] | { error: string }>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const tweets = await getTweets();
    return res.status(200).json(tweets);
  } catch (error) {
    console.error("Error fetching tweets:", error);
    return res.status(500).json({ error: "Failed to fetch tweets" });
  }
}
