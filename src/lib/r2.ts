/**
 * Cloudflare R2 (S3-compatible) storage utilities.
 * Server-side only — used in API routes and server components.
 */
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "";

if (typeof window === "undefined" && (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME)) {
  console.warn(
    "[R2] Missing env vars — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME"
  );
}

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

/** Public URL prefix (R2 public bucket or custom domain) */
export const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ||
  (R2_ACCOUNT_ID
    ? `https://pub-${R2_ACCOUNT_ID}.r2.dev`
    : "");

export interface R2UploadResult {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

/**
 * Upload a file buffer to R2 (server-side).
 * For files larger than ~100MB, prefer using presigned URLs instead.
 */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<R2UploadResult> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(command);

  return {
    key,
    url: `${R2_PUBLIC_URL}/${key}`,
    size: buffer.length,
    contentType,
  };
}

/**
 * Generate a presigned PUT URL so the client can upload directly to R2.
 * Supports files up to 5GB. The URL expires after the given number of seconds.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Delete a file from R2 by key.
 */
export async function deleteFromR2(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });
  await s3Client.send(command);
}

/**
 * List all objects with a given prefix (folder path).
 */
export async function listR2Objects(prefix: string): Promise<
  { key: string; size: number; lastModified: Date | null }[]
> {
  const command = new ListObjectsV2Command({
    Bucket: R2_BUCKET_NAME,
    Prefix: prefix,
  });
  const result = await s3Client.send(command);
  return (result.Contents || []).map((obj) => ({
    key: obj.Key || "",
    size: obj.Size || 0,
    lastModified: obj.LastModified || null,
  }));
}

/**
 * Get head (metadata) for a single object.
 */
export async function getR2ObjectHead(key: string): Promise<{
  size: number;
  contentType: string;
  lastModified: Date | null;
} | null> {
  try {
    const command = new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });
    const result = await s3Client.send(command);
    return {
      size: result.ContentLength || 0,
      contentType: result.ContentType || "application/octet-stream",
      lastModified: result.LastModified || null,
    };
  } catch {
    return null;
  }
}
