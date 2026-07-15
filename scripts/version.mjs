#!/usr/bin/env node

/**
 * Version management script for the Android APK build pipeline.
 *
 * Usage:  node scripts/version.mjs <command>
 *
 * Commands:
 *   bump       — Read build.gradle, bump versionCode + versionName, write back
 *   record     — Record a new release in Firestore via the releases API
 *
 * Environment variables:
 *   BUILD_SECRET_TOKEN   — Required for the /api/releases/create API call
 *   NEXT_PUBLIC_API_HOST — Required for the API call (e.g. https://your-project.vercel.app)
 *
 * If NEXT_PUBLIC_API_HOST is not set, the script falls back to http://localhost:3000.
 */

import { readFileSync, writeFileSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD_GRADLE = join(ROOT, "android", "app", "build.gradle");
const APK_PATH = join(ROOT, "public", "app-release.apk");
const API_HOST = process.env.NEXT_PUBLIC_API_HOST || "http://localhost:3000";
const BUILD_SECRET = process.env.BUILD_SECRET_TOKEN || "";

/* ─── Helpers ─── */

function readBuildGradle() {
  const content = readFileSync(BUILD_GRADLE, "utf-8");
  const vcMatch = content.match(/versionCode\s+(\d+)/);
  const vnMatch = content.match(/versionName\s+"([^"]+)"/);

  if (!vcMatch || !vnMatch) {
    console.error("❌ Could not parse versionCode or versionName from build.gradle");
    process.exit(1);
  }

  return {
    content,
    versionCode: parseInt(vcMatch[1], 10),
    versionName: vnMatch[1],
  };
}

function bumpSemver(current: string): string {
  const parts = current.split(".").map(Number);
  // If not a valid semver, start from "1.0.0"
  if (parts.length < 2 || parts.some(isNaN)) return "1.0.0";
  // Increment patch
  if (parts.length === 2) parts.push(1);
  else parts[parts.length - 1]++;
  return parts.join(".");
}

/* ─── Commands ─── */

function cmdBump() {
  const { content, versionCode, versionName } = readBuildGradle();
  const newVersionCode = versionCode + 1;
  const newVersionName = bumpSemver(versionName);

  const updated = content
    .replace(/versionCode\s+\d+/, `versionCode ${newVersionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${newVersionName}"`);

  writeFileSync(BUILD_GRADLE, updated, "utf-8");

  console.log(`✅ Version bumped: ${versionName} (${versionCode}) → ${newVersionName} (${newVersionCode})`);
}

async function cmdRecord() {
  const { versionCode, versionName } = readBuildGradle();

  let fileSize = 0;
  try {
    fileSize = statSync(APK_PATH).size;
  } catch {
    console.warn("⚠️  APK not found at public/app-release.apk — fileSize will be 0");
  }

  const downloadUrl = `/app-release.apk`;

  if (!BUILD_SECRET) {
    console.error("❌ BUILD_SECRET_TOKEN environment variable is required");
    process.exit(1);
  }

  console.log(`📤 Recording release: ${versionName} (${versionCode})...`);

  try {
    const res = await fetch(`${API_HOST}/api/releases/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BUILD_SECRET}`,
      },
      body: JSON.stringify({
        versionCode,
        versionName,
        downloadUrl,
        fileSize,
        releaseNotes: `Build ${versionName} — ${new Date().toISOString().split("T")[0]}`,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`❌ API error (${res.status}): ${text}`);
      process.exit(1);
    }

    const data = await res.json();
    console.log(`✅ Release recorded with id: ${data.id}`);
    console.log(`   Download URL: ${API_HOST}${downloadUrl}`);
  } catch (err) {
    console.error("❌ Failed to call releases API:", err.message);
    process.exit(1);
  }
}

/* ─── Main ─── */

const command = process.argv[2];

if (command === "bump") {
  cmdBump();
} else if (command === "record") {
  cmdRecord();
} else {
  console.log(`
Usage: node scripts/version.mjs <command>

Commands:
  bump    — Bump versionCode (+1) and versionName (patch)
  record  — Record a new release in Firestore via /api/releases/create

Environment:
  BUILD_SECRET_TOKEN   — Required for record command
  NEXT_PUBLIC_API_HOST — API host (default: http://localhost:3000)
`);
  process.exit(1);
}
