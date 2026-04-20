import { put } from "@vercel/blob";

/**
 * Uploads a media file to Vercel Blob under a deterministic, content-addressed
 * path. The importer is responsible for skipping uploads it already recorded
 * in the database — this helper just performs the write.
 */
export async function uploadMedia(
  pathname: string,
  data: Buffer | Uint8Array | ArrayBuffer,
  contentType: string,
): Promise<string> {
  const blob = await put(pathname, data as Buffer, {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export function contentTypeForExt(ext: string): string {
  return CONTENT_TYPE_BY_EXT[ext.toLowerCase()] ?? "application/octet-stream";
}

export function blobPathForMedia(tweetId: string, mediaKey: string, ext: string): string {
  return `tweets/${tweetId}/${mediaKey}.${ext.toLowerCase()}`;
}
