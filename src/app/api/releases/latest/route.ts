/**
 * GET /api/releases/latest
 * Returns the most recent app release (highest versionCode).
 * Public endpoint — no auth required (used by the app to check for updates).
 */
import { NextResponse } from "next/server";
import { getLatestRelease } from "@/lib/appReleases";

export async function GET() {
  try {
    const release = await getLatestRelease();
    if (!release) {
      return NextResponse.json({ release: null }, { status: 200 });
    }
    return NextResponse.json({ release }, { status: 200 });
  } catch (err) {
    console.error("[Releases] Error fetching latest:", err);
    return NextResponse.json(
      { error: "Failed to fetch latest release" },
      { status: 500 }
    );
  }
}
