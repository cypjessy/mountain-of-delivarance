/**
 * DELETE /api/r2/delete
 * Delete a video file from Cloudflare R2 storage.
 * Expects JSON body: { key: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { deleteFromR2 } from "@/lib/r2";

export async function DELETE(request: NextRequest) {
  try {
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
