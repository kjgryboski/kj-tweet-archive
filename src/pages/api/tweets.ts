import type { NextApiRequest, NextApiResponse } from "next";
import { getTweetsPaginated } from "@/lib/db";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 30;
    const sortParam = req.query.sort as string;
    const sort = (["newest", "oldest", "likes"] as const).includes(sortParam as any)
      ? (sortParam as "newest" | "oldest" | "likes")
      : "newest";

    const result = await getTweetsPaginated(cursor, limit, sort);

    if (!cursor && sort === "newest") {
      res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=3600");
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching tweets:", error);
    return res.status(500).json({ error: "Failed to fetch tweets" });
  }
}
