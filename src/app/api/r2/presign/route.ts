import { NextRequest, NextResponse } from "next/server";
import { getPresignedUploadUrl, R2_PUBLIC_URL } from "@/lib/r2";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { fileName, contentType, folder } = await req.json();

    if (!fileName || !contentType) {
      return NextResponse.json({ error: "fileName and contentType are required" }, { status: 400 });
    }

    const ext = fileName.split(".").pop() || "bin";
    const uuid = crypto.randomUUID();
    const key = folder ? `${folder}/${uuid}.${ext}` : `${uuid}.${ext}`;

    const presignedUrl = await getPresignedUploadUrl(key, contentType);

    return NextResponse.json({
      presignedUrl,
      publicUrl: `${R2_PUBLIC_URL}/${key}`,
      key,
    });
  } catch (err: any) {
    console.error("[R2] Presign error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate presigned URL" }, { status: 500 });
  }
}
