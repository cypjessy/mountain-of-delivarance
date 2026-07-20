"use client";

import { useEffect, useRef } from "react";

interface VideoJsPlayerProps {
  sourceUrl?: string;
  poster?: string;
  autoplay?: boolean;
  controls?: boolean;
  className?: string;
  onEnded?: () => void;
  onTimeUpdate?: (time: number) => void;
  seekTo?: number;
  seekVersion?: number;
}

/**
 * Native HTML5 video player wrapper for R2 videos.
 * Replaced video.js due to consistent black-screen rendering issues.
 * All features (controls, autoplay, seek, events) work natively.
 */
export default function VideoJsPlayer({
  sourceUrl,
  poster,
  autoplay = false,
  controls = true,
  className = "",
  onEnded,
  onTimeUpdate,
  seekTo,
  seekVersion,
}: VideoJsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;
  const seekToRef = useRef(seekTo);
  seekToRef.current = seekTo;

  // Register native event listeners once the video element is mounted
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const handleEnded = () => onEndedRef.current?.();
    const handleTimeUpdate = () => onTimeUpdateRef.current?.(vid.currentTime ?? 0);
    const handleError = () => {
      console.error("[VideoPlayer] Error:", vid.error?.code, vid.error?.message);
    };

    vid.addEventListener("ended", handleEnded);
    vid.addEventListener("timeupdate", handleTimeUpdate);
    vid.addEventListener("error", handleError);

    return () => {
      vid.removeEventListener("ended", handleEnded);
      vid.removeEventListener("timeupdate", handleTimeUpdate);
      vid.removeEventListener("error", handleError);
    };
  }, []);

  // Handle source changes — ensure muted before play() for Android WebView compatibility.
  // Android Chrome blocks autoplay for non-muted videos, even with
  // setMediaPlaybackRequiresUserGesture(false). Starting muted bypasses this
  // restriction. Users can unmute via the native controls.
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !sourceUrl) return;
    if (autoplay) {
      vid.muted = true;
      vid.play().catch(() => {});
    }
  }, [sourceUrl, autoplay]);

  // Seek position when seekVersion changes (e.g., after bumper interrupt)
  useEffect(() => {
    const vid = videoRef.current;
    const s = seekToRef.current;
    if (!vid || typeof s !== "number" || s <= 0) return;
    // If metadata is loaded, seek immediately; otherwise wait for it
    if (vid.readyState >= 1) {
      vid.currentTime = s;
    } else {
      const onLoaded = () => {
        vid.currentTime = s;
        vid.removeEventListener("loadedmetadata", onLoaded);
      };
      vid.addEventListener("loadedmetadata", onLoaded);
    }
  }, [seekVersion]);

  // Update poster when it changes
  useEffect(() => {
    if (videoRef.current && poster !== undefined) {
      videoRef.current.poster = poster || "";
    }
  }, [poster]);

  if (!sourceUrl) return null;

  return (
    <div className={className} style={{ width: "100%", background: "#000", position: "relative" }}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        className="video-player-native"
        src={sourceUrl}
        controls={controls}
        autoPlay={autoplay}
        muted={autoplay}
        playsInline
        preload="auto"
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
          objectFit: "contain",
        }}
      />
    </div>
  );
}
