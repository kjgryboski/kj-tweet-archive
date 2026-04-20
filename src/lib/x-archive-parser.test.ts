import { describe, it, expect } from "vitest";
import {
  stripYtdPrefix,
  parseAccountJs,
  parseTweetsJs,
  mediaFromRaw,
  normalizeTweets,
  filterAndResolveThreads,
  generateTitleFromText,
  ParsedAccount,
  RawTweet,
} from "./x-archive-parser";

const ACCOUNT: ParsedAccount = {
  accountId: "42",
  username: "kjfutures",
  displayName: "KJ",
};

describe("stripYtdPrefix", () => {
  it("strips the window.YTD assignment and parses JSON", () => {
    const raw = `window.YTD.tweets.part0 = [{"tweet":{"id_str":"1"}}]`;
    const out = stripYtdPrefix(raw);
    expect(out).toEqual([{ tweet: { id_str: "1" } }]);
  });

  it("throws on missing '=' assignment", () => {
    expect(() => stripYtdPrefix("not a YTD file")).toThrow();
  });
});

describe("parseAccountJs", () => {
  it("extracts account id + username", () => {
    const raw = `window.YTD.account.part0 = [{"account":{"accountId":"42","username":"kjfutures","accountDisplayName":"KJ"}}]`;
    expect(parseAccountJs(raw)).toEqual({
      accountId: "42",
      username: "kjfutures",
      displayName: "KJ",
    });
  });

  it("falls back to username when displayName missing", () => {
    const raw = `window.YTD.account.part0 = [{"account":{"accountId":"42","username":"kjfutures"}}]`;
    expect(parseAccountJs(raw).displayName).toBe("kjfutures");
  });
});

describe("parseTweetsJs", () => {
  it("returns the inner tweet objects", () => {
    const raw = `window.YTD.tweets.part0 = [{"tweet":{"id_str":"1","full_text":"hi"}},{"tweet":{"id_str":"2","full_text":"ho"}}]`;
    const out = parseTweetsJs(raw);
    expect(out).toHaveLength(2);
    expect(out[0].id_str).toBe("1");
  });

  it("skips entries without an id_str", () => {
    const raw = `window.YTD.tweets.part0 = [{"tweet":{"full_text":"no id"}}]`;
    expect(parseTweetsJs(raw)).toHaveLength(0);
  });
});

describe("mediaFromRaw", () => {
  it("extracts photo with expected filename", () => {
    const m = mediaFromRaw("111", {
      id_str: "999",
      type: "photo",
      media_url_https: "https://pbs.twimg.com/media/ABC.jpg",
      url: "https://t.co/abcd",
      sizes: { large: { w: 1200, h: 800 } },
    });
    expect(m).toMatchObject({
      mediaKey: "999",
      type: "photo",
      expectedFilename: "111-999.jpg",
      tcoUrl: "https://t.co/abcd",
      width: 1200,
      height: 800,
    });
  });

  it("picks the highest-bitrate mp4 for videos and overrides sourceUrl", () => {
    const m = mediaFromRaw("111", {
      id_str: "999",
      type: "video",
      media_url_https: "https://pbs.twimg.com/thumb.jpg",
      video_info: {
        duration_millis: 12000,
        variants: [
          { content_type: "application/x-mpegURL", url: "https://video.twimg.com/v.m3u8" },
          { content_type: "video/mp4", bitrate: 832000, url: "https://video.twimg.com/low.mp4" },
          { content_type: "video/mp4", bitrate: 2176000, url: "https://video.twimg.com/high.mp4" },
        ],
      },
    });
    expect(m?.type).toBe("video");
    expect(m?.sourceUrl).toBe("https://video.twimg.com/high.mp4");
    expect(m?.thumbnailUrl).toBe("https://pbs.twimg.com/thumb.jpg");
    expect(m?.durationMs).toBe(12000);
    expect(m?.expectedFilename).toBe("111-999.mp4");
  });

  it("treats animated_gif as a video entry", () => {
    const m = mediaFromRaw("111", {
      id_str: "999",
      type: "animated_gif",
      media_url_https: "https://pbs.twimg.com/tweet_video_thumb/ABC.jpg",
      video_info: {
        variants: [{ content_type: "video/mp4", url: "https://video.twimg.com/x.mp4", bitrate: 0 }],
      },
    });
    expect(m?.type).toBe("animated_gif");
    expect(m?.sourceUrl).toBe("https://video.twimg.com/x.mp4");
  });
});

function rawTweet(overrides: Partial<RawTweet>): RawTweet {
  return {
    id_str: "1",
    created_at: "Fri Mar 05 19:01:00 +0000 2021",
    full_text: "hello",
    ...overrides,
  };
}

describe("normalizeTweets — classification", () => {
  it("labels a plain tweet as original", () => {
    const [t] = normalizeTweets([rawTweet({ id_str: "1" })], ACCOUNT);
    expect(t.classification).toBe("original");
    expect(t.isThreadPart).toBe(false);
  });

  it("labels RT @ text as retweet", () => {
    const [t] = normalizeTweets(
      [rawTweet({ id_str: "2", full_text: "RT @other: hi" })],
      ACCOUNT,
    );
    expect(t.classification).toBe("retweet");
  });

  it("labels reply-to-self as self_reply (thread part)", () => {
    const [t] = normalizeTweets(
      [
        rawTweet({
          id_str: "3",
          full_text: "2/ more",
          in_reply_to_status_id_str: "1",
          in_reply_to_user_id_str: ACCOUNT.accountId,
        }),
      ],
      ACCOUNT,
    );
    expect(t.classification).toBe("self_reply");
    expect(t.isThreadPart).toBe(true);
  });

  it("labels reply-to-other as reply_to_other", () => {
    const [t] = normalizeTweets(
      [
        rawTweet({
          id_str: "4",
          in_reply_to_status_id_str: "99",
          in_reply_to_user_id_str: "someone-else",
        }),
      ],
      ACCOUNT,
    );
    expect(t.classification).toBe("reply_to_other");
  });

  it("detects quote tweets from entities.urls and strips the t.co from text", () => {
    const [t] = normalizeTweets(
      [
        rawTweet({
          id_str: "5",
          full_text: "interesting take https://t.co/xyz",
          entities: {
            urls: [
              {
                url: "https://t.co/xyz",
                expanded_url: "https://x.com/otheruser/status/987",
                display_url: "x.com/otheruser/status/987",
              },
            ],
          },
        }),
      ],
      ACCOUNT,
    );
    expect(t.classification).toBe("quote_tweet");
    expect(t.quotedTweetId).toBe("987");
    expect(t.quotedTweetUsername).toBe("otheruser");
    expect(t.cleanText).toBe("interesting take");
  });

  it("uses quoted_status_id_str + permalink when present", () => {
    const [t] = normalizeTweets(
      [
        rawTweet({
          id_str: "6",
          full_text: "quoting",
          quoted_status_id_str: "555",
          quoted_status_permalink: { expanded: "https://twitter.com/u/status/555" },
        }),
      ],
      ACCOUNT,
    );
    expect(t.classification).toBe("quote_tweet");
    expect(t.quotedTweetId).toBe("555");
  });

  it("ignores self-URL-references when detecting quotes", () => {
    const [t] = normalizeTweets(
      [
        rawTweet({
          id_str: "7",
          entities: {
            urls: [
              {
                url: "https://t.co/abc",
                expanded_url: `https://x.com/${ACCOUNT.username}/status/1`,
              },
            ],
          },
        }),
      ],
      ACCOUNT,
    );
    expect(t.classification).toBe("original");
  });
});

describe("normalizeTweets — media + counts", () => {
  it("extracts media and converts counts from strings", () => {
    const [t] = normalizeTweets(
      [
        rawTweet({
          id_str: "8",
          favorite_count: "42",
          retweet_count: "5",
          extended_entities: {
            media: [
              {
                id_str: "999",
                type: "photo",
                media_url_https: "https://pbs.twimg.com/media/X.jpg",
                url: "https://t.co/media",
              },
            ],
          },
          full_text: "look https://t.co/media",
        }),
      ],
      ACCOUNT,
    );
    expect(t.media).toHaveLength(1);
    expect(t.favoriteCount).toBe(42);
    expect(t.retweetCount).toBe(5);
    expect(t.cleanText).toBe("look");
  });
});

describe("filterAndResolveThreads", () => {
  it("drops replies-to-others and retweets, keeps originals + quotes + threads", () => {
    const input = normalizeTweets(
      [
        rawTweet({ id_str: "A", full_text: "root", created_at: "Fri Mar 05 10:00:00 +0000 2021" }),
        rawTweet({
          id_str: "B",
          full_text: "2/",
          in_reply_to_status_id_str: "A",
          in_reply_to_user_id_str: ACCOUNT.accountId,
          created_at: "Fri Mar 05 10:01:00 +0000 2021",
        }),
        rawTweet({
          id_str: "C",
          full_text: "reply to stranger",
          in_reply_to_status_id_str: "X",
          in_reply_to_user_id_str: "not-me",
          created_at: "Fri Mar 05 10:02:00 +0000 2021",
        }),
        rawTweet({
          id_str: "D",
          full_text: "RT @other: hi",
          created_at: "Fri Mar 05 10:03:00 +0000 2021",
        }),
        rawTweet({
          id_str: "E",
          full_text: "qt https://t.co/q",
          entities: {
            urls: [{ url: "https://t.co/q", expanded_url: "https://x.com/u/status/77" }],
          },
          created_at: "Fri Mar 05 10:04:00 +0000 2021",
        }),
      ],
      ACCOUNT,
    );
    const kept = filterAndResolveThreads(input);
    const ids = kept.map((t) => t.idStr).sort();
    expect(ids).toEqual(["A", "B", "E"]);
    const b = kept.find((t) => t.idStr === "B")!;
    expect(b.threadRootId).toBe("A");
  });

  it("drops orphan self-replies whose parent wasn't kept", () => {
    const input = normalizeTweets(
      [
        rawTweet({
          id_str: "X",
          full_text: "dangling",
          in_reply_to_status_id_str: "missing-parent",
          in_reply_to_user_id_str: ACCOUNT.accountId,
          created_at: "Fri Mar 05 10:00:00 +0000 2021",
        }),
      ],
      ACCOUNT,
    );
    expect(filterAndResolveThreads(input)).toHaveLength(0);
  });
});

describe("generateTitleFromText", () => {
  it("uses the first non-empty line", () => {
    expect(generateTitleFromText("\n\nhello world\nline 2")).toBe("hello world");
  });
  it("truncates long lines with ellipsis", () => {
    const long = "a".repeat(100);
    const title = generateTitleFromText(long, 20);
    expect(title.length).toBeLessThanOrEqual(20);
    expect(title.endsWith("…")).toBe(true);
  });
});
