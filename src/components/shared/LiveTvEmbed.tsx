"use client";

import { useRouter } from "next/navigation";

/**
 * Live TV embed that:
 *  - On web (Vercel, HTTPS): embeds Odysee directly.
 *  - On Capacitor native (APK, file://): loads the Vercel-hosted
 *    /live-tv-embed page in an iframe, so the Odysee iframe's
 *    parent is HTTPS, not file://.
 *
 * The admin/member nav button pushes to the TV management page
 * (/admin/tv or /tv) as before.
 */

function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof (window as any).Capacitor?.isNativePlatform === "function" &&
    (window as any).Capacitor.isNativePlatform()
  );
}

function getVercelBase(): string {
  if (typeof window === "undefined") return "";
  // NEXT_PUBLIC_VERCEL_URL is baked into the JS bundle at build time — works on APK too
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL || "";
  if (vercelUrl) return vercelUrl.replace(/\/+$/, "");
  // Fall back to window.location.origin for local dev / preview deployments
  // On Capacitor APK this will be file:// which we can't use for iframes
  if (window.location.origin.startsWith("file://")) return "";
  return window.location.origin.replace(/\/+$/, "");
}

const ODYSEE_SRC = "https://odysee.com/$/embed/@otvlive:a/gib254:2?autoplay=true";

interface Props {
  /** Where the "Watch" button navigates to */
  navTo: string;
}

export default function LiveTvEmbed({ navTo }: Props) {
  const router = useRouter();
  const vercelBase = getVercelBase();

  // Always load from Vercel when available — Odysee requires HTTPS parent.
  // Local dev (no Vercel URL) embeds Odysee directly (localhost is fine).
  // If Capacitor native has no Vercel URL configured, show fallback.
  if (!vercelBase) {
    const isNative = isCapacitorNative();
    if (isNative) {
      return (
        <div className="live-tv-embed-section">
          <LiveTvHeader navTo={navTo} router={router} />
          <div className="live-tv-embed-fallback">
            <i className="fas fa-tv" style={{ fontSize: 32, opacity: 0.3 }} />
            <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              Live TV is available on the web version
            </span>
          </div>
        </div>
      );
    }
    // Web local dev: embed Odysee directly
    return (
      <div className="live-tv-embed-section">
        <LiveTvHeader navTo={navTo} router={router} />
        <div className="live-tv-embed-wrap">
          <iframe
            src={ODYSEE_SRC}
            className="live-tv-iframe"
            allow="autoplay; encrypted-media"
            allowFullScreen
            title="Live TV"
          />
        </div>
      </div>
    );
  }

  // Vercel URL available — load the hosted embed page (works everywhere:
  // web, APK, all platforms). The /live-tv-embed route returns a clean
  // HTML page with the Odysee iframe under HTTPS.
  return (
    <div className="live-tv-embed-section">
      <LiveTvHeader navTo={navTo} router={router} />
      <div className="live-tv-embed-wrap">
        <iframe
          src={`${vercelBase}/live-tv-embed`}
          className="live-tv-iframe"
          allow="autoplay; encrypted-media"
          allowFullScreen
          title="Live TV"
        />
      </div>
    </div>
  );
}

function LiveTvHeader({
  navTo,
  router,
}: {
  navTo: string;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div className="live-tv-header">
      <div className="live-tv-header-left">
        <i className="fas fa-tv" />
        <span>Live TV</span>
      </div>
      <button
        className="live-tv-manage-btn"
        onClick={() => router.push(navTo)}
      >
        Watch <i className="fas fa-chevron-right" />
      </button>
    </div>
  );
}
