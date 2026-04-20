import { describe, it, expect } from "vitest";
import {
  generateTitle,
  parseTweetElements,
  mediaKeyFromUrl,
  upgradeToLarge,
} from "./scraper-utils";

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
  likes?: number;
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

  if (options.likes !== undefined) {
    const likeBtn = document.createElement("div");
    likeBtn.setAttribute("data-testid", "like");
    likeBtn.setAttribute("aria-label", `${options.likes} Likes`);
    article.appendChild(likeBtn);
  }

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
    expect(results[0]).toMatchObject({
      tweetId: "99999",
      text: "Hello from KJ",
      timestamp: "2026-03-01T10:00:00.000Z",
      url: "https://x.com/KJFUTURES/status/99999",
      likes: 0,
      photos: [],
      quotedTweetId: undefined,
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

  it("accepts custom selectors parameter", () => {
    const container = document.createElement("div");

    const article = document.createElement("article");
    article.setAttribute("role", "article");

    const link = document.createElement("a");
    link.setAttribute("href", "/KJFUTURES/status/55555");
    const time = document.createElement("time");
    time.setAttribute("datetime", "2026-03-10T08:00:00.000Z");
    time.textContent = "Mar 10";
    link.appendChild(time);
    article.appendChild(link);

    const textDiv = document.createElement("div");
    textDiv.setAttribute("lang", "en");
    textDiv.setAttribute("dir", "ltr");
    textDiv.textContent = "Custom selector tweet";
    article.appendChild(textDiv);

    container.appendChild(article);

    const customSelectors = {
      tweetContainer: ['article[role="article"]'],
      tweetText: ['div[lang][dir="ltr"]'],
      socialContext: ['[data-testid="socialContext"]'],
      timeElement: ['time[datetime]'],
      likeButton: ['[data-testid="like"]'],
    };

    const results = parseTweetElements(container, customSelectors);
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("Custom selector tweet");
    expect(results[0].tweetId).toBe("55555");
  });

  it("extracts likes from DOM", () => {
    const container = document.createElement("div");
    buildTweetArticle(container, { tweetId: "77777", text: "Popular tweet", likes: 42 });
    const results = parseTweetElements(container);
    expect(results).toHaveLength(1);
    expect(results[0].likes).toBe(42);
  });

  it("extracts photos from tweetPhoto imgs and upgrades to name=large", () => {
    const container = document.createElement("div");
    const article = document.createElement("article");
    article.setAttribute("data-testid", "tweet");

    const link = document.createElement("a");
    link.setAttribute("href", "/KJFUTURES/status/1");
    const time = document.createElement("time");
    time.setAttribute("datetime", "2026-01-15T12:00:00.000Z");
    link.appendChild(time);
    article.appendChild(link);

    const tt = document.createElement("div");
    tt.setAttribute("data-testid", "tweetText");
    tt.textContent = "with photo";
    article.appendChild(tt);

    const photoWrapper = document.createElement("div");
    photoWrapper.setAttribute("data-testid", "tweetPhoto");
    const img = document.createElement("img");
    img.setAttribute("src", "https://pbs.twimg.com/media/Fabc123?format=jpg&name=small");
    photoWrapper.appendChild(img);
    article.appendChild(photoWrapper);

    container.appendChild(article);

    const results = parseTweetElements(container);
    expect(results[0].photos).toHaveLength(1);
    expect(results[0].photos[0].mediaKey).toBe("Fabc123");
    expect(results[0].photos[0].url).toContain("name=large");
  });

  it("does not pull photos from the nested quoted tweet", () => {
    const container = document.createElement("div");
    const article = document.createElement("article");
    article.setAttribute("data-testid", "tweet");

    const link = document.createElement("a");
    link.setAttribute("href", "/KJFUTURES/status/1");
    const time = document.createElement("time");
    time.setAttribute("datetime", "2026-01-15T12:00:00.000Z");
    link.appendChild(time);
    article.appendChild(link);

    const tt = document.createElement("div");
    tt.setAttribute("data-testid", "tweetText");
    tt.textContent = "quoting";
    article.appendChild(tt);

    // Nested quoted tweet with its own photo — must NOT be picked up.
    const nested = document.createElement("article");
    const qlink = document.createElement("a");
    qlink.setAttribute("href", "/somebody/status/999");
    nested.appendChild(qlink);
    const qimg = document.createElement("img");
    qimg.setAttribute("src", "https://pbs.twimg.com/media/QUOTED?format=jpg");
    nested.appendChild(qimg);
    article.appendChild(nested);

    container.appendChild(article);

    const results = parseTweetElements(container);
    expect(results[0].photos).toHaveLength(0);
    expect(results[0].quotedTweetId).toBe("999");
    expect(results[0].quotedTweetUsername).toBe("somebody");
    expect(results[0].quotedTweetUrl).toBe("https://x.com/somebody/status/999");
  });

  it("does not drop a quote tweet whose quoted tweet is itself a reply", () => {
    const container = document.createElement("div");
    const article = document.createElement("article");
    article.setAttribute("data-testid", "tweet");

    const link = document.createElement("a");
    link.setAttribute("href", "/KJFUTURES/status/1");
    const time = document.createElement("time");
    time.setAttribute("datetime", "2026-01-15T12:00:00.000Z");
    link.appendChild(time);
    article.appendChild(link);

    const tt = document.createElement("div");
    tt.setAttribute("data-testid", "tweetText");
    tt.textContent = "quoting a reply";
    article.appendChild(tt);

    const nested = document.createElement("article");
    const replyLabel = document.createElement("span");
    replyLabel.textContent = "Replying to @someoneElse";
    nested.appendChild(replyLabel);
    const qlink = document.createElement("a");
    qlink.setAttribute("href", "/somebody/status/999");
    nested.appendChild(qlink);
    article.appendChild(nested);

    container.appendChild(article);

    const results = parseTweetElements(container);
    expect(results).toHaveLength(1);
    expect(results[0].quotedTweetId).toBe("999");
  });

  it("still drops genuine replies (outer Replying to @)", () => {
    const container = document.createElement("div");
    buildTweetArticle(container, { isReply: true });
    const results = parseTweetElements(container);
    expect(results).toHaveLength(0);
  });

  it("ignores self-referenced status links when detecting quotes", () => {
    const container = document.createElement("div");
    const article = document.createElement("article");
    article.setAttribute("data-testid", "tweet");

    const link = document.createElement("a");
    link.setAttribute("href", "/KJFUTURES/status/1");
    const time = document.createElement("time");
    time.setAttribute("datetime", "2026-01-15T12:00:00.000Z");
    link.appendChild(time);
    article.appendChild(link);

    const tt = document.createElement("div");
    tt.setAttribute("data-testid", "tweetText");
    tt.textContent = "self";
    article.appendChild(tt);

    const nested = document.createElement("article");
    const selfLink = document.createElement("a");
    selfLink.setAttribute("href", "/KJFUTURES/status/42");
    nested.appendChild(selfLink);
    article.appendChild(nested);

    container.appendChild(article);

    const results = parseTweetElements(container);
    expect(results[0].quotedTweetId).toBeUndefined();
  });
});

describe("mediaKeyFromUrl", () => {
  it("extracts key from a pbs.twimg.com media URL with query string", () => {
    expect(
      mediaKeyFromUrl("https://pbs.twimg.com/media/Fabc123?format=jpg&name=small"),
    ).toBe("Fabc123");
  });

  it("strips file extension from path", () => {
    expect(mediaKeyFromUrl("https://pbs.twimg.com/media/Fxyz.jpg")).toBe("Fxyz");
  });

  it("returns null for non-URL input", () => {
    expect(mediaKeyFromUrl("not a url")).toBeNull();
  });
});

describe("upgradeToLarge", () => {
  it("adds name=large to a twimg URL", () => {
    expect(upgradeToLarge("https://pbs.twimg.com/media/X?format=jpg&name=small")).toBe(
      "https://pbs.twimg.com/media/X?format=jpg&name=large",
    );
  });

  it("leaves non-twimg URLs unchanged", () => {
    expect(upgradeToLarge("https://example.com/img.jpg")).toBe(
      "https://example.com/img.jpg",
    );
  });

  it("handles invalid input gracefully", () => {
    expect(upgradeToLarge("nope")).toBe("nope");
  });
});
