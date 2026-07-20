"use client";

import { createContext, useContext, useRef, useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import PlyrPlayer from "@/components/tv/PlyrPlayer";
import type { LiveStatus } from "@/lib/youtube";

/* ─── Types ──────────────────────────────────────────────────── */

export interface TvPlayerCallbacks {
  onEnded?: () => void;
  onTimeUpdate?: (time: number) => void;
}

interface TvPlayerContextValue {
  /** Register a DOM element for the player to render into (via portal). */
  registerTarget: (el: HTMLElement | null) => void;
  /** Start/resume playing a video. */
  play: (videoId: string, seek?: number) => void;
  /** Hide the player. */
  hide: () => void;
  /** Update callbacks (onEnded, onTimeUpdate) without calling play again. */
  setCallbacks: (cbs: TvPlayerCallbacks) => void;
  /** Whether the player is currently shown. */
  visible: boolean;
  /** The current video ID. */
  currentVideoId: string | null;
  /** Current live stream status (auto-detected from Firestore). */
  liveStatus: LiveStatus | null;
  /** True when a live stream is active. */
  isLive: boolean;
}

const TvPlayerContext = createContext<TvPlayerContextValue | null>(null);

export function useTvPlayer() {
  const ctx = useContext(TvPlayerContext);
  if (!ctx) throw new Error("useTvPlayer must be used within TvPlayerProvider");
  return ctx;
}

/* ─── Provider ───────────────────────────────────────────────── */

export function TvPlayerProvider({ children }: { children: React.ReactNode }) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [seek, setSeek] = useState<number | undefined>(undefined);
  const [visible, setVisible] = useState(false);
  const callbacksRef = useRef<TvPlayerCallbacks>({});

  // ─── Live stream status (listens to tv_live_status/main globally) ───
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "tv_live_status", "main"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLiveStatus({
          isLive: data.isLive || false,
          liveVideoId: data.liveVideoId || null,
          liveTitle: data.liveTitle || null,
          startedBy: data.startedBy || null,
          startedAt: data.startedAt?.toDate?.() || null,
        } as LiveStatus);
      } else {
        setLiveStatus(null);
      }
    });
    return () => unsub();
  }, []);

  // Portal target — use ref + ready flag instead of direct state to avoid
  // callback-ref cascades (registerTarget is fully stable, never changes identity).
  const portalTargetRef = useRef<HTMLElement | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  // Synced ref so registerTarget can read videoId without depending on it
  const videoIdRef = useRef<string | null>(null);
  useEffect(() => { videoIdRef.current = videoId; }, [videoId]);

  // Guard against re-applying the same seek value
  const lastAppliedSeekRef = useRef<number | undefined>(undefined);

  // Stable — zero deps. Never changes identity, so callback refs that depend on
  // this never force React to call old-ref(null) + new-ref(el) on unrelated renders.
  const registerTarget = useCallback((el: HTMLElement | null) => {
    if (el === portalTargetRef.current && el !== null) return;
    portalTargetRef.current = el;
    setPortalReady(Boolean(el));
    if (el && videoIdRef.current && latestSeekRef.current !== undefined &&
        latestSeekRef.current !== lastAppliedSeekRef.current) {
      lastAppliedSeekRef.current = latestSeekRef.current;
      setSeek(latestSeekRef.current);
    }
  }, []);

  const [playerKey, setPlayerKey] = useState(0);
  // Track the latest seek time so it's preserved when portal target changes between pages
  const latestSeekRef = useRef<number | undefined>(undefined);

  const play = useCallback((id: string, seekTime?: number) => {
    setVideoId((prev) => {
      // If switching to a different video, force a fresh Plyr instance
      if (prev !== id) {
        setPlayerKey((k) => k + 1);
      } else if (seekTime !== undefined && latestSeekRef.current !== undefined &&
                 Math.abs(seekTime - latestSeekRef.current) > 1) {
        // Same video but seek changed significantly (>1s) — force fresh Plyr instance
        // so the new seek position is applied (e.g. after Firestore loads a saved state)
        setPlayerKey((k) => k + 1);
      }
      return id;
    });
    setSeek(seekTime);
    if (seekTime !== undefined) latestSeekRef.current = seekTime;
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
  }, []);

  const setCallbacks = useCallback((cbs: TvPlayerCallbacks) => {
    callbacksRef.current = cbs;
  }, []);

  // Get border-radius from portal target for matching styling
  const [borderRadius, setBorderRadius] = useState("0");
  useEffect(() => {
    const target = portalTargetRef.current;
    if (!target) return;
    const updateBorderRadius = () => {
      setBorderRadius(window.getComputedStyle(target).borderRadius);
    };
    updateBorderRadius();
    const observer = new ResizeObserver(updateBorderRadius);
    observer.observe(target);
    return () => observer.disconnect();
  }, [portalReady]);

  // Stable context value
  const ctxValue = useMemo<TvPlayerContextValue>(() => ({
    registerTarget, play, hide, setCallbacks, visible, currentVideoId: videoId,
    liveStatus,
    isLive: liveStatus?.isLive ?? false,
  }), [registerTarget, play, hide, setCallbacks, visible, videoId, liveStatus]);

  const currentPortalTarget = portalTargetRef.current;

  return (
    <TvPlayerContext.Provider value={ctxValue}>
      {/* Portal — renders PlyrPlayer into the page's target element (natural document flow) */}
      {visible && videoId && currentPortalTarget && createPortal(
        <div
          key={playerKey}
          style={{
            width: "100%",
            height: "100%",
            overflow: "hidden",
            borderRadius,
          }}
        >
          <PlyrPlayer
            videoId={videoId}
            initialSeek={seek}
            onEnded={() => callbacksRef.current.onEnded?.()}
            onTimeUpdate={(t) => {
              latestSeekRef.current = t;
              callbacksRef.current.onTimeUpdate?.(t);
            }}
          />
        </div>,
        currentPortalTarget
      )}
      {children}
    </TvPlayerContext.Provider>
  );
}
