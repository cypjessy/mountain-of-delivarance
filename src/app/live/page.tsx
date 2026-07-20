"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  doc, onSnapshot, Timestamp,
  collection, addDoc, query, orderBy, limit, serverTimestamp,
} from "firebase/firestore";
import { type LiveStatus } from "@/lib/youtube";
import {
  saveUserNote, getUserNote, getAllUserNotes, deleteUserNote,
} from "@/lib/youtube";
import ToastBridge from "@/components/dashboard/ToastBridge";

/* ─── Types ────────────────────────────────────────────────── */

type TabId = "notes" | "chat" | "prayer";

interface ChatMessage {
  id: string; userId: string; userName: string; message: string; timestamp: Date;
}

interface PrayerEntry {
  id: string; name: string; request: string; createdAt: Date;
  replyText?: string; repliedBy?: string; repliedAt?: Date;
}

interface TvNote { videoId: string; videoTitle: string; content: string; updatedAt?: any; }

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "notes", label: "Notes", icon: "fa-book-bible" },
  { id: "chat", label: "Chat", icon: "fa-comment" },
  { id: "prayer", label: "Prayer", icon: "fa-hands-praying" },
];

/* ─── Component ────────────────────────────────────────────── */

export default function LivePage() {
  const router = useRouter();

  // ─── Live status ───
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "tv_live_status", "main"), (snap: any) => {
      if (snap.exists()) {
        const d = snap.data();
        setLiveStatus({
          isLive: d.isLive || false,
          liveVideoId: d.liveVideoId || null,
          liveTitle: d.liveTitle || null,
          startedBy: d.startedBy || null,
          startedAt: d.startedAt?.toDate?.() || null,
        } as LiveStatus);
      } else {
        setLiveStatus({ isLive: false, liveVideoId: null, liveTitle: null, startedBy: null, startedAt: null });
      }
      setLiveLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!liveLoading && (!liveStatus?.isLive || !liveStatus?.liveVideoId)) {
      router.push("/dashboard");
    }
  }, [liveLoading, liveStatus?.isLive, liveStatus?.liveVideoId, router]);

  // ─── Tabs ───
  const [activeTab, setActiveTab] = useState<TabId>("notes");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const switchTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setDrawerOpen(true);
  }, []);

  // ─── User info ───
  const [userName, setUserName] = useState("");
  useEffect(() => {
    const u = auth.currentUser;
    if (u?.displayName) setUserName(u.displayName);
    else if (u?.email) setUserName(u.email.split("@")[0]);
    else setUserName("Guest");
  }, []);

  // ─── Orientation ───
  const [isLandscape, setIsLandscape] = useState(false);
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const toggleOrientation = useCallback(async () => {
    try {
      const { ScreenOrientation } = await import("@capacitor/screen-orientation");
      await ScreenOrientation.lock({ orientation: isLandscape ? "portrait" : "landscape" } as any);
    } catch {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
      } catch {}
    }
  }, [isLandscape]);

  // ─── Drawer drag ───
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const [drawerHeight, setDrawerHeight] = useState<number | null>(null);

  const handleDragStart = useCallback((clientY: number) => {
    dragStartY.current = clientY;
    dragStartHeight.current = drawerRef.current?.offsetHeight || 300;
  }, []);

  const handleDragMove = useCallback((clientY: number) => {
    const diff = dragStartY.current - clientY;
    const newH = Math.min(Math.max(dragStartHeight.current + diff, 80), window.innerHeight - 120);
    setDrawerHeight(newH);
  }, []);

  const handleDragEnd = useCallback(() => {
    const h = drawerHeight || drawerRef.current?.offsetHeight || 300;
    if (h < 150) { setDrawerOpen(false); setDrawerHeight(null); }
    else setDrawerHeight(null); // snap to auto
  }, [drawerHeight]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    handleDragStart(e.clientY);
    const onMove = (ev: PointerEvent) => handleDragMove(ev.clientY);
    const onUp = () => { handleDragEnd(); document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [handleDragStart, handleDragMove, handleDragEnd]);

  const toggleDrawer = useCallback(() => {
    setDrawerOpen((o) => !o);
    setDrawerHeight(null);
  }, []);

  // ─── Chat ───
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const chatBuf = useRef<ChatMessage[]>([]);

  useEffect(() => {
    if (activeTab !== "chat") return;
    const q = query(collection(db, "tv_chat"), orderBy("timestamp", "desc"), limit(100));
    chatBuf.current = [];
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((c) => {
        if (c.type === "removed") { chatBuf.current = chatBuf.current.filter((m) => m.id !== c.doc.id); return; }
        const d = c.doc.data();
        const msg: ChatMessage = {
          id: c.doc.id, userId: d.userId || "", userName: d.userName || "Anonymous",
          message: d.message || "", timestamp: (d.timestamp as Timestamp)?.toDate() || new Date(),
        };
        if (c.type === "added") chatBuf.current = [msg, ...chatBuf.current];
        else if (c.type === "modified") chatBuf.current = chatBuf.current.map((m) => m.id === c.doc.id ? msg : m);
      });
      setMessages(chatBuf.current);
    });
    return () => { unsub(); chatBuf.current = []; };
  }, [activeTab]);

  useEffect(() => { if (autoScroll && chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [messages, autoScroll]);

  const handleChatScroll = useCallback(() => {
    if (!chatListRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatListRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 60);
  }, []);

  const handleSendChat = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatSending(true);
    try {
      await addDoc(collection(db, "tv_chat"), {
        userId: auth.currentUser?.uid || "anonymous", userName, message: msg, timestamp: serverTimestamp(),
      });
      setChatInput(""); setAutoScroll(true);
    } catch {}
    setChatSending(false);
  }, [chatInput, userName]);

  const handleChatKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); }
  }, [handleSendChat]);

  // ─── Prayer ───
  const [prayerName, setPrayerName] = useState("");
  const [prayerRequest, setPrayerRequest] = useState("");
  const [prayers, setPrayers] = useState<PrayerEntry[]>([]);
  const [prayerSending, setPrayerSending] = useState(false);
  const prayerBuf = useRef<PrayerEntry[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || activeTab !== "prayer") return;
    const q = query(collection(db, "users", uid, "tv_prayers"), orderBy("createdAt", "desc"), limit(50));
    prayerBuf.current = [];
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((c) => {
        if (c.type === "removed") { prayerBuf.current = prayerBuf.current.filter((p) => p.id !== c.doc.id); return; }
        const d = c.doc.data();
        const entry: PrayerEntry = {
          id: c.doc.id, name: d.name || "Anonymous", request: d.request || "",
          createdAt: (d.createdAt as Timestamp)?.toDate() || new Date(),
          replyText: d.replyText || undefined, repliedBy: d.repliedBy || undefined,
          repliedAt: d.repliedAt ? (d.repliedAt as Timestamp)?.toDate() : undefined,
        };
        if (c.type === "added") prayerBuf.current = [entry, ...prayerBuf.current];
        else if (c.type === "modified") prayerBuf.current = prayerBuf.current.map((p) => p.id === c.doc.id ? entry : p);
      });
      setPrayers(prayerBuf.current);
    });
    return () => { unsub(); prayerBuf.current = []; };
  }, [activeTab]);

  const handleSendPrayer = useCallback(async () => {
    const req = prayerRequest.trim();
    const uid = auth.currentUser?.uid;
    if (!req || !uid) return;
    setPrayerSending(true);
    try {
      await addDoc(collection(db, "users", uid, "tv_prayers"), {
        userId: uid, name: prayerName.trim() || userName, request: req, createdAt: serverTimestamp(),
      });
      setPrayerRequest("");
    } catch {}
    setPrayerSending(false);
  }, [prayerRequest, prayerName, userName]);

  // ─── Notes ───
  const liveVideoId = liveStatus?.liveVideoId || "live";
  const [noteContent, setNoteContent] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteLastSaved, setNoteLastSaved] = useState<Date | null>(null);
  const notesLoadedRef = useRef(false);
  const noteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteChangedRef = useRef(false);

  const [allNotes, setAllNotes] = useState<TvNote[]>([]);
  const [allNotesLoading, setAllNotesLoading] = useState(false);

  const [notesSubTab, setNotesSubTab] = useState<"write" | "saved">("write");
  const [selectedNote, setSelectedNote] = useState<TvNote | null>(null);
  const [noteSavingExplicit, setNoteSavingExplicit] = useState(false);
  const [notesSearch, setNotesSearch] = useState("");
  const [notesPreview, setNotesPreview] = useState(false);

  useEffect(() => {
    if (!auth.currentUser?.uid || activeTab !== "notes") return;
    notesLoadedRef.current = false;
    const uid = auth.currentUser.uid;
    (async () => {
      try {
        const draft = localStorage.getItem(`live_draft_${uid}`);
        if (draft !== null) setNoteContent(draft);
        else { const s = await getUserNote(uid, liveVideoId); setNoteContent(s?.content || ""); }
      } catch { setNoteContent(""); }
      notesLoadedRef.current = true;
    })();
  }, [activeTab, liveVideoId]);

  useEffect(() => {
    if (!auth.currentUser?.uid) return;
    try { localStorage.setItem(`live_draft_${auth.currentUser.uid}`, noteContent); } catch {}
  }, [noteContent]);

  useEffect(() => {
    if (!notesLoadedRef.current || !auth.currentUser?.uid || !noteChangedRef.current) return;
    noteChangedRef.current = false;
    const uid = auth.currentUser.uid;
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(async () => {
      setNoteSaving(true);
      try {
        await saveUserNote(uid, liveVideoId, liveStatus?.liveTitle || "Live Stream", noteContent);
        setNoteLastSaved(new Date());
      } catch {}
      setNoteSaving(false);
    }, 800);
    return () => { if (noteTimerRef.current) clearTimeout(noteTimerRef.current); };
  }, [noteContent, liveVideoId, liveStatus?.liveTitle]);

  const handleNoteChange = useCallback((v: string) => { noteChangedRef.current = true; setNoteContent(v); }, []);

  const handleExplicitSave = useCallback(async () => {
    if (!auth.currentUser?.uid || !noteContent.trim()) return;
    const uid = auth.currentUser.uid;
    setNoteSavingExplicit(true);
    try {
      await saveUserNote(uid, liveVideoId, liveStatus?.liveTitle || "Live Stream", noteContent);
      setNoteLastSaved(new Date());
      noteChangedRef.current = false;
      localStorage.removeItem(`live_draft_${uid}`);
      getAllUserNotes(uid).then(setAllNotes).catch(() => {});
    } catch {}
    setNoteSavingExplicit(false);
  }, [noteContent, liveVideoId, liveStatus?.liveTitle]);

  useEffect(() => {
    const saveNow = async () => {
      if (!auth.currentUser?.uid || !noteChangedRef.current) return;
      try {
        await saveUserNote(auth.currentUser.uid, liveVideoId, liveStatus?.liveTitle || "Live Stream", noteContent);
        setNoteLastSaved(new Date());
        noteChangedRef.current = false;
      } catch {}
    };
    const onVis = () => { if (document.visibilityState === "hidden") saveNow(); };
    window.addEventListener("beforeunload", saveNow);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("beforeunload", saveNow); document.removeEventListener("visibilitychange", onVis); saveNow(); };
  }, [noteContent, liveVideoId, liveStatus?.liveTitle]);

  useEffect(() => {
    if (activeTab !== "notes" || !auth.currentUser?.uid) return;
    setAllNotesLoading(true);
    getAllUserNotes(auth.currentUser.uid).then(setAllNotes).catch(() => {}).finally(() => setAllNotesLoading(false));
  }, [activeTab]);

  // ─── Note formatting ───
  const insertFormatting = useCallback((before: string, after: string) => {
    const ta = document.getElementById("live-note-ta") as HTMLTextAreaElement | null;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = noteContent.substring(start, end);
    setNoteContent(noteContent.substring(0, start) + before + sel + after + noteContent.substring(end));
    noteChangedRef.current = true;
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + before.length, start + before.length + sel.length); });
  }, [noteContent]);

  const hBold = useCallback(() => insertFormatting("**", "**"), [insertFormatting]);
  const hItalic = useCallback(() => insertFormatting("*", "*"), [insertFormatting]);
  const hHeading = useCallback(() => insertFormatting("\n## ", ""), [insertFormatting]);
  const hBullet = useCallback(() => insertFormatting("\n- ", ""), [insertFormatting]);
  const hNumbered = useCallback(() => insertFormatting("\n1. ", ""), [insertFormatting]);
  const hLink = useCallback(() => {
    const ta = document.getElementById("live-note-ta") as HTMLTextAreaElement | null;
    if (!ta) return;
    if (noteContent.substring(ta.selectionStart, ta.selectionEnd)) insertFormatting("[", "](url)");
    else insertFormatting("[link text]", "(url)");
  }, [insertFormatting, noteContent]);

  const renderNoteContent = useCallback((content: string) => {
    let html = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/^### (.+)$/gm, '<h4 class="md-h4">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.+?)`/g, '<code class="md-code">$1</code>');
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>');
    const lines = html.split("\n");
    let res = "", inUl = false, inOl = false;
    for (const line of lines) {
      const ulM = line.match(/^\s*[-*]\s+(.+)/);
      const olM = line.match(/^\s*\d+\.\s+(.+)/);
      if (ulM) {
        if (!inUl) { if (inOl) { res += "</ol>\n"; inOl = false; } res += "<ul class='md-ul'>\n"; inUl = true; }
        res += `<li>${ulM[1]}</li>\n`;
      } else if (olM) {
        if (!inOl) { if (inUl) { res += "</ul>\n"; inUl = false; } res += "<ol class='md-ol'>\n"; inOl = true; }
        res += `<li>${olM[1]}</li>\n`;
      } else {
        if (inUl) { res += "</ul>\n"; inUl = false; }
        if (inOl) { res += "</ol>\n"; inOl = false; }
        res += line.trim() === "" ? "<br />\n" : `<p>${line}</p>\n`;
      }
    }
    if (inUl) res += "</ul>\n"; if (inOl) res += "</ol>\n";
    return res;
  }, []);

  const handleExportNotes = useCallback(() => {
    if (allNotes.length === 0) return;
    const lines: string[] = ["# Live Stream Notes Export", "", `Exported: ${new Date().toLocaleDateString()}`, `Total: ${allNotes.length}`, "", "---", ""];
    for (const n of [...allNotes].sort((a, b) => (a.videoTitle || "").localeCompare(b.videoTitle || ""))) {
      lines.push(`## ${n.videoTitle || "Untitled"}`);
      if (n.updatedAt) lines.push(`*Last edited: ${new Date(n.updatedAt as any).toLocaleDateString()}*`);
      lines.push("", n.content || "*(no content)*", "", "---", "");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `live-notes-${new Date().toISOString().split("T")[0]}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [allNotes]);

  // ─── Loading ───
  if (liveLoading) {
    return (
      <div className="ls">
        <div className="ls-inner">
          <i className="fas fa-tv ls-icon"></i>
          <p>Loading Live TV...</p>
        </div>
        <style>{`.ls{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000;z-index:9999}.ls-inner{text-align:center}.ls-icon{font-size:32px;color:#fff;margin-bottom:10px;opacity:.5}.ls p{font-size:13px;color:rgba(255,255,255,.4)}`}</style>
      </div>
    );
  }

  if (!liveStatus?.isLive || !liveStatus?.liveVideoId) {
    return (
      <div className="ls">
        <div className="ls-inner">
          <i className="fas fa-video-slash ls-icon" style={{ opacity: .3 }}></i>
          <p>Off Air</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.4)", margin: "6px auto", maxWidth: 260 }}>No live stream active.</p>
          <button onClick={() => router.push("/dashboard")} className="ls-btn">Back</button>
        </div>
        <style>{`.ls{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000;z-index:9999}.ls-inner{text-align:center}.ls-icon{font-size:32px;margin-bottom:10px}.ls p{font-size:13px;color:rgba(255,255,255,.5)}.ls-btn{margin-top:14px;padding:10px 20px;border-radius:10px;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:13px;font-weight:600;cursor:pointer}`}</style>
      </div>
    );
  }

  const liveTitle = liveStatus?.liveTitle || "Live Stream";

  return (
    <div className="lv">
      <ToastBridge />

      {/* ─── Full-screen YouTube background ─── */}
      <div className="lv-bg">
        <iframe
          src={`https://www.youtube.com/embed/${liveStatus.liveVideoId}?autoplay=1&mute=1&controls=1&rel=0&showinfo=0`}
          className="lv-frame"
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
        />
      </div>

      {/* ─── Top bar (overlaid on video) ─── */}
      <div className="lv-top">
        <button className="lv-back" onClick={() => router.push("/dashboard")}>
          <i className="fas fa-chevron-left"></i>
        </button>
        <div className="lv-info">
          <div className="lv-name">Live TV</div>
          <div className="lv-title">{liveTitle}</div>
        </div>
        <div className="lv-actions">
          <div className="lv-badge"><span className="lv-dot"></span> LIVE</div>
          <button className="lv-orient" onClick={toggleOrientation}>
            <i className={`fas fa-${isLandscape ? "compress" : "expand"}`}></i>
          </button>
        </div>
      </div>

      {/* ─── Tab bar (overlaid) ─── */}
      <div className="lv-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`lv-tab ${activeTab === t.id ? "active" : ""}`} onClick={() => switchTab(t.id)}>
            <i className={`fas ${t.icon}`}></i>
            <span>{t.label}</span>
          </button>
        ))}
        <button className="lv-tab" onClick={toggleDrawer}>
          <i className={`fas fa-${drawerOpen ? "chevron-down" : "chevron-up"}`}></i>
          <span>{drawerOpen ? "Close" : "Open"}</span>
        </button>
      </div>

      {/* ─── Drawer ─── */}
      <div
        ref={drawerRef}
        className="lv-drawer"
        style={drawerHeight ? { height: drawerHeight } : drawerOpen ? { height: "45vh" } : { height: 0 }}
      >
        {/* Drag handle */}
        <div className="lv-drag" onPointerDown={onPointerDown}>
          <div className="lv-drag-bar"></div>
        </div>

        {/* Tab content */}
        <div className="lv-body">
          {activeTab === "chat" && (
            <div className="lv-pane">
              <div className="lv-chat-msgs" ref={chatListRef} onScroll={handleChatScroll}>
                {messages.length === 0 ? (
                  <div className="lv-empty"><i className="fas fa-comment-dots"></i><span>No messages yet.</span></div>
                ) : messages.map((m) => (
                  <div key={m.id} className={`lv-msg ${m.userId === auth.currentUser?.uid ? "own" : ""}`}>
                    <div className="lv-msg-head">
                      <span className="lv-msg-name">{m.userName}</span>
                      <span className="lv-msg-time">{m.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="lv-msg-text">{m.message}</div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="lv-chat-bar">
                <input className="lv-ci" type="text" placeholder="Message..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={handleChatKey} maxLength={500} />
                <button className="lv-cs" onClick={handleSendChat} disabled={chatSending || !chatInput.trim()}>
                  {chatSending ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                </button>
              </div>
            </div>
          )}

          {activeTab === "prayer" && (
            <div className="lv-pane">
              <div className="lv-prayer-in">
                <i className="fas fa-hands-praying"></i>
                <p>Share your prayer requests.</p>
              </div>
              <div className="lv-prayer-fm">
                <input className="lv-in" type="text" placeholder="Your name (optional)" value={prayerName} onChange={(e) => setPrayerName(e.target.value)} maxLength={60} />
                <textarea className="lv-ta" placeholder="Share your prayer request..." value={prayerRequest} onChange={(e) => setPrayerRequest(e.target.value)} maxLength={500} rows={3} />
                <button className="lv-pb" onClick={handleSendPrayer} disabled={prayerSending || !prayerRequest.trim()}>
                  {prayerSending ? <><i className="fas fa-spinner fa-spin"></i> Sending...</> : <><i className="fas fa-pray"></i> Send Prayer Request</>}
                </button>
              </div>
              {prayers.length > 0 && (
                <>
                  <div className="lv-st"><i className="fas fa-list"></i> Prayer Requests ({prayers.length})</div>
                  <div className="lv-prayer-list">
                    {prayers.map((p) => (
                      <div key={p.id} className="lv-pi">
                        <div className="lv-pi-head"><i className="fas fa-user"></i> {p.name}<span className="lv-pi-date">{p.createdAt.toLocaleDateString([], { month: "short", day: "numeric" })}</span></div>
                        <div className="lv-pi-text">{p.request}</div>
                        {p.replyText && (
                          <div className="lv-pr">
                            <div className="lv-pr-head"><i className="fas fa-reply"></i> {p.repliedBy || "Admin"}</div>
                            <div className="lv-pr-text">{p.replyText}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "notes" && (
            <div className="lv-pane">
              <div className="lv-ns">
                <button className={`lv-nsub ${notesSubTab === "write" ? "active" : ""}`} onClick={() => setNotesSubTab("write")}><i className="fas fa-pen"></i> Write</button>
                <button className={`lv-nsub ${notesSubTab === "saved" ? "active" : ""}`} onClick={() => setNotesSubTab("saved")}><i className="fas fa-bookmark"></i> Saved ({allNotes.length})</button>
              </div>

              {notesSubTab === "write" && (
                <>
                  <div className="lv-nc"><span className="lv-nc-label">Now Streaming</span><span className="lv-nc-title">{liveTitle}</span></div>
                  <div className="lv-ntb">
                    <div className="lv-ntb-l">
                      <button className="lv-tbb" onClick={hBold}><i className="fas fa-bold"></i></button>
                      <button className="lv-tbb" onClick={hItalic}><i className="fas fa-italic"></i></button>
                      <button className="lv-tbb" onClick={hHeading}><i className="fas fa-heading"></i></button>
                      <span className="lv-tbs"></span>
                      <button className="lv-tbb" onClick={hBullet}><i className="fas fa-list-ul"></i></button>
                      <button className="lv-tbb" onClick={hNumbered}><i className="fas fa-list-ol"></i></button>
                      <span className="lv-tbs"></span>
                      <button className="lv-tbb" onClick={hLink}><i className="fas fa-link"></i></button>
                    </div>
                    <div className="lv-ntb-r">
                      {noteSaving && <span className="lv-nspin"><i className="fas fa-spinner fa-spin"></i></span>}
                      <button className={`lv-tbb ${notesPreview ? "active" : ""}`} onClick={() => setNotesPreview((p) => !p)}><i className={`fas fa-${notesPreview ? "edit" : "eye"}`}></i></button>
                      <button className="lv-tbb" onClick={handleExplicitSave} disabled={noteSavingExplicit || !noteContent.trim()}><i className="fas fa-save"></i></button>
                    </div>
                  </div>
                  {notesPreview ? (
                    <div className="lv-np" dangerouslySetInnerHTML={{ __html: noteContent.trim() ? renderNoteContent(noteContent) : '<p style="color:rgba(255,255,255,.3);font-style:italic">No notes yet.</p>' }} />
                  ) : (
                    <textarea id="live-note-ta" className="lv-nta" placeholder="Write your notes here..." value={noteContent} onChange={(e) => handleNoteChange(e.target.value)} rows={6} />
                  )}
                  <div className="lv-nst">
                    {noteSaving ? <><i className="fas fa-spinner fa-spin"></i> Saving...</> : noteLastSaved ? <><i className="fas fa-check-circle"></i> Saved {noteLastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</> : <><i className="fas fa-save"></i> Auto-saving</>}
                  </div>
                  <button className="lv-nsb" onClick={handleExplicitSave} disabled={noteSavingExplicit || !noteContent.trim()}>
                    {noteSavingExplicit ? <><i className="fas fa-spinner fa-spin"></i> Saving...</> : <><i className="fas fa-save"></i> Save to Library</>}
                  </button>
                </>
              )}

              {notesSubTab === "saved" && (
                <div className="lv-nsv">
                  <div className="lv-nsv-h"><i className="fas fa-bookmark"></i> My Notes Library
                    <button className="lv-ne" onClick={handleExportNotes} disabled={allNotes.length === 0}><i className="fas fa-download"></i></button>
                  </div>
                  <div className="lv-nsw">
                    <i className="fas fa-search lv-ssi"></i>
                    <input className="lv-ss" placeholder="Search notes..." value={notesSearch} onChange={(e) => setNotesSearch(e.target.value)} />
                    {notesSearch && <button className="lv-ssc" onClick={() => setNotesSearch("")}><i className="fas fa-times"></i></button>}
                  </div>
                  {(() => {
                    const filtered = notesSearch ? allNotes.filter((n) => n.videoTitle?.toLowerCase().includes(notesSearch.toLowerCase())) : allNotes;
                    if (filtered.length === 0) return <div className="lv-empty"><i className="fas fa-search"></i><span>{allNotesLoading ? "Loading..." : notesSearch ? `No matches` : "No saved notes."}</span></div>;
                    return (
                      <div className="lv-nl">
                        {filtered.map((n) => (
                          <div key={n.videoId} className="lv-ncrd" onClick={() => setSelectedNote(n)}>
                            <div className="lv-ncrd-t"><span className="lv-ncrd-title">{n.videoTitle || "Untitled"}</span>{n.updatedAt && <span className="lv-ncrd-date">{new Date(n.updatedAt as any).toLocaleDateString([], { month: "short", day: "numeric" })}</span>}</div>
                            <div className="lv-ncrd-p">{n.content?.substring(0, 120)}{n.content?.length > 120 ? "..." : ""}</div>
                            <div className="lv-ncrd-a">
                              <button className="lv-ncrd-open" onClick={(e) => { e.stopPropagation(); setSelectedNote(n); }}><i className="fas fa-book-open"></i> Read</button>
                              <button className="lv-ncrd-del" onClick={async (e) => {
                                e.stopPropagation(); if (!auth.currentUser?.uid) return;
                                try { await deleteUserNote(auth.currentUser.uid, n.videoId); setAllNotes((p) => p.filter((x) => x.videoId !== n.videoId)); } catch {}
                              }}><i className="fas fa-trash"></i> Delete</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Note reader ─── */}
      {selectedNote && (
        <div className="lv-over" onClick={() => setSelectedNote(null)}>
          <div className="lv-ocard" onClick={(e) => e.stopPropagation()}>
            <div className="lv-oh"><span className="lv-ot">{selectedNote.videoTitle || "Note"}</span><button className="lv-oc" onClick={() => setSelectedNote(null)}><i className="fas fa-times"></i></button></div>
            {selectedNote.updatedAt && <div className="lv-od">Edited: {new Date(selectedNote.updatedAt as any).toLocaleDateString()}</div>}
            <div className="lv-ob" dangerouslySetInnerHTML={{ __html: renderNoteContent(selectedNote.content || "") }} />
            <button className="lv-odel" onClick={async () => {
              if (!auth.currentUser?.uid) return;
              try { await deleteUserNote(auth.currentUser.uid, selectedNote.videoId); setAllNotes((p) => p.filter((x) => x.videoId !== selectedNote.videoId)); setSelectedNote(null); } catch {}
            }}><i className="fas fa-trash"></i> Delete</button>
          </div>
        </div>
      )}

      <style>{`
.lv{position:fixed;inset:0;background:#000;overflow:hidden;font-family:inherit}
.lv-bg{position:fixed;inset:0;z-index:0}
.lv-frame{width:100%;height:100%;border:none}
.lv-top{position:absolute;top:0;left:0;right:0;z-index:10;display:flex;align-items:center;gap:10px;padding:10px 14px;background:linear-gradient(180deg,rgba(0,0,0,.7),transparent)}
.lv-back{width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.lv-info{flex:1;min-width:0}
.lv-name{font-size:12px;font-weight:600;color:rgba(255,255,255,.9)}
.lv-title{font-size:10px;color:rgba(255,255,255,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lv-actions{display:flex;align-items:center;gap:6px}
.lv-badge{display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:20px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;background:rgba(239,68,68,0.2);color:#EF4444}
.lv-dot{width:5px;height:5px;border-radius:50%;background:#EF4444;animation:lp 1.5s ease-in-out infinite}
.lv-orient{width:30px;height:30px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:rgba(255,255,255,.8);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.lv-tabs{position:absolute;bottom:0;left:0;right:0;z-index:10;display:flex;background:rgba(15,15,15,.92);border-top:1px solid rgba(255,255,255,.08)}
.lv-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;background:none;border:none;color:rgba(255,255,255,.4);font-size:9px;font-weight:600;cursor:pointer;transition:all .2s;position:relative}
.lv-tab i{font-size:15px;transition:transform .2s}
.lv-tab:active i{transform:scale(.85)}
.lv-tab.active{color:#fff}
.lv-tab.active::after{content:'';position:absolute;top:0;left:25%;right:25%;height:2px;background:#fff;border-radius:0 0 1px 1px}
.lv-drawer{position:absolute;bottom:41px;left:0;right:0;z-index:9;background:rgba(15,15,15,.95);border-radius:16px 16px 0 0;overflow:hidden;transition:height .35s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column}
.lv-drag{display:flex;align-items:center;justify-content:center;padding:8px 0 4px;cursor:grab;flex-shrink:0;touch-action:none}
.lv-drag-bar{width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,.15)}
.lv-body{flex:1;overflow:hidden;display:flex;flex-direction:column}
.lv-pane{flex:1;overflow:hidden;display:flex;flex-direction:column}
.lv-empty{text-align:center;padding:20px 16px;color:rgba(255,255,255,.3);font-size:12px}
.lv-empty i{font-size:24px;display:block;margin-bottom:6px;opacity:.4}
.lv-chat-msgs{flex:1;overflow-y:auto;padding:8px 14px;display:flex;flex-direction:column;gap:4px}
.lv-msg{padding:6px 10px;border-radius:10px;background:rgba(255,255,255,.06);max-width:85%}
.lv-msg.own{align-self:flex-end;background:rgba(232,168,56,.1)}
.lv-msg-head{display:flex;align-items:center;gap:6px;margin-bottom:2px}
.lv-msg-name{font-size:10px;font-weight:700;color:rgba(255,255,255,.7)}
.lv-msg-time{font-size:8px;color:rgba(255,255,255,.3);margin-left:auto}
.lv-msg-text{font-size:12px;color:rgba(255,255,255,.85);line-height:1.4;word-break:break-word}
.lv-chat-bar{display:flex;gap:6px;padding:6px 14px 10px;flex-shrink:0}
.lv-ci{flex:1;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#fff;font-size:12px;outline:none}
.lv-ci:focus{border-color:rgba(232,168,56,.5)}
.lv-ci::placeholder{color:rgba(255,255,255,.25)}
.lv-cs{width:36px;height:36px;border-radius:10px;border:none;background:rgba(232,168,56,.8);color:#fff;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.lv-cs:disabled{opacity:.4}
.lv-prayer-in{text-align:center;padding:12px 14px;color:rgba(255,255,255,.5);font-size:11px}
.lv-prayer-in i{font-size:24px;color:rgba(255,255,255,.3);margin-bottom:6px;display:block}
.lv-prayer-fm{display:flex;flex-direction:column;gap:6px;padding:0 14px 10px}
.lv-in,.lv-ta{padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#fff;font-size:12px;outline:none;resize:none;font-family:inherit}
.lv-in:focus,.lv-ta:focus{border-color:rgba(232,168,56,.5)}
.lv-in::placeholder,.lv-ta::placeholder{color:rgba(255,255,255,.25)}
.lv-pb{padding:8px;border-radius:10px;border:none;background:rgba(232,168,56,.8);color:#fff;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}
.lv-pb:disabled{opacity:.4}
.lv-st{font-size:11px;font-weight:700;color:rgba(255,255,255,.5);padding:8px 14px 4px}
.lv-prayer-list{flex:1;overflow-y:auto;padding:0 14px 10px;display:flex;flex-direction:column;gap:6px}
.lv-pi{padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.06)}
.lv-pi-head{font-size:10px;font-weight:700;color:rgba(255,255,255,.6);margin-bottom:3px;display:flex;align-items:center;gap:4px}
.lv-pi-date{font-size:9px;color:rgba(255,255,255,.3);margin-left:auto;font-weight:400}
.lv-pi-text{font-size:12px;color:rgba(255,255,255,.8);line-height:1.5}
.lv-pr{margin-top:6px;padding:6px 8px;border-radius:8px;background:rgba(232,168,56,.06);border-left:2px solid rgba(232,168,56,.5)}
.lv-pr-head{font-size:9px;color:rgba(232,168,56,.7);margin-bottom:2px;display:flex;align-items:center;gap:4px}
.lv-pr-text{font-size:11px;color:rgba(255,255,255,.6);line-height:1.4}
.lv-ns{display:flex;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0}
.lv-nsub{flex:1;padding:8px 6px;border:none;background:transparent;color:rgba(255,255,255,.4);font-size:10px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:4px}
.lv-nsub.active{color:#fff;border-bottom-color:#fff;background:rgba(255,255,255,.04)}
.lv-nc{display:flex;align-items:center;gap:6px;padding:8px 14px;background:rgba(232,168,56,.06);border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0}
.lv-nc-label{font-size:9px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.5px}
.lv-nc-title{font-size:11px;font-weight:700;color:rgba(255,255,255,.8)}
.lv-ntb{display:flex;align-items:center;justify-content:space-between;padding:4px 14px;flex-shrink:0;gap:2px}
.lv-ntb-l,.lv-ntb-r{display:flex;align-items:center;gap:1px}
.lv-tbb{width:26px;height:26px;border-radius:6px;border:1px solid transparent;background:transparent;color:rgba(255,255,255,.5);font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.lv-tbb:hover{border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.06)}
.lv-tbb.active{background:rgba(232,168,56,.1);color:rgba(232,168,56,.7);border-color:rgba(232,168,56,.2)}
.lv-tbb:disabled{opacity:.3}
.lv-tbs{width:1px;height:14px;background:rgba(255,255,255,.08);margin:0 1px}
.lv-nspin{font-size:10px;color:rgba(232,168,56,.7);margin-right:2px}
.lv-nta{flex:1;padding:8px 14px;border:none;background:transparent;color:rgba(255,255,255,.85);font-size:12px;line-height:1.5;resize:none;outline:none;font-family:inherit}
.lv-nta::placeholder{color:rgba(255,255,255,.2)}
.lv-np{flex:1;padding:8px 14px;overflow-y:auto;font-size:12px;line-height:1.5;color:rgba(255,255,255,.85)}
.lv-nst{font-size:10px;color:rgba(255,255,255,.35);padding:4px 14px;text-align:center;flex-shrink:0}
.lv-nst .fa-check-circle{color:#4ADE80}
.lv-nsb{margin:2px 14px 8px;padding:8px;border-radius:10px;border:none;background:rgba(232,168,56,.8);color:#fff;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;flex-shrink:0}
.lv-nsb:disabled{opacity:.4}
.lv-nsv{flex:1;overflow:hidden;display:flex;flex-direction:column}
.lv-nsv-h{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:rgba(255,255,255,.5);padding:8px 14px;flex-shrink:0}
.lv-ne{margin-left:auto;width:26px;height:26px;border-radius:6px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:rgba(255,255,255,.5);font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.lv-ne:disabled{opacity:.3}
.lv-nsw{position:relative;padding:4px 14px;flex-shrink:0}
.lv-ssi{position:absolute;left:22px;top:50%;transform:translateY(-50%);font-size:10px;color:rgba(255,255,255,.3);pointer-events:none}
.lv-ss{width:100%;padding:6px 28px 6px 30px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#fff;font-size:11px;outline:none;box-sizing:border-box}
.lv-ss::placeholder{color:rgba(255,255,255,.2)}
.lv-ssc{position:absolute;right:22px;top:50%;transform:translateY(-50%);border:none;background:none;color:rgba(255,255,255,.3);font-size:10px;cursor:pointer}
.lv-nl{flex:1;overflow-y:auto;padding:2px 14px 8px;display:flex;flex-direction:column;gap:4px}
.lv-ncrd{padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.06);cursor:pointer}
.lv-ncrd-t{display:flex;align-items:center;gap:4px;margin-bottom:3px}
.lv-ncrd-title{font-size:11px;font-weight:700;color:rgba(255,255,255,.8);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lv-ncrd-date{font-size:9px;color:rgba(255,255,255,.3);flex-shrink:0}
.lv-ncrd-p{font-size:10px;color:rgba(255,255,255,.35);line-height:1.3;margin-bottom:4px}
.lv-ncrd-a{display:flex;gap:4px}
.lv-ncrd-open,.lv-ncrd-del{padding:3px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);font-size:9px;font-weight:600;cursor:pointer}
.lv-ncrd-open{color:rgba(232,168,56,.8)}
.lv-ncrd-del{color:rgba(239,68,68,.7)}
.lv-over{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6)}
.lv-ocard{background:rgba(20,20,20,.96);border-radius:16px;max-width:420px;width:100%;max-height:80vh;overflow:auto;padding:16px}
.lv-oh{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.lv-ot{font-size:14px;font-weight:700;color:#fff}
.lv-oc{width:26px;height:26px;border-radius:6px;border:none;background:rgba(255,255,255,.08);color:rgba(255,255,255,.5);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.lv-od{font-size:10px;color:rgba(255,255,255,.35);margin-bottom:8px}
.lv-ob{font-size:12px;line-height:1.6;color:rgba(255,255,255,.7)}
.lv-ob h3,.lv-ob h4{color:#fff!important;margin:10px 0 4px}
.lv-ob h3{font-size:13px;font-weight:700}
.lv-ob h4{font-size:12px;font-weight:700}
.lv-ob p{margin-bottom:6px}
.lv-ob code{font-size:11px;padding:1px 3px;border-radius:3px;background:rgba(255,255,255,.08);color:rgba(232,168,56,.8)}
.lv-ob a{color:rgba(232,168,56,.8);text-decoration:underline}
.lv-ob ul,.lv-ob ol{margin:2px 0;padding-left:16px}
.lv-ob li{margin-bottom:1px}
.lv-odel{padding:6px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:rgba(239,68,68,.7);font-size:11px;font-weight:600;cursor:pointer;margin-top:12px}
.md-h3{font-size:13px;font-weight:700;margin:10px 0 4px;color:#fff}
.md-h4{font-size:12px;font-weight:700;margin:8px 0 3px;color:#fff}
.md-code{font-size:11px;padding:1px 3px;border-radius:3px;background:rgba(255,255,255,.08);color:rgba(232,168,56,.8)}
.md-link{color:rgba(232,168,56,.8);text-decoration:underline}
.md-ul,.md-ol{margin:2px 0;padding-left:16px}
.md-ul li,.md-ol li{margin-bottom:1px}
@keyframes lp{0%,100%{opacity:1}50%{opacity:.3}}
      `}</style>
    </div>
  );
}
