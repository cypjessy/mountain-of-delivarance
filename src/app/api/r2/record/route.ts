/**
 * POST /api/r2/record
 * Save uploaded video metadata to Firestore (r2_videos collection).
 * Called by the client AFTER the file has been uploaded directly to R2.
 *
 * Request:
 *   Authorization: Bearer <Firebase ID token>
 *   Body: { key, url, title, description, fileSize, contentType, originalName, duration, thumbnail?, category? }
 *
 * Response: { id: string } (the Firestore doc ID)
 */
import { NextRequest, NextResponse } from "next/server";
import { addR2Video } from "@/lib/r2Videos";
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

    // ── Read body ──
    const body = await request.json();
    const {
      key,
      url,
      title,
      description,
      fileSize,
      contentType,
      originalName,
      duration,
      thumbnail,
      category,
    } = body;

    // ── Validate required fields ──
    if (!key || !url || !title) {
      return NextResponse.json(
        { error: "Missing required fields: key, url, title" },
        { status: 400 }
      );
    }

    // ── Save to Firestore ──
    const docId = await addR2Video({
      title,
      description: description || "",
      url,
      key,
      fileSize: fileSize || 0,
      contentType: contentType || "video/mp4",
      originalName: originalName || "unknown",
      duration: duration || 0,
      thumbnail: thumbnail || "",
      category: category || "sermon",
      isFeatured: false,
      isHidden: false,
    });

    return NextResponse.json({ id: docId, url, key });
  } catch (error: any) {
    console.error("[R2 Record Error]", error);
    return NextResponse.json(
      { error: error.message || "Failed to record video" },
      { status: 500 }
    );
  }
}
