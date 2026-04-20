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
  mockInsertTweet,
  mockInsertMedia,
  mockInsertQuotedSnapshot,
  mockGenerateTitle,
  mockExecutablePath,
  mockSendAlert,
  mockFetchAndUploadPhoto,
  mockHasExistingMedia,
} = vi.hoisted(() => {
  const mockEvaluate = vi.fn();
  const mockGoto = vi.fn().mockResolvedValue(undefined);
  const mockWaitForSelector = vi.fn().mockResolvedValue(undefined);
  const mockSetUserAgent = vi.fn().mockResolvedValue(undefined);
  const mockBrowserClose = vi.fn().mockResolvedValue(undefined);
  const mockPageClose = vi.fn().mockResolvedValue(undefined);
  const mockNewPage = vi.fn().mockResolvedValue({
    setUserAgent: mockSetUserAgent,
    goto: mockGoto,
    waitForSelector: mockWaitForSelector,
    evaluate: mockEvaluate,
    close: mockPageClose,
  });
  const mockLaunch = vi.fn().mockResolvedValue({
    newPage: mockNewPage,
    close: mockBrowserClose,
  });
  const mockInsertTweet = vi.fn().mockResolvedValue(undefined);
  const mockInsertMedia = vi.fn().mockResolvedValue(undefined);
  const mockInsertQuotedSnapshot = vi.fn().mockResolvedValue(undefined);
  const mockGenerateTitle = vi.fn((text: string) => text.slice(0, 30));
  const mockExecutablePath = vi.fn().mockResolvedValue("/usr/bin/chromium");
  const mockSendAlert = vi.fn().mockResolvedValue(undefined);
  const mockFetchAndUploadPhoto = vi.fn().mockResolvedValue(null);
  const mockHasExistingMedia = vi.fn().mockResolvedValue(false);

  return {
    mockEvaluate,
    mockGoto,
    mockWaitForSelector,
    mockSetUserAgent,
    mockBrowserClose,
    mockNewPage,
    mockLaunch,
    mockInsertTweet,
    mockInsertMedia,
    mockInsertQuotedSnapshot,
    mockGenerateTitle,
    mockExecutablePath,
    mockSendAlert,
    mockFetchAndUploadPhoto,
    mockHasExistingMedia,
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
  ensureSchema: vi.fn().mockResolvedValue(undefined),
  insertTweet: mockInsertTweet,
  insertMedia: mockInsertMedia,
  insertQuotedSnapshot: mockInsertQuotedSnapshot,
}));

vi.mock("@/lib/scraper-utils", () => ({
  generateTitle: mockGenerateTitle,
}));

vi.mock("@/lib/scraper-media", () => ({
  fetchAndUploadPhoto: mockFetchAndUploadPhoto,
  hasExistingMedia: mockHasExistingMedia,
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
  mockInsertTweet.mockReset();
  mockInsertMedia.mockReset();
  mockInsertQuotedSnapshot.mockReset();
  mockEvaluate.mockReset();
  mockLaunch.mockClear();
  mockBrowserClose.mockClear();
  mockNewPage.mockClear();
  mockSendAlert.mockReset();
  mockFetchAndUploadPhoto.mockReset();
  mockHasExistingMedia.mockReset();

  // Restore defaults after reset
  mockInsertTweet.mockResolvedValue(undefined);
  mockInsertMedia.mockResolvedValue(undefined);
  mockInsertQuotedSnapshot.mockResolvedValue(undefined);
  mockSendAlert.mockResolvedValue(undefined);
  mockFetchAndUploadPhoto.mockResolvedValue(null);
  mockHasExistingMedia.mockResolvedValue(false);
  mockLaunch.mockResolvedValue({
    newPage: mockNewPage,
    close: mockBrowserClose,
  });
  mockNewPage.mockResolvedValue({
    setUserAgent: mockSetUserAgent,
    goto: mockGoto,
    waitForSelector: mockWaitForSelector,
    evaluate: mockEvaluate,
    close: vi.fn().mockResolvedValue(undefined),
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

  it("does not call initDb (removed from handler)", async () => {
    process.env.CRON_SECRET = "my-secret";
    mockEvaluate
      .mockResolvedValueOnce(undefined) // scroll
      .mockResolvedValueOnce(0)         // count (breaks loop since 0 === previousCount)
      .mockResolvedValueOnce({
        tweets: [{ tweetId: "100", text: "Test", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/100", likes: 0, photos: [] }],
        selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
      });
    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);
    // Handler should succeed without initDb — verifies it was removed
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("upserts all scraped tweets via insertTweet", async () => {
    process.env.CRON_SECRET = "my-secret";

    const scrapedTweets = [
      { tweetId: "111", text: "First tweet", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/111", likes: 5, photos: [] },
    ];

    mockEvaluate
      .mockResolvedValueOnce(undefined) // scroll
      .mockResolvedValueOnce(0)         // count
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
      { tweetId: "222", text: "New tweet content", timestamp: "2026-02-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/222", likes: 0, photos: [] },
    ];

    mockEvaluate
      .mockResolvedValueOnce(undefined) // scroll
      .mockResolvedValueOnce(0)         // count
      .mockResolvedValueOnce({
        tweets: scrapedTweets,
        selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
      });

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
      quoted_tweet_id: null,
    });
  });

  it("returns correct scraped count", async () => {
    process.env.CRON_SECRET = "my-secret";

    const scrapedTweets = [
      { tweetId: "333", text: "Tweet A", timestamp: "2026-03-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/333", likes: 0, photos: [] },
      { tweetId: "444", text: "Tweet B", timestamp: "2026-03-02T00:00:00Z", url: "https://x.com/KJFUTURES/status/444", likes: 0, photos: [] },
    ];

    mockEvaluate
      .mockResolvedValueOnce(undefined) // scroll
      .mockResolvedValueOnce(0)         // count
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
        .mockResolvedValueOnce(undefined) // scroll
        .mockResolvedValueOnce(0)         // count
        .mockResolvedValueOnce({
          tweets: [{ tweetId: "777", text: "Retry tweet", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/777", likes: 0, photos: [] }],
          selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
        }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    mockNewPage.mockResolvedValueOnce(mockPage1).mockResolvedValueOnce(mockPage2);
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
      .mockResolvedValueOnce(undefined) // scroll
      .mockResolvedValueOnce(0)         // count
      .mockResolvedValueOnce({
        tweets: [
          { tweetId: "888", text: "Fallback tweet 1", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/888", likes: 0, photos: [] },
          { tweetId: "889", text: "Fallback tweet 2", timestamp: "2026-01-02T00:00:00Z", url: "https://x.com/KJFUTURES/status/889", likes: 0, photos: [] },
          { tweetId: "890", text: "Fallback tweet 3", timestamp: "2026-01-03T00:00:00Z", url: "https://x.com/KJFUTURES/status/890", likes: 0, photos: [] },
        ],
        selectorsUsed: { tweetContainer: 'article[role="article"]', tweetText: '[data-testid="tweetText"]' },
      });
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
      .mockResolvedValueOnce(undefined) // scroll
      .mockResolvedValueOnce(0)         // count
      .mockResolvedValueOnce({
        tweets: [{ tweetId: "999", text: "Meta tweet", timestamp: "2026-01-01T00:00:00Z", url: "https://x.com/KJFUTURES/status/999", likes: 0, photos: [] }],
        selectorsUsed: { tweetContainer: '[data-testid="tweet"]', tweetText: '[data-testid="tweetText"]' },
      });
    const { req, res } = createMockReqRes("Bearer my-secret");
    await runHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      attempts: 1,
      selectorsUsed: expect.objectContaining({ tweetContainer: '[data-testid="tweet"]' }),
      fallbacksTriggered: false,
    }));
  });
});
