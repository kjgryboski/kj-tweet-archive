import { describe, it, expect, vi } from "vitest";

vi.mock("./db", () => ({
  getTweets: vi.fn(),
}));

import { fetchUserTweets } from "./api";
import { getTweets } from "./db";

const mockGetTweets = vi.mocked(getTweets);

describe("fetchUserTweets", () => {
  it("returns tweets on success", async () => {
    const mockTweets = [
      { id: "1", text: "Hello", createdAt: "2026-01-01", username: "KJ", name: "KJ" },
    ];
    mockGetTweets.mockResolvedValue(mockTweets as any);

    const result = await fetchUserTweets();
    expect(result).toEqual(mockTweets);
  });

  it("returns empty array on error", async () => {
    mockGetTweets.mockRejectedValue(new Error("DB down"));

    const result = await fetchUserTweets();
    expect(result).toEqual([]);
  });
});
