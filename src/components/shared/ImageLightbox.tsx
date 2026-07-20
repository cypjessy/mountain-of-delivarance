"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ========== TYPES ==========

export interface LightboxImage {
  url: string;
  title: string;
  description?: string;
  date?: string;
  category?: string;
}

export interface ImageLightboxAPI {
  /** The lightbox JSX — render at the end of your component tree */
  ImageLightbox: React.ReactNode;
  /** Open the lightbox with a set of images */
  open: (images: LightboxImage[], index?: number) => void;
  /** Close the lightbox */
  close: () => void;
}

// ========== HOOK ==========

export function useImageLightbox(): ImageLightboxAPI {
  const [isOpen, setIsOpen] = useState(false);
  const [images, setImages] = useState<LightboxImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // Track body overflow count so nested lightboxes don't double-unlock scrolling
  const overflowCountRef = useRef(0);

  const lockScroll = useCallback(() => {
    overflowCountRef.current += 1;
    document.body.style.overflow = "hidden";
  }, []);

  const unlockScroll = useCallback(() => {
    overflowCountRef.current = Math.max(0, overflowCountRef.current - 1);
    if (overflowCountRef.current === 0) {
      document.body.style.overflow = "";
    }
  }, []);

  const open = useCallback((imgs: LightboxImage[], index = 0) => {
    setImages(imgs);
    setCurrentIndex(index);
    setZoomed(false);
    setIsOpen(true);
    lockScroll();
  }, [lockScroll]);

  const close = useCallback(() => {
    setIsOpen(false);
    setZoomed(false);
    unlockScroll();
  }, [unlockScroll]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % images.length);
    setZoomed(false);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + images.length) % images.length);
    setZoomed(false);
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close, goNext, goPrev]);

  // Cleanup overflow on unmount — only if still locked
  useEffect(() => () => { unlockScroll(); }, [unlockScroll]);

  const current = images[currentIndex] || null;

  const ImageLightbox = isOpen && images.length > 0 ? (
    <>
      <style>{`
        .il-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.96); z-index: 10000;
          display: flex; flex-direction: column; user-select: none;
          -webkit-user-select: none;
        }
        .il-top {
          position: absolute; top: 0; left: 0; right: 0; z-index: 2;
          display: flex; align-items: center; justify-content: space-between;
          padding: env(safe-area-inset-top, 12px) 16px 12px;
          background: linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%);
        }
        .il-top-left { display: flex; align-items: center; gap: 10px; }
        .il-counter {
          font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.9);
          background: rgba(255,255,255,0.1); padding: 4px 12px; border-radius: 20px;
        }
        .il-close {
          width: 36px; height: 36px; border-radius: 50%;
          background: rgba(255,255,255,0.08); border: none; color: #fff;
          font-size: 18px; cursor: pointer; display: flex;
          align-items: center; justify-content: center;
        }
        .il-close:active { background: rgba(255,255,255,0.2); transform: scale(0.92); }
        .il-actions { display: flex; align-items: center; gap: 8px; }
        .il-action-btn {
          width: 36px; height: 36px; border-radius: 50%;
          background: rgba(255,255,255,0.08); border: none; color: #fff;
          font-size: 15px; cursor: pointer; display: flex;
          align-items: center; justify-content: center;
        }
        .il-action-btn:active { background: rgba(255,255,255,0.2); transform: scale(0.92); }
        .il-stage {
          flex: 1; display: flex; align-items: center; justify-content: center;
          position: relative; overflow: hidden;
        }
        .il-img {
          max-width: 100%; max-height: 100%; object-fit: contain;
          transition: transform 0.25s ease; cursor: pointer; will-change: transform;
        }
        .il-img.zoomed { transform: scale(2); }
        .il-nav {
          position: absolute; top: 50%; transform: translateY(-50%);
          width: 44px; height: 44px; border-radius: 50%;
          background: rgba(255,255,255,0.08); border: none; color: #fff;
          font-size: 18px; cursor: pointer; display: flex;
          align-items: center; justify-content: center; z-index: 3;
        }
        .il-nav:active { background: rgba(255,255,255,0.2); transform: translateY(-50%) scale(0.9); }
        .il-nav.prev { left: 12px; }
        .il-nav.next { right: 12px; }
        .il-bottom {
          padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
          background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%);
        }
        .il-title {
          font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.9);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .il-meta {
          font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 2px;
        }
        .il-desc {
          font-size: 13px; color: rgba(255,255,255,0.6);
          line-height: 1.5; margin-top: 6px;
        }
      `}</style>

      <div className="il-overlay">
        {/* Top bar */}
        <div className="il-top">
          <div className="il-top-left">
            <button className="il-close" onClick={close}><i className="fas fa-xmark"></i></button>
            <span className="il-counter">{currentIndex + 1} / {images.length}</span>
          </div>
          <div className="il-actions">
            <button className="il-action-btn" onClick={async () => {
              if (!current) return;
              try {
                const { Share } = await import("@capacitor/share");
                await Share.share({ title: current.title, url: current.url });
              } catch {
                if (navigator.share) {
                  try { await navigator.share({ title: current.title, url: current.url }); return; } catch {}
                }
                try {
                  await navigator.clipboard.writeText(current.url);
                  window.dispatchEvent(new CustomEvent("show-toast", {
                    detail: { title: "Copied", message: "Image URL copied to clipboard!", type: "success", duration: 2000 },
                  }));
                } catch {}
              }
            }}>
              <i className="fas fa-share-nodes"></i>
            </button>
            <button className="il-action-btn" onClick={async () => {
              if (!current) return;
              try {
                const { Browser } = await import("@capacitor/browser");
                await Browser.open({ url: current.url });
              } catch {
                window.open(current.url, "_blank");
              }
            }}>
              <i className="fas fa-download"></i>
            </button>
          </div>
        </div>

        {/* Image stage */}
        <div className="il-stage"
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            const diffX = touchStartX.current - e.changedTouches[0].clientX;
            const diffY = touchStartY.current - e.changedTouches[0].clientY;
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 60) {
              if (diffX > 0) goNext();
              else goPrev();
            } else if (diffY > 100) {
              close();
            }
          }}
          onClick={(e) => { if (e.target === e.currentTarget && zoomed) setZoomed(false); }}
        >
          {images.length > 1 && (
            <>
              <button className="il-nav prev" onClick={(e) => { e.stopPropagation(); goPrev(); }}>
                <i className="fas fa-chevron-left"></i>
              </button>
              <button className="il-nav next" onClick={(e) => { e.stopPropagation(); goNext(); }}>
                <i className="fas fa-chevron-right"></i>
              </button>
            </>
          )}
          {current && (
            <img
              className={`il-img${zoomed ? " zoomed" : ""}`}
              src={current.url}
              alt={current.title}
              onClick={() => setZoomed(!zoomed)}
            />
          )}
        </div>

        {/* Bottom info */}
        <div className="il-bottom">
          {current && (
            <>
              <div className="il-title">{current.title}</div>
              <div className="il-meta">
                {current.date && <span>{current.date}</span>}
                {current.category && <span>{current.date ? " · " : ""}{current.category}</span>}
              </div>
              {current.description && <div className="il-desc">{current.description}</div>}
            </>
          )}
        </div>
      </div>
    </>
  ) : null;

  return { ImageLightbox, open, close };
}
