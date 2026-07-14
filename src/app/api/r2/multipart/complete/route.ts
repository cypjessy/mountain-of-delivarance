/**
 * POST /api/r2/multipart/complete
 * Finalize a multipart upload to R2.
 * The client saves metadata to Firestore after receiving the URL.
 *
 * Request: {
 *   sessionId,          // base64-encoded "key:::uploadId"
 *   parts: [{ partNumber, etag }],
 * }
 * Response: { key, url }
 */
import { NextRequest, NextResponse } from "next/server";
import { completeMultipartUpload, abortMultipartUpload, R2_PUBLIC_URL } from "@/lib/r2";

export async function POST(request: NextRequest) {
  let key = "";
  let uploadId = "";

  try {
    const body = await request.json();
    const { sessionId, parts } = body;

    // ── Decode sessionId ──
    if (!sessionId || !parts || !Array.isArray(parts) || parts.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, parts[]" },
        { status: 400 }
      );
    }

    try {
      const decoded = Buffer.from(sessionId, "base64").toString("utf-8");
      const sepIndex = decoded.indexOf(":::");
      if (sepIndex === -1) throw new Error("Invalid sessionId format");
      key = decoded.slice(0, sepIndex);
      uploadId = decoded.slice(sepIndex + 3);
    } catch {
      return NextResponse.json({ error: "Invalid sessionId" }, { status: 400 });
    }

    if (!key || !uploadId) {
      return NextResponse.json(
        { error: "Invalid sessionId — missing key or uploadId" },
        { status: 400 }
      );
    }

    // ── Sort parts by partNumber ascending ──
    const sortedParts = [...parts].sort(
      (a: any, b: any) => (a.partNumber || 0) - (b.partNumber || 0)
    );

    const r2Parts = sortedParts.map((p: any) => ({
      PartNumber: p.partNumber,
      ETag: p.etag,
    }));

    // ── Complete multipart upload ──
    await completeMultipartUpload(key, uploadId, r2Parts);

    const url = `${R2_PUBLIC_URL}/${key}`;

    return NextResponse.json({ key, url });
  } catch (error: any) {
    console.error("[R2 Multipart Complete Error]", error);

    // Try to abort the multipart upload to discard uploaded parts
    if (key && uploadId) {
      try {
        await abortMultipartUpload(key, uploadId);
      } catch {}
    } else if (key) {
      // If we don't have uploadId but have key, try to delete the file
      try {
        const { deleteFromR2 } = await import("@/lib/r2");
        await deleteFromR2(key);
      } catch {}
    }

    return NextResponse.json(
      { error: error.message || "Failed to complete upload" },
      { status: 500 }
    );
  }
}
