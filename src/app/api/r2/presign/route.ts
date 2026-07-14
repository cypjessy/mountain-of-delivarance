/**
 * POST /api/r2/presign
 * Generate a presigned PUT URL so the client can upload directly to R2.
 * Supports files up to 5GB.
 *
 * Request:  { fileName: string, contentType: string }
 * Response: { key: string, presignedUrl: string, publicUrl: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getPresignedUploadUrl, R2_PUBLIC_URL } from "@/lib/r2";

export async function POST(request: NextRequest) {
  try {
    const { fileName, contentType } = await request.json();

    if (!fileName) {
      return NextResponse.json({ error: "fileName is required" }, { status: 400 });
    }

    // Generate a unique key
    const ext = fileName.split(".").pop() || "mp4";
    const uuid = crypto.randomUUID();
    const key = `videos/${uuid}.${ext}`;

    // Presigned URL valid for 2 hours (7200 seconds)
    const presignedUrl = await getPresignedUploadUrl(key, contentType || "video/mp4", 7200);

    return NextResponse.json({
      key,
      presignedUrl,
      publicUrl: `${R2_PUBLIC_URL}/${key}`,
    });
  } catch (error: any) {
    console.error("[R2 Presign Error]", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
