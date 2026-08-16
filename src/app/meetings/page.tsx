"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import ToastBridge from "@/components/dashboard/ToastBridge";
import { getUpcomingMeetings, submitRSVP, getRSVPsForMeetings, getAgenda, getActionItems, getAgendaCount } from "@/lib/meetings";
import type { Meeting, AgendaItem, ActionItem } from "@/lib/meetings";
import { useAppStore } from "@/lib/useAppStore";
import BottomNavBar from "@/components/shared/BottomNavBar";
import PremiumTopBar from "@/components/shared/PremiumTopBar";

export default function MeetingsPage() {
  const router = useRouter();
  const userDoc = useAppStore((s) => s.userDoc);
  const user = useAppStore((s) => s.user);
  const userId = user?.uid || "";
  const userName = userDoc?.display_name || user?.displayName || "You";
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [rsvpStatus, setRsvpStatus] = useState<Record<string, "yes" | "no" | "maybe" | null>>({});
  const [rsvpLoading, setRsvpLoading] = useState<Set<string>>(new Set());
  const [agendaCounts, setAgendaCounts] = useState<Record<string, number>>({});
  const [agendaModal, setAgendaModal] = useState<{ meetingTitle: string; items: AgendaItem[] } | null>(null);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [actionModal, setActionModal] = useState<{ meetingTitle: string; items: ActionItem[] } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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

  // Load RSVPs once meetings are loaded
  useEffect(() => {
    if (meetings.length === 0 || !userId) return;
    const ids = meetings.map((m) => m.id).filter(Boolean) as string[];
    getRSVPsForMeetings(ids, userId).then(setRsvpStatus).catch(() => {});
  }, [meetings.length, userId]);

  // Pre-load agenda counts for all meetings
  useEffect(() => {
    if (meetings.length === 0) return;
    meetings.forEach(async (m) => {
      if (!m.id) return;
      try {
        const count = await getAgendaCount(m.id);
        setAgendaCounts((prev) => ({ ...prev, [m.id!]: count }));
      } catch {}
    });
  }, [meetings.length]);

  const handleRSVP = async (meetingId: string, status: "yes" | "no" | "maybe") => {
    if (!userId) return;
    setRsvpLoading((prev) => new Set(prev).add(meetingId));
    try {
      await submitRSVP(meetingId, userId, userName, status);
      setRsvpStatus((prev) => ({ ...prev, [meetingId]: status }));
      showToast("RSVP Updated", `You're ${status === "yes" ? "attending" : status === "no" ? "not attending" : "tentative"}`, "success", 2000);
    } catch {
      showToast("Error", "Could not update RSVP", "error", 3000);
    } finally {
      setRsvpLoading((prev) => { const next = new Set(prev); next.delete(meetingId); return next; });
    }
  };

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
        :root { --primary: #E8A838; --primary-light: #F5C76B; --primary-dark: #B98A1F; --bg: #0F0D0A; --surface: #181512; --surface-elevated: #23201B; --surface-card: #1C1915; --surface-hover: #2B2720; --text-primary: #F7F5F0; --text-secondary: #A8A39A; --text-tertiary: #75706A; --border: #2B2720; --error: #F87171; --success: #34D399; --info: #60A5FA; --gradient-start: #E8A838; --gradient-end: #C9771D; --gradient-blue: #60A5FA; --gradient-purple: #A78BFA; --shadow-soft: 0 4px 20px rgba(232,168,56,0.16); --shadow-elevated: 0 10px 36px rgba(0,0,0,0.55); --radius-sm: 10px; --radius-md: 14px; --radius-lg: 18px; --radius-xl: 22px; --radius-full: 50%; }
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; }
        html, body { height: 100%; overflow: hidden; background: var(--bg); color: var(--text-primary); }
        .app-container { height: 100%; display: flex; flex-direction: column; position: relative; overflow: hidden; }
        @media (min-width: 480px) { .app-container { max-width: 480px; margin: 0 auto; border-left: 1px solid var(--border); border-right: 1px solid var(--border); } }.header { padding: 10px 16px 8px; display: flex; align-items: center; gap: 12px; flex-shrink: 0; background: var(--bg); border-bottom: 1px solid var(--border); }
        .header-logo { width: 38px; height: 38px; background: linear-gradient(135deg, var(--gradient-blue), #2563EB); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .header-logo i { font-size: 16px; color: #fff; }
        .header-info { flex: 1; min-width: 0; }
        .header-title { font-size: 15px; font-weight: 700; line-height: 1.2; }
        .header-sub { font-size: 11px; color: var(--text-tertiary); margin-top: 1px; }

        .content-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: calc(120px + env(safe-area-inset-bottom, 0px)); }
        .content-scroll::-webkit-scrollbar { display: none; }

        .meetings-list { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
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

        /* RSVP Buttons */
        .rsvp-row { display: flex; gap: 8px; }
        .rsvp-btn { flex: 1; padding: 8px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 700; border: 1.5px solid var(--border); background: var(--surface); color: var(--text-secondary); cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; justify-content: center; gap: 4px; }
        .rsvp-btn:active { transform: scale(0.95); }
        .rsvp-btn.yes.active { border-color: var(--success); color: var(--success); background: rgba(74,222,128,0.08); }
        .rsvp-btn.maybe.active { border-color: var(--warning, #FBBF24); color: var(--warning, #FBBF24); background: rgba(251,191,36,0.08); }
        .rsvp-btn.no.active { border-color: var(--error); color: var(--error); background: rgba(255,107,107,0.08); }
        .rsvp-btn i { font-size: 10px; }
        .rsvp-btn:disabled { opacity: 0.5; }

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
        <PremiumTopBar
          icon="fa-people-group"
          title="Meetings"
          subtitle={userId ? "Join audio meetings with the church" : "Sign in to RSVP and join meetings"}
        />

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
                    {/* Action Buttons Row */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {/* View Agenda Button */}
                      <button
                        onClick={async () => {
                          if (!m.id) return;
                          setAgendaLoading(true);
                          try {
                            const items = await getAgenda(m.id);
                            setAgendaModal({ meetingTitle: m.title, items });
                          } catch {}
                          setAgendaLoading(false);
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "8px 12px", borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border)",
                          background: "var(--surface)", color: "var(--primary)",
                          fontSize: 12, fontWeight: 700, cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {agendaLoading ? (
                          <i className="fas fa-spinner fa-spin" style={{ fontSize: 11 }}></i>
                        ) : (
                          <i className="fas fa-list-check" style={{ fontSize: 11 }}></i>
                        )}
                        Full Agenda
                        {agendaCounts[m.id || ""] !== undefined && agendaCounts[m.id || ""] > 0 && (
                          <span style={{
                            minWidth: 18, height: 18, borderRadius: 9,
                            padding: "0 5px",
                            background: "var(--primary)", color: "#fff",
                            fontSize: 10, fontWeight: 800,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            lineHeight: 1,
                          }}>
                            {agendaCounts[m.id || ""]}
                          </span>
                        )}
                      </button>

                      {/* View Action Items Button */}
                      <button
                        onClick={async () => {
                          if (!m.id) return;
                          setActionLoading(true);
                          try {
                            const items = await getActionItems(m.id);
                            setActionModal({ meetingTitle: m.title, items });
                          } catch {}
                          setActionLoading(false);
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "8px 12px", borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border)",
                          background: "var(--surface)", color: "var(--success)",
                          fontSize: 12, fontWeight: 700, cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {actionLoading ? (
                          <i className="fas fa-spinner fa-spin" style={{ fontSize: 11 }}></i>
                        ) : (
                          <i className="fas fa-check-double" style={{ fontSize: 11 }}></i>
                        )}
                        Action Items
                      </button>
                    </div>

                    {/* RSVP Buttons */}
                    {userId && canJoin && (
                      <div className="rsvp-row">
                        <button
                          className={`rsvp-btn yes ${rsvpStatus[m.id || ""] === "yes" ? "active" : ""}`}
                          onClick={() => handleRSVP(m.id || "", "yes")}
                          disabled={rsvpLoading.has(m.id || "")}
                        >
                          {rsvpLoading.has(m.id || "") && rsvpStatus[m.id || ""] === "yes" ? (
                            <i className="fas fa-spinner fa-spin"></i>
                          ) : (
                            <><i className="fas fa-check"></i> Yes</>
                          )}
                        </button>
                        <button
                          className={`rsvp-btn maybe ${rsvpStatus[m.id || ""] === "maybe" ? "active" : ""}`}
                          onClick={() => handleRSVP(m.id || "", "maybe")}
                          disabled={rsvpLoading.has(m.id || "")}
                        >
                          {rsvpLoading.has(m.id || "") && rsvpStatus[m.id || ""] === "maybe" ? (
                            <i className="fas fa-spinner fa-spin"></i>
                          ) : (
                            <><i className="fas fa-question"></i> Maybe</>
                          )}
                        </button>
                        <button
                          className={`rsvp-btn no ${rsvpStatus[m.id || ""] === "no" ? "active" : ""}`}
                          onClick={() => handleRSVP(m.id || "", "no")}
                          disabled={rsvpLoading.has(m.id || "")}
                        >
                          {rsvpLoading.has(m.id || "") && rsvpStatus[m.id || ""] === "no" ? (
                            <i className="fas fa-spinner fa-spin"></i>
                          ) : (
                            <><i className="fas fa-times"></i> No</>
                          )}
                        </button>
                      </div>
                    )}
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

      {/* ACTION ITEMS MODAL */}
      {actionModal && (
        <>
          <div className="form-overlay" onClick={() => setActionModal(null)}></div>
          <div className="agenda-sheet">
            <div className="form-handle"></div>
            <div className="agenda-sheet-header">
              <div className="agenda-sheet-title">{actionModal.meetingTitle}</div>
              <div className="agenda-sheet-sub">Action Items</div>
            </div>
            <div className="agenda-sheet-body">
              {actionModal.items.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-tertiary)" }}>
                  <i className="fas fa-check-double" style={{ fontSize: 32, opacity: 0.3, marginBottom: 12 }}></i>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>No action items yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>The host hasn't assigned any action items for this meeting.</div>
                </div>
              ) : (
                <>
                  {/* Summary bar */}
                  <div className="agenda-summary">
                    <span>{actionModal.items.length} item{actionModal.items.length !== 1 ? "s" : ""}</span>
                    <span>{actionModal.items.filter((i) => i.status === "completed").length} completed</span>
                    <span>{actionModal.items.filter((i) => i.status !== "completed").length} open</span>
                  </div>

                  <div className="agenda-sheet-list">
                    {actionModal.items.map((item, idx) => {
                      const isOverdue = item.dueDate && item.dueDate < new Date().toISOString().slice(0, 10) && item.status !== "completed";
                      return (
                        <div key={item.id || idx} style={{
                          display: "flex", gap: 12, padding: "12px 0",
                          borderBottom: "1px solid var(--border)",
                          opacity: item.status === "completed" ? 0.5 : 1,
                        }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%",
                            border: `2px solid ${item.status === "completed" ? "var(--success)" : "var(--text-tertiary)"}`,
                            background: item.status === "completed" ? "var(--success)" : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0, marginTop: 2, fontSize: 11, color: "#fff",
                          }}>
                            {item.status === "completed" && <i className="fas fa-check"></i>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 14, fontWeight: 600,
                              textDecoration: item.status === "completed" ? "line-through" : "none",
                            }}>
                              {item.title}
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", fontSize: 12, color: "var(--text-tertiary)" }}>
                              {item.assigneeName && (
                                <span><i className="fas fa-user" style={{ fontSize: 10, marginRight: 3 }}></i>{item.assigneeName}</span>
                              )}
                              {item.dueDate && (
                                <span style={{ color: isOverdue ? "var(--error)" : "var(--text-tertiary)" }}>
                                  <i className="fas fa-calendar" style={{ fontSize: 10, marginRight: 3 }}></i>
                                  {new Date(item.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                              )}
                              <span style={{
                                padding: "1px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                                background: item.priority === "high" ? "rgba(255,107,107,0.12)"
                                  : item.priority === "medium" ? "rgba(232,168,56,0.12)"
                                  : "rgba(107,107,107,0.12)",
                                color: item.priority === "high" ? "var(--error)"
                                  : item.priority === "medium" ? "var(--primary)"
                                  : "var(--text-tertiary)",
                              }}>
                                {item.priority}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <div className="agenda-sheet-footer">
              <button className="agenda-close-btn" onClick={() => setActionModal(null)}>
                <i className="fas fa-xmark"></i> Close
              </button>
            </div>
          </div>

        </>
      )}

      {/* AGENDA MODAL */}
      {agendaModal && (
        <>
          <div className="form-overlay" onClick={() => setAgendaModal(null)}></div>
          <div className="agenda-sheet">
            <div className="form-handle"></div>
            <div className="agenda-sheet-header">
              <div className="agenda-sheet-title">{agendaModal.meetingTitle}</div>
              <div className="agenda-sheet-sub">Meeting Agenda</div>
            </div>
            <div className="agenda-sheet-body">
              {agendaModal.items.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-tertiary)" }}>
                  <i className="fas fa-list-check" style={{ fontSize: 32, opacity: 0.3, marginBottom: 12 }}></i>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>No agenda items yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>The host hasn't added an agenda for this meeting.</div>
                </div>
              ) : (
                <>
                  {/* Summary bar */}
                  <div className="agenda-summary">
                    <span>{agendaModal.items.length} item{agendaModal.items.length !== 1 ? "s" : ""}</span>
                    <span>
                      <i className="fas fa-clock"></i>{' '}
                      {agendaModal.items.reduce((sum, i) => sum + i.duration, 0)} min total
                    </span>
                    <span>
                      {agendaModal.items.filter((i) => i.isCompleted).length} completed
                    </span>
                  </div>

                  <div className="agenda-sheet-list">
                    {agendaModal.items.map((item, idx) => (
                      <div key={item.id || idx} className={`agenda-sheet-item ${item.isCompleted ? "done" : ""}`}>
                        <div className="agenda-item-num-wrap">
                          <div className={`agenda-item-num-circle ${item.isCompleted ? "checked" : ""}`}>
                            {item.isCompleted ? <i className="fas fa-check"></i> : idx + 1}
                          </div>
                          {idx < agendaModal.items.length - 1 && <div className="agenda-item-line"></div>}
                        </div>
                        <div className="agenda-item-content">
                          <div className="agenda-item-content-title">{item.title}</div>
                          <div className="agenda-item-content-meta">
                            <span><i className="fas fa-clock"></i> {item.duration} min</span>
                            {item.assigneeName && (
                              <span><i className="fas fa-user"></i> {item.assigneeName}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="agenda-sheet-footer">
              <button className="agenda-close-btn" onClick={() => setAgendaModal(null)}>
                <i className="fas fa-xmark"></i> Close
              </button>
            </div>
          </div>

          <style>{`
            .form-overlay {
              position: fixed; inset: 0; background: var(--overlay, rgba(0,0,0,0.92));
              z-index: 9000;
            }
            .form-handle {
              width: 40px; height: 5px; background: var(--text-tertiary);
              border-radius: 3px; margin: 12px auto 8px; opacity: 0.5;
            }
            .agenda-sheet {
              position: fixed; bottom: 0; left: 0; right: 0; z-index: 9001;
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
              background: var(--surface-elevated);
              color: var(--text-secondary);
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

            .agenda-sheet-list {
              display: flex; flex-direction: column;
            }
            .agenda-sheet-item {
              display: flex; gap: 12px; min-height: 50px;
              padding-bottom: 4px;
              transition: all 0.2s ease;
            }
            .agenda-sheet-item.done {
              opacity: 0.5;
            }
            .agenda-item-num-wrap {
              display: flex; flex-direction: column;
              align-items: center; width: 28px; flex-shrink: 0;
            }
            .agenda-item-num-circle {
              width: 28px; height: 28px; border-radius: 50%;
              border: 2px solid var(--primary);
              display: flex; align-items: center; justify-content: center;
              font-size: 12px; font-weight: 800; color: var(--primary);
              background: rgba(232,168,56,0.08);
              flex-shrink: 0;
            }
            .agenda-item-num-circle.checked {
              background: var(--success); border-color: var(--success);
              color: #fff; font-size: 11px;
            }
            .agenda-item-line {
              width: 2px; flex: 1; min-height: 20px;
              background: rgba(232,168,56,0.12);
            }
            .agenda-item-content {
              flex: 1; padding-bottom: 16px;
            }
            .agenda-item-content-title {
              font-size: 14px; font-weight: 600;
              padding-top: 4px;
            }
            .agenda-sheet-item.done .agenda-item-content-title {
              text-decoration: line-through;
            }
            .agenda-item-content-meta {
              display: flex; gap: 12px; margin-top: 4px;
              font-size: 12px; color: var(--text-tertiary);
            }
            .agenda-item-content-meta i {
              font-size: 10px; color: var(--primary); margin-right: 2px;
            }
          `}</style>
        </>
      )}
    </>
  );
}
