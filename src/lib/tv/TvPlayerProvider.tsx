"use client";

import { createContext, useContext, useRef, useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import PlyrPlayer from "@/components/tv/PlyrPlayer";
import type { LiveStatus } from "@/lib/youtube";

/* ─── Types ──────────────────────────────────────────────────── */

export interface TvPlayerCallbacks {
  onEnded?: () => void;
  onTimeUpdate?: (time: number) => void;
}

export interface BumperConfig {
  r2VideoUrl: string;
  r2VideoTitle: string;
}

interface ResumeState {
  mode: 'youtube' | 'r2';
  videoId?: string;
  r2Url?: string;
  seek: number;
}

interface TvPlayerContextValue {
  /** Register a DOM element for the player to render into (via portal). */
  registerTarget: (el: HTMLElement | null) => void;
  /** Start/resume playing a YouTube video. */
  play: (videoId: string, seek?: number) => void;
  /** Start/resume playing an R2 (HTML5) video by URL. */
  playR2: (sourceUrl: string, seek?: number) => void;
  /** Hide the player. */
  hide: () => void;
  /** Update callbacks (onEnded, onTimeUpdate) without calling play again. */
  setCallbacks: (cbs: TvPlayerCallbacks) => void;
  /** Whether the player is currently shown. */
  visible: boolean;
  /** The current YouTube video ID (null if playing R2 video). */
  currentVideoId: string | null;
  /** The current R2 video URL (null if playing YouTube). */
  currentR2Url: string | null;
  /** Current live stream status (auto-detected from Firestore). */
  liveStatus: LiveStatus | null;
  /** True when a live stream is active. */
  isLive: boolean;
  // ─── Bumper animation ───
  /** The bumper config (null = no bumper set). */
  bumperConfig: BumperConfig | null;
  /** Whether the bumper is currently playing. */
  isBumperPlaying: boolean;
  /** Manually trigger the bumper (interrupts current video). */
  triggerBumper: () => void;
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
  const [r2Url, setR2Url] = useState<string | null>(null);
  const [seek, setSeek] = useState<number | undefined>(undefined);
  const [visible, setVisible] = useState(false);
  const callbacksRef = useRef<TvPlayerCallbacks>({});

  // ─── Bumper state ───
  const [bumperConfig, setBumperConfig] = useState<BumperConfig | null>(null);
  const [isBumperPlaying, setIsBumperPlaying] = useState(false);
  // When bumper triggers, we save the video to resume
  const resumeVideoRef = useRef<ResumeState | null>(null);
  // Track cumulative playback time for 15-min bumper interrupt
  const playbackSecondsRef = useRef(0);
  const lastTimeUpdateRef = useRef(0);
  const BUMPER_INTERVAL = 15 * 60; // 15 minutes in seconds
  // Load bumper config from Firestore on mount
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "tv_config", "bumper"));
        if (snap.exists()) {
          const data = snap.data() as { r2VideoUrl: string; r2VideoTitle: string };
          setBumperConfig({ r2VideoUrl: data.r2VideoUrl, r2VideoTitle: data.r2VideoTitle });
        }
      } catch {}
    })();
  }, []);

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

  // Synced refs for resume state
  const videoIdRef = useRef<string | null>(null);
  const r2UrlRef = useRef<string | null>(null);
  useEffect(() => { videoIdRef.current = videoId; }, [videoId]);
  useEffect(() => { r2UrlRef.current = r2Url; }, [r2Url]);

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
    // Exit bumper mode if active
    if (isBumperPlaying) {
      setIsBumperPlaying(false);
      resumeVideoRef.current = null;
    }
    // Clear R2 mode
    setR2Url(null);
    r2UrlRef.current = null;
    // Reset playback timer when starting a new video
    playbackSecondsRef.current = 0;
    lastTimeUpdateRef.current = 0;
    setVideoId((prev) => {
      if (prev !== id) setPlayerKey((k) => k + 1);
      return id;
    });
    setSeek(seekTime);
    if (seekTime !== undefined) latestSeekRef.current = seekTime;
    setVisible(true);
  }, [isBumperPlaying]);

  const playR2 = useCallback((sourceUrl: string, seekTime?: number) => {
    // Exit bumper mode if active
    if (isBumperPlaying) {
      setIsBumperPlaying(false);
      resumeVideoRef.current = null;
    }
    // Clear YouTube mode
    setVideoId(null);
    videoIdRef.current = null;
    // Reset playback timer
    playbackSecondsRef.current = 0;
    lastTimeUpdateRef.current = 0;
    setR2Url((prev) => {
      if (prev !== sourceUrl) setPlayerKey((k) => k + 1);
      return sourceUrl;
    });
    setSeek(seekTime);
    if (seekTime !== undefined) latestSeekRef.current = seekTime;
    setVisible(true);
  }, [isBumperPlaying]);

  const hide = useCallback(() => {
    setVisible(false);
    setIsBumperPlaying(false);
    resumeVideoRef.current = null;
    playbackSecondsRef.current = 0;
    lastTimeUpdateRef.current = 0;
  }, []);

  const setCallbacks = useCallback((cbs: TvPlayerCallbacks) => {
    callbacksRef.current = cbs;
  }, []);

  // ─── Bumper trigger ───
  const triggerBumper = useCallback(() => {
    if (!bumperConfig) return;
    if (isBumperPlaying) return;
    // Save current state before switching to bumper
    const currentSeek = latestSeekRef.current;
    if (typeof currentSeek !== "number") return;
    const currentId = videoIdRef.current;
    const currentR2 = r2UrlRef.current;
    if (currentId) {
      resumeVideoRef.current = {
        mode: 'youtube',
        videoId: currentId,
        seek: currentSeek,
      };
    } else if (currentR2) {
      resumeVideoRef.current = {
        mode: 'r2',
        r2Url: currentR2,
        seek: currentSeek,
      };
    }
    playbackSecondsRef.current = 0;
    lastTimeUpdateRef.current = 0;
    setIsBumperPlaying(true);
  }, [bumperConfig, isBumperPlaying]);

  // ─── Bumper ended — restore main video ───
  const handleBumperEnded = useCallback(() => {
    setIsBumperPlaying(false);
    const resume = resumeVideoRef.current;
    resumeVideoRef.current = null;
    if (!resume) return;
    setPlayerKey((k) => k + 1);
    setSeek(resume.seek);
    latestSeekRef.current = resume.seek;
    if (resume.mode === 'youtube') {
      setR2Url(null);
      setVideoId(resume.videoId || null);
    } else {
      setVideoId(null);
      setR2Url(resume.r2Url || null);
    }
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
    registerTarget, play, playR2, hide, setCallbacks, visible,
    currentVideoId: videoId,
    currentR2Url: r2Url,
    liveStatus,
    isLive: liveStatus?.isLive ?? false,
    bumperConfig,
    isBumperPlaying,
    triggerBumper,
  }), [registerTarget, play, playR2, hide, setCallbacks, visible,
      videoId, r2Url, liveStatus,
      bumperConfig, isBumperPlaying, triggerBumper]);

  const currentPortalTarget = portalTargetRef.current;

  return (
    <TvPlayerContext.Provider value={ctxValue}>
      {/* Portal — renders PlyrPlayer into the page's target element */}
      {visible && currentPortalTarget && createPortal(
        <div
          key={playerKey + (isBumperPlaying ? "-bumper" : "")}
          style={{
            width: "100%",
            height: "100%",
            overflow: "hidden",
            borderRadius,
          }}
        >
          {isBumperPlaying && bumperConfig ? (
            <PlyrPlayer
              sourceUrl={bumperConfig.r2VideoUrl}
              provider="html5"
              onEnded={handleBumperEnded}
              onTimeUpdate={() => {}}
            />
          ) : r2Url ? (
            <PlyrPlayer
              sourceUrl={r2Url}
              provider="html5"
              initialSeek={seek}
              onEnded={() => {
                playbackSecondsRef.current = 0;
                lastTimeUpdateRef.current = 0;
                callbacksRef.current.onEnded?.();
              }}
              onTimeUpdate={(t) => {
                latestSeekRef.current = t;
                if (lastTimeUpdateRef.current > 0 && t > lastTimeUpdateRef.current) {
                  const delta = t - lastTimeUpdateRef.current;
                  playbackSecondsRef.current += delta;
                  if (bumperConfig && playbackSecondsRef.current >= BUMPER_INTERVAL) {
                    setTimeout(() => triggerBumper(), 0);
                  }
                }
                lastTimeUpdateRef.current = t;
                callbacksRef.current.onTimeUpdate?.(t);
              }}
            />
          ) : videoId ? (
            <PlyrPlayer
              videoId={videoId}
              initialSeek={seek}
              onEnded={() => {
                playbackSecondsRef.current = 0;
                lastTimeUpdateRef.current = 0;
                callbacksRef.current.onEnded?.();
              }}
              onTimeUpdate={(t) => {
                latestSeekRef.current = t;
                if (lastTimeUpdateRef.current > 0 && t > lastTimeUpdateRef.current) {
                  const delta = t - lastTimeUpdateRef.current;
                  playbackSecondsRef.current += delta;
                  if (bumperConfig && playbackSecondsRef.current >= BUMPER_INTERVAL) {
                    setTimeout(() => triggerBumper(), 0);
                  }
                }
                lastTimeUpdateRef.current = t;
                callbacksRef.current.onTimeUpdate?.(t);
              }}
            />
          ) : null}
        </div>,
        currentPortalTarget
      )}
      {children}
    </TvPlayerContext.Provider>
  );
}
