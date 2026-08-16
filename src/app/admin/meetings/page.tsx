"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AdminBottomNav from "@/components/admin/AdminBottomNav";
import ToastBridge from "@/components/dashboard/ToastBridge";
import { useAppStore } from "@/lib/useAppStore";
import { getMeetings, createMeeting, updateMeeting, deleteMeeting, generateRoomName, getRSVPSummary, getAttendance, getAgenda, addAgendaItem, updateAgendaItem, deleteAgendaItem, getActionItems, createActionItem, completeActionItem, reopenActionItem } from "@/lib/meetings";
import PremiumTopBar from "@/components/shared/PremiumTopBar";
import type { Meeting, AttendanceEntry, AgendaItem, ActionItem } from "@/lib/meetings";
import { hapticSuccess } from "@/lib/haptics";

const statusOptions = [
  { value: "scheduled", label: "Scheduled" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
];

export default function AdminMeetingsPage() {
  const router = useRouter();
  const userDoc = useAppStore((s) => s.userDoc);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [rsvpSummaries, setRsvpSummaries] = useState<Record<string, { yes: number; no: number; maybe: number }>>({});
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const [attendances, setAttendances] = useState<Record<string, AttendanceEntry[]>>({});
  const [attendanceLoading, setAttendanceLoading] = useState<Set<string>>(new Set());

  // Action items state
  const [actionItems, setActionItems] = useState<Record<string, ActionItem[]>>({});
  const [actionItemsLoading, setActionItemsLoading] = useState<Set<string>>(new Set());
  const [expandedActions, setExpandedActions] = useState<string | null>(null);
  const [showNewActionForm, setShowNewActionForm] = useState(false);
  const [newActionTitle, setNewActionTitle] = useState("");
  const [newActionAssignee, setNewActionAssignee] = useState("");
  const [newActionDue, setNewActionDue] = useState("");
  const [newActionPriority, setNewActionPriority] = useState<"low" | "medium" | "high">("medium");

  // Agenda builder state
  const [agendaItems, setAgendaItems] = useState<Omit<AgendaItem, "id" | "meetingId">[]>([]);
  const [newAgendaTitle, setNewAgendaTitle] = useState("");
  const [newAgendaDuration, setNewAgendaDuration] = useState(5);
  const [newAgendaAssignee, setNewAgendaAssignee] = useState("");

  const defaultDate = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    title: "",
    description: "",
    date: defaultDate,
    startTime: "19:00",
    endTime: "20:00",
    maxParticipants: 10,
    status: "scheduled" as Meeting["status"],
  });

  function showToast(title: string, message: string, type: string, duration: number) {
    window.dispatchEvent(new CustomEvent("show-toast", { detail: { title, message, type, duration } }));
  }

  const loadMeetings = useCallback(async () => {
    try {
      const data = await getMeetings();
      setMeetings(data);
    } catch (e) {
      console.error("Failed to load meetings:", e);
      showToast("Error", "Failed to load meetings", "error", 3000);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setTimeout(() => loadMeetings(), 0); }, [loadMeetings]);

  // Load RSVP summaries once meetings are loaded
  useEffect(() => {
    if (meetings.length === 0) return;
    meetings.forEach(async (m) => {
      if (!m.id) return;
      try {
        const summary = await getRSVPSummary(m.id);
        setRsvpSummaries((prev) => ({ ...prev, [m.id!]: summary }));
      } catch {}
    });
  }, [meetings.length]);

  const resetForm = () => {
    setForm({
      title: "",
      description: "",
      date: defaultDate,
      startTime: "19:00",
      endTime: "20:00",
      maxParticipants: 10,
      status: "scheduled",
    });
    setEditId(null);
    setShowCreate(false);
    setAgendaItems([]);
    setNewAgendaTitle("");
    setNewAgendaDuration(5);
    setNewAgendaAssignee("");
  };

  const openEdit = async (m: Meeting) => {
    setForm({
      title: m.title,
      description: m.description,
      date: m.date,
      startTime: m.startTime,
      endTime: m.endTime,
      maxParticipants: m.maxParticipants,
      status: m.status,
    });
    setEditId(m.id || null);
    setShowCreate(true);
    // Load existing agenda
    if (m.id) {
      try {
        const items = await getAgenda(m.id);
        setAgendaItems(items.map((i) => ({
          title: i.title,
          description: i.description,
          duration: i.duration,
          assigneeName: i.assigneeName,
          sortOrder: i.sortOrder,
          isCompleted: i.isCompleted,
        })));
      } catch {
        setAgendaItems([]);
      }
    }
  };

  const addNewAgendaItem = () => {
    if (!newAgendaTitle.trim()) return;
    const maxOrder = agendaItems.reduce((max, item) => Math.max(max, item.sortOrder), 0);
    setAgendaItems((prev) => [
      ...prev,
      {
        title: newAgendaTitle.trim(),
        description: "",
        duration: newAgendaDuration,
        assigneeName: newAgendaAssignee.trim() || undefined,
        sortOrder: maxOrder + 1,
        isCompleted: false,
      },
    ]);
    setNewAgendaTitle("");
    setNewAgendaDuration(5);
    setNewAgendaAssignee("");
  };

  const moveAgendaItem = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === agendaItems.length - 1) return;
    const items = [...agendaItems];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    const temp = items[index].sortOrder;
    items[index] = { ...items[index], sortOrder: items[swapIndex].sortOrder };
    items[swapIndex] = { ...items[swapIndex], sortOrder: temp };
    // Sort by sortOrder
    items.sort((a, b) => a.sortOrder - b.sortOrder);
    setAgendaItems(items);
  };

  const removeAgendaItem = (index: number) => {
    setAgendaItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      showToast("Validation", "Meeting title is required", "error", 2500);
      return;
    }
    if (!form.date || !form.startTime || !form.endTime) {
      showToast("Validation", "Date and time are required", "error", 2500);
      return;
    }

    setActionLoading(true);
    try {
      if (editId) {
        await updateMeeting(editId, {
          title: form.title,
          description: form.description,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          maxParticipants: form.maxParticipants,
          status: form.status,
        });
        // Sync agenda items (delete all, re-add)
        const existing = await getAgenda(editId);
        await Promise.all(existing.map((i) => deleteAgendaItem(editId, i.id!)));
        await Promise.all(agendaItems.map((item) => addAgendaItem(editId, item)));
        showToast("Updated", `"${form.title}" saved`, "success", 2500);
      } else {
        const newId = await createMeeting({
          title: form.title,
          description: form.description,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          roomName: generateRoomName("pending"),
          hostId: userDoc?.uid || "admin",
          hostName: userDoc?.display_name || "Admin",
          status: "scheduled",
          maxParticipants: form.maxParticipants,
        });
        // Update room name with real ID
        await updateMeeting(newId, { roomName: generateRoomName(newId) });
        // Save agenda items
        await Promise.all(agendaItems.map((item) => addAgendaItem(newId, item)));
        showToast("Created", `"${form.title}" meeting created`, "success", 2500);
      }
      await hapticSuccess();
      resetForm();
      await loadMeetings();
    } catch (e) {
      showToast("Error", editId ? "Failed to update meeting" : "Failed to create meeting", "error", 3000);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    setActionLoading(true);
    try {
      await deleteMeeting(id);
      setMeetings((prev) => prev.filter((m) => m.id !== id));
      showToast("Deleted", `"${title}" removed`, "success", 2500);
      await hapticSuccess();
    } catch (e) {
      showToast("Error", "Failed to delete meeting", "error", 3000);
    } finally {
      setActionLoading(false);
      setDeleteConfirm(null);
    }
  };

  const joinMeeting = async (m: Meeting) => {
    if (!m.roomName) {
      showToast("Not Ready", "This meeting room isn't configured yet", "error", 3000);
      return;
    }

    // If scheduled, first set to active
    if (m.status === "scheduled") {
      await updateMeeting(m.id!, { status: "active" });
      setMeetings((prev) => prev.map((x) => x.id === m.id ? { ...x, status: "active" as Meeting["status"] } : x));
    }

    // Navigate to the premium host page
    setJoiningId(m.id || null);
    setTimeout(() => {
      router.push(`/admin/meetings/host?id=${m.id}`);
    }, 300);
  };

  const toggleStatus = async (m: Meeting) => {
    const nextStatus = m.status === "scheduled" ? "active" : m.status === "active" ? "ended" : "scheduled";
    try {
      await updateMeeting(m.id!, { status: nextStatus as Meeting["status"] });
      setMeetings((prev) => prev.map((x) => x.id === m.id ? { ...x, status: nextStatus as Meeting["status"] } : x));
      showToast(
        nextStatus === "active" ? "Meeting Started" : nextStatus === "ended" ? "Meeting Ended" : "Meeting Reset",
        `"${m.title}" is now ${nextStatus}`,
        "success",
        2500
      );
      await hapticSuccess();
    } catch (e) {
      showToast("Error", "Failed to update status", "error", 3000);
    }
  };

  const formatTime = (date: string, startTime: string, endTime: string) => {
    const fmt = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
      return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
    };
    return `${fmt(startTime)} — ${fmt(endTime)}`;
  };

  const isToday = (date: string) => date === new Date().toISOString().slice(0, 10);

  // Compute attendance counts from loaded attendances
  const attendanceCounts: Record<string, number> = {};
  Object.entries(attendances).forEach(([id, list]) => {
    attendanceCounts[id] = list.length;
  });

  const toggleActionItems = async (m: Meeting) => {
    if (!m.id) return;
    if (expandedActions === m.id) {
      setExpandedActions(null);
      return;
    }
    setExpandedActions(m.id);
    if (!actionItems[m.id]) {
      setActionItemsLoading((prev) => new Set(prev).add(m.id!));
      try {
        const data = await getActionItems(m.id);
        setActionItems((prev) => ({ ...prev, [m.id!]: data }));
      } catch {}
      setActionItemsLoading((prev) => { const next = new Set(prev); next.delete(m.id!); return next; });
    }
  };

  const handleCreateAction = async (meetingId: string) => {
    if (!newActionTitle.trim()) return;
    try {
      await createActionItem(meetingId, {
        title: newActionTitle.trim(),
        description: "",
        assigneeName: newActionAssignee.trim() || undefined,
        dueDate: newActionDue || undefined,
        priority: newActionPriority,
        status: "open",
        createdBy: userDoc?.uid || "admin",
        createdByName: userDoc?.display_name || "Admin",
      });
      // Reload action items
      const data = await getActionItems(meetingId);
      setActionItems((prev) => ({ ...prev, [meetingId]: data }));
      setNewActionTitle("");
      setNewActionAssignee("");
      setNewActionDue("");
      setNewActionPriority("medium");
      setShowNewActionForm(false);
      showToast("Created", "Action item added", "success", 2500);
    } catch (e) {
      showToast("Error", "Failed to create action item", "error", 3000);
    }
  };

  const handleToggleActionItem = async (meetingId: string, item: ActionItem) => {
    if (!item.id) return;
    try {
      if (item.status === "completed") {
        await reopenActionItem(meetingId, item.id);
      } else {
        await completeActionItem(meetingId, item.id);
      }
      // Update local state
      setActionItems((prev) => {
        const items = prev[meetingId]?.map((a) =>
          a.id === item.id
            ? { ...a, status: a.status === "completed" ? ("open" as const) : ("completed" as const) }
            : a
        ) || [];
        return { ...prev, [meetingId]: items };
      });
    } catch (e) {
      showToast("Error", "Failed to update action item", "error", 3000);
    }
  };

  const toggleAttendance = async (m: Meeting) => {
    if (!m.id) return;
    if (expandedMeeting === m.id) {
      setExpandedMeeting(null);
      return;
    }
    setExpandedMeeting(m.id);
    if (!attendances[m.id]) {
      setAttendanceLoading((prev) => new Set(prev).add(m.id!));
      try {
        const data = await getAttendance(m.id);
        setAttendances((prev) => ({ ...prev, [m.id!]: data }));
      } catch {}
      setAttendanceLoading((prev) => { const next = new Set(prev); next.delete(m.id!); return next; });
    }
  };

  // Separate meetings into upcoming and past
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = meetings.filter((m) => m.date >= today && m.status !== "ended");
  const past = meetings.filter((m) => m.date < today || m.status === "ended");

  return (
    <>
      <style>{`
        :root { --primary: #E8A838; --primary-light: #F5C76B; --primary-dark: #B98A1F; --bg: #0F0D0A; --surface: #181512; --surface-elevated: #23201B; --surface-card: #1C1915; --surface-hover: #2B2720; --text-primary: #F7F5F0; --text-secondary: #A8A39A; --text-tertiary: #75706A; --border: #2B2720; --error: #F87171; --success: #34D399; --info: #60A5FA; --warning: #FBBF24; --overlay: rgba(0,0,0,0.92); --gradient-start: #E8A838; --gradient-end: #C9771D; --gradient-purple: #A78BFA; --gradient-blue: #60A5FA; --gradient-green: #22C55E; --gradient-red: #EF4444; --shadow-soft: 0 4px 20px rgba(232,168,56,0.16); --shadow-elevated: 0 10px 36px rgba(0,0,0,0.55); --radius-sm: 10px; --radius-md: 14px; --radius-lg: 18px; --radius-xl: 22px; --radius-full: 50%; }
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; }
        html, body { height: 100%; overflow: hidden; background: var(--bg); color: var(--text-primary); }
        .app-container { height: 100%; display: flex; flex-direction: column; position: relative; overflow: hidden; }
        @media (min-width: 480px) { .app-container { max-width: 480px; margin: 0 auto; border-left: 1px solid var(--border); border-right: 1px solid var(--border); } }

        .header { padding: 10px 16px 8px; display: flex; align-items: center; gap: 12px; flex-shrink: 0; background: var(--bg); border-bottom: 1px solid var(--border); }
        .header-logo { width: 38px; height: 38px; background: linear-gradient(135deg, var(--gradient-blue), #2563EB); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 12px rgba(59,130,246,0.2); }
        .header-logo i { font-size: 16px; color: #fff; }
        .header-info { flex: 1; min-width: 0; }
        .header-title { font-size: 15px; font-weight: 700; line-height: 1.2; display: flex; align-items: center; gap: 8px; }
        .header-count { font-size: 12px; color: var(--text-tertiary); font-weight: 500; }

        .content-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; padding-bottom: calc(100px + env(safe-area-inset-bottom, 0px)); }
        .content-scroll::-webkit-scrollbar { display: none; }

        .toolbar { display: flex; align-items: center; gap: 10px; padding: 12px 16px; flex-shrink: 0; background: var(--bg); }
        .create-btn { display: flex; align-items: center; gap: 6px; padding: 10px 16px; background: linear-gradient(135deg, var(--gradient-blue), #2563EB); border: none; border-radius: var(--radius-md); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(59,130,246,0.2); transition: all 0.2s ease; white-space: nowrap; }
        .create-btn:active { transform: scale(0.95); }
        .create-btn i { font-size: 14px; }

        .section-label { font-size: 12px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; padding: 0 16px; margin-bottom: 8px; }

        .meetings-list { padding: 0 16px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
        .meeting-card { background: var(--surface-card); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; transition: all 0.2s ease; }
        .meeting-card:active { transform: scale(0.98); }
        .meeting-card.active { border-color: var(--success); box-shadow: 0 0 0 1px rgba(74,222,128,0.2); }
        .meeting-card.ended { opacity: 0.6; }

        .meeting-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
        .meeting-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .meeting-info { flex: 1; min-width: 0; }
        .meeting-title { font-size: 15px; font-weight: 700; line-height: 1.3; display: flex; align-items: center; gap: 8px; }
        .meeting-title .live-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; background: rgba(74,222,128,0.15); color: var(--success); text-transform: uppercase; letter-spacing: 0.5px; }
        .meeting-title .live-tag i { font-size: 6px; }
        .meeting-desc { font-size: 13px; color: var(--text-secondary); margin-top: 4px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .meeting-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
        .meta-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: var(--surface-elevated); color: var(--text-secondary); }
        .meta-chip i { font-size: 11px; color: var(--primary); }
        .meeting-actions { display: flex; gap: 6px; flex-shrink: 0; align-self: flex-start; }
        .meeting-action-btn { width: 30px; height: 30px; border-radius: 8px; border: none; background: var(--surface); color: var(--text-tertiary); font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease; }
        .meeting-action-btn:active { background: var(--surface-hover); }
        .meeting-action-btn.edit:active { color: var(--primary); }
        .meeting-action-btn.delete:active { color: var(--error); }
        .meeting-action-btn.status { background: rgba(74,222,128,0.1); color: var(--success); }
        .meeting-action-btn.status.end { background: rgba(107,107,107,0.1); color: var(--text-tertiary); }

        .meeting-status-row { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-top: 1px solid var(--border); }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .status-dot.scheduled { background: var(--text-tertiary); }
        .status-dot.active { background: var(--success); animation: livePulse 1.5s ease-in-out infinite; }
        .status-dot.ended { background: var(--error); }
        .status-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
        .status-btn { margin-left: auto; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; border: none; cursor: pointer; transition: all 0.15s ease; }
        .status-btn:active { transform: scale(0.95); }
        .status-btn.go { background: var(--success); color: #fff; }
        .status-btn.end-btn { background: rgba(239,68,68,0.12); color: var(--error); }
        .status-btn.reset { background: var(--surface-elevated); color: var(--text-tertiary); }
        .status-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        @keyframes livePulse { 0%,100% { opacity:1;transform:scale(1); } 50% { opacity:0.4;transform:scale(1.5); } }

        /* RSVP Chip */
        .meta-chip.rsvp-chip { background: rgba(74,222,128,0.08); color: var(--success); }
        .meta-chip.rsvp-chip i { color: var(--success); }
        .status-btn.info-small { margin-left: auto; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; border: none; cursor: pointer; transition: all 0.15s ease; background: var(--surface-elevated); color: var(--text-secondary); }
        .status-btn.info-small:active { transform: scale(0.95); }

        /* Attendance Section */
        .attendance-section { border-top: 1px solid var(--border); padding: 10px 16px 14px; }
        .attendance-header { font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
        .attendance-header i { font-size: 12px; color: var(--primary); }
        .attendance-list { display: flex; flex-direction: column; gap: 6px; }
        .attendance-item { display: flex; align-items: center; gap: 10px; padding: 6px 8px; background: var(--surface); border-radius: 8px; }
        .attendance-avatar { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, var(--gradient-blue), #2563EB); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .attendance-info { flex: 1; min-width: 0; }
        .attendance-name { font-size: 13px; font-weight: 600; }
        .attendance-time { font-size: 11px; color: var(--text-tertiary); }

        .empty-state { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; text-align: center; gap: 10px; }
        .empty-state i { font-size: 40px; color: var(--text-tertiary); opacity: 0.3; }
        .empty-state h3 { font-size: 18px; font-weight: 700; }
        .empty-state p { font-size: 14px; color: var(--text-secondary); max-width: 280px; line-height: 1.5; }

        /* Create/Edit Form */
        .form-sheet { position: fixed; bottom: 0; left: 0; right: 0; z-index: 9001; background: var(--surface); border-radius: 28px 28px 0 0; max-width: 480px; margin: 0 auto; animation: slideUp 0.35s cubic-bezier(0.32,0.72,0,1); max-height: 90vh; display: flex; flex-direction: column; }
        .form-overlay { position: fixed; inset: 0; background: var(--overlay); z-index: 9000; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .form-handle { width: 40px; height: 5px; background: var(--text-tertiary); border-radius: 3px; margin: 12px auto 8px; opacity: 0.5; }
        .form-header { padding: 8px 24px 16px; text-align: center; }
        .form-header h2 { font-size: 20px; font-weight: 700; }
        .form-body { flex: 1; overflow-y: auto; padding: 0 24px 20px; }
        .form-body::-webkit-scrollbar { display: none; }
        .form-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; gap: 12px; }

        .form-group { margin-bottom: 14px; }
        .form-group label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
        .form-input, .form-select { width: 100%; padding: 12px 14px; background: var(--surface-card); border: 1.5px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary); font-size: 14px; outline: none; }
        .form-input:focus, .form-select:focus { border-color: var(--primary); }
        .form-input::placeholder { color: var(--text-tertiary); }
        .form-select { appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='%236B6B6B' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px; }
        .form-textarea { width: 100%; padding: 12px 14px; background: var(--surface-card); border: 1.5px solid var(--border); border-radius: var(--radius-md); color: var(--text-primary); font-size: 14px; outline: none; resize: vertical; min-height: 70px; font-family: inherit; }
        .form-textarea:focus { border-color: var(--primary); }
        .form-row { display: flex; gap: 12px; }
        .form-row .form-group { flex: 1; }
        .form-row-3 { display: flex; gap: 8px; }
        .form-row-3 .form-group { flex: 1; }

        .form-input[type="date"]::-webkit-calendar-picker-indicator,
        .form-input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(0.7); cursor: pointer; }

        .join-btn.status { margin-left: auto; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; border: none; cursor: pointer; transition: all 0.15s ease; display: inline-flex; align-items: center; gap: 4px; }
        .join-btn.status:active { transform: scale(0.95); }
        .join-btn.status { background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end)); color: #fff; }
        .join-btn.status:disabled { opacity: 0.5; cursor: not-allowed; }
        .join-btn.status i { font-size: 10px; }

        /* Agenda Builder */
        .form-section { margin: 16px 0; padding-top: 12px; border-top: 1px solid var(--border); }
        .form-section-title { font-size: 12px; font-weight: 700; color: var(--primary); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
        .form-section-title i { font-size: 12px; }
        .agenda-item-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--surface-card); border-radius: var(--radius-sm); margin-bottom: 6px; border: 1px solid var(--border); }
        .agenda-item-order { display: flex; flex-direction: column; align-items: center; gap: 1px; flex-shrink: 0; }
        .agenda-move-btn { width: 20px; height: 20px; border: none; background: none; color: var(--text-tertiary); cursor: pointer; font-size: 9px; display: flex; align-items: center; justify-content: center; padding: 0; }
        .agenda-move-btn:active { color: var(--primary); }
        .agenda-move-btn:disabled { opacity: 0.2; }
        .agenda-item-num { font-size: 10px; font-weight: 700; color: var(--text-tertiary); }
        .agenda-item-info { flex: 1; min-width: 0; }
        .agenda-item-title { font-size: 13px; font-weight: 600; }
        .agenda-item-meta { display: flex; gap: 8px; margin-top: 2px; font-size: 11px; color: var(--text-tertiary); }
        .agenda-item-meta i { font-size: 10px; margin-right: 3px; color: var(--primary); }
        .agenda-remove-btn { width: 24px; height: 24px; border-radius: 6px; border: none; background: rgba(255,107,107,0.1); color: var(--error); cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .agenda-remove-btn:active { background: rgba(255,107,107,0.2); }
        .agenda-add-row { display: flex; gap: 6px; align-items: flex-start; }
        .agenda-add-input { flex: 1; padding: 8px 10px !important; font-size: 13px !important; }
        .agenda-add-extras { display: flex; gap: 6px; flex-shrink: 0; }
        .agenda-add-field { display: flex; align-items: center; gap: 4px; background: var(--surface-card); border: 1.5px solid var(--border); border-radius: var(--radius-md); padding: 0 8px; }
        .agenda-add-field i { font-size: 11px; color: var(--text-tertiary); }
        .agenda-add-num { width: 36px !important; padding: 8px 4px !important; background: transparent !important; border: none !important; font-size: 13px !important; text-align: center; }
        .agenda-add-unit { font-size: 10px; color: var(--text-tertiary); font-weight: 600; }
        .agenda-add-btn { width: 36px; height: 36px; border-radius: var(--radius-sm); border: none; background: linear-gradient(135deg, var(--gradient-blue), #2563EB); color: #fff; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .agenda-add-btn:active { transform: scale(0.95); }
        .agenda-add-btn:disabled { opacity: 0.4; }

        .btn-primary { flex: 1; padding: 14px; background: linear-gradient(135deg, var(--gradient-blue), #2563EB); border: none; border-radius: var(--radius-md); color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .btn-primary:active { transform: scale(0.97); }
        .btn-primary:disabled { opacity: 0.6; }
        .btn-secondary { flex: 1; padding: 14px; background: var(--surface-elevated); border: none; border-radius: var(--radius-md); color: var(--text-secondary); font-size: 15px; font-weight: 700; cursor: pointer; }
        .btn-secondary:active { transform: scale(0.97); }

        /* Delete Confirm */
        .delete-overlay { position: fixed; inset: 0; background: var(--overlay); z-index: 9500; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .delete-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 24px; max-width: 340px; width: 100%; text-align: center; }
        .delete-card h3 { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
        .delete-card p { font-size: 14px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5; }
        .delete-actions { display: flex; gap: 10px; }
        .delete-confirm { flex: 1; padding: 12px; border-radius: var(--radius-md); background: var(--error); border: none; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; }
        .delete-confirm:active { transform: scale(0.95); }
        .delete-cancel { flex: 1; padding: 12px; border-radius: var(--radius-md); background: var(--surface-elevated); border: none; color: var(--text-secondary); font-size: 14px; font-weight: 700; cursor: pointer; }
        .delete-cancel:active { transform: scale(0.95); }

        /* Skeleton */
        .skeleton-loading { background: linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 50%, var(--surface) 75%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; border-radius: var(--radius-md); }
        .skeleton-line { height: 14px; width: 100%; margin-bottom: 8px; }
        .skeleton-line.w60 { width: 60%; }
        .skeleton-line.w40 { width: 40%; }
        .skeleton-line.w80 { width: 80%; }
        .skeleton-line.h24 { height: 24px; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        /* ========== BOTTOM NAV ========== */
        .bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(15,15,15,0.92); backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); border-top: 1px solid var(--border); padding: 8px 0 calc(8px + env(safe-area-inset-bottom, 0px)); z-index: 1000; display: flex; justify-content: space-around; align-items: center; }
        @media (min-width: 480px) { .bottom-nav { max-width: 480px; margin: 0 auto; } }
        .nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 12px; background: none; border: none; color: var(--text-tertiary); cursor: pointer; transition: all 0.2s ease; position: relative; }
        .nav-item.active { color: var(--primary); }
        .nav-item i { font-size: 20px; transition: transform 0.2s ease; }
        .nav-item:active i { transform: scale(0.85); }
        .nav-item span { font-size: 10px; font-weight: 600; }
        .nav-item .nav-badge { position: absolute; top: 2px; right: 6px; width: 8px; height: 8px; background: var(--error); border-radius: var(--radius-full); border: 2px solid var(--bg); }
      `}</style>

      <ToastBridge />

      <div className="app-container">
        <PremiumTopBar
          icon="fa-people-group"
          title="Meetings"
          subtitle={`${meetings.length} total meetings`}
        />

        {/* TOOLBAR */}
        <div className="toolbar">
          <button className="create-btn" onClick={() => { resetForm(); setShowCreate(true); }}>
            <i className="fas fa-plus"></i> Schedule Meeting
          </button>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div className="content-scroll">
          {loading ? (
            <div style={{ padding: "0 16px" }}>
              {[1,2,3].map((i) => (
                <div key={i} className="meeting-card" style={{ padding: 14, marginBottom: 10 }}>
                  <div className="skeleton-loading skeleton-line w60 h24" style={{ marginBottom: 8 }}></div>
                  <div className="skeleton-loading skeleton-line w80" style={{ marginBottom: 6 }}></div>
                  <div className="skeleton-loading skeleton-line w40"></div>
                </div>
              ))}
            </div>
          ) : meetings.length === 0 ? (
            <div className="empty-state">
              <i className="fas fa-people-group"></i>
              <h3>No Meetings Yet</h3>
              <p>Schedule your first audio meeting for members to join and pray together.</p>
            </div>
          ) : (
            <>
              {/* UPCOMING */}
              {upcoming.length > 0 && (
                <>
                  <div className="section-label" style={{ marginTop: 8 }}>Upcoming ({upcoming.length})</div>
                  <div className="meetings-list">
                    {upcoming.map((m) => (
                      <div key={m.id} className={`meeting-card ${m.status === "active" ? "active" : ""}`}>
                        <div className="meeting-body">
                          <div className="meeting-top">
                            <div className="meeting-info">
                              <div className="meeting-title">
                                {m.title}
                                {m.status === "active" && <span className="live-tag"><i className="fas fa-circle"></i> Live</span>}
                              </div>
                              {m.description && <div className="meeting-desc">{m.description}</div>}
                              <div className="meeting-meta">
                                <span className="meta-chip">
                                  <i className="fas fa-calendar"></i>
                                  {isToday(m.date) ? "Today" : new Date(m.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </span>
                                <span className="meta-chip">
                                  <i className="fas fa-clock"></i>
                                  {formatTime(m.date, m.startTime, m.endTime)}
                                </span>
                                <span className="meta-chip">
                                  <i className="fas fa-users"></i>
                                  {m.maxParticipants} max
                                </span>
                                {/* RSVP Summary */}
                                {rsvpSummaries[m.id || ""] && (
                                  <span className="meta-chip rsvp-chip">
                                    <i className="fas fa-check-circle"></i>
                                    {rsvpSummaries[m.id || ""]!.yes + rsvpSummaries[m.id || ""]!.maybe} ({rsvpSummaries[m.id || ""]!.no})
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="meeting-actions">
                              <button className="meeting-action-btn edit" onClick={() => openEdit(m)} title="Edit"><i className="fas fa-pen"></i></button>
                              <button className="meeting-action-btn delete" onClick={() => setDeleteConfirm(m.id || null)} title="Delete"><i className="fas fa-trash-can"></i></button>
                            </div>
                          </div>
                        </div>
                        <div className="meeting-status-row">
                          <div className={`status-dot ${m.status}`}></div>
                          <span className="status-label">{m.status}</span>
                          {m.status !== "ended" && (
                            <button
                              className="join-btn status"
                              onClick={() => joinMeeting(m)}
                              disabled={joiningId === m.id}
                              title="Join and speak"
                            >
                              {joiningId === m.id ? (
                                <i className="fas fa-spinner fa-spin"></i>
                              ) : m.status === "active" ? (
                                <><i className="fas fa-broadcast-tower"></i> Join</>
                              ) : (
                                <><i className="fas fa-broadcast-tower"></i> Go Live</>
                              )}
                            </button>
                          )}
                          <button
                            className={`status-btn ${m.status === "scheduled" ? "go" : m.status === "active" ? "end-btn" : "reset"}`}
                            onClick={() => toggleStatus(m)}
                            disabled={actionLoading}
                          >
                            {actionLoading ? (
                              <i className="fas fa-spinner fa-spin"></i>
                            ) : m.status === "scheduled" ? (
                              "Start Meeting"
                            ) : m.status === "active" ? (
                              "End Meeting"
                            ) : (
                              "Reset"
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* PAST */}
              {past.length > 0 && (
                <>
                  <div className="section-label" style={{ marginTop: 8 }}>Past ({past.length})</div>
                  <div className="meetings-list">
                    {past.map((m) => (
                      <div key={m.id} className="meeting-card ended">
                        <div className="meeting-body">
                          <div className="meeting-top">
                            <div className="meeting-info">
                              <div className="meeting-title">{m.title}</div>
                              {m.description && <div className="meeting-desc">{m.description}</div>}
                              <div className="meeting-meta">
                                <span className="meta-chip"><i className="fas fa-calendar"></i>{new Date(m.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                <span className="meta-chip"><i className="fas fa-clock"></i>{formatTime(m.date, m.startTime, m.endTime)}</span>
                              </div>
                            </div>
                            <div className="meeting-actions">
                              <button className="meeting-action-btn edit" onClick={() => openEdit(m)} title="Edit"><i className="fas fa-pen"></i></button>
                              <button className="meeting-action-btn delete" onClick={() => setDeleteConfirm(m.id || null)} title="Delete"><i className="fas fa-trash-can"></i></button>
                            </div>
                          </div>
                        </div>
                        <div className="meeting-status-row">
                          <div className="status-dot ended"></div>
                          <span className="status-label">ended</span>
                          <button className="status-btn info-small" onClick={() => toggleAttendance(m)}>
                            {expandedMeeting === m.id ? (
                              <><i className="fas fa-chevron-up"></i> Hide</>
                            ) : (
                              <><i className="fas fa-users"></i> {attendanceCounts[m.id || ""] || "..."}</>
                            )}
                          </button>
                          <button className="status-btn info-small" onClick={() => toggleActionItems(m)}>
                            {expandedActions === m.id ? (
                              <><i className="fas fa-chevron-up"></i> Actions</>
                            ) : (
                              <><i className="fas fa-check-double"></i> {actionItems[m.id || ""]?.filter((a) => a.status !== "completed").length || 0}</>
                            )}
                          </button>
                          <button className="status-btn reset" onClick={() => toggleStatus(m)} disabled={actionLoading}>
                            {actionLoading ? <i className="fas fa-spinner fa-spin"></i> : "Reset"}
                          </button>
                        </div>
                        {/* Attendance section for past meetings */}
                        {expandedMeeting === m.id && (
                          <div className="attendance-section">
                            <div className="attendance-header">
                              <i className="fas fa-user-check"></i> Attendance ({attendanceCounts[m.id || ""] || 0})
                            </div>
                            {attendanceLoading.has(m.id || "") ? (
                              <div style={{ padding: "8px 16px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                                <i className="fas fa-spinner fa-spin"></i> Loading...
                              </div>
                            ) : attendances[m.id || ""]?.length > 0 ? (
                              <div className="attendance-list">
                                {attendances[m.id || ""].map((a) => (
                                  <div className="attendance-item" key={a.id || a.userId}>
                                    <div className="attendance-avatar">{a.userName.charAt(0).toUpperCase()}</div>
                                    <div className="attendance-info">
                                      <div className="attendance-name">{a.userName}</div>
                                      <div className="attendance-time">
                                        {a.leftAt ? "Joined & left" : "Joined"}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ padding: "8px 16px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                                No attendance recorded
                              </div>
                            )}
                          </div>
                        )}

                        {/* Action Items section */}
                        {expandedActions === m.id && (
                          <div className="attendance-section">
                            <div className="attendance-header" style={{ justifyContent: "space-between" }}>
                              <span><i className="fas fa-check-double"></i> Action Items</span>
                              <button
                                onClick={() => setShowNewActionForm(true)}
                                style={{
                                  background: "none", border: "none", color: "var(--primary)",
                                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                                  display: "flex", alignItems: "center", gap: 4,
                                }}
                              >
                                <i className="fas fa-plus"></i> Add
                              </button>
                            </div>

                            {/* New Action Item Form */}
                            {showNewActionForm && (
                              <div style={{ padding: "8px 0", marginBottom: 8, borderBottom: "1px solid var(--border)" }}>
                                <div className="form-group" style={{ marginBottom: 8 }}>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={newActionTitle}
                                    onChange={(e) => setNewActionTitle(e.target.value)}
                                    placeholder="Action item title..."
                                    style={{ padding: "8px 10px", fontSize: 13 }}
                                  />
                                </div>
                                <div className="form-row" style={{ gap: 8 }}>
                                  <div className="form-group" style={{ marginBottom: 8, flex: 1 }}>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={newActionAssignee}
                                      onChange={(e) => setNewActionAssignee(e.target.value)}
                                      placeholder="Assignee"
                                      style={{ padding: "8px 10px", fontSize: 13 }}
                                    />
                                  </div>
                                  <div className="form-group" style={{ marginBottom: 8, flex: 1 }}>
                                    <input
                                      type="date"
                                      className="form-input"
                                      value={newActionDue}
                                      onChange={(e) => setNewActionDue(e.target.value)}
                                      style={{ padding: "8px 10px", fontSize: 13 }}
                                    />
                                  </div>
                                  <div className="form-group" style={{ marginBottom: 8, width: 70 }}>
                                    <select
                                      className="form-select"
                                      value={newActionPriority}
                                      onChange={(e) => setNewActionPriority(e.target.value as any)}
                                      style={{ padding: "8px 6px", fontSize: 12 }}
                                    >
                                      <option value="low">Low</option>
                                      <option value="medium">Med</option>
                                      <option value="high">High</option>
                                    </select>
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                  <button
                                    onClick={() => setShowNewActionForm(false)}
                                    style={{
                                      padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)",
                                      background: "transparent", color: "var(--text-secondary)",
                                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                                    }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleCreateAction(m.id!)}
                                    disabled={!newActionTitle.trim()}
                                    style={{
                                      padding: "6px 12px", borderRadius: 6, border: "none",
                                      background: "linear-gradient(135deg, var(--gradient-blue), #2563EB)",
                                      color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
                                      opacity: !newActionTitle.trim() ? 0.5 : 1,
                                    }}
                                  >
                                    <i className="fas fa-plus"></i> Add
                                  </button>
                                </div>
                              </div>
                            )}

                            {actionItemsLoading.has(m.id || "") ? (
                              <div style={{ padding: "8px 16px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                                <i className="fas fa-spinner fa-spin"></i> Loading...
                              </div>
                            ) : actionItems[m.id || ""]?.length > 0 ? (
                              <div className="attendance-list">
                                {actionItems[m.id || ""].map((item) => (
                                  <div
                                    className="attendance-item"
                                    key={item.id}
                                    onClick={() => handleToggleActionItem(m.id!, item)}
                                    style={{
                                      cursor: "pointer",
                                      opacity: item.status === "completed" ? 0.5 : 1,
                                      textDecoration: item.status === "completed" ? "line-through" : "none",
                                    }}
                                  >
                                    <div style={{
                                      width: 22, height: 22, borderRadius: "50%",
                                      border: `2px solid ${item.status === "completed" ? "var(--success)" : "var(--text-tertiary)"}`,
                                      background: item.status === "completed" ? "var(--success)" : "transparent",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      flexShrink: 0, fontSize: 10, color: "#fff",
                                    }}>
                                      {item.status === "completed" && <i className="fas fa-check"></i>}
                                    </div>
                                    <div className="attendance-info">
                                      <div className="attendance-name">{item.title}</div>
                                      <div className="attendance-time" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                        {item.assigneeName && (
                                          <span><i className="fas fa-user"></i> {item.assigneeName}</span>
                                        )}
                                        {item.dueDate && (
                                          <span style={{
                                            color: item.dueDate < new Date().toISOString().slice(0, 10) && item.status !== "completed"
                                              ? "var(--error)" : "var(--text-tertiary)"
                                          }}>
                                            <i className="fas fa-calendar"></i>{' '}
                                            {new Date(item.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                          </span>
                                        )}
                                        <span style={{
                                          padding: "1px 6px", borderRadius: 4, fontSize: 10,
                                          fontWeight: 700,
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
                                ))}
                              </div>
                            ) : (
                              <div style={{ padding: "8px 16px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 12 }}>
                                No action items yet. Tap "Add" to create one.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={{ height: 40 }}></div>
            </>
          )}
        </div>

        <AdminBottomNav />
      </div>

      {/* CREATE/EDIT FORM MODAL */}
      {showCreate && (
        <>
          <div className="form-overlay" onClick={resetForm}></div>
          <div className="form-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="form-handle"></div>
            <div className="form-header"><h2>{editId ? "Edit Meeting" : "Schedule Meeting"}</h2></div>
            <div className="form-body">
              <div className="form-group"><label>Title</label><input type="text" className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Sunday Prayer Meeting" /></div>
              <div className="form-group"><label>Description</label><textarea className="form-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe what this meeting is about..." /></div>
              <div className="form-row">
                <div className="form-group"><label>Date</label><input type="date" className="form-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                <div className="form-group"><label>Max Participants</label><input type="number" className="form-input" value={form.maxParticipants} onChange={(e) => setForm({ ...form, maxParticipants: parseInt(e.target.value) || 1 })} min="1" max="100" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Start Time</label><input type="time" className="form-input" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
                <div className="form-group"><label>End Time</label><input type="time" className="form-input" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
              </div>
              {editId && (
                <div className="form-group"><label>Status</label><select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Meeting["status"] })}>{statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
              )}

              {/* AGENDA BUILDER */}
              <div className="form-section">
                <div className="form-section-title"><i className="fas fa-list-check"></i> Agenda Items</div>

                {agendaItems.map((item, i) => (
                  <div className="agenda-item-row" key={i}>
                    <div className="agenda-item-order">
                      <button className="agenda-move-btn" onClick={() => moveAgendaItem(i, "up")} disabled={i === 0}><i className="fas fa-chevron-up"></i></button>
                      <span className="agenda-item-num">{i + 1}</span>
                      <button className="agenda-move-btn" onClick={() => moveAgendaItem(i, "down")} disabled={i === agendaItems.length - 1}><i className="fas fa-chevron-down"></i></button>
                    </div>
                    <div className="agenda-item-info">
                      <div className="agenda-item-title">{item.title}</div>
                      <div className="agenda-item-meta">
                        <span><i className="fas fa-clock"></i> {item.duration} min</span>
                        {item.assigneeName && <span><i className="fas fa-user"></i> {item.assigneeName}</span>}
                      </div>
                    </div>
                    <button className="agenda-remove-btn" onClick={() => removeAgendaItem(i)}><i className="fas fa-xmark"></i></button>
                  </div>
                ))}

                <div className="agenda-add-row">
                  <input
                    type="text"
                    className="form-input agenda-add-input"
                    value={newAgendaTitle}
                    onChange={(e) => setNewAgendaTitle(e.target.value)}
                    placeholder="Item title..."
                    onKeyDown={(e) => e.key === "Enter" && addNewAgendaItem()}
                  />
                  <div className="agenda-add-extras">
                    <div className="agenda-add-field">
                      <i className="fas fa-clock"></i>
                      <input
                        type="number"
                        className="form-input agenda-add-num"
                        value={newAgendaDuration}
                        onChange={(e) => setNewAgendaDuration(parseInt(e.target.value) || 1)}
                        min="1"
                        max="120"
                      />
                      <span className="agenda-add-unit">min</span>
                    </div>
                    <div className="agenda-add-field">
                      <i className="fas fa-user"></i>
                      <input
                        type="text"
                        className="form-input agenda-add-input"
                        value={newAgendaAssignee}
                        onChange={(e) => setNewAgendaAssignee(e.target.value)}
                        placeholder="Assignee (opt)"
                      />
                    </div>
                  </div>
                  <button className="agenda-add-btn" onClick={addNewAgendaItem} disabled={!newAgendaTitle.trim()}>
                    <i className="fas fa-plus"></i>
                  </button>
                </div>
              </div>
            <div className="form-footer">
              <button className="btn-secondary" onClick={resetForm}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={actionLoading}>
                {actionLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}
                {editId ? "Save Changes" : "Create Meeting"}
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* DELETE CONFIRM */}
      {deleteConfirm && (
        <div className="delete-overlay">
          <div className="delete-card">
            <h3>Delete Meeting?</h3>
            <p>This will permanently remove this meeting. Members will no longer be able to join.</p>
            <div className="delete-actions">
              <button className="delete-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="delete-confirm" onClick={() => {
                const m = meetings.find((x) => x.id === deleteConfirm);
                if (m) handleDelete(deleteConfirm, m.title);
              }} disabled={actionLoading}>
                {actionLoading ? <i className="fas fa-spinner fa-spin"></i> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
