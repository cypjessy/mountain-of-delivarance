/**
 * POST /api/r2/multipart/complete
 * Finalize a multipart upload to R2.
 * Flushes any remaining buffered chunks as the final part, then completes.
 * The client saves metadata to Firestore after receiving the URL.
 *
 * Request: { sessionId }
 * Response: { key, url }
 */
import { NextRequest, NextResponse } from "next/server";
import { completeMultipartUpload, abortMultipartUpload, uploadPart, R2_PUBLIC_URL } from "@/lib/r2";
import { getCompletedParts } from "../part/route";

// Import the same buffer state from the part route
// (We share the same module scope via getCompletedParts)

export async function POST(request: NextRequest) {
  let key = "";
  let uploadId = "";
  let sessionId = "";

  try {
    const body = await request.json();
    sessionId = body.sessionId || "";

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
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

    // Retrieve stored parts and clean up buffer state
    const parts = getCompletedParts(sessionId);

    if (parts.length === 0) {
      return NextResponse.json(
        { error: "No completed parts found — did you upload any chunks?" },
        { status: 400 }
      );
    }

    // ── Complete multipart upload ──
    await completeMultipartUpload(key, uploadId, parts);

    const url = `${R2_PUBLIC_URL}/${key}`;

    return NextResponse.json({ key, url });
  } catch (error: any) {
    console.error("[R2 Multipart Complete Error]", error);

    // Clean up on failure
    if (key && uploadId) {
      try {
        await abortMultipartUpload(key, uploadId);
      } catch {}
    }

    return NextResponse.json(
      { error: error.message || "Failed to complete upload" },
      { status: 500 }
    );
  }
}
