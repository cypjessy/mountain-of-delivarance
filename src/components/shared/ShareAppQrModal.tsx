"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface ShareAppQrModalProps {
  open: boolean;
  onClose: () => void;
}

const APP_DOWNLOAD_URL = "https://mountain-of-delivarance.vercel.app/app-release.apk";

export default function ShareAppQrModal({ open, onClose }: ShareAppQrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        const QRCode = await import("qrcode");
        const url = await QRCode.toDataURL(APP_DOWNLOAD_URL, {
          width: 280,
          margin: 2,
          color: { dark: "#FFFFFF", light: "#1A1A1A" },
        });
        if (mounted) setQrDataUrl(url);
      } catch {
        // Fallback: render using canvas manually
        if (canvasRef.current) {
          const QRCode = await import("qrcode");
          QRCode.toCanvas(canvasRef.current, APP_DOWNLOAD_URL, {
            width: 280,
            margin: 2,
            color: { dark: "#FFFFFF", light: "#1A1A1A" },
          });
        }
      }
    })();
    return () => { mounted = false; };
  }, [open]);

  const handleShare = useCallback(async () => {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({
        title: "MOD NAKURU App",
        text: "Download the MOD NAKURU church app",
        url: APP_DOWNLOAD_URL,
      });
    } catch {
      // Fallback to native share if available
      if (navigator.share) {
        await navigator.share({
          title: "MOD NAKURU App",
          text: "Download the MOD NAKURU church app",
          url: APP_DOWNLOAD_URL,
        });
      } else {
        await navigator.clipboard.writeText(APP_DOWNLOAD_URL);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(APP_DOWNLOAD_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }, []);

  if (!open) return null;

  return (
    <>
      <style>{`
        .qr-overlay {
          position: fixed;
          inset: 0;
          z-index: 99999;
          background: rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          animation: qrFadeIn 0.25s ease;
        }
        @keyframes qrFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .qr-modal {
          background: #1A1A1A;
          border: 1px solid #2A2A2A;
          border-radius: 24px;
          padding: 28px 24px 20px;
          max-width: 340px;
          width: 100%;
          text-align: center;
          animation: qrSlideUp 0.35s cubic-bezier(0.32, 0.72, 0, 1);
        }
        @keyframes qrSlideUp {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .qr-title {
          font-size: 18px;
          font-weight: 800;
          color: #FFFFFF;
          margin-bottom: 4px;
        }
        .qr-sub {
          font-size: 13px;
          color: #A0A0A0;
          margin-bottom: 20px;
          line-height: 1.5;
        }
        .qr-code-wrap {
          background: #1A1A1A;
          border-radius: 16px;
          padding: 16px;
          display: inline-block;
          margin-bottom: 20px;
          border: 1px solid #2A2A2A;
        }
        .qr-code-wrap canvas,
        .qr-code-wrap img {
          display: block;
          width: 220px;
          height: 220px;
          border-radius: 8px;
        }
        .qr-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .qr-btn {
          width: 100%;
          padding: 14px;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 700;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s ease;
        }
        .qr-btn:active { transform: scale(0.97); }
        .qr-btn.primary {
          background: linear-gradient(135deg, #E8A838, #D4762A);
          color: #fff;
        }
        .qr-btn.secondary {
          background: #242424;
          border: 1px solid #2A2A2A;
          color: #A0A0A0;
        }
        .qr-btn.secondary:active { background: #2A2A2A; }
        .qr-close {
          margin-top: 4px;
          background: none;
          border: none;
          color: #6B6B6B;
          font-size: 12px;
          cursor: pointer;
          padding: 8px;
          transition: color 0.2s;
        }
        .qr-close:hover { color: #A0A0A0; }
        .qr-copied-tag {
          font-size: 12px;
          color: #22C55E;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
        }
      `}</style>

      <div className="qr-overlay" onClick={onClose}>
        <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
          <div className="qr-title">
            <i className="fas fa-share-nodes" style={{ color: "#E8A838", marginRight: 8 }}></i>
            Share App
          </div>
          <div className="qr-sub">
            Scan the QR code or share the link to download the MOD NAKURU app
          </div>

          <div className="qr-code-wrap">
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code" />
            ) : (
              <div style={{
                width: 220, height: 220,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#6B6B6B", fontSize: 14, background: "#0F0F0F", borderRadius: 8,
              }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }}></i>
              </div>
            )}
          </div>

          <div className="qr-actions">
            <button className="qr-btn primary" onClick={handleShare}>
              <i className="fas fa-share-nodes"></i> Share App
            </button>
            <button className="qr-btn secondary" onClick={handleCopy}>
              {copied ? (
                <><i className="fas fa-check-circle" style={{ color: "#22C55E" }}></i> Link Copied!</>
              ) : (
                <><i className="fas fa-copy"></i> Copy Download Link</>
              )}
            </button>
          </div>

          <button className="qr-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  );
}
