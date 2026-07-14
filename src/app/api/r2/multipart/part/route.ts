/**
 * POST /api/r2/multipart/part
 * Accept a single chunk from the client (≤3MB, safe for Vercel's body limit).
 * Server buffers chunks until ≥MIN_PART_SIZE, then flushes to R2 as a single part.
 *
 * Request: multipart/form-data
 *   - sessionId: string (base64-encoded "key:::uploadId")
 *   - isLast: "true" if this is the final chunk
 *   - file: File (the chunk binary, up to ~3MB)
 *
 * Response: { partNumber: number, etag: string } | { buffered: true }
 *   - If etag is returned: the chunk was flushed as an R2 part (client tracks it)
 *   - If buffered: chunk is held in server memory, send more chunks
 */
import { NextRequest, NextResponse } from "next/server";
import { uploadPart } from "@/lib/r2";

// ─── Module-level buffer state ─────────────────────────────────
// Shared across requests in the same serverless instance.
// On cold start: state is empty (user retries the upload).
// Key: sessionId   Value: accumulated buffer & metadata
const buffers = new Map<string, Buffer[]>();
const bufferSizes = new Map<string, number>();
// Key: sessionId   Value: completed parts list
const completedParts = new Map<string, { PartNumber: number; ETag: string }[]>();
const nextPartNums = new Map<string, number>();

const MIN_PART_SIZE = 5.5 * 1024 * 1024; // 5.5MB (safely above R2's 5MB minimum)

function decodeSessionId(sessionIdB64: string): { key: string; uploadId: string } | null {
  try {
    const decoded = Buffer.from(sessionIdB64, "base64").toString("utf-8");
    const sepIndex = decoded.indexOf(":::");
    if (sepIndex === -1) return null;
    return {
      key: decoded.slice(0, sepIndex),
      uploadId: decoded.slice(sepIndex + 3),
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const sessionId = formData.get("sessionId") as string | null;
    const isLast = formData.get("isLast") === "true";
    const file = formData.get("file") as File | null;

    if (!sessionId || !file) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, file" },
        { status: 400 }
      );
    }

    const decoded = decodeSessionId(sessionId);
    if (!decoded || !decoded.key || !decoded.uploadId) {
      return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
    }

    const { key, uploadId } = decoded;

    // Read the chunk into a buffer
    const arrayBuffer = await file.arrayBuffer();
    const chunk = Buffer.from(arrayBuffer);

    // ── Buffer management ──
    const existing = buffers.get(sessionId) || [];
    const existingSize = bufferSizes.get(sessionId) || 0;
    existing.push(chunk);
    const newSize = existingSize + chunk.length;
    buffers.set(sessionId, existing);
    bufferSizes.set(sessionId, newSize);

    // If buffer is large enough (≥MIN_PART_SIZE) OR this is the last chunk, flush
    if (newSize >= MIN_PART_SIZE || isLast) {
      // Concatenate all buffered chunks
      const combined = Buffer.concat(existing);
      // Clear the buffer
      buffers.delete(sessionId);
      bufferSizes.delete(sessionId);

      // Get next part number
      const partNum = (nextPartNums.get(sessionId) || 0) + 1;
      nextPartNums.set(sessionId, partNum);

      // Upload to R2
      const etag = await uploadPart(key, uploadId, partNum, combined);

      // Store in completed parts
      const parts = completedParts.get(sessionId) || [];
      parts.push({ PartNumber: partNum, ETag: etag });
      completedParts.set(sessionId, parts);

      return NextResponse.json({ partNumber: partNum, etag, isLast });
    } else {
      // Buffer isn't full yet — tell client to keep sending
      return NextResponse.json({ buffered: true });
    }
  } catch (error: any) {
    console.error("[R2 Multipart Part Error]", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload part" },
      { status: 500 }
    );
  }
}

/**
 * Called by the complete endpoint to get stored parts and clean up state.
 */
export function getCompletedParts(sessionId: string): { PartNumber: number; ETag: string }[] {
  const parts = completedParts.get(sessionId) || [];
  completedParts.delete(sessionId);
  buffers.delete(sessionId);
  bufferSizes.delete(sessionId);
  nextPartNums.delete(sessionId);
  return parts;
}
