/**
 * Pure parser for the X/Twitter "Download your data" ZIP format.
 *
 * The ZIP contains files like:
 *   data/account.js        -> window.YTD.account.part0 = [{ account: {...} }]
 *   data/tweets.js         -> window.YTD.tweets.part0 = [{ tweet: {...} }, ...]
 *   data/tweet_media/      -> folder of {tweet_id}-{media_id}.{ext} files
 *
 * These helpers do not touch the filesystem — callers read the files and
 * pass contents in. That keeps the parser fully unit-testable.
 */

export interface ParsedAccount {
  accountId: string;
  username: string;
  displayName: string;
}

export interface ParsedMedia {
  mediaKey: string;
  type: "photo" | "video" | "animated_gif";
  sourceUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  tcoUrl?: string;
  expectedFilename: string;
}

export type TweetClassification =
  | "original"
  | "self_reply"
  | "reply_to_other"
  | "retweet"
  | "quote_tweet";

export interface ParsedTweet {
  idStr: string;
  createdAt: string;
  fullText: string;
  cleanText: string;
  favoriteCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  inReplyToStatusId?: string;
  inReplyToUserId?: string;
  classification: TweetClassification;
  isThreadPart: boolean;
  threadRootId?: string;
  quotedTweetId?: string;
  quotedTweetUrl?: string;
  quotedTweetUsername?: string;
  media: ParsedMedia[];
}

export interface RawTweet {
  id_str?: string;
  created_at?: string;
  full_text?: string;
  text?: string;
  favorite_count?: string | number;
  retweet_count?: string | number;
  reply_count?: string | number;
  quote_count?: string | number;
  in_reply_to_status_id_str?: string;
  in_reply_to_user_id_str?: string;
  in_reply_to_screen_name?: string;
  retweeted_status?: unknown;
  quoted_status_id_str?: string;
  quoted_status_permalink?: { url?: string; expanded?: string };
  entities?: {
    urls?: Array<{ url?: string; expanded_url?: string; display_url?: string }>;
  };
  extended_entities?: {
    media?: Array<RawMediaEntity>;
  };
}

interface RawMediaEntity {
  id_str?: string;
  type?: string;
  media_url_https?: string;
  media_url?: string;
  url?: string;
  expanded_url?: string;
  sizes?: Record<string, { w?: number; h?: number }>;
  video_info?: {
    duration_millis?: number;
    variants?: Array<{ bitrate?: number; content_type?: string; url?: string }>;
  };
  original_info?: { width?: number; height?: number };
}

/**
 * Strips the `window.YTD.X.partN = ` prefix that X wraps its JSON payloads in,
 * then returns the parsed array. Throws on malformed input.
 */
export function stripYtdPrefix(content: string): unknown {
  const eqIdx = content.indexOf("=");
  if (eqIdx === -1) {
    throw new Error("Not an X YTD file — missing '=' assignment");
  }
  const json = content.slice(eqIdx + 1).trim();
  return JSON.parse(json);
}

export function parseAccountJs(content: string): ParsedAccount {
  const parsed = stripYtdPrefix(content);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("account.js did not contain an array");
  }
  const acct = (parsed[0] as { account?: Record<string, string> }).account;
  if (!acct) throw new Error("account.js entry missing 'account' key");
  return {
    accountId: acct.accountId,
    username: acct.username,
    displayName: acct.accountDisplayName || acct.username,
  };
}

export function parseTweetsJs(content: string): RawTweet[] {
  const parsed = stripYtdPrefix(content);
  if (!Array.isArray(parsed)) {
    throw new Error("tweets.js did not contain an array");
  }
  return parsed
    .map((entry) => (entry as { tweet?: RawTweet }).tweet)
    .filter((t): t is RawTweet => Boolean(t && t.id_str));
}

function toNumber(v: string | number | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseInt(v, 10) : v;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Twitter archive dates look like "Fri Mar 05 19:01:00 +0000 2021".
 * `new Date(...)` handles that format reliably on Node + browsers.
 */
function parseTweetDate(raw: string | undefined): string {
  if (!raw) return new Date(0).toISOString();
  const d = new Date(raw);
  if (isNaN(d.getTime())) return new Date(0).toISOString();
  return d.toISOString();
}

function fileExtFromUrl(url: string | undefined): string {
  if (!url) return "jpg";
  const path = url.split("?")[0];
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "jpg";
  return path.slice(dot + 1).toLowerCase();
}

function pickBestVideoVariant(
  variants: Array<{ bitrate?: number; content_type?: string; url?: string }> | undefined,
): { url?: string; contentType?: string } {
  if (!variants || variants.length === 0) return {};
  const mp4s = variants.filter((v) => v.content_type === "video/mp4" && v.url);
  if (mp4s.length === 0) return { url: variants[0].url, contentType: variants[0].content_type };
  mp4s.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  return { url: mp4s[0].url, contentType: mp4s[0].content_type };
}

/**
 * X archives name media files `{tweet_id}-{media_id}.{ext}` in the
 * `data/tweet_media/` folder. For videos the archive usually stores an .mp4
 * file, occasionally only the thumbnail — importer handles the fallback.
 */
export function mediaFromRaw(tweetIdStr: string, raw: RawMediaEntity): ParsedMedia | null {
  if (!raw.id_str) return null;
  const type =
    raw.type === "video"
      ? "video"
      : raw.type === "animated_gif"
        ? "animated_gif"
        : "photo";

  const thumbnailUrl = raw.media_url_https || raw.media_url;
  let sourceUrl = thumbnailUrl || "";
  let ext = fileExtFromUrl(thumbnailUrl);

  if (type === "video" || type === "animated_gif") {
    const best = pickBestVideoVariant(raw.video_info?.variants);
    if (best.url) {
      sourceUrl = best.url;
      ext = "mp4";
    }
  }

  const w = raw.original_info?.width ?? raw.sizes?.large?.w;
  const h = raw.original_info?.height ?? raw.sizes?.large?.h;

  return {
    mediaKey: raw.id_str,
    type,
    sourceUrl,
    thumbnailUrl: thumbnailUrl || undefined,
    width: typeof w === "number" ? w : undefined,
    height: typeof h === "number" ? h : undefined,
    durationMs: raw.video_info?.duration_millis,
    tcoUrl: raw.url,
    expectedFilename: `${tweetIdStr}-${raw.id_str}.${ext}`,
  };
}

const STATUS_URL_RE =
  /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([^/]+)\/status\/(\d+)/i;

function detectQuoteFromUrls(
  raw: RawTweet,
  ownUsername: string,
): { id: string; url: string; username?: string } | null {
  if (raw.quoted_status_id_str) {
    const url = raw.quoted_status_permalink?.expanded || raw.quoted_status_permalink?.url;
    return {
      id: raw.quoted_status_id_str,
      url: url || `https://x.com/i/status/${raw.quoted_status_id_str}`,
    };
  }
  const urls = raw.entities?.urls || [];
  for (const u of urls) {
    if (!u.expanded_url) continue;
    const m = u.expanded_url.match(STATUS_URL_RE);
    if (!m) continue;
    const [, username, id] = m;
    if (username.toLowerCase() === ownUsername.toLowerCase()) continue;
    return { id, url: u.expanded_url, username };
  }
  return null;
}

/**
 * Removes trailing t.co links that reference media or the quoted tweet —
 * those become proper embeds on the page, so leaving them in the text
 * produces duplicate junk like "…check this out https://t.co/abcd".
 */
function buildCleanText(raw: RawTweet, media: ParsedMedia[], quoteTcoUrl?: string): string {
  let text = raw.full_text ?? raw.text ?? "";
  const tcoUrls = new Set<string>();
  for (const m of media) {
    if (m.tcoUrl) tcoUrls.add(m.tcoUrl);
  }
  if (quoteTcoUrl) tcoUrls.add(quoteTcoUrl);
  for (const tco of tcoUrls) {
    text = text.split(tco).join("");
  }
  return text.replace(/\s+$/g, "").replace(/[ \t]+\n/g, "\n");
}

function classify(
  raw: RawTweet,
  ownUserId: string,
  quoteDetected: boolean,
): TweetClassification {
  const text = raw.full_text ?? raw.text ?? "";
  if (raw.retweeted_status || /^RT @\w+:/.test(text)) return "retweet";
  if (raw.in_reply_to_user_id_str) {
    return raw.in_reply_to_user_id_str === ownUserId ? "self_reply" : "reply_to_other";
  }
  if (quoteDetected) return "quote_tweet";
  return "original";
}

/**
 * Classifies each raw tweet and produces normalized records. Does NOT
 * compute thread roots — that's a separate pass because it depends on the
 * full set and the set of tweets we actually keep.
 */
export function normalizeTweets(
  raws: RawTweet[],
  account: ParsedAccount,
): ParsedTweet[] {
  const result: ParsedTweet[] = [];
  for (const raw of raws) {
    if (!raw.id_str) continue;
    const mediaRaw = raw.extended_entities?.media || [];
    const media = mediaRaw
      .map((m) => mediaFromRaw(raw.id_str!, m))
      .filter((m): m is ParsedMedia => m !== null);

    const quote = detectQuoteFromUrls(raw, account.username);
    const classification = classify(raw, account.accountId, quote !== null);

    let quoteTcoUrl: string | undefined;
    if (quote) {
      const match = (raw.entities?.urls || []).find(
        (u) => u.expanded_url === quote.url,
      );
      quoteTcoUrl = match?.url;
    }

    const cleanText = buildCleanText(raw, media, quoteTcoUrl);

    result.push({
      idStr: raw.id_str,
      createdAt: parseTweetDate(raw.created_at),
      fullText: raw.full_text ?? raw.text ?? "",
      cleanText,
      favoriteCount: toNumber(raw.favorite_count),
      retweetCount: toNumber(raw.retweet_count),
      replyCount: toNumber(raw.reply_count),
      quoteCount: toNumber(raw.quote_count),
      inReplyToStatusId: raw.in_reply_to_status_id_str,
      inReplyToUserId: raw.in_reply_to_user_id_str,
      classification,
      isThreadPart: classification === "self_reply",
      quotedTweetId: quote?.id,
      quotedTweetUrl: quote?.url,
      quotedTweetUsername: quote?.username,
      media,
    });
  }
  return result;
}

/**
 * A tweet is kept if it's an original, a quote tweet, or a self-reply
 * that chains back (directly or transitively) to one of our own kept tweets.
 * Replies to other users and retweets are dropped.
 */
export function filterAndResolveThreads(tweets: ParsedTweet[]): ParsedTweet[] {
  const byId = new Map<string, ParsedTweet>();
  for (const t of tweets) byId.set(t.idStr, t);

  const kept = new Map<string, ParsedTweet>();

  for (const t of tweets) {
    if (t.classification === "original" || t.classification === "quote_tweet") {
      kept.set(t.idStr, t);
    }
  }

  const rootOf = (t: ParsedTweet): string | null => {
    let cur: ParsedTweet | undefined = t;
    const seen = new Set<string>();
    while (cur && cur.inReplyToStatusId) {
      if (seen.has(cur.idStr)) return null;
      seen.add(cur.idStr);
      const parent = byId.get(cur.inReplyToStatusId);
      if (!parent) return null;
      if (parent.classification !== "self_reply" && parent.classification !== "original" && parent.classification !== "quote_tweet") {
        return null;
      }
      if (!parent.inReplyToStatusId) return parent.idStr;
      cur = parent;
    }
    return cur?.idStr ?? null;
  };

  for (const t of tweets) {
    if (t.classification !== "self_reply") continue;
    const root = rootOf(t);
    if (root && kept.has(root)) {
      kept.set(t.idStr, { ...t, threadRootId: root });
    }
  }

  return Array.from(kept.values()).sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );
}

export function generateTitleFromText(text: string, maxLen = 80): string {
  const firstLine = text.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
  if (firstLine.length <= maxLen) return firstLine;
  return firstLine.slice(0, maxLen - 1).trimEnd() + "…";
}
