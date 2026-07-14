/**
 * POST /api/r2/multipart/part
 * Upload a single chunk (part) of a multipart upload to R2.
 * Parts are numbered sequentially starting at 1.
 *
 * Request: multipart/form-data
 *   - sessionId: string (base64-encoded "key:::uploadId")
 *   - partNumber: number
 *   - file: File (the chunk binary)
 *
 * Response: { partNumber: number, etag: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { uploadPart } from "@/lib/r2";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const sessionIdB64 = formData.get("sessionId") as string | null;
    const partNumberRaw = formData.get("partNumber") as string | null;
    const file = formData.get("file") as File | null;

    if (!sessionIdB64 || !partNumberRaw || !file) {
      return NextResponse.json(
        { error: "Missing required fields: sessionId, partNumber, file" },
        { status: 400 }
      );
    }

    const partNumber = parseInt(partNumberRaw);
    if (isNaN(partNumber) || partNumber < 1) {
      return NextResponse.json(
        { error: "partNumber must be a positive integer" },
        { status: 400 }
      );
    }

    let key: string, uploadId: string;
    try {
      const decoded = Buffer.from(sessionIdB64, "base64").toString("utf-8");
      const sepIndex = decoded.indexOf(":::");
      if (sepIndex === -1) throw new Error("Invalid sessionId format");
      key = decoded.slice(0, sepIndex);
      uploadId = decoded.slice(sepIndex + 3);
    } catch {
      return NextResponse.json(
        { error: "Invalid sessionId" },
        { status: 400 }
      );
    }

    if (!key || !uploadId) {
      return NextResponse.json(
        { error: "Invalid sessionId — missing key or uploadId" },
        { status: 400 }
      );
    }

    // Read the chunk into a buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload this part to R2
    const etag = await uploadPart(key, uploadId, partNumber, buffer);

    return NextResponse.json({ partNumber, etag });
  } catch (error: any) {
    console.error("[R2 Multipart Part Error]", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload part" },
      { status: 500 }
    );
  }
}
