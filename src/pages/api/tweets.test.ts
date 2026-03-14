import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

vi.mock("@/lib/db", () => ({
  getTweets: vi.fn(),
}));

import handler from "./tweets";
import { getTweets } from "@/lib/db";

const mockGetTweets = vi.mocked(getTweets);

function createMockReqRes(method = "GET") {
  const req = { method } as NextApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  } as unknown as NextApiResponse;
  return { req, res };
}

beforeEach(() => {
  mockGetTweets.mockReset();
});

describe("GET /api/tweets", () => {
  it("returns 200 with tweets", async () => {
    const tweets = [{ id: "1", text: "Hello", createdAt: "2026-01-01", username: "KJ", name: "KJ" }];
    mockGetTweets.mockResolvedValue(tweets as any);

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(tweets);
  });

  it("sets Cache-Control header on success", async () => {
    mockGetTweets.mockResolvedValue([]);

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "public, s-maxage=21600, stale-while-revalidate=3600"
    );
  });

  it("returns 405 for non-GET methods", async () => {
    const { req, res } = createMockReqRes("POST");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 500 on database error", async () => {
    mockGetTweets.mockRejectedValue(new Error("DB error"));

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to fetch tweets" });
  });
});
