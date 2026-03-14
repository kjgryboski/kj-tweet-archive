import type { NextApiRequest, NextApiResponse } from "next";
import { getTweetsPaginated, getTweetCount } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const checkRateLimit = rateLimit({ windowMs: 60_000, max: 60 });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket?.remoteAddress
    || "unknown";
  const { allowed, remaining } = checkRateLimit(ip);
  if (!allowed) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many requests" });
  }
  res.setHeader("X-RateLimit-Remaining", String(remaining));

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
    const q = (req.query.q as string) || undefined;

    const [result, totalCount] = await Promise.all([
      getTweetsPaginated(cursor, limit, sort, q),
      !cursor ? getTweetCount() : Promise.resolve(undefined),
    ]);

    if (!cursor && sort === "newest" && !q) {
      res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=3600");
    }

    return res.status(200).json({ ...result, totalCount });
  } catch (error) {
    console.error("Error fetching tweets:", error);
    return res.status(500).json({ error: "Failed to fetch tweets" });
  }
}
