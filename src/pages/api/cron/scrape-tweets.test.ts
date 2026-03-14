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
  mockSendAlert,
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
  const mockSendAlert = vi.fn().mockResolvedValue(undefined);

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
    mockSendAlert,
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

vi.mock("@/lib/email", () => ({
  sendAlert: mockSendAlert,
}));

vi.mock("@/lib/scraper-selectors", () => ({
  SELECTORS: {
    tweetContainer: ['[data-testid="tweet"]', 'article[role="article"]', 'article'],
    tweetText: ['[data-testid="tweetText"]', 'div[lang][dir="ltr"]'],
    socialContext: ['[data-testid="socialContext"]'],
    timeElement: ['time[datetime]'],
    likeButton: ['[data-testid="like"]', '[aria-label*="Like"]'],
  },
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
  mockSendAlert.mockReset();

  // Restore defaults after reset
  mockInitDb.mockResolvedValue(undefined);
  mockInsertTweet.mockResolvedValue(undefined);
  mockSendAlert.mockResolvedValue(undefined);
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

// Helper: run handler while advancing fake timers past the setTimeout delays
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
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        tweets: [{ tweetId: "100", text: "Test", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/100" }],
        selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
      });
    mockTweetExists.mockResolvedValue(true);
    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);
    expect(mockInitDb).toHaveBeenCalledTimes(1);
  });

  it("upserts all scraped tweets via insertTweet", async () => {
    process.env.CRON_SECRET = "my-secret";

    const scrapedTweets = [
      { tweetId: "111", text: "First tweet", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/111", likes: 5 },
    ];

    mockEvaluate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        tweets: scrapedTweets,
        selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
      });

    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);

    expect(mockInsertTweet).toHaveBeenCalledTimes(1);
    expect(mockInsertTweet).toHaveBeenCalledWith(expect.objectContaining({
      x_tweet_id: "111",
      likes: 5,
    }));
  });

  it("inserts tweets with correct data via upsert", async () => {
    process.env.CRON_SECRET = "my-secret";

    const scrapedTweets = [
      { tweetId: "222", text: "New tweet content", timestamp: "2026-02-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/222" },
    ];

    mockEvaluate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        tweets: scrapedTweets,
        selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
      });

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
      likes: 0,
    });
  });

  it("returns correct scraped count", async () => {
    process.env.CRON_SECRET = "my-secret";

    const scrapedTweets = [
      { tweetId: "333", text: "Tweet A", timestamp: "2026-03-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/333", likes: 0 },
      { tweetId: "444", text: "Tweet B", timestamp: "2026-03-02T00:00:00Z", url: "https://x.com/KJFUTURES/status/444", likes: 0 },
    ];

    mockEvaluate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        tweets: scrapedTweets,
        selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
      });

    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, scraped: 2 }));
    expect(mockInsertTweet).toHaveBeenCalledTimes(2);
  });

  it("returns 500 when scraper throws", async () => {
    process.env.CRON_SECRET = "my-secret";

    mockLaunch.mockRejectedValueOnce(new Error("Puppeteer failed"));

    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringContaining("Puppeteer failed") }));
    expect(mockSendAlert).toHaveBeenCalled();
  });

  it("retries on first attempt failure, succeeds on second", async () => {
    process.env.CRON_SECRET = "my-secret";
    const mockPage1 = {
      setUserAgent: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockRejectedValue(new Error("Timeout")),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const mockPage2 = {
      setUserAgent: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          tweets: [{ tweetId: "777", text: "Retry tweet", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/777" }],
          selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
        }),
    };
    mockNewPage.mockResolvedValueOnce(mockPage1).mockResolvedValueOnce(mockPage2);
    mockTweetExists.mockResolvedValue(false);

    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, attempts: 2 }));
  });

  it("sends alert email on total failure", async () => {
    process.env.CRON_SECRET = "my-secret";
    mockLaunch.mockRejectedValue(new Error("Browser crashed"));

    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockSendAlert).toHaveBeenCalledWith(
      "[KJ Tweets] Scraper FAILED — 0 tweets extracted",
      expect.stringContaining("Browser crashed")
    );
  });

  it("sends degradation alert when fallback selector used", async () => {
    process.env.CRON_SECRET = "my-secret";
    mockEvaluate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        tweets: [
          { tweetId: "888", text: "Fallback tweet 1", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/888", likes: 0 },
          { tweetId: "889", text: "Fallback tweet 2", timestamp: "2026-01-02T00:00:00Z", url: "https://x.com/KJFUTURES/status/889", likes: 0 },
          { tweetId: "890", text: "Fallback tweet 3", timestamp: "2026-01-03T00:00:00Z", url: "https://x.com/KJFUTURES/status/890", likes: 0 },
        ],
        selectorsUsed: { tweetContainer: 'article[role="article"]', tweetText: '[data-testid="tweetText"]' },
      });
    mockTweetExists.mockResolvedValue(false);

    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);

    expect(mockSendAlert).toHaveBeenCalledWith(
      "[KJ Tweets] Selector degradation — fallback in use",
      expect.stringContaining("fallback")
    );
  });

  it("response includes selector metadata and attempts", async () => {
    process.env.CRON_SECRET = "my-secret";
    mockEvaluate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        tweets: [{ tweetId: "999", text: "Meta tweet", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/999" }],
        selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
      });
    mockTweetExists.mockResolvedValue(false);

    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      attempts: 1,
      selectorsUsed: expect.objectContaining({ tweetContainer: '[data-testid="tweet"]' }),
      fallbacksTriggered: false,
    }));
  });
});
