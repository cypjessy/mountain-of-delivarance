"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import ToastBridge from "@/components/dashboard/ToastBridge";
import ReactionsOverlay from "@/components/meetings/ReactionsOverlay";
import { useAppStore } from "@/lib/useAppStore";
import PremiumTopBar from "@/components/shared/PremiumTopBar";
import { getMeeting, generateLiveKitToken, getAgenda } from "@/lib/meetings";
import type { Meeting, AgendaItem } from "@/lib/meetings";
import { Room, RoomEvent, Track } from "livekit-client";

export default function MemberListenPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const meetingId = searchParams?.get("id") || "";
  const userDoc = useAppStore((s) => s.userDoc);
  const user = useAppStore((s) => s.user);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<string[]>([]);
  const [speakingParticipants, setSpeakingParticipants] = useState<Set<string>>(new Set());
  const [isMuted, setIsMuted] = useState(true);
  const [adminMuted, setAdminMuted] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [remoteHandRaised, setRemoteHandRaised] = useState<Set<string>>(new Set());
  const [speakingTimer, setSpeakingTimer] = useState<{ remaining: number; limit: number } | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [autoAgenda, setAutoAgenda] = useState<{ meetingTitle: string; items: AgendaItem[] } | null>(null);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const autoAgendaShownRef = useRef(false);
  const roomRef = useRef<Room | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speakingTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMutedRef = useRef(true);
  const handRaisedRef = useRef(false);
  const localTrackSidRef = useRef<string | null>(null);

  const displayName = userDoc?.display_name || user?.displayName || user?.email?.split("@")[0] || "You";
  const identity = user?.uid || `member-${Date.now()}`;

  useEffect(() => {
    setIsDesktop(window.matchMedia('(pointer: fine)').matches);
  }, []);

  function showToast(title: string, message: string, type: string, duration: number) {
    window.dispatchEvent(new CustomEvent("show-toast", { detail: { title, message, type, duration } }));
  }

  // Load meeting and auto-connect
  useEffect(() => {
    if (!meetingId) return;
    getMeeting(meetingId)
      .then((m) => {
        if (m) {
          setMeeting(m);
          if (m.status !== "ended") {
            connectToRoom(m);
          } else {
            showToast("Ended", "This meeting has ended", "info", 3000);
            setLoading(false);
          }
        } else {
          showToast("Error", "Meeting not found", "error", 3000);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error("Failed to load meeting:", e);
        showToast("Error", "Could not load meeting", "error", 3000);
        setLoading(false);
      });
  }, [meetingId]);

  const connectToRoom = async (m: Meeting) => {
    if (!m.roomName || connecting) return;
    setConnecting(true);
    try {
      const { token, url } = await generateLiveKitToken(m.roomName, identity);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      room.on(RoomEvent.ParticipantConnected, (p) => {
        setParticipants((prev) => [...prev.filter((n) => n !== p.identity), p.identity]);
      });

      room.on(RoomEvent.ParticipantDisconnected, (p) => {
        setParticipants((prev) => prev.filter((n) => n !== p.identity));
        setRemoteHandRaised((prev) => {
          const n = new Set(prev);
          n.delete(p.identity);
          return n;
        });
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const speakingNames = new Set<string>();
        for (const s of speakers) {
          if (s.identity !== identity) {
            speakingNames.add(s.identity);
          }
        }
        setSpeakingParticipants(speakingNames);
      });

      room.on(RoomEvent.Reconnecting, () => {
        // Abort reconnection — room is likely ended by host
        if (roomRef.current) {
          roomRef.current.disconnect();
        }
      });

      // CRITICAL: Attach remote audio tracks to <audio> elements so sound plays
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const audioEl = track.attach();
          audioEl.style.display = 'none';
          document.body.appendChild(audioEl);
        }
      });

      // Detect admin mute — when our local audio track is unpublished unexpectedly
      room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.kind === Track.Kind.Audio && !isMutedRef.current) {
          // User was unmuted, so this was triggered by admin revoking canPublish
          setAdminMuted(true);
          setIsMuted(true);
          isMutedRef.current = true;
          showToast("Muted", "Host closed your microphone", "info", 3000);
        }
      });

      // Detect admin unmute — when publish permission is restored
      room.on(RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.kind === Track.Kind.Audio) {
          setAdminMuted(false);
        }
      });

      // Listen for metadata changes (hand raise, admin approval, etc.)
      room.on(RoomEvent.ParticipantMetadataChanged, (raw, p) => {
        const data = raw ? JSON.parse(raw) : {};
        if (p.identity === identity) {
          // Our own metadata changed — admin cleared handRaised (approved/dismissed)
          if (!data.handRaised && handRaisedRef.current) {
            setHandRaised(false);
            handRaisedRef.current = false;
            showToast("Request Accepted", "Tap the PTT button to speak", "success", 4000);
          }
        } else {
          // Remote participant's hand-raise status changed
          if (data.handRaised) {
            setRemoteHandRaised((prev) => new Set(prev).add(p.identity));
          } else {
            setRemoteHandRaised((prev) => {
              const n = new Set(prev);
              n.delete(p.identity);
              return n;
            });
          }
        }
      });

      room.on(RoomEvent.Disconnected, async () => {
        setConnected(false);
        setParticipants([]);
        setSpeakingParticipants(new Set());
        setAdminMuted(false);
        setHandRaised(false);
        handRaisedRef.current = false;
        setRemoteHandRaised(new Set());
        setSpeakingTimer(null);
        if (speakingTimerIntervalRef.current) clearInterval(speakingTimerIntervalRef.current);
        speakingTimerIntervalRef.current = null;
        roomRef.current = null;
        localTrackSidRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
        // Re-check meeting status from Firestore
        try {
          const freshMeeting = await getMeeting(meetingId);
          if (freshMeeting) setMeeting(freshMeeting);
        } catch {
          // ignore
        }
      });

      await room.connect(url, token);

      // Best-effort muted track creation — primes permission system on Android.
      // If blocked, user can tap mic button later.
      room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
      // Initialize metadata for hand-raise state
      room.localParticipant.setMetadata(JSON.stringify({})).catch(() => {});

      // Audio is not enabled yet — user must tap "Start Listening" button.
      // This ensures startAudio() is called with a proper user gesture.

      // Join listen-only — don't create any mic track yet
      roomRef.current = room;
      setConnected(true);
      setConnecting(false);
      setLoading(false);
      setElapsed(0);

      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      }, 1000);

      const remoteNames = Array.from(room.remoteParticipants.values()).map((p) => p.identity);
      setParticipants(remoteNames);

      // Scan initial participant metadata for hand raises
      for (const [, p] of room.remoteParticipants) {
        if (p.metadata) {
          try {
            const data = JSON.parse(p.metadata);
            if (data.handRaised) {
              setRemoteHandRaised((prev) => new Set(prev).add(p.identity));
            }
          } catch {}
        }
      }

      showToast("Connected", `You joined "${m.title}"`, "success", 3000);
    } catch (e) {
      console.error("Failed to connect:", e);
      showToast("Connection Failed", e instanceof Error ? e.message : "Could not connect", "error", 4000);
      setConnecting(false);
      setLoading(false);
    }
  };

  const leaveMeeting = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    router.push("/meetings");
  };

  const handleStartListening = () => {
    const room = roomRef.current;
    if (!room) return;
    // Enable audio output (resume AudioContext with user gesture)
    room.startAudio().catch(() => {});
    setAudioEnabled(true);
    showToast("Listening", "You can now hear the meeting", "success", 2500);
  };

  const pttLockRef = useRef(false);

  const handlePTTDown = async () => {
    if (pttLockRef.current) return;
    pttLockRef.current = true;
    const room = roomRef.current;
    if (!room) { pttLockRef.current = false; return; }
    try {
      if (adminMuted) {
        // Admin may have unmuted us — try to publish
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          setAdminMuted(false);
          setIsMuted(false);
          isMutedRef.current = false;
        } catch {
          showToast("Muted", "Host has your microphone closed", "info", 3000);
        }
      } else {
        await room.localParticipant.setMicrophoneEnabled(true);
        isMutedRef.current = false;
        setIsMuted(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not access microphone";
      console.error("PTT down failed:", e);
      showToast("Mic Error", msg, "error", 4000);
    } finally {
      pttLockRef.current = false;
    }
  };

  const handlePTTUp = async () => {
    pttLockRef.current = true;
    const room = roomRef.current;
    if (!room) { pttLockRef.current = false; return; }
    isMutedRef.current = true;
    setIsMuted(true);
    try {
      await room.localParticipant.setMicrophoneEnabled(false);
    } catch {
      // Track may already be unpublished (admin mute)
    } finally {
      pttLockRef.current = false;
    }
  };

  // Stable refs for keyboard shortcut (avoids stale closures in effects)
  const pttDownRef = useRef(handlePTTDown);
  const pttUpRef = useRef(handlePTTUp);
  useEffect(() => { pttDownRef.current = handlePTTDown; });
  useEffect(() => { pttUpRef.current = handlePTTUp; });

  const toggleHandRaise = async () => {
    const room = roomRef.current;
    if (!room) return;
    const newState = !handRaisedRef.current;
    handRaisedRef.current = newState;
    setHandRaised(newState);
    room.localParticipant.setMetadata(JSON.stringify({ handRaised: newState })).catch(() => {});
  };

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // Auto-show agenda when connected to a live meeting (first time only)
  useEffect(() => {
    if (connected && meetingId && !autoAgendaShownRef.current) {
      autoAgendaShownRef.current = true;
      // Small delay so the UI finishes rendering
      const timer = setTimeout(async () => {
        setAgendaLoading(true);
        try {
          const items = await getAgenda(meetingId);
          if (items.length > 0 && meeting) {
            setAutoAgenda({ meetingTitle: meeting.title, items });
          }
        } catch {}
        setAgendaLoading(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [connected, meetingId, meeting?.title]);

  // Log attendance join when connected
  useEffect(() => {
    if (connected && meetingId && user?.uid) {
      import("@/lib/meetings").then(({ logAttendanceJoin }) => {
        logAttendanceJoin(meetingId, user.uid!, displayName).catch(() => {});
      }).catch(() => {});
    }
  }, [connected]);

  // Keyboard shortcut: Spacebar for Push-to-Talk (desktop only)
  useEffect(() => {
    if (!connected || !audioEnabled) return;
    const isDesktop = window.matchMedia('(pointer: fine)').matches;
    if (!isDesktop) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      e.preventDefault();
      pttDownRef.current();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      e.preventDefault();
      pttUpRef.current();
    };

    const onBlur = () => {
      // Release PTT if user switches tabs/windows while holding spacebar
      pttUpRef.current();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      pttUpRef.current();
    };
  }, [connected, audioEnabled]);

  // Speaking timer via data channel
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !connected) return;

    const handler = (payload: Uint8Array, _participant: any, _kind: any, topic: string | undefined) => {
      if (topic !== "timer") return;
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (data.type === "timer-start") {
          // Clear any existing timer
          if (speakingTimerIntervalRef.current) clearInterval(speakingTimerIntervalRef.current);
          const durationSec = Math.floor((data.duration || 180000) / 1000);
          setSpeakingTimer({ remaining: durationSec, limit: durationSec });
          speakingTimerIntervalRef.current = setInterval(() => {
            setSpeakingTimer((prev) => {
              if (!prev || prev.remaining <= 1) {
                if (speakingTimerIntervalRef.current) clearInterval(speakingTimerIntervalRef.current);
                speakingTimerIntervalRef.current = null;
                return null;
              }
              return { ...prev, remaining: prev.remaining - 1 };
            });
          }, 1000);
        } else if (data.type === "timer-extend") {
          const additional = Math.floor((data.additional || 60000) / 1000);
          setSpeakingTimer((prev) => {
            if (!prev) return null;
            return { ...prev, remaining: prev.remaining + additional, limit: prev.limit + additional };
          });
        } else if (data.type === "timer-end") {
          if (speakingTimerIntervalRef.current) clearInterval(speakingTimerIntervalRef.current);
          speakingTimerIntervalRef.current = null;
          setSpeakingTimer(null);
        }
      } catch {}
    };

    room.on(RoomEvent.DataReceived, handler);
    return () => {
      room.off(RoomEvent.DataReceived, handler);
      if (speakingTimerIntervalRef.current) clearInterval(speakingTimerIntervalRef.current);
      speakingTimerIntervalRef.current = null;
    };
  }, [connected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        // Log attendance leave
        if (meetingId && user?.uid) {
          import("@/lib/meetings").then(({ logAttendanceLeave }) => {
            logAttendanceLeave(meetingId, user.uid!).catch(() => {});
          }).catch(() => {});
        }
        roomRef.current.disconnect();
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [meetingId, user?.uid]);

  // Loading screen
  if (loading) {
    return (
      <div style={{
        height: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", background: "#0A0A0F", gap: 24, fontFamily: "Inter, sans-serif"
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: "linear-gradient(135deg, #3B82F6, #8B5CF6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 40px rgba(59,130,246,0.3)", animation: "pulseLoad 1.5s ease-in-out infinite"
        }}>
          <i className="fas fa-headphones" style={{ fontSize: 32, color: "#fff" }}></i>
        </div>
        <div style={{ color: "#E8A838", fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
          {connecting ? "Connecting..." : "Loading..."}
        </div>
        <div style={{ width: 200, height: 3, background: "#1A1A1A", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: "40%", background: "linear-gradient(90deg, #3B82F6, #8B5CF6)",
            borderRadius: 2, animation: "slide 1.2s ease-in-out infinite"
          }}></div>
        </div>
        <style>{`
          @keyframes pulseLoad { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } }
          @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        `}</style>
      </div>
    );
  }

  // Meeting not found / ended
  if (!meeting || meeting.status === "ended") {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", height: "100vh",
        background: "#0A0A0F", fontFamily: "Inter, sans-serif"
      }}>
        <div style={{ textAlign: "center", color: "#A0A0A0" }}>
          <i className="fas fa-circle-exclamation" style={{ fontSize: 48, marginBottom: 16, color: "#FF6B6B" }}></i>
          <h2 style={{ color: "#fff", margin: "0 0 8px" }}>
            {meeting?.status === "ended" ? "Meeting Ended" : "Not Found"}
          </h2>
          <p style={{ margin: "0 0 24px", fontSize: 14 }}>
            {meeting?.status === "ended"
              ? "This meeting has already ended."
              : "This meeting doesn't exist or has been removed."}
          </p>
          <button onClick={() => router.push("/meetings")}
            style={{
              padding: "12px 28px", borderRadius: 12, border: "none",
              background: "linear-gradient(135deg, #3B82F6, #2563EB)", color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer"
            }}>
            <i className="fas fa-arrow-left" style={{ marginRight: 8 }}></i> Back to Meetings
          </button>
        </div>
      </div>
    );
  }

  const isAnyoneSpeaking = speakingParticipants.size > 0;
  const activeSpeaker = isAnyoneSpeaking ? Array.from(speakingParticipants)[0] : null;

  return (
    <>
      <style>{`
        :root {
          --primary: #E8A838;
          --primary-light: #F5C76B;
          --bg: #0D0B08;
          --surface: rgba(255,255,255,0.04);
          --surface-card: rgba(255,255,255,0.06);
          --border: rgba(255,255,255,0.06);
          --text-primary: #FFFFFF;
          --text-secondary: rgba(255,255,255,0.6);
          --text-tertiary: rgba(255,255,255,0.35);
          --success: #34D399;
          --error: #F87171;
          --info: #60A5FA;
          --gradient-start: #E8A838;
          --gradient-end: #C9771D;
          --gradient-blue: #60A5FA;
          --gradient-purple: #A78BFA;
          --shadow-glow: 0 0 30px rgba(96,165,250,0.12);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html, body { height: 100%; overflow: hidden; background: var(--bg); color: var(--text-primary); font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; }

        .listen-page {
          height: 100vh;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        /* ===== ANIMATED BACKGROUND ===== */
        .bg-canvas {
          position: fixed;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          background:
            radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.05) 0%, transparent 60%),
            radial-gradient(ellipse at 70% 80%, rgba(139,92,246,0.04) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(232,168,56,0.03) 0%, transparent 50%);
        }

        .bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.25;
          animation: orbFloat 25s ease-in-out infinite;
        }

        .bg-orb:nth-child(1) {
          width: 350px; height: 350px;
          background: rgba(59,130,246,0.1);
          top: -15%; left: -10%;
          animation-delay: 0s;
        }

        .bg-orb:nth-child(2) {
          width: 280px; height: 280px;
          background: rgba(139,92,246,0.08);
          bottom: -10%; right: -8%;
          animation-delay: -8s;
        }

        .bg-orb:nth-child(3) {
          width: 200px; height: 200px;
          background: rgba(232,168,56,0.06);
          top: 30%; left: 60%;
          animation-delay: -16s;
        }

        @keyframes orbFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(40px, -30px) scale(1.1); }
          50% { transform: translate(-25px, 25px) scale(0.9); }
          75% { transform: translate(35px, -15px) scale(1.05); }
        }

        .listen-content {
          position: relative;
          z-index: 1;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        /* ===== TOP BAR ===== */
        .top-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          flex-shrink: 0;
          background: rgba(10,10,15,0.8);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border);
        }

        .top-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .back-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: var(--surface);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .back-btn:active { transform: scale(0.9); }

        .listen-badge {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 5px 12px;
          border-radius: 100px;
          background: rgba(74,222,128,0.1);
          border: 1px solid rgba(74,222,128,0.2);
        }

        .listen-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--success);
          animation: livePulse 1.2s ease-in-out infinite;
        }

        .listen-text {
          font-size: 11px;
          font-weight: 700;
          color: var(--success);
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        .top-timer {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-tertiary);
          font-variant-numeric: tabular-nums;
        }

        .top-timer i { font-size: 11px; }

        .top-info-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-tertiary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .top-info-btn:active { transform: scale(0.9); }
        .top-info-btn.active { border-color: var(--primary); color: var(--primary); }

        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.6); }
        }

        /* ===== MAIN AREA ===== */
        .main-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
          gap: 20px;
          overflow-y: auto;
        }

        /* Audio visualization ring */
        .audio-ring-wrap {
          position: relative;
          width: 160px;
          height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .audio-ring-base {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.05);
        }

        .audio-ring-pulse {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid rgba(59,130,246,0.15);
          animation: ringPulse 3s ease-in-out infinite;
        }

        .audio-ring-pulse:nth-child(2) {
          animation-delay: 1s;
        }

        .audio-ring-pulse:nth-child(3) {
          animation-delay: 2s;
        }

        @keyframes ringPulse {
          0% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.2); opacity: 0; }
          100% { transform: scale(1.3); opacity: 0; }
        }

        .audio-icon-wrap {
          width: 110px;
          height: 110px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15));
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 1;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.06);
        }

        .audio-icon-wrap i {
          font-size: 44px;
          background: linear-gradient(135deg, #3B82F6, #8B5CF6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* Visualizer bars */
        .visualizer {
          display: flex;
          align-items: center;
          gap: 4px;
          height: 40px;
          margin-top: 4px;
        }

        .visualizer-bar {
          width: 4px;
          border-radius: 3px;
          background: linear-gradient(to top, #3B82F6, #8B5CF6);
          animation: vizAnim 0.8s ease-in-out infinite;
        }

        .visualizer-bar:nth-child(1) { height: 20px; animation-delay: 0s; }
        .visualizer-bar:nth-child(2) { height: 30px; animation-delay: 0.1s; }
        .visualizer-bar:nth-child(3) { height: 14px; animation-delay: 0.2s; }
        .visualizer-bar:nth-child(4) { height: 36px; animation-delay: 0.15s; }
        .visualizer-bar:nth-child(5) { height: 24px; animation-delay: 0.25s; }
        .visualizer-bar:nth-child(6) { height: 32px; animation-delay: 0.05s; }
        .visualizer-bar:nth-child(7) { height: 18px; animation-delay: 0.3s; }
        .visualizer-bar:nth-child(8) { height: 28px; animation-delay: 0.12s; }

        @keyframes vizAnim {
          0%, 100% { transform: scaleY(0.4); opacity: 0.6; }
          50% { transform: scaleY(1); opacity: 1; }
        }

        /* Meeting info */
        .meeting-info {
          text-align: center;
        }

        .meeting-title {
          font-size: 22px;
          font-weight: 800;
          background: linear-gradient(135deg, #fff, rgba(255,255,255,0.8));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 6px;
          line-height: 1.3;
        }

        .meeting-desc {
          font-size: 13px;
          color: var(--text-secondary);
          max-width: 300px;
          line-height: 1.5;
        }

        /* ===== PTT + SPEAKER STATUS ===== */
        .ptt-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          width: 100%;
          max-width: 340px;
        }

        .ptt-speaking-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          text-align: center;
          animation: fadeIn 0.3s ease;
        }

        .ptt-speaking-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          box-shadow: 0 0 0 2px var(--success), 0 0 24px rgba(74,222,128,0.15);
        }

        .ptt-speaking-label {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .ptt-speaking-name {
          font-size: 16px;
          font-weight: 700;
          color: var(--success);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 240px;
        }

        .ptt-status-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-tertiary);
          padding: 8px 18px;
          background: var(--surface-card);
          border: 1px solid var(--border);
          border-radius: 100px;
          backdrop-filter: blur(10px);
        }

        .ptt-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--success);
          animation: livePulse 1.2s ease-in-out infinite;
        }

        .speaker-wave {
          display: flex;
          align-items: center;
          gap: 2px;
          height: 24px;
        }

        .speaker-wave span {
          width: 3px;
          background: var(--success);
          border-radius: 3px;
          animation: waveAnim 0.6s ease-in-out infinite;
        }

        .speaker-wave span:nth-child(1) { height: 8px; animation-delay: 0s; }
        .speaker-wave span:nth-child(2) { height: 14px; animation-delay: 0.1s; }
        .speaker-wave span:nth-child(3) { height: 10px; animation-delay: 0.2s; }
        .speaker-wave span:nth-child(4) { height: 18px; animation-delay: 0.15s; }
        .speaker-wave span:nth-child(5) { height: 12px; animation-delay: 0.25s; }

        @keyframes waveAnim {
          0%, 100% { transform: scaleY(0.5); }
          50% { transform: scaleY(1); }
        }

        /* ===== RAISED HANDS NOTIFICATION ===== */
        .hand-raise-notice {
          width: 100%;
          max-width: 340px;
          padding: 12px 16px;
          background: rgba(232,168,56,0.06);
          border: 1px solid rgba(232,168,56,0.15);
          border-radius: 16px;
          backdrop-filter: blur(10px);
          animation: fadeIn 0.3s ease;
        }

        .hand-raise-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 700;
          color: var(--primary);
          margin-bottom: 8px;
        }

        .hand-raise-header i {
          font-size: 13px;
        }

        .hand-raise-count {
          margin-left: auto;
          font-size: 10px;
          font-weight: 700;
          color: var(--primary);
          background: rgba(232,168,56,0.12);
          padding: 1px 7px;
          border-radius: 100px;
        }

        .hand-raise-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .hand-raise-chip {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 100px;
          background: rgba(232,168,56,0.08);
          border: 1px solid rgba(232,168,56,0.1);
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .hand-raise-chip .hand-raise-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--primary);
          animation: livePulse 1.2s ease-in-out infinite;
        }

        .hand-raise-chip.more {
          background: transparent;
          border-color: transparent;
          color: var(--text-tertiary);
          font-size: 10px;
        }

        /* ===== SPEAKING TIMER ===== */
        .timer-panel {
          width: 100%;
          max-width: 340px;
          background: var(--surface-card);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 16px 20px;
          backdrop-filter: blur(10px);
          animation: fadeIn 0.3s ease;
        }

        .timer-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }

        .timer-title {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .timer-body {
          display: flex;
          flex-direction: column;
          gap: 10px;
          align-items: center;
        }

        .timer-progress-wrap {
          width: 100%;
          height: 6px;
          background: rgba(255,255,255,0.06);
          border-radius: 4px;
          overflow: hidden;
        }

        .timer-progress-bar {
          height: 100%;
          border-radius: 4px;
          transition: width 1s linear, background 0.5s ease;
        }

        .timer-digits {
          font-size: 36px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          letter-spacing: 3px;
          color: var(--text-primary);
        }

        /* ===== BOTTOM CONTROLS ===== */
        .bottom-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 24px;
          flex-shrink: 0;
          background: rgba(10,10,15,0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid var(--border);
        }

        .bottom-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 0 0 auto;
        }

        .bottom-right {
          display: flex;
          align-items: center;
          gap: 14px;
          flex: 0 0 auto;
        }

        .ctrl-btn {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .ctrl-btn:active { transform: scale(0.9); }

        .ctrl-btn.hand {
          background: var(--surface);
          color: var(--text-tertiary);
          border: 1px solid var(--border);
          transition: all 0.3s ease;
        }

        .ctrl-btn.hand.raised {
          background: rgba(232,168,56,0.15);
          color: var(--primary);
          border-color: rgba(232,168,56,0.3);
          animation: pttHandPulse 1.5s ease-in-out infinite;
        }

        @keyframes pttHandPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(232,168,56,0.2); }
          50% { box-shadow: 0 0 16px 4px rgba(232,168,56,0.1); }
        }

        /* ===== PUSH-TO-TALK PREMIUM BUTTON ===== */
        .ptt-btn {
          position: relative;
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: none;
          background: var(--surface-card);
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          -webkit-touch-callout: none;
          touch-action: manipulation;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
        }

        /* Gradient ring border */
        .ptt-btn::before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04), rgba(255,255,255,0.1));
          z-index: -1;
          transition: all 0.4s ease;
        }

        /* Spinning conic ring (idle) */
        .ptt-btn::after {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          background: conic-gradient(from 0deg, transparent, rgba(59,130,246,0.15), transparent, rgba(139,92,246,0.15), transparent);
          z-index: -2;
          animation: pttRingSpin 4s linear infinite;
          mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1px));
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1px));
        }

        .ptt-btn:active {
          transform: scale(0.92);
        }

        .ptt-btn i {
          font-size: 30px;
          color: var(--text-secondary);
          transition: all 0.3s ease;
          position: relative;
          z-index: 1;
        }

        /* Idle pulse glow to attract attention */
        .ptt-btn:not(.active):not(.blocked) {
          box-shadow: 0 0 0 0 rgba(59,130,246,0.12);
          animation: pttIdlePulse 2.2s ease-in-out infinite;
        }

        /* ===== ACTIVE (SPEAKING) ===== */
        .ptt-btn.active {
          transform: scale(1.05);
          animation: pttActiveBreathe 1.2s ease-in-out infinite;
        }

        .ptt-btn.active::before {
          background: linear-gradient(135deg, rgba(74,222,128,0.35), rgba(59,130,246,0.2));
          inset: -3px;
        }

        .ptt-btn.active::after {
          background: conic-gradient(from 0deg, transparent, rgba(74,222,128,0.45), transparent, rgba(59,130,246,0.35), transparent);
          animation: pttRingSpin 2s linear infinite;
          inset: -6px;
        }

        .ptt-btn.active i {
          color: var(--success);
          animation: pttMicActive 0.6s ease-in-out infinite;
        }

        .ptt-btn.active .ptt-wave-ring {
          opacity: 1;
        }

        .ptt-btn.active .ptt-wave-ring:nth-child(1) {
          animation: pttWaveExpand 1.2s ease-out infinite;
        }

        .ptt-btn.active .ptt-wave-ring:nth-child(2) {
          animation: pttWaveExpand 1.2s ease-out infinite 0.4s;
        }

        .ptt-btn.active .ptt-wave-ring:nth-child(3) {
          animation: pttWaveExpand 1.2s ease-out infinite 0.8s;
        }

        .ptt-btn.active .ptt-dot {
          background: var(--success);
          box-shadow: 0 0 10px rgba(74,222,128,0.6);
          animation: pttDotPulse 1s ease-in-out infinite;
        }

        /* ===== BLOCKED ===== */
        .ptt-btn.blocked {
          cursor: not-allowed;
          opacity: 0.85;
        }

        .ptt-btn.blocked::before {
          background: linear-gradient(135deg, rgba(255,165,0,0.15), rgba(255,100,0,0.1));
          inset: -2px;
        }

        .ptt-btn.blocked::after {
          background: conic-gradient(from 0deg, transparent, rgba(255,165,0,0.2), transparent, rgba(255,100,0,0.1), transparent);
          animation: pttRingSpin 3s linear infinite reverse;
        }

        .ptt-btn.blocked i {
          color: #ffa500;
        }

        .ptt-btn.blocked .ptt-dot {
          background: #ffa500;
          box-shadow: 0 0 8px rgba(255,165,0,0.4);
          animation: pttDotPulse 1.5s ease-in-out infinite;
        }

        .ptt-btn.blocked .ptt-label {
          color: #ffa500;
        }

        /* Wave ripple rings */
        .ptt-wave-ring {
          position: absolute;
          inset: -8px;
          border-radius: 50%;
          border: 2px solid rgba(74,222,128,0.2);
          opacity: 0;
          pointer-events: none;
        }

        /* Status dot indicator */
        .ptt-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          position: absolute;
          top: 16px;
          right: 16px;
          transition: all 0.3s ease;
          z-index: 2;
        }

        .ptt-btn:not(.active):not(.blocked) .ptt-dot {
          background: var(--info);
          box-shadow: 0 0 8px rgba(56,189,248,0.4);
          animation: pttDotPulse 2s ease-in-out infinite;
        }

        /* PTT Label below button */
        .ptt-label {
          position: absolute;
          bottom: -22px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 10px;
          font-weight: 800;
          color: var(--text-tertiary);
          white-space: nowrap;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          transition: all 0.3s ease;
        }

        .ptt-btn.active .ptt-label {
          color: var(--success);
          bottom: -24px;
        }

        .ptt-btn.blocked .ptt-label {
          color: #ffa500;
          bottom: -24px;
        }

        /* ===== ANIMATIONS ===== */
        @keyframes pttRingSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes pttIdlePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.1); }
          50% { box-shadow: 0 0 24px 8px rgba(59,130,246,0.06); }
        }

        @keyframes pttActiveBreathe {
          0%, 100% { transform: scale(1.05); }
          50% { transform: scale(1.1); }
        }

        @keyframes pttMicActive {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }

        @keyframes pttWaveExpand {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(2); opacity: 0; }
        }

        @keyframes pttDotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }

        .ctrl-btn.hangup {
          width: 52px;
          height: 52px;
          background: var(--error);
          color: #fff;
          box-shadow: 0 4px 20px rgba(255,107,107,0.25);
        }

        .ctrl-btn.hangup:active {
          box-shadow: 0 2px 10px rgba(255,107,107,0.3);
        }

        .participant-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 100px;
          background: var(--surface);
          border: 1px solid var(--border);
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .participant-chip i { font-size: 11px; color: var(--primary); }

        /* ===== INFO OVERLAY ===== */
        .info-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.8);
          backdrop-filter: blur(15px);
          -webkit-backdrop-filter: blur(15px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          animation: fadeIn 0.3s ease;
        }

        .info-card {
          background: #151520;
          border: 1px solid var(--border);
          border-radius: 28px;
          padding: 32px 28px;
          max-width: 380px;
          width: 100%;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
        }

        .info-card-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15));
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          border: 1px solid rgba(255,255,255,0.06);
        }

        .info-card-icon i { font-size: 24px; color: var(--info); }

        .info-card h3 {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .info-card p {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: 20px;
        }

        .info-detail {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
        }

        .info-detail:last-child {
          border-bottom: none;
        }

        .info-detail-label {
          color: var(--text-tertiary);
          font-weight: 500;
        }

        .info-detail-value {
          font-weight: 600;
        }

        .info-dismiss {
          width: 100%;
          margin-top: 20px;
          padding: 12px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #3B82F6, #2563EB);
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .info-dismiss:active { transform: scale(0.97); }

        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        /* Responsive */
        @media (max-width: 480px) {
          .audio-ring-wrap { width: 140px; height: 140px; }
          .audio-icon-wrap { width: 96px; height: 96px; }
          .audio-icon-wrap i { font-size: 36px; }
          .meeting-title { font-size: 19px; }
          .top-bar { padding: 10px 14px; }
          .bottom-controls { padding: 8px 12px; }
          .bottom-right { gap: 10px; }
          .ptt-btn { width: 64px; height: 64px; }
          .ptt-btn i { font-size: 24px; }
          .ptt-btn .ptt-label { font-size: 9px; bottom: -18px; }
          .ptt-dot { width: 6px; height: 6px; top: 12px; right: 12px; }
          .ctrl-btn { width: 40px; height: 40px; font-size: 14px; }
        }
      `}</style>

      <ToastBridge />
      <div className="listen-page">
        <PremiumTopBar minimal />
        <div className="bg-canvas">
          <div className="bg-orb"></div>
          <div className="bg-orb"></div>
          <div className="bg-orb"></div>
        </div>

        {connected && !audioEnabled ? (
          <div style={{
            position: "relative", zIndex: 1, flex: 1, display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: 40, textAlign: "center", gap: 24
          }}>
            <div style={{
              width: 100, height: 100, borderRadius: "50%",
              background: "linear-gradient(135deg, var(--gradient-blue), var(--gradient-purple))",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 50px rgba(59,130,246,0.25)",
              animation: "pulseLoad 1.5s ease-in-out infinite"
            }}>
              <i className="fas fa-headphones" style={{ fontSize: 40, color: "#fff" }}></i>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{meeting?.title}</h1>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5, maxWidth: 300 }}>
              Tap the button below to start listening to the meeting
            </p>
            <button
              onClick={handleStartListening}
              style={{
                padding: "16px 48px", borderRadius: 100, border: "none",
                background: "linear-gradient(135deg, var(--gradient-blue), #2563EB)",
                color: "#fff", fontSize: 17, fontWeight: 800, cursor: "pointer",
                boxShadow: "0 8px 32px rgba(59,130,246,0.35)",
                display: "flex", alignItems: "center", gap: 10,
                transition: "all 0.2s ease"
              }}
            >
              <i className="fas fa-headphones-simple"></i>
              Start Listening
            </button>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0 }}>
              Tap "Speak" below to unmute your microphone when you want to talk
            </p>
          </div>
        ) : (
        <div className="listen-content">
          {/* TOP BAR */}
          <div className="top-bar">
            <div className="top-left">
              <button className="back-btn" onClick={leaveMeeting} title="Leave">
                <i className="fas fa-chevron-left"></i>
              </button>
              <div className="listen-badge">
                <div className="listen-dot"></div>
                <span className="listen-text">Listening</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {connected && (
                <div className="top-timer">
                  <i className="fas fa-clock"></i>
                  {formatElapsed(elapsed)}
                </div>
              )}
              <button
                className={`top-info-btn ${showInfo ? "active" : ""}`}
                onClick={() => setShowInfo(!showInfo)}
                title="Meeting Info"
              >
                <i className="fas fa-info"></i>
              </button>
            </div>
          </div>

          {/* MAIN AREA */}
          <div className="main-area">
            {/* Audio visualization */}
            <div className="audio-ring-wrap">
              <div className="audio-ring-base"></div>
              <div className="audio-ring-pulse"></div>
              <div className="audio-ring-pulse"></div>
              <div className="audio-ring-pulse"></div>
              <div className="audio-icon-wrap">
                <i className="fas fa-headphones-simple"></i>
              </div>
            </div>

            {/* Visualizer bars */}
            <div className="visualizer">
              <div className="visualizer-bar"></div>
              <div className="visualizer-bar"></div>
              <div className="visualizer-bar"></div>
              <div className="visualizer-bar"></div>
              <div className="visualizer-bar"></div>
              <div className="visualizer-bar"></div>
              <div className="visualizer-bar"></div>
              <div className="visualizer-bar"></div>
            </div>

            {/* Meeting info */}
            <div className="meeting-info">
              <div className="meeting-title">{meeting.title}</div>
              {meeting.description && (
                <div className="meeting-desc">{meeting.description}</div>
              )}
            </div>

            {/* Raised hands notification */}
            {remoteHandRaised.size > 0 && (
              <div className="hand-raise-notice">
                <div className="hand-raise-header">
                  <i className="fas fa-hand"></i>
                  <span>Raised hand{remoteHandRaised.size > 1 ? "s" : ""}</span>
                  <span className="hand-raise-count">{remoteHandRaised.size}</span>
                </div>
                <div className="hand-raise-list">
                  {Array.from(remoteHandRaised).slice(0, 3).map((name) => (
                    <div className="hand-raise-chip" key={name}>
                      <span className="hand-raise-dot"></span>
                      {name}
                    </div>
                  ))}
                  {remoteHandRaised.size > 3 && (
                    <div className="hand-raise-chip more">
                      +{remoteHandRaised.size - 3} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Speaking Timer */}
            {speakingTimer && (
              <div className="timer-panel">
                <div className="timer-header">
                  <i className="fas fa-hourglass-half" style={{ color: "var(--success)" }}></i>
                  <span className="timer-title">Your Speaking Time</span>
                </div>
                <div className="timer-body">
                  <div className="timer-progress-wrap">
                    <div className="timer-progress-bar" style={{
                      width: `${(speakingTimer.remaining / speakingTimer.limit) * 100}%`,
                      background: speakingTimer.remaining <= 30
                        ? "linear-gradient(90deg, #FF6B6B, #EE4444)"
                        : speakingTimer.remaining <= 60
                          ? "linear-gradient(90deg, #F59E0B, #D97706)"
                          : "linear-gradient(90deg, var(--gradient-start), var(--gradient-end))",
                    }}></div>
                  </div>
                  <div className="timer-digits">
                    {String(Math.floor(speakingTimer.remaining / 60)).padStart(2, "0")}:
                    {String(speakingTimer.remaining % 60).padStart(2, "0")}
                  </div>
                </div>
              </div>
            )}

            {/* PTT Button + Speaker Status */}
            <div className="ptt-section">
              {/* Speaker status indicator */}
              {isAnyoneSpeaking ? (
                <div className="ptt-speaking-indicator">
                  <div className="ptt-speaking-avatar"
                    style={{ background: "linear-gradient(135deg, #3B82F6, #2563EB)" }}>
                    {activeSpeaker?.charAt(0).toUpperCase()}
                  </div>
                  <div className="ptt-speaking-label">Speaking Now</div>
                  <div className="ptt-speaking-name">{activeSpeaker}</div>
                  <div className="speaker-wave">
                    <span></span><span></span><span></span><span></span><span></span>
                  </div>
                </div>
              ) : (
                <div className="ptt-status-label">
                  <span className="ptt-status-dot"></span>
                  {participants.length > 0
                    ? `${participants.length + 1} in the room`
                    : "Waiting for speakers..."}
                </div>
              )}

              {/* PTT Button */}
              <button
                className={`ptt-btn ${adminMuted ? "blocked" : !isMuted ? "active" : ""}`}
                onMouseDown={handlePTTDown}
                onMouseUp={handlePTTUp}
                onMouseLeave={handlePTTUp}
                onTouchStart={handlePTTDown}
                onTouchEnd={handlePTTUp}
                onTouchCancel={handlePTTUp}
                title={adminMuted ? "Host closed your microphone" : "Hold to talk"}
              >
                <div className="ptt-wave-ring"></div>
                <div className="ptt-wave-ring"></div>
                <div className="ptt-wave-ring"></div>
                <div className="ptt-dot"></div>
                <i className={`fas fa-${adminMuted ? "lock" : "microphone"}`}></i>
                <span className="ptt-label">
                  {adminMuted ? "Blocked" : !isMuted ? "Speaking..." : "Hold to Talk"}
                </span>
              </button>
            </div>
          </div>

          {/* BOTTOM CONTROLS */}
          <div className="bottom-controls">
            <div className="bottom-left">
              <div className="participant-chip">
                <i className="fas fa-headphones"></i>
                <span>{participants.length + 1}</span>
              </div>
            </div>

            <div className="bottom-right">
              <ReactionsOverlay room={roomRef.current} identity={identity} />
              <button
                className={`ctrl-btn hand ${handRaised ? "raised" : ""}`}
                onClick={toggleHandRaise}
                title={handRaised ? "Lower hand" : "Raise hand to speak"}
              >
                <i className="fas fa-hand"></i>
              </button>
              <button
                className="ctrl-btn hangup"
                onClick={leaveMeeting}
                title="Leave Meeting"
              >
                <i className="fas fa-phone-slash"></i>
              </button>
            </div>
          </div>
          </div>
        )}
      </div>

      {/* INFO OVERLAY */}
      {showInfo && (
        <div className="info-overlay" onClick={() => setShowInfo(false)}>
          <div className="info-card" onClick={(e) => e.stopPropagation()}>
            <div className="info-card-icon">
              <i className="fas fa-circle-info"></i>
            </div>
            <h3>{meeting.title}</h3>
            <p>{meeting.description || "No description"}</p>

            <div className="info-detail">
              <span className="info-detail-label">Status</span>
              <span className="info-detail-value" style={{ color: "var(--success)" }}>
                <i className="fas fa-circle" style={{ fontSize: 8, marginRight: 6 }}></i>
                Live
              </span>
            </div>
            <div className="info-detail">
              <span className="info-detail-label">Duration</span>
              <span className="info-detail-value">{formatElapsed(elapsed)}</span>
            </div>
            <div className="info-detail">
              <span className="info-detail-label">Participants</span>
              <span className="info-detail-value">{participants.length + 1}</span>
            </div>
            <div className="info-detail">
              <span className="info-detail-label">Your mic</span>
              <span className="info-detail-value" style={{ color: isMuted ? "var(--text-tertiary)" : "var(--success)" }}>
                {isMuted ? "Muted" : "Active"}
              </span>
            </div>

            <button className="info-dismiss" onClick={() => setShowInfo(false)}>
              Got it
            </button>
          </div>
        </div>
      )}

      {/* AUTO AGENDA MODAL */}
      {autoAgenda && (
        <>
          <div className="form-overlay" onClick={() => setAutoAgenda(null)}></div>
          <div className="agenda-sheet" style={{ zIndex: 10001 }}>
            <div className="agenda-item-num-circle" style={{ width: 32, height: 32, margin: "12px auto 0", fontSize: 14, borderColor: "var(--info)", color: "var(--info)", background: "rgba(56,189,248,0.1)" }}>
              <i className="fas fa-list-check" style={{ fontSize: 14 }}></i>
            </div>
            <div className="agenda-sheet-header" style={{ paddingTop: 8 }}>
              <div className="agenda-sheet-title">{autoAgenda.meetingTitle}</div>
              <div className="agenda-sheet-sub">Meeting Agenda</div>
            </div>
            <div className="agenda-sheet-body">
              <div className="agenda-summary">
                <span>{autoAgenda.items.length} item{autoAgenda.items.length !== 1 ? "s" : ""}</span>
                <span>
                  <i className="fas fa-clock"></i>{' '}
                  {autoAgenda.items.reduce((sum, i) => sum + i.duration, 0)} min total
                </span>
                <span>
                  {autoAgenda.items.filter((i) => i.isCompleted).length} completed
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                {autoAgenda.items.map((item, idx) => (
                  <div key={item.id || idx} style={{
                    display: "flex", gap: 12, minHeight: 50, paddingBottom: 4,
                    opacity: item.isCompleted ? 0.5 : 1,
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 28, flexShrink: 0 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%",
                        border: `2px solid ${item.isCompleted ? "var(--success)" : "var(--primary)"}`,
                        background: item.isCompleted ? "var(--success)" : "rgba(232,168,56,0.08)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 800, color: item.isCompleted ? "#fff" : "var(--primary)",
                        flexShrink: 0,
                      }}>
                        {item.isCompleted ? <i className="fas fa-check" style={{ fontSize: 11 }}></i> : idx + 1}
                      </div>
                      {idx < autoAgenda.items.length - 1 && (
                        <div style={{
                          width: 2, flex: 1, minHeight: 20,
                          background: "rgba(232,168,56,0.12)",
                        }}></div>
                      )}
                    </div>
                    <div style={{ flex: 1, paddingBottom: 16 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 600, paddingTop: 4,
                        textDecoration: item.isCompleted ? "line-through" : "none",
                      }}>
                        {item.title}
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 12, color: "var(--text-tertiary)" }}>
                        <span><i className="fas fa-clock" style={{ fontSize: 10, marginRight: 2 }}></i> {item.duration} min</span>
                        {item.assigneeName && (
                          <span><i className="fas fa-user" style={{ fontSize: 10, marginRight: 2 }}></i> {item.assigneeName}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="agenda-sheet-footer">
              <button className="agenda-close-btn" onClick={() => setAutoAgenda(null)}>
                <i className="fas fa-check"></i> Got it
              </button>
            </div>
          </div>

          <style>{`
            .form-overlay {
              position: fixed; inset: 0; background: rgba(0,0,0,0.88);
              z-index: 10000;
            }
            .agenda-sheet {
              position: fixed; bottom: 0; left: 0; right: 0; z-index: 10001;
              background: var(--surface); border-radius: 28px 28px 0 0;
              max-width: 480px; margin: 0 auto;
              animation: slideUp 0.35s cubic-bezier(0.32,0.72,0,1);
              max-height: 80vh; display: flex; flex-direction: column;
            }
            @keyframes slideUp {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
            .agenda-sheet-header {
              padding: 8px 24px 12px; text-align: center;
              border-bottom: 1px solid var(--border);
            }
            .agenda-sheet-title {
              font-size: 18px; font-weight: 700;
            }
            .agenda-sheet-sub {
              font-size: 12px; color: var(--text-tertiary);
              margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px;
            }
            .agenda-sheet-body {
              flex: 1; overflow-y: auto; padding: 16px 24px 8px;
            }
            .agenda-sheet-body::-webkit-scrollbar { display: none; }
            .agenda-sheet-footer {
              padding: 12px 24px 24px;
              border-top: 1px solid var(--border);
            }
            .agenda-close-btn {
              width: 100%; padding: 12px;
              border-radius: var(--radius-md);
              border: 1px solid var(--border);
              background: linear-gradient(135deg, var(--gradient-blue), #2563EB);
              color: #fff;
              font-size: 14px; font-weight: 700;
              cursor: pointer; transition: all 0.2s ease;
              display: flex; align-items: center; justify-content: center; gap: 6px;
            }
            .agenda-close-btn:active { transform: scale(0.97); }
            .agenda-summary {
              display: flex; gap: 16px; justify-content: center;
              padding: 10px 16px; margin-bottom: 12px;
              background: var(--surface-elevated); border-radius: var(--radius-md);
              font-size: 12px; color: var(--text-secondary); font-weight: 600;
            }
            .agenda-summary i { font-size: 11px; color: var(--primary); }
          `}</style>
        </>
      )}
    </>
  );
}
