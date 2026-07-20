/**
 * POST /api/notify-update
 *
 * Sends a Firebase Cloud Messaging push notification to all users
 * who have an fcm_token stored, notifying them of a new app update.
 *
 * Authentication: Bearer token matching BUILD_SECRET_TOKEN env var.
 * The notification includes a URL that opens the APK download page
 * when tapped.
 */
import { NextRequest, NextResponse } from "next/server";

const BUILD_SECRET = process.env.BUILD_SECRET_TOKEN || "";
const FCM_SERVER_KEY = process.env.NEXT_PUBLIC_FIREBASE_FCM_KEY || "";
const APP_DOWNLOAD_URL = "https://mountain-of-delivarance.vercel.app/app-release.apk";

export async function POST(request: NextRequest) {
  // ── Verify build secret ──
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  if (!BUILD_SECRET || token !== BUILD_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!FCM_SERVER_KEY) {
    return NextResponse.json(
      { error: "FCM_SERVER_KEY not configured. Set NEXT_PUBLIC_FIREBASE_FCM_KEY env var." },
      { status: 500 }
    );
  }

  try {
    // ── Parse request body for optional title/message overrides ──
    let body: { title?: string; message?: string; versionName?: string } = {};
    try {
      body = await request.json();
    } catch {}

    const notificationTitle = body.title || "📲 App Update Available";
    const notificationMessage = body.message || `Version ${body.versionName || "new"} of MOD NAKURU app is ready. Tap to download.`;

    // ── Fetch all users with fcm_token from Firestore ──
    const { db } = await import("@/lib/firebase");
    const { collection, getDocs } = await import("firebase/firestore");

    const usersSnap = await getDocs(collection(db, "users"));
    const fcmTokens: string[] = [];

    usersSnap.forEach((doc) => {
      const data = doc.data();
      if (data.fcm_token && typeof data.fcm_token === "string") {
        fcmTokens.push(data.fcm_token);
      }
    });

    if (fcmTokens.length === 0) {
      return NextResponse.json({ success: true, sent: 0, total: 0, message: "No FCM tokens found" });
    }

    // ── Send push notification via FCM HTTP v1 API ──
    let sentCount = 0;
    let failCount = 0;

    // Send in batches to avoid overwhelming the FCM API
    const batchSize = 100;
    for (let i = 0; i < fcmTokens.length; i += batchSize) {
      const batch = fcmTokens.slice(i, i + batchSize);

      // Send individually (FCM HTTP v1 doesn't support batch send for multicast easily)
      const results = await Promise.allSettled(
        batch.map(async (fcmToken) => {
          const response = await fetch(
            `https://fcm.googleapis.com/fcm/send`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `key=${FCM_SERVER_KEY}`,
              },
              body: JSON.stringify({
                to: fcmToken,
                notification: {
                  title: notificationTitle,
                  body: notificationMessage,
                  sound: "default",
                  badge: "1",
                  icon: "ic_launcher_round",
                },
                data: {
                  type: "app_update",
                  url: APP_DOWNLOAD_URL,
                  title: notificationTitle,
                  body: notificationMessage,
                },
                android: {
                  priority: "high",
                  notification: {
                    channelId: "app_updates",
                    priority: "high",
                    clickAction: "OPEN_APP_UPDATE",
                  },
                },
              }),
            }
          );

          if (!response.ok) {
            const errText = await response.text().catch(() => "unknown");
            console.error(`[FCM] Failed for token: ${errText}`);
            throw new Error(errText);
          }
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          sentCount++;
        } else {
          failCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failCount,
      total: fcmTokens.length,
      message: `Notification sent to ${sentCount} device(s) (${failCount} failed)`,
    });
  } catch (err: any) {
    console.error("[FCM] Error sending notification:", err);
    return NextResponse.json(
      { error: "Failed to send notifications", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
