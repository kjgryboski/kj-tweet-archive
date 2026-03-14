import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

const {
  mockEvaluate,
  mockGoto,
  mockWaitForSelector,
  mockSetUserAgent,
  mockBrowserClose,
  mockNewPage,
  mockLaunch,
  mockInitDb,
  mockInsertTweet,
  mockTweetExists,
  mockGenerateTitle,
  mockExecutablePath,
} = vi.hoisted(() => {
  const mockEvaluate = vi.fn();
  const mockGoto = vi.fn().mockResolvedValue(undefined);
  const mockWaitForSelector = vi.fn().mockResolvedValue(undefined);
  const mockSetUserAgent = vi.fn().mockResolvedValue(undefined);
  const mockBrowserClose = vi.fn().mockResolvedValue(undefined);
  const mockNewPage = vi.fn().mockResolvedValue({
    setUserAgent: mockSetUserAgent,
    goto: mockGoto,
    waitForSelector: mockWaitForSelector,
    evaluate: mockEvaluate,
  });
  const mockLaunch = vi.fn().mockResolvedValue({
    newPage: mockNewPage,
    close: mockBrowserClose,
  });
  const mockInitDb = vi.fn().mockResolvedValue(undefined);
  const mockInsertTweet = vi.fn().mockResolvedValue(undefined);
  const mockTweetExists = vi.fn();
  const mockGenerateTitle = vi.fn((text: string) => text.slice(0, 30));
  const mockExecutablePath = vi.fn().mockResolvedValue("/usr/bin/chromium");

  return {
    mockEvaluate,
    mockGoto,
    mockWaitForSelector,
    mockSetUserAgent,
    mockBrowserClose,
    mockNewPage,
    mockLaunch,
    mockInitDb,
    mockInsertTweet,
    mockTweetExists,
    mockGenerateTitle,
    mockExecutablePath,
  };
});

vi.mock("puppeteer-core", () => ({
  default: { launch: mockLaunch },
}));

vi.mock("@sparticuz/chromium", () => ({
  default: {
    args: [],
    executablePath: mockExecutablePath,
  },
}));

vi.mock("@/lib/db", () => ({
  initDb: mockInitDb,
  insertTweet: mockInsertTweet,
  tweetExists: mockTweetExists,
}));

vi.mock("@/lib/scraper-utils", () => ({
  generateTitle: mockGenerateTitle,
}));

import handler from "./scrape-tweets";

function createMockReqRes(authHeader?: string) {
  const req = {
    method: "GET",
    headers: {
      authorization: authHeader,
    },
  } as unknown as NextApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
  return { req, res };
}

beforeEach(() => {
  vi.useFakeTimers();
  mockInitDb.mockReset();
  mockInsertTweet.mockReset();
  mockTweetExists.mockReset();
  mockEvaluate.mockReset();
  mockLaunch.mockClear();
  mockBrowserClose.mockClear();
  mockNewPage.mockClear();

  // Restore defaults after reset
  mockInitDb.mockResolvedValue(undefined);
  mockInsertTweet.mockResolvedValue(undefined);
  mockLaunch.mockResolvedValue({
    newPage: mockNewPage,
    close: mockBrowserClose,
  });
  mockNewPage.mockResolvedValue({
    setUserAgent: mockSetUserAgent,
    goto: mockGoto,
    waitForSelector: mockWaitForSelector,
    evaluate: mockEvaluate,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// Helper: run handler while advancing fake timers past the 2s setTimeout in scrapeTweets
async function runHandler(req: NextApiRequest, res: NextApiResponse) {
  const handlerPromise = handler(req, res);
  await vi.runAllTimersAsync();
  return handlerPromise;
}

describe("GET /api/cron/scrape-tweets", () => {
  it("returns 401 without valid bearer token", async () => {
    process.env.CRON_SECRET = "my-secret";
    const { req, res } = createMockReqRes("Bearer wrong-secret");

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("calls initDb before processing tweets", async () => {
    process.env.CRON_SECRET = "my-secret";

    mockEvaluate
      .mockResolvedValueOnce(undefined)  // scroll
      .mockResolvedValueOnce([]);        // extraction (empty)

    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);

    expect(mockInitDb).toHaveBeenCalledTimes(1);
    expect(mockTweetExists).not.toHaveBeenCalled(); // no tweets to check
  });

  it("skips existing tweets (tweetExists returns true → no insert)", async () => {
    process.env.CRON_SECRET = "my-secret";

    const scrapedTweets = [
      { tweetId: "111", text: "First tweet", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/111" },
    ];

    mockEvaluate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(scrapedTweets);

    mockTweetExists.mockResolvedValue(true);

    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);

    expect(mockTweetExists).toHaveBeenCalledWith("111");
    expect(mockInsertTweet).not.toHaveBeenCalled();
  });

  it("inserts new tweets with correct data (tweetExists returns false → insertTweet called)", async () => {
    process.env.CRON_SECRET = "my-secret";

    const scrapedTweets = [
      { tweetId: "222", text: "New tweet content", timestamp: "2026-02-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/222" },
    ];

    mockEvaluate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(scrapedTweets);

    mockTweetExists.mockResolvedValue(false);

    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);

    expect(mockInsertTweet).toHaveBeenCalledWith({
      x_tweet_id: "222",
      title: expect.any(String),
      message: "New tweet content",
      x_link: "https://x.com/KJFUTURES/status/222",
      username: "KJFUTURES",
      name: "KJ",
      created_at: "2026-02-01T00:00:00Z",
    });
  });

  it("returns correct scraped/new counts (2 scraped, 1 existing, 1 new → {scraped: 2, new: 1})", async () => {
    process.env.CRON_SECRET = "my-secret";

    const scrapedTweets = [
      { tweetId: "333", text: "Tweet A", timestamp: "2026-03-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/333" },
      { tweetId: "444", text: "Tweet B", timestamp: "2026-03-02T00:00:00Z", url: "https://x.com/KJFUTURES/status/444" },
    ];

    mockEvaluate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(scrapedTweets);

    mockTweetExists
      .mockResolvedValueOnce(true)   // tweet 333 exists
      .mockResolvedValueOnce(false); // tweet 444 is new

    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, scraped: 2, new: 1 });
  });

  it("returns 500 when scraper throws", async () => {
    process.env.CRON_SECRET = "my-secret";

    mockLaunch.mockRejectedValueOnce(new Error("Puppeteer failed"));

    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Error: Puppeteer failed" });
  });
});
