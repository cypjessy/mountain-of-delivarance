"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import ToastBridge from "@/components/dashboard/ToastBridge";
import { getUpcomingMeetings } from "@/lib/meetings";
import type { Meeting } from "@/lib/meetings";
import BottomNavBar from "@/components/shared/BottomNavBar";

export default function MeetingsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  function showToast(title: string, message: string, type: string, duration: number) {
    window.dispatchEvent(new CustomEvent("show-toast", { detail: { title, message, type, duration } }));
  }

  const loadMeetings = useCallback(async () => {
    try {
      const data = await getUpcomingMeetings();
      setMeetings(data);
    } catch (e) {
      console.error("Failed to load meetings:", e);
      showToast("Error", "Could not load meetings", "error", 3000);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setTimeout(() => loadMeetings(), 0); }, [loadMeetings]);

  const joinMeeting = (meeting: Meeting) => {
    if (!meeting.roomName) {
      showToast("Not Ready", "This meeting room isn't configured yet", "error", 3000);
      return;
    }
    if (meeting.status === "ended") {
      showToast("Ended", "This meeting has already ended", "info", 2500);
      return;
    }
    setJoiningId(meeting.id || null);
    setTimeout(() => {
      router.push(`/meetings/listen?id=${meeting.id}`);
    }, 300);
  };

  const isToday = (date: string) => date === new Date().toISOString().slice(0, 10);

  const formatTime = (startTime: string, endTime: string) => {
    const fmt = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
      return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
    };
    return `${fmt(startTime)} — ${fmt(endTime)}`;
  };

  return (
    <>
      <style>{`
        :root { --primary: #E8A838; --primary-light: #F5C76B; --primary-dark: #C48A2A; --bg: #0F0F0F; --surface: #1A1A1A; --surface-elevated: #242424; --surface-card: #1E1E1E; --surface-hover: #2A2A2A; --text-primary: #FFFFFF; --text-secondary: #A0A0A0; --text-tertiary: #6B6B6B; --border: #2A2A2A; --error: #FF6B6B; --success: #4ADE80; --info: #38BDF8; --gradient-start: #E8A838; --gradient-end: #D4762A; --gradient-blue: #3B82F6; --gradient-purple: #8B5CF6; --shadow-soft: 0 4px 20px rgba(232,168,56,0.15); --shadow-elevated: 0 8px 32px rgba(0,0,0,0.5); --radius-sm: 10px; --radius-md: 14px; --radius-lg: 18px; --radius-xl: 22px; --radius-full: 50%; }
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; }
        html, body { height: 100%; overflow: hidden; background: var(--bg); color: var(--text-primary); }
        .app-container { height: 100%; display: flex; flex-direction: column; position: relative; overflow: hidden; }
        @media (min-width: 480px) { .app-container { max-width: 480px; margin: 0 auto; border-left: 1px solid var(--border); border-right: 1px solid var(--border); } }
        .status-bar { height: env(safe-area-inset-top, 24px); min-height: 24px; background: var(--bg); flex-shrink: 0; }

        .header { padding: 10px 16px 8px; display: flex; align-items: center; gap: 12px; flex-shrink: 0; background: var(--bg); border-bottom: 1px solid var(--border); }
        .header-logo { width: 38px; height: 38px; background: linear-gradient(135deg, var(--gradient-blue), #2563EB); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .header-logo i { font-size: 16px; color: #fff; }
        .header-info { flex: 1; min-width: 0; }
        .header-title { font-size: 15px; font-weight: 700; line-height: 1.2; }
        .header-sub { font-size: 11px; color: var(--text-tertiary); margin-top: 1px; }

        .content-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: 120px; }
        .content-scroll::-webkit-scrollbar { display: none; }

        .meetings-list { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
        .meeting-card { background: var(--surface-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px; display: flex; flex-direction: column; gap: 10px; transition: all 0.2s ease; }
        .meeting-card:active { transform: scale(0.98); }
        .meeting-card.active { border-color: var(--success); background: linear-gradient(135deg, rgba(74,222,128,0.03), rgba(59,130,246,0.03)); }
        .meeting-card.ended { opacity: 0.5; }

        .meeting-title { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        .meeting-title .live-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; background: rgba(74,222,128,0.15); color: var(--success); text-transform: uppercase; letter-spacing: 0.5px; }
        .meeting-title .live-tag i { font-size: 6px; }
        .meeting-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

        .meeting-meta { display: flex; flex-wrap: wrap; gap: 8px; }
        .meta-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; background: var(--surface-elevated); color: var(--text-secondary); }
        .meta-chip i { font-size: 12px; color: var(--primary); }

        .join-btn { width: 100%; padding: 12px; border-radius: var(--radius-md); font-size: 14px; font-weight: 700; border: none; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .join-btn:active { transform: scale(0.97); }
        .join-btn.scheduled { background: linear-gradient(135deg, var(--gradient-blue), #2563EB); color: #fff; }
        .join-btn.active { background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end)); color: #fff; box-shadow: var(--shadow-soft); }
        .join-btn.ended { background: var(--surface-elevated); color: var(--text-tertiary); cursor: default; }
        .join-btn:disabled { opacity: 0.6; }

        .empty-state { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; text-align: center; gap: 10px; }
        .empty-state i { font-size: 40px; color: var(--text-tertiary); opacity: 0.3; }
        .empty-state h3 { font-size: 18px; font-weight: 700; }
        .empty-state p { font-size: 14px; color: var(--text-secondary); max-width: 280px; line-height: 1.5; }

        .section-divider { display: flex; align-items: center; gap: 12px; padding: 0 16px; margin-bottom: 4px; }
        .section-divider-line { flex: 1; height: 1px; background: var(--border); }
        .section-divider-label { font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }

        /* ========== BOTTOM NAV ========== */
        .bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(15,15,15,0.92); backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); border-top: 1px solid var(--border); padding: 8px 0 calc(8px + env(safe-area-inset-bottom, 0px)); z-index: 1000; display: flex; justify-content: space-around; align-items: center; }
        @media (min-width: 480px) { .bottom-nav { max-width: 480px; margin: 0 auto; } }
        .nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 16px; background: none; border: none; color: var(--text-tertiary); cursor: pointer; transition: all 0.2s ease; position: relative; }
        .nav-item.active { color: var(--primary); }
        .nav-item i { font-size: 22px; transition: transform 0.2s ease; }
        .nav-item:active i { transform: scale(0.85); }
        .nav-item span { font-size: 10px; font-weight: 600; }
        .nav-item .nav-badge { position: absolute; top: 2px; right: 6px; width: 8px; height: 8px; background: var(--error); border-radius: var(--radius-full); border: 2px solid var(--bg); }

        /* Skeleton */
        .skeleton-loading { background: linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 50%, var(--surface) 75%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; border-radius: var(--radius-md); }
        .skeleton-line { height: 14px; width: 100%; margin-bottom: 8px; }
        .skeleton-line.w60 { width: 60%; }
        .skeleton-line.w40 { width: 40%; }
        .skeleton-line.w80 { width: 80%; }
        .skeleton-line.h24 { height: 24px; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>

      <ToastBridge />

      <div className="app-container">
        <div className="status-bar"></div>

        {/* HEADER */}
        <header className="header">
          <div className="header-logo"><i className="fas fa-people-group"></i></div>
          <div className="header-info">
            <div className="header-title">Meetings</div>
            <div className="header-sub">Join audio meetings with the church</div>
          </div>
        </header>

        {/* CONTENT */}
        <div className="content-scroll">
          {loading ? (
            <div style={{ padding: 16 }}>
              {[1,2].map((i) => (
                <div key={i} className="meeting-card" style={{ marginBottom: 12 }}>
                  <div className="skeleton-loading skeleton-line w60 h24" style={{ marginBottom: 8 }}></div>
                  <div className="skeleton-loading skeleton-line w80" style={{ marginBottom: 6 }}></div>
                  <div className="skeleton-loading skeleton-line w40"></div>
                </div>
              ))}
            </div>
          ) : meetings.length === 0 ? (
            <div className="empty-state">
              <i className="fas fa-people-group"></i>
              <h3>No Upcoming Meetings</h3>
              <p>Check back later for scheduled prayer meetings and gatherings.</p>
            </div>
          ) : (
            <div className="meetings-list">
              {meetings.map((m) => {
                const canJoin = m.status !== "ended";
                return (
                  <div key={m.id} className={`meeting-card ${m.status === "active" ? "active" : m.status === "ended" ? "ended" : ""}`}>
                    <div className="meeting-title">
                      {m.title}
                      {m.status === "active" && <span className="live-tag"><i className="fas fa-circle"></i> Live</span>}
                    </div>
                    {m.description && <div className="meeting-desc">{m.description}</div>}
                    <div className="meeting-meta">
                      <span className="meta-chip">
                        <i className="fas fa-calendar"></i>
                        {isToday(m.date) ? "Today" : new Date(m.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </span>
                      <span className="meta-chip">
                        <i className="fas fa-clock"></i>
                        {formatTime(m.startTime, m.endTime)}
                      </span>
                      <span className="meta-chip">
                        <i className="fas fa-users"></i>
                        {m.maxParticipants}
                      </span>
                    </div>
                    <button
                      className={`join-btn ${m.status}`}
                      onClick={() => canJoin && joinMeeting(m)}
                      disabled={!canJoin || joiningId === m.id}
                    >
                      {joiningId === m.id ? (
                        <><i className="fas fa-spinner fa-spin"></i> Joining...</>
                      ) : m.status === "active" ? (
                        <><i className="fas fa-phone"></i> Join Now</>
                      ) : m.status === "scheduled" ? (
                        <><i className="fas fa-clock"></i> Upcoming</>
                      ) : (
                        "Ended"
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ height: 20 }}></div>
        </div>

        <BottomNavBar activeTab="meetings" />
      </div>
    </>
  );
}
