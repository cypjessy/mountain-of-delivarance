"use client";

import { useEffect, useRef } from "react";

interface Props {
  videoId?: string;
  onEnded: () => void;
  onTimeUpdate?: (time: number) => void;
  initialSeek?: number;
  /** Override seek after player is already playing (calls seekTo, no remount). */
  seekOverride?: number;
}

let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).YT?.Player) return Promise.resolve();
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const first = document.getElementsByTagName("script")[0];
    first.parentNode!.insertBefore(tag, first);
    (window as any).onYouTubeIframeAPIReady = () => resolve();
  });

  return apiLoadPromise;
}

/**
 * YouTube embed using the IFrame Player API directly.
 * Uses loadVideoById with startSeconds for reliable initial seeking.
 * This is more reliable than seekTo() in onReady because it loads the
 * video AND seeks in one atomic operation.
 */
export default function YoutubeEmbed({
  videoId,
  onEnded,
  onTimeUpdate,
  initialSeek,
  seekOverride,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const videoIdRef = useRef(videoId);
  const onEndedRef = useRef(onEnded);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const pendingSeekRef = useRef<number | null>(null);
  const initialSeekRef = useRef(initialSeek);
  initialSeekRef.current = initialSeek;
  videoIdRef.current = videoId;

  onEndedRef.current = onEnded;
  onTimeUpdateRef.current = onTimeUpdate;

  // Only recreate player when videoId changes
  useEffect(() => {
    if (!videoId || !containerRef.current) return;

    let destroyed = false;

    const create = async () => {
      await loadYouTubeAPI();
      if (destroyed || !containerRef.current) return;

      // Destroy any previous instance
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }

      const seekSeconds = initialSeekRef.current && initialSeekRef.current > 0.1
        ? Math.floor(initialSeekRef.current) : undefined;

      // Don't pass videoId to constructor — load it in onReady with startSeconds
      // for reliable seeking (one atomic load + seek operation).
      const player = new (window as any).YT.Player(containerRef.current, {
        height: "100%",
        width: "100%",
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
        },
        events: {
          onReady: () => {
            // loadVideoById with startSeconds is the only reliable way to start
            // a YouTube video at a specific position. seekTo() in onReady does
            // NOT work because the video metadata hasn't loaded yet.
            const vid = videoIdRef.current;
            if (!vid) return;
            if (seekSeconds && seekSeconds > 0.1) {
              try {
                player.loadVideoById({ videoId: vid, startSeconds: seekSeconds });
              } catch {}
            } else {
              try {
                player.loadVideoById(vid);
              } catch {}
            }
            // Apply any pending seek that was set before the player was ready
            if (pendingSeekRef.current && pendingSeekRef.current > 0.1) {
              try {
                player.seekTo(pendingSeekRef.current, true);
              } catch {}
              pendingSeekRef.current = null;
            }
          },
          onStateChange: (event: any) => {
            const YT = (window as any).YT;
            if (event.data === YT.PlayerState.ENDED) {
              onEndedRef.current();
            }
            if (event.data === YT.PlayerState.PLAYING) {
              // Start polling for time updates
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = setInterval(() => {
                try {
                  const t = player.getCurrentTime();
                  onTimeUpdateRef.current?.(t);
                } catch {}
              }, 1000);
            }
            if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = undefined;
              }
            }
          },
        },
      });

      playerRef.current = player;
    };

    create();

    return () => {
      destroyed = true;
      pendingSeekRef.current = null;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = undefined;
      }
      // Save current position before destroying the player
      try {
        const t = playerRef.current?.getCurrentTime?.();
        if (t && t > 0.1) {
          localStorage.setItem("admin_dash_tv_seek", String(Math.floor(t)));
        }
      } catch {}
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
    };
  }, [videoId]);

  // ─── Seek override: seek on the EXISTING player (no remount) ───
  // If player isn't ready yet, store as pending for the onReady event.
  useEffect(() => {
    if (seekOverride && seekOverride > 0.1) {
      if (playerRef.current) {
        try {
          playerRef.current.seekTo(seekOverride, true);
        } catch {}
      } else {
        pendingSeekRef.current = seekOverride;
      }
    }
  }, [seekOverride]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {/* Outer wrapper prevents React/YouTube DOM conflicts.
          YT.Player replaces children of containerRef with an iframe.
          React manages the outer div, YouTube manages the inner one. */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
