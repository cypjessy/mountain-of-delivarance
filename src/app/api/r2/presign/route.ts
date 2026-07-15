/**
 * POST /api/r2/presign
 * Generate a presigned PUT URL so the client can upload directly to R2.
 * Supports files up to 5GB.
 * Requires a valid Firebase ID token in the Authorization header.
 *
 * Request:
 *   Authorization: Bearer <Firebase ID token>
 *   Body: { fileName: string, contentType: string, folder?: string }
 *
 * Response: { key: string, presignedUrl: string, publicUrl: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getPresignedUploadUrl, R2_PUBLIC_URL } from "@/lib/r2";
import { verifyFirebaseToken } from "@/lib/apiAuth";

export async function POST(request: NextRequest) {
  try {
    // ── Verify Firebase Auth token ──
    const user = await verifyFirebaseToken(
      request.headers.get("Authorization")
    );
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized — valid Firebase ID token required" },
        { status: 401 }
      );
    }

    const { fileName, contentType, folder } = await request.json();

    if (!fileName) {
      return NextResponse.json({ error: "fileName is required" }, { status: 400 });
    }

    // Generate a unique key
    const ext = fileName.split(".").pop() || "mp4";
    const uuid = crypto.randomUUID();
    const prefix = folder || "videos";
    const key = `${prefix}/${uuid}.${ext}`;

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
