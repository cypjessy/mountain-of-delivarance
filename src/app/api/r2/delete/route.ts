/**
 * DELETE /api/r2/delete
 * Delete a video file from Cloudflare R2 storage.
 * Requires a valid Firebase ID token in the Authorization header.
 * Expects JSON body: { key: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { deleteFromR2 } from "@/lib/r2";
import { verifyFirebaseToken } from "@/lib/apiAuth";

export async function DELETE(request: NextRequest) {
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

    const { key } = await request.json();

    if (!key) {
      return NextResponse.json({ error: "No key provided" }, { status: 400 });
    }

    await deleteFromR2(key);

    return NextResponse.json({ success: true, key });
  } catch (error: any) {
    console.error("[R2 Delete Error]", error);
    return NextResponse.json(
      { error: error.message || "Delete failed" },
      { status: 500 }
    );
  }
}
