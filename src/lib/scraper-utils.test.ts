import { describe, it, expect } from "vitest";
import { generateTitle, parseTweetElements } from "./scraper-utils";

describe("generateTitle", () => {
  it("returns short first sentence as-is", () => {
    expect(generateTitle("Hello world. More text here.")).toBe("Hello world");
  });

  it("truncates long text at 60 chars with ellipsis", () => {
    const longText = "A".repeat(100);
    const result = generateTitle(longText);
    expect(result).toBe("A".repeat(60) + "...");
  });

  it("splits on sentence boundaries (. ! ? newline)", () => {
    expect(generateTitle("Wow! That is great.")).toBe("Wow");
    expect(generateTitle("Really? Yes.")).toBe("Really");
    expect(generateTitle("Line one\nLine two")).toBe("Line one");
  });

  it("returns '...' for empty/whitespace input", () => {
    expect(generateTitle("")).toBe("...");
    expect(generateTitle("   ")).toBe("...");
  });

  it("returns first sentence when exactly 80 chars", () => {
    const sentence = "A".repeat(80);
    expect(generateTitle(sentence + ". More.")).toBe(sentence);
  });
});

function buildTweetArticle(container: HTMLElement, options: {
  tweetId?: string;
  text?: string;
  timestamp?: string;
  isRetweet?: boolean;
  isReply?: boolean;
  isEmpty?: boolean;
}) {
  const {
    tweetId = "12345",
    text = "Sample tweet text",
    timestamp = "2026-01-15T12:00:00.000Z",
    isRetweet = false,
    isReply = false,
    isEmpty = false,
  } = options;

  const article = document.createElement("article");
  article.setAttribute("data-testid", "tweet");

  if (isRetweet) {
    const ctx = document.createElement("div");
    ctx.setAttribute("data-testid", "socialContext");
    ctx.textContent = "User reposted";
    article.appendChild(ctx);
  }

  if (isReply) {
    const replySpan = document.createElement("span");
    replySpan.textContent = "Replying to @someone";
    article.appendChild(replySpan);
  }

  const link = document.createElement("a");
  link.setAttribute("href", `/KJFUTURES/status/${tweetId}`);
  const time = document.createElement("time");
  time.setAttribute("datetime", timestamp);
  time.textContent = "Jan 15";
  link.appendChild(time);
  article.appendChild(link);

  const tweetTextEl = document.createElement("div");
  tweetTextEl.setAttribute("data-testid", "tweetText");
  if (!isEmpty) {
    tweetTextEl.textContent = text;
  }
  article.appendChild(tweetTextEl);

  container.appendChild(article);
}

describe("parseTweetElements", () => {
  it("extracts tweet ID, text, timestamp, and URL", () => {
    const container = document.createElement("div");
    buildTweetArticle(container, {
      tweetId: "99999",
      text: "Hello from KJ",
      timestamp: "2026-03-01T10:00:00.000Z",
    });

    const results = parseTweetElements(container);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      tweetId: "99999",
      text: "Hello from KJ",
      timestamp: "2026-03-01T10:00:00.000Z",
      url: "https://x.com/KJFUTURES/status/99999",
    });
  });

  it("skips retweets", () => {
    const container = document.createElement("div");
    buildTweetArticle(container, { isRetweet: true });

    const results = parseTweetElements(container);
    expect(results).toHaveLength(0);
  });

  it("skips replies", () => {
    const container = document.createElement("div");
    buildTweetArticle(container, { isReply: true });

    const results = parseTweetElements(container);
    expect(results).toHaveLength(0);
  });

  it("skips tweets with empty text", () => {
    const container = document.createElement("div");
    buildTweetArticle(container, { isEmpty: true });

    const results = parseTweetElements(container);
    expect(results).toHaveLength(0);
  });
});
