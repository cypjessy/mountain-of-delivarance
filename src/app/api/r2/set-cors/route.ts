/**
 * POST /api/r2/set-cors
 * One-time endpoint to configure CORS on your R2 bucket.
 * This allows browser-based direct uploads from your frontend domains.
 *
 * Call this once with:
 *   curl -X POST http://localhost:3000/api/r2/set-cors
 * Or just visit it in your browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "";

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to set CORS rules on your R2 bucket.",
    usage: "curl -X POST http://localhost:3000/api/r2/set-cors",
  });
}

export async function POST() {
  try {
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
      return NextResponse.json(
        { error: "Missing R2 env vars — check .env.local" },
        { status: 500 }
      );
    }

    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });

    const command = new PutBucketCorsCommand({
      Bucket: R2_BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [
              "http://localhost:3000",
              "http://localhost:3001",
              "http://localhost:*",
              "https://*.vercel.app",
              "https://*.r2.dev",
              "https://mountainofdeliverance.com",
              "https://*.mountainofdeliverance.com",
            ],
            AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    });

    await s3Client.send(command);

    return NextResponse.json({
      success: true,
      message: `CORS policy applied to bucket "${R2_BUCKET_NAME}"`,
      origins: [
        "http://localhost:3000",
        "https://*.vercel.app",
        "https://*.r2.dev",
        "https://mountainofdeliverance.com",
      ],
    });
  } catch (error: any) {
    console.error("[R2 CORS Error]", error);
    return NextResponse.json(
      { error: error.message || "Failed to set CORS policy" },
      { status: 500 }
    );
  }
}
