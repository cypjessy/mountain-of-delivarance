"use client";

import { useEffect, useState, useCallback } from "react";
import { getLatestRelease } from "@/lib/appReleases";
import type { AppRelease } from "@/lib/appReleases";

/**
 * Force-update checker for the Android app.
 *
 * On native Android (Capacitor), reads the real versionCode via
 * @capacitor/device. If a newer release exists in Firestore, it
 * shows a FULL-SCREEN blocking overlay — the user MUST download
 * and install the update before using the app.
 *
 * On web, no native version is available so the component simply
 * hides (no false-positive update prompts).
 */
export default function UpdateChecker() {
  const [latest, setLatest] = useState<AppRelease | null>(null);
  const [currentCode, setCurrentCode] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // ── Get native app version via Capacitor ──
  useEffect(() => {
    let mounted = true;
    let attempts = 0;
    const tryGetVersion = async (): Promise<void> => {
      attempts++;
      try {
        const { Device } = await import("@capacitor/device");
        const info = await Device.getInfo() as unknown as { appBuild: string; appVersion: string };
        const code = parseInt(info.appBuild, 10);
        if (mounted && !isNaN(code) && code > 0) {
          setCurrentCode(code);
          setReady(true);
          return;
        }
      } catch {
        // Capacitor not available — may be retried below
      }
      // Fallback: check if Capacitor is available globally and try Plugin.Device
      try {
        const cap = (window as any).Capacitor;
        if (cap?.Plugins?.Device?.getInfo) {
          const info = await cap.Plugins.Device.getInfo() as { appBuild?: string; appVersion?: string };
          const code = parseInt(info?.appBuild || "", 10);
          if (mounted && !isNaN(code) && code > 0) {
            setCurrentCode(code);
            setReady(true);
            return;
          }
        }
      } catch {}
      // Check user agent for Capacitor build info
      try {
        const ua = navigator.userAgent;
        // Some Capacitor builds embed version in user agent
        const buildMatch = ua.match(/build\/(\d+)/i);
        if (buildMatch) {
          const code = parseInt(buildMatch[1], 10);
          if (mounted && !isNaN(code) && code > 0) {
            setCurrentCode(code);
            setReady(true);
            return;
          }
        }
      } catch {}
      // Retry with backoff if still mounted and not exhausted
      if (attempts < 3 && mounted) {
        setTimeout(tryGetVersion, 1500 * attempts);
      } else {
        if (mounted) setReady(true);
      }
    };
    tryGetVersion();
    return () => { mounted = false; };
  }, []);

  // ── Check Firestore for latest release ──
  useEffect(() => {
    if (!ready || currentCode === null) return;
    let mounted = true;
    const check = async () => {
      try {
        const release = await getLatestRelease();
        if (mounted) setLatest(release);
      } catch { /* silent */ }
    };
    const timer = setTimeout(check, 2000);
    return () => { mounted = false; clearTimeout(timer); };
  }, [ready, currentCode]);

  // ── Download handler ──
  const handleDownload = useCallback(async () => {
    if (!latest?.downloadUrl || downloading) return;
    setDownloading(true);
    const url = latest.downloadUrl.startsWith("http")
      ? latest.downloadUrl
      : `${window.location.origin}${latest.downloadUrl}`;
    // Open in browser so the user can download and install
    window.open(url, "_blank");
    // Give the user time to complete the installation
    // They'll see the force update again until they install the new version
    setTimeout(() => setDownloading(false), 5000);
  }, [latest, downloading]);

  // ── Don't show if conditions aren't met ──
  if (!ready || currentCode === null || !latest) return null;
  if (latest.versionCode <= currentCode) return null;

  return (
    <>
      <style>{`
        .force-update-overlay {
          position: fixed;
          inset: 0;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #0F0F0F;
          padding: 32px 24px;
          animation: forceUpdateFadeIn 0.4s ease;
        }
        @keyframes forceUpdateFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .force-update-icon {
          width: 80px;
          height: 80px;
          border-radius: 24px;
          background: linear-gradient(135deg, rgba(232,168,56,0.12), rgba(232,168,56,0.04));
          border: 1px solid rgba(232,168,56,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 34px;
          color: #E8A838;
          margin-bottom: 24px;
        }
        .force-update-title {
          font-size: 22px;
          font-weight: 800;
          text-align: center;
          margin-bottom: 8px;
          color: #FFFFFF;
        }
        .force-update-sub {
          font-size: 14px;
          color: #A0A0A0;
          text-align: center;
          line-height: 1.6;
          margin-bottom: 4px;
          max-width: 320px;
        }
        .force-update-version {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 20px;
          background: rgba(232,168,56,0.1);
          border: 1px solid rgba(232,168,56,0.15);
          font-size: 13px;
          font-weight: 700;
          color: #E8A838;
          margin: 16px 0 28px;
        }
        .force-update-btn {
          width: 100%;
          max-width: 320px;
          padding: 16px;
          border-radius: 14px;
          font-size: 16px;
          font-weight: 700;
          border: none;
          background: linear-gradient(135deg, #E8A838, #D4762A);
          color: #fff;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .force-update-btn:active { transform: scale(0.97); }
        .force-update-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .force-update-hint {
          font-size: 12px;
          color: #6B6B6B;
          text-align: center;
          margin-top: 16px;
          max-width: 280px;
          line-height: 1.5;
        }
        .force-update-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: #fff;
          border-radius: 50%;
          animation: forceUpdateSpin 0.6s linear infinite;
        }
        @keyframes forceUpdateSpin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="force-update-overlay">
        <div className="force-update-icon">
          <i className="fas fa-arrow-up"></i>
        </div>

        <div className="force-update-title">
          Update Required
        </div>

        <div className="force-update-sub">
          A new version of the app is available.
          {latest.releaseNotes && <> {latest.releaseNotes}</>}
        </div>

        <div className="force-update-sub" style={{ marginTop: 4 }}>
          Please download and install the update to continue.
        </div>

        <div className="force-update-version">
          <i className="fas fa-download"></i>
          v{latest.versionName}
          {latest.fileSize > 0 && (
            <> · {(latest.fileSize / 1048576).toFixed(1)} MB</>
          )}
        </div>

        <button
          className="force-update-btn"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? (
            <><div className="force-update-spinner"></div> Opening Download...</>
          ) : (
            <><i className="fas fa-download"></i> Download Update</>
          )}
        </button>

        <div className="force-update-hint">
          After downloading, open the APK file to install. You may need to allow installation from unknown sources.
        </div>
      </div>
    </>
  );
}
