import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

const { mockUpdateTweetLikes, mockLaunch, mockExecutablePath, mockSendAlert } = vi.hoisted(() => ({
  mockUpdateTweetLikes: vi.fn().mockResolvedValue(undefined),
  mockLaunch: vi.fn(),
  mockExecutablePath: vi.fn().mockResolvedValue("/usr/bin/chromium"),
  mockSendAlert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({ updateTweetLikes: mockUpdateTweetLikes }));
vi.mock("puppeteer-core", () => ({ default: { launch: mockLaunch } }));
vi.mock("@sparticuz/chromium", () => ({ default: { args: [], executablePath: mockExecutablePath } }));
vi.mock("@/lib/email", () => ({ sendAlert: mockSendAlert }));
vi.mock("@/lib/scraper-selectors", () => ({
  SELECTORS: {
    tweetContainer: ['[data-testid="tweet"]'],
    likeButton: ['[data-testid="like"]'],
    timeElement: ['time[datetime]'],
  },
}));

import handler from "./refresh-metrics";

function createMockReqRes(authHeader?: string) {
  const req = { method: "GET", headers: { authorization: authHeader } } as unknown as NextApiRequest;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as NextApiResponse;
  return { req, res };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mockUpdateTweetLikes.mockResolvedValue(undefined);
  mockSendAlert.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

async function runHandler(req: NextApiRequest, res: NextApiResponse) {
  const handlerPromise = handler(req, res);
  await vi.runAllTimersAsync();
  return handlerPromise;
}

describe("GET /api/cron/refresh-metrics", () => {
  it("returns 401 without valid bearer token", async () => {
    process.env.CRON_SECRET = "secret";
    const { req, res } = createMockReqRes("Bearer wrong");
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("updates likes for visible tweets", async () => {
    process.env.CRON_SECRET = "secret";
    const mockEvaluate = vi.fn()
      .mockResolvedValueOnce(undefined) // scroll
      .mockResolvedValueOnce(0)         // count (breaks loop)
      .mockResolvedValueOnce([          // extraction
        { tweetId: "111", likes: 10 },
        { tweetId: "222", likes: 25 },
      ]);
    const mockPage = {
      setUserAgent: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      evaluate: mockEvaluate,
      close: vi.fn().mockResolvedValue(undefined),
    };
    mockLaunch.mockResolvedValue({
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
    });

    const { req, res } = createMockReqRes("Bearer secret");
    await runHandler(req, res);

    expect(mockUpdateTweetLikes).toHaveBeenCalledWith("111", 10);
    expect(mockUpdateTweetLikes).toHaveBeenCalledWith("222", 25);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, updated: 2 });
  });
});
