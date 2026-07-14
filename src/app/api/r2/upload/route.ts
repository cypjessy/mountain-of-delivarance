/**
 * POST /api/r2/upload
 * Upload a video file to Cloudflare R2 storage.
 * Expects multipart/form-data with:
 *   - file: the video file (MP4, WebM, etc.)
 *   - title: video title
 *   - description (optional)
 * Returns the R2 URL and file metadata.
 */
import { NextRequest, NextResponse } from "next/server";
import { uploadToR2, R2_PUBLIC_URL } from "@/lib/r2";

const ALLOWED_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
];

const MAX_SIZE = 500 * 1024 * 1024; // 500MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || "";
    const description = (formData.get("description") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: "${file.type}". Allowed: MP4, WebM, OGG, MOV, AVI, MKV`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: ${MAX_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 }
      );
    }

    // Generate a unique key
    const ext = file.name.split(".").pop() || "mp4";
    const uuid = crypto.randomUUID();
    const key = `videos/${uuid}.${ext}`;

    // Read the file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to R2
    const result = await uploadToR2(buffer, key, file.type);

    return NextResponse.json({
      key: result.key,
      url: result.url,
      size: result.size,
      contentType: result.contentType,
      title,
      description,
      originalName: file.name,
    });
  } catch (error: any) {
    console.error("[R2 Upload Error]", error);
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 }
    );
  }
}

