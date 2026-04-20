import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

vi.mock("@/lib/db", () => ({
  getTweetsPaginated: vi.fn(),
  getTweetCount: vi.fn(),
}));

import handler from "@/pages/api/tweets";
import { getTweetsPaginated, getTweetCount } from "@/lib/db";

const mockGetTweetsPaginated = vi.mocked(getTweetsPaginated);
const mockGetTweetCount = vi.mocked(getTweetCount);

function createMockReqRes(method = "GET", query: Record<string, string> = {}) {
  const req = { method, query, headers: {}, socket: { remoteAddress: "127.0.0.1" } } as unknown as NextApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  } as unknown as NextApiResponse;
  return { req, res };
}

beforeEach(() => {
  mockGetTweetsPaginated.mockReset();
  mockGetTweetCount.mockReset();
  mockGetTweetCount.mockResolvedValue(100);
});

describe("GET /api/tweets", () => {
  it("returns 200 with paginated response", async () => {
    const result = {
      tweets: [{ id: "1", text: "Hello", createdAt: "2026-01-01", username: "KJ", name: "KJ" }],
      hasMore: false,
      nextCursor: null,
    };
    mockGetTweetsPaginated.mockResolvedValue(result as any);

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining(result));
  });

  it("sets Cache-Control header on first page (no cursor)", async () => {
    mockGetTweetsPaginated.mockResolvedValue({ tweets: [], hasMore: false, nextCursor: null } as any);

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "public, s-maxage=21600, stale-while-revalidate=3600"
    );
  });

  it("does not set Cache-Control header on cursor pages", async () => {
    mockGetTweetsPaginated.mockResolvedValue({ tweets: [], hasMore: false, nextCursor: null } as any);

    const { req, res } = createMockReqRes("GET", { cursor: "abc" });
    await handler(req, res);

    expect(res.setHeader).not.toHaveBeenCalledWith(
      "Cache-Control",
      expect.any(String)
    );
  });

  it("passes cursor and limit query params to getTweetsPaginated", async () => {
    mockGetTweetsPaginated.mockResolvedValue({ tweets: [], hasMore: false, nextCursor: null } as any);

    const { req, res } = createMockReqRes("GET", { cursor: "abc123", limit: "15" });
    await handler(req, res);

    expect(mockGetTweetsPaginated).toHaveBeenCalledWith("abc123", 15, "newest", undefined);
  });

  it("passes sort param to getTweetsPaginated", async () => {
    mockGetTweetsPaginated.mockResolvedValue({ tweets: [], hasMore: false, nextCursor: null } as any);

    const { req, res } = createMockReqRes("GET", { sort: "oldest" });
    await handler(req, res);

    expect(mockGetTweetsPaginated).toHaveBeenCalledWith(undefined, 30, "oldest", undefined);
  });

  it("passes sort=likes to getTweetsPaginated", async () => {
    mockGetTweetsPaginated.mockResolvedValue({ tweets: [], hasMore: false, nextCursor: null } as any);
    const { req, res } = createMockReqRes("GET", { sort: "likes" });
    await handler(req, res);
    expect(mockGetTweetsPaginated).toHaveBeenCalledWith(undefined, 30, "likes", undefined);
  });

  it("passes q search param to getTweetsPaginated", async () => {
    mockGetTweetsPaginated.mockResolvedValue({ tweets: [], hasMore: false, nextCursor: null } as any);
    const { req, res } = createMockReqRes("GET", { q: "bitcoin" });
    await handler(req, res);
    expect(mockGetTweetsPaginated).toHaveBeenCalledWith(undefined, 30, "newest", "bitcoin");
  });

  it("does not pass q when not provided", async () => {
    mockGetTweetsPaginated.mockResolvedValue({ tweets: [], hasMore: false, nextCursor: null } as any);
    const { req, res } = createMockReqRes("GET");
    await handler(req, res);
    expect(mockGetTweetsPaginated).toHaveBeenCalledWith(undefined, 30, "newest", undefined);
  });

  it("does not set Cache-Control when q is provided", async () => {
    mockGetTweetsPaginated.mockResolvedValue({ tweets: [], hasMore: false, nextCursor: null } as any);
    const { req, res } = createMockReqRes("GET", { q: "test" });
    await handler(req, res);
    expect(res.setHeader).not.toHaveBeenCalledWith(
      "Cache-Control",
      expect.any(String)
    );
  });

  it("returns 405 for non-GET methods", async () => {
    const { req, res } = createMockReqRes("POST");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 500 on database error", async () => {
    mockGetTweetsPaginated.mockRejectedValue(new Error("DB error"));

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to fetch tweets" });
  });
});
