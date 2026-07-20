"use client";

import { useState } from "react";

interface AppUpdate {
  versionName: string;
  downloadUrl: string;
  sentAt: any;
}

interface Props {
  update: AppUpdate;
  onDismiss: () => void;
}

export default function AppUpdateBubble({ update, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="aub-root">
      {/* ── Collapsed bubble ── */}
      {!expanded && (
        <button className="aub-fab" onClick={() => setExpanded(true)} aria-label="App update available">
          <i className="fas fa-download aub-fab-icon" />
          <span className="aub-fab-pulse" />
        </button>
      )}

      {/* ── Expanded card ── */}
      {expanded && (
        <div className="aub-card">
          <button className="aub-close" onClick={onDismiss} aria-label="Dismiss">
            <i className="fas fa-times" />
          </button>

          <div className="aub-body">
            <div className="aub-icon-wrap">
              <i className="fas fa-arrow-circle-down aub-card-icon" />
            </div>
            <div className="aub-content">
              <div className="aub-title">App Update Available</div>
              <div className="aub-sub">
                {update.versionName ? `Version ${update.versionName}` : "Tap to download the latest version"}
              </div>
              <a
                href={update.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="aub-download-btn"
                onClick={onDismiss}
              >
                <i className="fas fa-download" />
                Download
              </a>
            </div>
          </div>

          <div className="aub-dismiss-text" onClick={onDismiss}>
            Dismiss
          </div>
        </div>
      )}

      {/* ── Styles ── */}
      <style>{`
        .aub-root {
          position: fixed;
          z-index: 9999;
          bottom: calc(80px + env(safe-area-inset-bottom, 0px));
          right: 16px;
          pointer-events: none;
        }
        .aub-root > * {
          pointer-events: auto;
        }

        /* Collapsed FAB */
        .aub-fab {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: linear-gradient(135deg, #E8A838, #D4762A);
          border: none;
          cursor: pointer;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px rgba(232, 168, 56, 0.4);
          animation: aub-fadeIn 0.3s ease;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .aub-fab:active {
          transform: scale(0.9);
          box-shadow: 0 2px 12px rgba(232, 168, 56, 0.3);
        }
        .aub-fab-icon {
          font-size: 20px;
          color: #fff;
          position: relative;
          z-index: 2;
          animation: aub-bounce 2s ease-in-out infinite;
        }
        .aub-fab-pulse {
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 2px solid rgba(232, 168, 56, 0.4);
          animation: aub-pulse 2s ease-out infinite;
        }
        @keyframes aub-pulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes aub-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes aub-fadeIn {
          from { opacity: 0; transform: scale(0.6) translateY(12px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        /* Expanded Card */
        .aub-card {
          width: 280px;
          background: rgba(26, 26, 26, 0.92);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(232, 168, 56, 0.25);
          border-radius: 20px;
          padding: 16px;
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(232, 168, 56, 0.1);
          animation: aub-cardIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          overflow: hidden;
        }
        .aub-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, #E8A838, #D4762A, #E8A838);
          background-size: 200% 100%;
          animation: aub-shimmer 3s ease-in-out infinite;
        }
        @keyframes aub-shimmer {
          0%, 100% { background-position: 0% 0%; }
          50% { background-position: 100% 0%; }
        }
        @keyframes aub-cardIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.92);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .aub-close {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.06);
          border: none;
          color: rgba(255, 255, 255, 0.4);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          transition: all 0.2s ease;
        }
        .aub-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .aub-body {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .aub-icon-wrap {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(232, 168, 56, 0.2), rgba(212, 118, 42, 0.2));
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .aub-card-icon {
          font-size: 18px;
          color: #E8A838;
        }
        .aub-content {
          flex: 1;
          min-width: 0;
        }
        .aub-title {
          font-size: 14px;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.2px;
        }
        .aub-sub {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 2px;
          line-height: 1.4;
        }
        .aub-download-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 10px;
          padding: 8px 18px;
          border-radius: 10px;
          background: linear-gradient(135deg, #E8A838, #D4762A);
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          border: none;
          cursor: pointer;
        }
        .aub-download-btn:active {
          transform: scale(0.95);
          box-shadow: 0 2px 12px rgba(232, 168, 56, 0.3);
        }
        .aub-download-btn i {
          font-size: 13px;
        }

        .aub-dismiss-text {
          text-align: center;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.25);
          margin-top: 10px;
          cursor: pointer;
          transition: color 0.2s ease;
          padding: 4px;
        }
        .aub-dismiss-text:hover {
          color: rgba(255, 255, 255, 0.5);
        }

        /* Responsive: on very small screens, shrink card width */
        @media (max-width: 360px) {
          .aub-card { width: 240px; padding: 14px; }
        }
      `}</style>
    </div>
  );
}
