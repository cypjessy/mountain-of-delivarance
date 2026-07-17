"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import type { ReactNode } from "react";

interface PremiumTopBarProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightContent?: ReactNode;
  minimal?: boolean;
  icon?: string;
  hideIcon?: boolean;
  noBorder?: boolean;
}

export default function PremiumTopBar({
  title,
  subtitle,
  showBack,
  onBack,
  rightContent,
  minimal,
  icon,
  hideIcon,
  noBorder,
}: PremiumTopBarProps) {
  const router = useRouter();
  const handleBack = onBack || (() => router.back());
  const [safeTop, setSafeTop] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const { StatusBar } = await import("@capacitor/status-bar");
        const info = await StatusBar.getInfo();
        setSafeTop(info.height || 0);
      } catch {
        setSafeTop(0);
      }
    })();
  }, []);

  return (
    <>
      <style>{`
        .ptb-wrapper {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          z-index: 100;
          position: relative;
        }
        .ptb-safe {
          height: ${safeTop}px;
          flex-shrink: 0;
        }
        .ptb-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 16px;
          min-height: ${minimal ? "0" : "44px"};
          background: var(--bg, #0F0F0F);
          ${
            noBorder
              ? ""
              : "border-bottom: 1px solid var(--border, #2A2A2A);"
          }
          position: relative;
        }
        ${
          minimal
            ? ""
            : `
        .ptb-logo {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          flex-shrink: 0;
          background: linear-gradient(135deg, var(--gradient-start, #E8A838), var(--gradient-end, #D4762A));
          box-shadow: 0 2px 12px rgba(232,168,56,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ptb-logo i {
          font-size: 14px;
          color: #fff;
        }
        .ptb-info {
          flex: 1;
          min-width: 0;
        }
        .ptb-title {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.3px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--text-primary, #fff);
        }
        .ptb-sub {
          font-size: 11px;
          color: var(--text-tertiary, #6B6B6B);
          font-weight: 500;
          margin-top: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ptb-back {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          flex-shrink: 0;
          background: var(--surface, #1A1A1A);
          border: 1px solid var(--border, #2A2A2A);
          color: var(--text-primary, #fff);
          font-size: 15px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .ptb-back:active {
          background: var(--surface-elevated, #242424);
          transform: scale(0.92);
        }
        .ptb-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        `
        }
      `}</style>
      <div className="ptb-wrapper">
        <div className="ptb-safe" />
        {!minimal && (
          <div className="ptb-bar">
            {showBack && (
              <button className="ptb-back" onClick={handleBack}>
                <i className="fas fa-chevron-left" />
              </button>
            )}
            {!hideIcon && (
              <div className="ptb-logo">
                <i className={`fas ${icon || "fa-cross"}`} />
              </div>
            )}
            <div className="ptb-info">
              <div className="ptb-title">
                {title || "MOD NAKURU"}
              </div>
              {subtitle && <div className="ptb-sub">{subtitle}</div>}
            </div>
            {rightContent && <div className="ptb-actions">{rightContent}</div>}
          </div>
        )}
      </div>
    </>
  );
}
