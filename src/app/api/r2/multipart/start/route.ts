/**
 * POST /api/r2/multipart/start
 * Initiate an S3-compatible multipart upload to Cloudflare R2.
 * Returns a sessionId (key:::uploadId) that must be passed to part & complete endpoints.
 *
 * Request:  { fileName: string, contentType: string }
 * Response: { sessionId: string, key: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { startMultipartUpload } from "@/lib/r2";

export async function POST(request: NextRequest) {
  try {
    const { fileName, contentType } = await request.json();

    if (!fileName) {
      return NextResponse.json({ error: "fileName is required" }, { status: 400 });
    }

    const ext = fileName.split(".").pop() || "mp4";
    const uuid = crypto.randomUUID();
    const key = `videos/${uuid}.${ext}`;

    const { uploadId } = await startMultipartUpload(key, contentType || "video/mp4");
    if (!uploadId) {
      throw new Error("Failed to get UploadId from R2");
    }

    // Encode key & uploadId into a single opaque token
    const sessionId = Buffer.from(`${key}:::${uploadId}`).toString("base64");

    return NextResponse.json({ sessionId, key });
  } catch (error: any) {
    console.error("[R2 Multipart Start Error]", error);
    return NextResponse.json(
      { error: error.message || "Failed to start multipart upload" },
      { status: 500 }
    );
  }
}
