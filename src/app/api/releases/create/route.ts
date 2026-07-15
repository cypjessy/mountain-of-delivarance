/**
 * POST /api/releases/create
 * Creates a new app release record in Firestore.
 *
 * Protected by a BUILD_SECRET_TOKEN environment variable.
 * The build script sends this token in the Authorization header.
 *
 * Body: { versionCode, versionName, downloadUrl, fileSize, releaseNotes }
 */
import { NextRequest, NextResponse } from "next/server";
import { createRelease } from "@/lib/appReleases";

const BUILD_SECRET = process.env.BUILD_SECRET_TOKEN || "";

export async function POST(request: NextRequest) {
  // Verify build secret
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== BUILD_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { versionCode, versionName, downloadUrl, fileSize, releaseNotes } = body;

    // Validate required fields
    if (
      typeof versionCode !== "number" ||
      typeof versionName !== "string" ||
      typeof downloadUrl !== "string"
    ) {
      return NextResponse.json(
        { error: "Missing or invalid required fields: versionCode (number), versionName (string), downloadUrl (string)" },
        { status: 400 }
      );
    }

    const id = await createRelease({
      versionCode,
      versionName,
      downloadUrl,
      fileSize: typeof fileSize === "number" ? fileSize : 0,
      releaseNotes: typeof releaseNotes === "string" ? releaseNotes : "",
    });

    return NextResponse.json({ id, success: true }, { status: 201 });
  } catch (err) {
    console.error("[Releases] Error creating release:", err);
    return NextResponse.json(
      { error: "Failed to create release" },
      { status: 500 }
    );
  }
}
