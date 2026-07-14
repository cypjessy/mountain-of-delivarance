"use client";

import { createContext, useContext, useRef, useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import PlyrPlayer from "@/components/tv/PlyrPlayer";

/* ─── Types ──────────────────────────────────────────────────── */

export interface AdminTvPlayerCallbacks {
  onEnded?: () => void;
  onTimeUpdate?: (time: number) => void;
}

export interface AdminBumperConfig {
  r2VideoUrl: string;
  r2VideoTitle: string;
}

interface AdminTvPlayerContextValue {
  registerTarget: (el: HTMLElement | null) => void;
  play: (videoId: string, seek?: number) => void;
  playR2: (sourceUrl: string, seek?: number) => void;
  hide: () => void;
  setCallbacks: (cbs: AdminTvPlayerCallbacks) => void;
  visible: boolean;
  currentVideoId: string | null;
  currentR2Url: string | null;
  bumperConfig: AdminBumperConfig | null;
  isBumperPlaying: boolean;
  triggerBumper: () => void;
}

const AdminTvPlayerContext = createContext<AdminTvPlayerContextValue | null>(null);

export function useAdminTvPlayer() {
  const ctx = useContext(AdminTvPlayerContext);
  if (!ctx) throw new Error("useAdminTvPlayer must be used within AdminTvPlayerProvider");
  return ctx;
}

/* ─── Provider ───────────────────────────────────────────────── */

export function AdminTvPlayerProvider({ children }: { children: React.ReactNode }) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [r2Url, setR2Url] = useState<string | null>(null);
  const [seek, setSeek] = useState<number | undefined>(undefined);
  const [visible, setVisible] = useState(false);
  const callbacksRef = useRef<AdminTvPlayerCallbacks>({});

  // ─── Bumper state ───
  const [bumperConfig, setBumperConfig] = useState<AdminBumperConfig | null>(null);
  const [isBumperPlaying, setIsBumperPlaying] = useState(false);
  const resumeVideoRef = useRef<{ mode: 'youtube' | 'r2'; videoId?: string; r2Url?: string; seek: number } | null>(null);
  const playbackSecondsRef = useRef(0);
  const lastTimeUpdateRef = useRef(0);
  const BUMPER_INTERVAL = 15 * 60;

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

  // Portal target
  const portalTargetRef = useRef<HTMLElement | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  const videoIdRef = useRef<string | null>(null);
  const r2UrlRef = useRef<string | null>(null);
  useEffect(() => { videoIdRef.current = videoId; }, [videoId]);
  useEffect(() => { r2UrlRef.current = r2Url; }, [r2Url]);

  const registerTarget = useCallback((el: HTMLElement | null) => {
    if (el === portalTargetRef.current && el !== null) return;
    portalTargetRef.current = el;
    setPortalReady(Boolean(el));
  }, []);

  const [playerKey, setPlayerKey] = useState(0);
  const latestSeekRef = useRef<number | undefined>(undefined);

  const play = useCallback((id: string, seekTime?: number) => {
    if (isBumperPlaying) {
      setIsBumperPlaying(false);
      resumeVideoRef.current = null;
    }
    setR2Url(null);
    r2UrlRef.current = null;
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
    if (isBumperPlaying) {
      setIsBumperPlaying(false);
      resumeVideoRef.current = null;
    }
    setVideoId(null);
    videoIdRef.current = null;
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

  const setCallbacks = useCallback((cbs: AdminTvPlayerCallbacks) => {
    callbacksRef.current = cbs;
  }, []);

  const triggerBumper = useCallback(() => {
    if (!bumperConfig) return;
    if (isBumperPlaying) return;
    const currentSeek = latestSeekRef.current;
    if (typeof currentSeek !== "number") return;
    const currentId = videoIdRef.current;
    const currentR2 = r2UrlRef.current;
    if (currentId) {
      resumeVideoRef.current = { mode: 'youtube', videoId: currentId, seek: currentSeek };
    } else if (currentR2) {
      resumeVideoRef.current = { mode: 'r2', r2Url: currentR2, seek: currentSeek };
    }
    playbackSecondsRef.current = 0;
    lastTimeUpdateRef.current = 0;
    setIsBumperPlaying(true);
  }, [bumperConfig, isBumperPlaying]);

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

  // Border-radius sync
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

  const ctxValue = useMemo<AdminTvPlayerContextValue>(() => ({
    registerTarget, play, playR2, hide, setCallbacks, visible,
    currentVideoId: videoId,
    currentR2Url: r2Url,
    bumperConfig,
    isBumperPlaying,
    triggerBumper,
  }), [registerTarget, play, playR2, hide, setCallbacks, visible,
      videoId, r2Url, bumperConfig, isBumperPlaying, triggerBumper]);

  const currentPortalTarget = portalTargetRef.current;

  return (
    <AdminTvPlayerContext.Provider value={ctxValue}>
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
    </AdminTvPlayerContext.Provider>
  );
}
