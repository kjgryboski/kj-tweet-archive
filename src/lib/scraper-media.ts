import { sql } from "@vercel/postgres";
import { blobPathForMedia, contentTypeForExt, uploadMedia } from "./blob";
import type { ScrapedPhoto } from "./scraper-utils";

/**
 * True if we've already persisted any media for this tweet. The scraper only
 * captures photos, and the archive importer is the authoritative source for
 * video/GIF, so we skip any tweet that already has rows — either it was
 * archive-imported (full-fidelity) or scraped on a previous run.
 */
export async function hasExistingMedia(xTweetId: string): Promise<boolean> {
  const { rows } = await sql`
    SELECT 1 FROM tweet_media WHERE x_tweet_id = ${xTweetId} LIMIT 1
  `;
  return rows.length > 0;
}

function extFromContentType(ct: string | null, url: string): string {
  if (ct?.includes("jpeg")) return "jpg";
  if (ct?.includes("png")) return "png";
  if (ct?.includes("webp")) return "webp";
  if (ct?.includes("gif")) return "gif";
  try {
    const u = new URL(url);
    const fmt = u.searchParams.get("format");
    if (fmt) return fmt.toLowerCase();
  } catch {
    /* ignore */
  }
  return "jpg";
}

export interface UploadedPhoto {
  mediaKey: string;
  url: string;
  contentType: string;
  width?: number;
  height?: number;
}

/**
 * Fetches a photo from pbs.twimg.com and persists it to Vercel Blob under
 * tweets/{tweetId}/{mediaKey}.{ext}. Returns the public Blob URL.
 */
export async function fetchAndUploadPhoto(
  xTweetId: string,
  photo: ScrapedPhoto,
): Promise<UploadedPhoto | null> {
  const res = await fetch(photo.url);
  if (!res.ok) {
    console.warn(
      `[scraper-media] failed to fetch ${photo.url}: ${res.status} ${res.statusText}`,
    );
    return null;
  }
  const contentType = res.headers.get("content-type");
  const ext = extFromContentType(contentType, photo.url);
  const buf = Buffer.from(await res.arrayBuffer());
  const blobUrl = await uploadMedia(
    blobPathForMedia(xTweetId, photo.mediaKey, ext),
    buf,
    contentType || contentTypeForExt(ext),
  );
  return {
    mediaKey: photo.mediaKey,
    url: blobUrl,
    contentType: contentType || contentTypeForExt(ext),
  };
}
