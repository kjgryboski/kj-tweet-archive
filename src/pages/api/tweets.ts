import type { NextApiRequest, NextApiResponse } from "next";
import { fetchUserTweets } from "@/lib/api";
import { TweetProps } from "@/components/Tweet";

type ErrorResponse = {
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TweetProps[] | ErrorResponse>
) {
  try {
    // Only allow GET requests
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const tweets = await fetchUserTweets();
    return res.status(200).json(tweets);
  } catch (error) {
    console.error("Error in API:", error);
    return res.status(500).json({ error: "Failed to fetch tweets" });
  }
}
