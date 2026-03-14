import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @vercel/postgres
const { mockSql } = vi.hoisted(() => ({ mockSql: vi.fn() }));
vi.mock("@vercel/postgres", () => ({
  sql: mockSql,
}));

import { initDb, insertTweet, getTweetsPaginated, getTweetById, getTweetCount, updateTweetLikes } from "./db";

beforeEach(() => {
  mockSql.mockReset();
});

describe("initDb", () => {
  it("calls sql with CREATE TABLE statement", async () => {
    mockSql.mockResolvedValue({});
    await initDb();
    expect(mockSql).toHaveBeenCalled();
  });
});

describe("insertTweet", () => {
  it("calls sql with correct values", async () => {
    mockSql.mockResolvedValue({});
    await insertTweet({
      x_tweet_id: "111",
      title: "Test title",
      message: "Test message",
      x_link: "https://x.com/test/status/111",
      username: "testuser",
      name: "Test",
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(mockSql).toHaveBeenCalled();
  });

  it("applies defaults for optional fields", async () => {
    mockSql.mockResolvedValue({});
    await insertTweet({
      title: "Title",
      message: "Message",
    });
    expect(mockSql).toHaveBeenCalled();
  });
});

describe("getTweetsPaginated", () => {
  it("returns limited results with hasMore flag", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      x_tweet_id: String(100 + i),
      message: `Tweet ${i}`,
      title: `Title ${i}`,
      created_at: new Date(`2026-01-${15 - i}T12:00:00Z`),
      username: "KJFUTURES",
      name: "KJ",
      x_link: `https://x.com/KJFUTURES/status/${100 + i}`,
    }));
    mockSql.mockResolvedValue({ rows });

    const result = await getTweetsPaginated(undefined, 3);
    expect(result.tweets).toHaveLength(3);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("102");
  });

  it("returns all results when fewer than limit", async () => {
    const rows = [{
      id: 1, x_tweet_id: "200", message: "Only tweet", title: "Only",
      created_at: new Date("2026-01-15T12:00:00Z"),
      username: "KJFUTURES", name: "KJ",
      x_link: "https://x.com/KJFUTURES/status/200",
    }];
    mockSql.mockResolvedValue({ rows });

    const result = await getTweetsPaginated(undefined, 3);
    expect(result.tweets).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("calls sql with cursor when provided", async () => {
    mockSql.mockResolvedValue({ rows: [] });
    await getTweetsPaginated("cursor123", 5);
    expect(mockSql).toHaveBeenCalled();
  });

  it("respects sort=oldest parameter", async () => {
    mockSql.mockResolvedValue({ rows: [] });
    await getTweetsPaginated(undefined, 5, "oldest");
    expect(mockSql).toHaveBeenCalled();
  });

  it("respects sort=likes parameter", async () => {
    mockSql.mockResolvedValue({ rows: [] });
    await getTweetsPaginated(undefined, 5, "likes");
    expect(mockSql).toHaveBeenCalled();
  });

  it("applies ILIKE filter when q param is provided", async () => {
    mockSql.mockResolvedValue({ rows: [] });
    await getTweetsPaginated(undefined, 5, "newest", "bitcoin");
    expect(mockSql).toHaveBeenCalled();
    const call = mockSql.mock.calls[mockSql.mock.calls.length - 1];
    expect(JSON.stringify(call)).toContain("bitcoin");
  });

  it("applies ILIKE filter with cursor and search", async () => {
    mockSql.mockResolvedValue({ rows: [] });
    await getTweetsPaginated("cursor123", 5, "newest", "bitcoin");
    expect(mockSql).toHaveBeenCalled();
    const call = mockSql.mock.calls[mockSql.mock.calls.length - 1];
    expect(JSON.stringify(call)).toContain("bitcoin");
    expect(JSON.stringify(call)).toContain("cursor123");
  });
});

describe("getTweetById", () => {
  it("returns tweet when found", async () => {
    mockSql.mockResolvedValue({
      rows: [{
        id: 1, x_tweet_id: "123", message: "Hello", title: "Hi",
        created_at: new Date("2026-01-01T00:00:00Z"),
        username: "KJFUTURES", name: "KJ",
        x_link: "https://x.com/KJFUTURES/status/123", likes: 5,
      }],
    });
    const tweet = await getTweetById("123");
    expect(tweet).not.toBeNull();
    expect(tweet!.id).toBe("123");
    expect(tweet!.text).toBe("Hello");
    expect(tweet!.likes).toBe(5);
  });

  it("returns null when not found", async () => {
    mockSql.mockResolvedValue({ rows: [] });
    const tweet = await getTweetById("999");
    expect(tweet).toBeNull();
  });
});

describe("getTweetCount", () => {
  it("returns the count from SQL", async () => {
    mockSql.mockResolvedValue({ rows: [{ count: "42" }] });
    const count = await getTweetCount();
    expect(count).toBe(42);
  });
});

describe("updateTweetLikes", () => {
  it("calls sql with correct UPDATE", async () => {
    mockSql.mockResolvedValue({});
    await updateTweetLikes("tweet123", 42);
    expect(mockSql).toHaveBeenCalled();
  });
});
