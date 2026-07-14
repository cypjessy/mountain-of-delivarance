"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFullscreenToggle } from "@/lib/tv/fullscreen";
import {
  getGivingConfig, saveGivingConfig,
  replyToPrayer,
  getLiveStatus, setLiveStream, endLiveStream,
} from "@/lib/youtube";
import type { LiveStatus } from "@/lib/youtube";
import type { TVGivingConfig } from "@/lib/youtube";
import {
  getR2Videos, getR2Video,
  getR2TvPlaylists, addR2TvPlaylist, deleteR2TvPlaylist, updateR2TvPlaylist,
  getTvBumperConfig,
  getAdminTvState, saveAdminTvState,
  type R2Video, type R2TvPlaylist,
} from "@/lib/r2Videos";
import {
  getPaymentMethods, addPaymentMethod, updatePaymentMethod, deletePaymentMethod,
  getTransactions, updateTransactionStatus,
  type PaymentMethod, type Transaction,
} from "@/lib/giving";
import { auth, db } from "@/lib/firebase";
import {
  collection, collectionGroup, doc, query, orderBy, onSnapshot, limit, Timestamp,
} from "firebase/firestore";
import AdminBottomNav from "@/components/admin/AdminBottomNav";
import { AdminTvPlayerProvider, useAdminTvPlayer } from "@/lib/tv/AdminTvPlayerProvider";
import ToastBridge from "@/components/dashboard/ToastBridge";
import PremiumTopBar from "@/components/shared/PremiumTopBar";

export default function AdminTVPage() {
  const router = useRouter();
  const { toggleFullscreen } = useFullscreenToggle();
  const [loading, setLoading] = useState(true);

  // ─── AdminTvPlayerProvider (separate from member TV player) ───
  const adminTvPlayer = useAdminTvPlayer();
  // Callback ref fires on every mount/remount (handles tab switching correctly)
  const tvPlayerTargetRef = useCallback((el: HTMLDivElement | null) => {
    adminTvPlayer.registerTarget(el);
  }, [adminTvPlayer]);

  // ─── R2 Videos state ───
  const [allVideos, setAllVideos] = useState<R2Video[]>([]);
  const [videoSearch, setVideoSearch] = useState("");

  // ─── Entry bumper state (plays before first playlist video) ───
  const [entryBumperUrl, setEntryBumperUrl] = useState<string | null>(null);
  const [isEntryBumperPlaying, setIsEntryBumperPlaying] = useState(false);

  // ─── Playlist state (ordered R2 TV playlists) ───
  const [playlists, setPlaylists] = useState<R2TvPlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [showAddPlaylist, setShowAddPlaylist] = useState(false);
  const [plName, setPlName] = useState("");
  const [plVideoIds, setPlVideoIds] = useState<string[]>([]);
  const [plStartIndex, setPlStartIndex] = useState(0);
  const [plSaving, setPlSaving] = useState(false);
  const [plDeletingId, setPlDeletingId] = useState<string | null>(null);
  const [editingPlaylist, setEditingPlaylist] = useState<R2TvPlaylist | null>(null);

  // ─── Admin TV player resume state (Firestore-backed) ───
  const tvUid = auth.currentUser?.uid;
  const [currentTvIndex, setCurrentTvIndex] = useState(0);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [startTvCountdown, setStartTvCountdown] = useState<number | null>(null);

  function showToast(title: string, message: string, type: string, duration: number) {
    window.dispatchEvent(
      new CustomEvent("show-toast", {
        detail: { title, message, type, duration },
      })
    );
  }
  const savedAdminSeekRef = useRef(0);
  const lastAdminTvSeekRef = useRef(0);
  const lastAdminTvIndexRef = useRef(0);
  const isEntryBumperPlayingRef = useRef(false);

  // Sync ref with state for use inside interval callbacks
  useEffect(() => {
    isEntryBumperPlayingRef.current = isEntryBumperPlaying;
  }, [isEntryBumperPlaying]);

  // Load R2 videos + playlists + admin TV state from Firestore on mount
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const uid = auth.currentUser?.uid;
      try {
        const [videos, pls, bumperData, adminState] = await Promise.all([
          getR2Videos({ includeHidden: true }),
          getR2TvPlaylists(),
          getTvBumperConfig(),
          uid ? getAdminTvState(uid) : Promise.resolve(null),
        ]);
        if (!mounted) return;
        setAllVideos(videos);
        setPlaylists(pls);

        // Restore saved seek from Firestore
        if (adminState) {
          savedAdminSeekRef.current = adminState.currentSeek || 0;
        }

        // Restore last active playlist and index from Firestore (fallback: first playlist)
        let hasActivePlaylist = false;
        const savedPlaylistId = adminState?.activePlaylistId;
        if (savedPlaylistId && pls.find(p => p.id === savedPlaylistId)) {
          setActivePlaylistId(savedPlaylistId);
          const pl = pls.find(p => p.id === savedPlaylistId)!;
          const savedIndex = adminState?.currentIndex ?? pl.currentIndex ?? 0;
          setCurrentTvIndex(savedIndex < pl.videoIds.length ? savedIndex : 0);
          hasActivePlaylist = true;
        } else if (pls.length > 0) {
          setActivePlaylistId(pls[0].id);
          setCurrentTvIndex(pls[0].currentIndex || 0);
          hasActivePlaylist = true;
        }

        // Auto-play: if bumper config exists and a playlist is active, play entry bumper first
        if (bumperData && hasActivePlaylist) {
          setEntryBumperUrl(bumperData.r2VideoUrl);
          setIsEntryBumperPlaying(true);
        }

        setLoading(false);
      } catch { if (mounted) setLoading(false); }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Helper: get the currently active playlist's video IDs resolved to R2Video objects
  const activePlaylist = activePlaylistId ? playlists.find(p => p.id === activePlaylistId) : null;
  const activeVideoIds = activePlaylist?.videoIds || [];
  const activeVideos: R2Video[] = activeVideoIds
    .map(id => allVideos.find(v => v.id === id))
    .filter((v): v is R2Video => !!v);

  const currentVideo = !isEntryBumperPlaying && activeVideos.length > 0
    ? activeVideos[currentTvIndex >= activeVideos.length ? 0 : currentTvIndex]
    : null;

  // Add R2 video to playlist builder
  const addVideoToPlaylist = useCallback((videoId: string) => {
    setPlVideoIds((prev) => (prev.includes(videoId) ? prev : [...prev, videoId]));
  }, []);

  // Remove R2 video from playlist builder
  const removeVideoFromPlaylist = useCallback((videoId: string) => {
    setPlVideoIds((prev) => prev.filter((id) => id !== videoId));
  }, []);

  // Move video up in playlist builder
  const moveVideoUp = useCallback((index: number) => {
    if (index === 0) return;
    setPlVideoIds((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  // Move video down in playlist builder
  const moveVideoDown = useCallback((index: number) => {
    setPlVideoIds((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  // Save a new R2 TV playlist
  const handleAddPlaylist = useCallback(async () => {
    if (!plName.trim()) {
      showToast("Name Required", "Enter a name for this playlist", "error", 3000);
      return;
    }
    if (plVideoIds.length === 0) {
      showToast("No Videos", "Add at least one R2 video to the playlist", "error", 3000);
      return;
    }
    setPlSaving(true);
    try {
      const startIdx = plStartIndex < plVideoIds.length ? plStartIndex : 0;
      await addR2TvPlaylist({
        title: plName.trim(),
        videoIds: plVideoIds,
        currentIndex: startIdx,
        isActive: true,
      });
      const fresh = await getR2TvPlaylists();
      setPlaylists(fresh);
      setShowAddPlaylist(false);
      setEditingPlaylist(null);
      setPlName("");
      setPlVideoIds([]);
      setPlStartIndex(0);
      showToast("Playlist Created!", `"${plName.trim()}" — ${plVideoIds.length} videos`, "success", 3000);
    } catch {
      showToast("Error", "Could not save playlist", "error", 3000);
    }
    setPlSaving(false);
  }, [plName, plVideoIds, plStartIndex]);

  // Update existing playlist
  const handleUpdatePlaylist = useCallback(async () => {
    if (!editingPlaylist) return;
    if (!plName.trim()) {
      showToast("Name Required", "Enter a name for this playlist", "error", 3000);
      return;
    }
    if (plVideoIds.length === 0) {
      showToast("No Videos", "Add at least one R2 video", "error", 3000);
      return;
    }
    setPlSaving(true);
    try {
      const startIdx = plStartIndex < plVideoIds.length ? plStartIndex : 0;
      await updateR2TvPlaylist(editingPlaylist.id, {
        title: plName.trim(),
        videoIds: plVideoIds,
        currentIndex: startIdx,
      });
      const fresh = await getR2TvPlaylists();
      setPlaylists(fresh);
      setShowAddPlaylist(false);
      setEditingPlaylist(null);
      setPlName("");
      setPlVideoIds([]);
      setPlStartIndex(0);
      showToast("Playlist Updated!", `"${plName.trim()}" saved`, "success", 3000);
    } catch {
      showToast("Error", "Could not update playlist", "error", 3000);
    }
    setPlSaving(false);
  }, [editingPlaylist, plName, plVideoIds, plStartIndex]);

  // Delete playlist
  const handleDeletePlaylist = useCallback(async (id: string) => {
    setPlDeletingId(id);
    try {
      await deleteR2TvPlaylist(id);
      const fresh = await getR2TvPlaylists();
      setPlaylists(fresh);
      if (activePlaylistId === id) {
        setActivePlaylistId(fresh.length > 0 ? fresh[0].id : null);
        setCurrentTvIndex(0);
      }
      showToast("Removed", "Playlist deleted", "success", 2500);
    } catch {
      showToast("Error", "Could not delete playlist", "error", 3000);
    }
    setPlDeletingId(null);
  }, [activePlaylistId]);

  // Edit playlist — populate form
  const handleEditPlaylist = useCallback((pl: R2TvPlaylist) => {
    setEditingPlaylist(pl);
    setPlName(pl.title);
    setPlVideoIds(pl.videoIds);
    setPlStartIndex(pl.currentIndex || 0);
    setShowAddPlaylist(true);
  }, []);

  // Activate a playlist for playback
  const handleActivatePlaylist = useCallback((pl: R2TvPlaylist) => {
    setActivePlaylistId(pl.id);
    setCurrentTvIndex(pl.currentIndex || 0);
    savedAdminSeekRef.current = 0;
    // Save to Firestore
    const uid = auth.currentUser?.uid;
    if (uid) {
      saveAdminTvState(uid, { activePlaylistId: pl.id, currentIndex: pl.currentIndex || 0, currentSeek: 0 });
    }
    showToast("Playlist Active", `"${pl.title}" is now playing`, "success", 2500);
  }, []);

  // Helper: get R2Video by ID
  const getVideoById = useCallback(
    (id: string) => allVideos.find((v) => v.id === id),
    [allVideos]
  );

  // Advance to next video in the active playlist
  const advanceTvVideo = useCallback(() => {
    setStartTvCountdown(null);
    if (lastAdminTvIndexRef.current >= (activeVideos.length || 1) - 1) return;
    const nextIndex = lastAdminTvIndexRef.current + 1;
    setCurrentTvIndex(nextIndex);
    // Update playlist's currentIndex in Firestore
    if (activePlaylistId) {
      updateR2TvPlaylist(activePlaylistId, { currentIndex: nextIndex });
    }
    // Also save to Firestore per-user state
    const uid = auth.currentUser?.uid;
    if (uid) {
      saveAdminTvState(uid, { activePlaylistId, currentIndex: nextIndex, currentSeek: 0 });
    }
  }, [activeVideos.length, activePlaylistId]);

  // Sync index ref (no localStorage write needed)
  useEffect(() => {
    lastAdminTvIndexRef.current = currentTvIndex;
  }, [currentTvIndex]);

  const handleAdminTvTimeUpdate = useCallback((time: number) => {
    lastAdminTvSeekRef.current = time;
  }, []);

  // Play entry bumper when url is set
  useEffect(() => {
    if (entryBumperUrl && isEntryBumperPlaying) {
      adminTvPlayer.playR2(entryBumperUrl, 0);
    }
  }, [entryBumperUrl, isEntryBumperPlaying, adminTvPlayer]);

  // Call playR2() when playlist video changes (skip during entry bumper)
  useEffect(() => {
    if (isEntryBumperPlaying) return;
    if (currentVideo) {
      const seek = savedAdminSeekRef.current > 0.1 ? savedAdminSeekRef.current : 0;
      adminTvPlayer.playR2(currentVideo.url, seek);
      savedAdminSeekRef.current = 0; // Use seek only once after restore
    }
  }, [currentVideo?.id, adminTvPlayer, isEntryBumperPlaying]);

  // Hide player when admin TV has nothing to play (prevents stale YouTube state)
  useEffect(() => {
    if (!loading && !currentVideo && !isEntryBumperPlaying) {
      adminTvPlayer.hide();
    }
  }, [loading, currentVideo?.id, isEntryBumperPlaying, adminTvPlayer]);

  // Keep callbacks in sync
  useEffect(() => {
    adminTvPlayer.setCallbacks({
      onEnded: () => {
        // Entry bumper finished — transition to playlist
        if (isEntryBumperPlaying) {
          setIsEntryBumperPlaying(false);
          setEntryBumperUrl(null);
          // Force re-render so the normal playlist video effect picks up currentVideo
          return;
        }
        if (activeVideos.length > 1) {
          setStartTvCountdown(20);
        } else {
          advanceTvVideo();
        }
      },
      onTimeUpdate: handleAdminTvTimeUpdate,
    });
  }, [advanceTvVideo, handleAdminTvTimeUpdate, adminTvPlayer, activeVideos.length, isEntryBumperPlaying]);

  // Save progress to Firestore per-user (skips during entry bumper to avoid seek corruption)
  const saveAdminTvProgress = useCallback(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    // Don't save during entry bumper — would overwrite real progress with bumper's seek
    if (isEntryBumperPlayingRef.current) return;
    const seek = lastAdminTvSeekRef.current;
    // Don't save seek=0 on first mount — would overwrite real progress
    if (seek <= 0.1) return;
    const index = lastAdminTvIndexRef.current;
    saveAdminTvState(uid, {
      activePlaylistId,
      currentIndex: index,
      currentSeek: seek,
    });
  }, [activePlaylistId]);

  useEffect(() => {
    const interval = setInterval(saveAdminTvProgress, 5000);
    return () => { clearInterval(interval); saveAdminTvProgress(); };
  }, [saveAdminTvProgress]);

  // TV countdown timer
  useEffect(() => {
    if (startTvCountdown === null || startTvCountdown <= 0) return;
    const timer = setTimeout(() => {
      if (startTvCountdown <= 1) {
        setStartTvCountdown(null);
        advanceTvVideo();
      } else {
        setStartTvCountdown(startTvCountdown - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [startTvCountdown, advanceTvVideo]);

  // Save on page unload
  useEffect(() => {
    const handleUnload = () => saveAdminTvProgress();
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") saveAdminTvProgress();
    };
    window.addEventListener("beforeunload", handleUnload);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [saveAdminTvProgress]);

  // ─── Live stream state ───
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [liveUrlInput, setLiveUrlInput] = useState("");
  const [liveTitleInput, setLiveTitleInput] = useState("");
  const [liveSaving, setLiveSaving] = useState(false);

  // Load live status on mount
  useEffect(() => {
    getLiveStatus().then(setLiveStatus);
  }, []);

  // Real-time listener for live status changes
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "tv_live_status", "main"), (snap: any) => {
      if (snap.exists()) {
        const data = snap.data();
        setLiveStatus({
          isLive: data.isLive || false,
          liveVideoId: data.liveVideoId || null,
          liveTitle: data.liveTitle || null,
          startedBy: data.startedBy || null,
          startedAt: data.startedAt?.toDate?.() || null,
        } as LiveStatus);
      }
    });
    return () => unsub();
  }, []);

  // Handle Go Live
  const handleGoLive = useCallback(async () => {
    const id = extractYouTubeId(liveUrlInput);
    if (!id) {
      showToast("Invalid Link", "Enter a valid YouTube URL or video ID", "error", 3000);
      return;
    }
    setLiveSaving(true);
    try {
      await setLiveStream(id, liveTitleInput.trim() || "Live Stream", auth.currentUser?.uid || "admin");
      showToast("Live!", "Live stream started for all members", "success", 3000);
    } catch {
      showToast("Error", "Could not start live stream", "error", 3000);
    }
    setLiveSaving(false);
  }, [liveUrlInput, liveTitleInput]);

  // Handle End Live
  const handleEndLive = useCallback(async () => {
    setLiveSaving(true);
    try {
      await endLiveStream();
      showToast("Ended", "Live stream ended. Members returned to playlist.", "success", 3000);
      setLiveUrlInput("");
      setLiveTitleInput("");
    } catch {
      showToast("Error", "Could not end live stream", "error", 3000);
    }
    setLiveSaving(false);
  }, []);

  // Filter videos by search
  const filteredVideos = videoSearch
    ? allVideos.filter(
        (v) =>
          v.title.toLowerCase().includes(videoSearch.toLowerCase()) ||
          v.id.toLowerCase().includes(videoSearch.toLowerCase())
      )
    : allVideos;

  // Videos not yet in the current playlist being built
  const availableVideos = filteredVideos.filter(v => !plVideoIds.includes(v.id));

  // ─── LIVE DASHBOARD STATE ───
  type AdminTabId = "videos" | "playlist" | "live";
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTabId>("videos");
  type LiveSubTab = "dashboard" | "chat" | "prayers" | "giving" | "broadcast";
  const [liveSubTab, setLiveSubTab] = useState<LiveSubTab>("dashboard");

  // Chat messages (read-only, for admin to monitor)
  interface LiveChatMsg {
    id: string;
    userId: string;
    userName: string;
    message: string;
    timestamp: Date;
  }
  interface LivePrayer {
    id: string;
    userId: string;
    name: string;
    request: string;
    createdAt: Date;
    replyText?: string;
    repliedBy?: string;
    repliedAt?: Date;
  }

  const [liveChatMsgs, setLiveChatMsgs] = useState<LiveChatMsg[]>([]);
  const [livePrayers, setLivePrayers] = useState<LivePrayer[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [replyingSaving, setReplyingSaving] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [givingConfig, setGivingConfig] = useState<TVGivingConfig | null>(null);
  const [gcSaving, setGcSaving] = useState(false);
  const [gcAmounts, setGcAmounts] = useState("");
  const [gcChurchName, setGcChurchName] = useState("");
  const [gcDescription, setGcDescription] = useState("");
  const [gcMethods, setGcMethods] = useState("");

  // Giving management state
  type GivingSubTab = "config" | "methods" | "transactions";
  const [givingSubTab, setGivingSubTab] = useState<GivingSubTab>("methods");
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [showMethodForm, setShowMethodForm] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [methodName, setMethodName] = useState("");
  const [methodType, setMethodType] = useState<PaymentMethod["type"]>("mpesa");
  const [methodDetails, setMethodDetails] = useState("");
  const [methodIcon, setMethodIcon] = useState("");
  const [methodInstructions, setMethodInstructions] = useState("");
  const [methodEnabled, setMethodEnabled] = useState(true);
  const [methodSaving, setMethodSaving] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transLoading, setTransLoading] = useState(false);
  const [feedbackInputs, setFeedbackInputs] = useState<Record<string, string>>({});

  // Live chat listener
  useEffect(() => {
    const q = query(
      collection(db, "tv_chat"),
      orderBy("timestamp", "desc"),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: LiveChatMsg[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          userId: data.userId || "",
          userName: data.userName || "Anonymous",
          message: data.message || "",
          timestamp: (data.timestamp as Timestamp)?.toDate() || new Date(),
        });
      });
      setLiveChatMsgs(list);
    });
    return () => unsub();
  }, []);

  // Live prayer requests listener (collectionGroup — sees all users' prayers)
  const prayerBufferRef = useRef<LivePrayer[]>([]);
  useEffect(() => {
    const q = query(
      collectionGroup(db, "tv_prayers"),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    prayerBufferRef.current = [];
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === "removed") {
          prayerBufferRef.current = prayerBufferRef.current.filter((p) => p.id !== change.doc.id);
          return;
        }
        const data = change.doc.data();
        // Extract userId from doc path: "users/{userId}/tv_prayers/{docId}"
        const pathParts = change.doc.ref.path.split("/");
        const userId = pathParts.length >= 4 ? pathParts[1] : (data.userId || "");
        const entry: LivePrayer = {
          id: change.doc.id,
          userId,
          name: data.name || "Anonymous",
          request: data.request || "",
          createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
          replyText: data.replyText || undefined,
          repliedBy: data.repliedBy || undefined,
          repliedAt: data.repliedAt ? (data.repliedAt as Timestamp)?.toDate() : undefined,
        };
        if (change.type === "added") {
          prayerBufferRef.current = [entry, ...prayerBufferRef.current];
        } else if (change.type === "modified") {
          prayerBufferRef.current = prayerBufferRef.current.map((p) =>
            p.id === change.doc.id ? entry : p
          );
        }
      });
      setLivePrayers(prayerBufferRef.current);
    });
    return () => unsub();
  }, []);

  // Poll active viewers every 15 seconds
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const { countActiveViewers } = await import("@/lib/youtube");
        const count = await countActiveViewers();
        if (mounted) setViewerCount(count);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Load giving config
  useEffect(() => {
    getGivingConfig().then((c) => {
      setGivingConfig(c);
      setGcAmounts(c.amounts.join(", "));
      setGcChurchName(c.churchName);
      setGcDescription(c.description);
      setGcMethods(c.methods.map((m) => `${m.icon}|${m.label}|${m.link}`).join("\n"));
    });
  }, []);

  // Save giving config
  const handleSaveGivingConfig = useCallback(async () => {
    setGcSaving(true);
    try {
      const amounts = gcAmounts.split(",").map((s) => s.trim()).filter(Boolean);
      const methods = gcMethods.split("\n").filter(Boolean).map((line) => {
        const parts = line.split("|").map((s) => s.trim());
        return { icon: parts[0] || "fa-heart", label: parts[1] || "Give", link: parts[2] || "/admin/giving" };
      });
      await saveGivingConfig({
        amounts,
        churchName: gcChurchName.trim() || "the Church",
        description: gcDescription.trim() || "Support the ministry",
        methods,
      });
      const fresh = await getGivingConfig();
      setGivingConfig(fresh);
      showToast("Saved", "Giving configuration updated", "success", 2500);
    } catch {
      showToast("Error", "Could not save giving config", "error", 3000);
    }
    setGcSaving(false);
  }, [gcAmounts, gcChurchName, gcDescription, gcMethods]);

  // Load giving management data
  const loadMethods = useCallback(async () => {
    setMethodsLoading(true);
    try { setMethods(await getPaymentMethods()); } catch { showToast("Error", "Failed to load payment methods", "error", 3000); }
    setMethodsLoading(false);
  }, []);

  const loadTransactions = useCallback(async () => {
    setTransLoading(true);
    try { setTransactions(await getTransactions()); } catch { showToast("Error", "Failed to load transactions", "error", 3000); }
    setTransLoading(false);
  }, []);

  useEffect(() => { loadMethods(); loadTransactions(); }, [loadMethods, loadTransactions]);

  const resetMethodForm = () => {
    setEditingMethod(null); setMethodName(""); setMethodType("mpesa");
    setMethodDetails(""); setMethodIcon(""); setMethodInstructions(""); setMethodEnabled(true);
  };

  const openEditMethod = (m: PaymentMethod) => {
    setEditingMethod(m); setMethodName(m.name); setMethodType(m.type);
    setMethodDetails(Object.entries(m.details).map(([k, v]) => `${k}: ${v}`).join("\n"));
    setMethodIcon(m.icon); setMethodInstructions(m.instructions); setMethodEnabled(m.enabled);
    setShowMethodForm(true);
  };

  const handleSaveMethod = async () => {
    if (!methodName.trim()) { showToast("Validation", "Method name is required", "error", 3000); return; }
    setMethodSaving(true);
    const details: Record<string, string> = {};
    methodDetails.split("\n").filter(Boolean).forEach((line) => {
      const idx = line.indexOf(":");
      if (idx > 0) details[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    const payload = {
      name: methodName.trim(), type: methodType, details,
      icon: methodIcon || "fa-circle-dollar", instructions: methodInstructions.trim(),
      enabled: methodEnabled, order: editingMethod ? editingMethod.order : methods.length,
    };
    try {
      if (editingMethod?.id) { await updatePaymentMethod(editingMethod.id, payload); showToast("Updated", "Payment method updated", "success", 2500); }
      else { await addPaymentMethod(payload); showToast("Added", "Payment method added", "success", 2500); }
      resetMethodForm(); setShowMethodForm(false); await loadMethods();
    } catch { showToast("Error", "Failed to save payment method", "error", 3000); }
    setMethodSaving(false);
  };

  const handleDeleteMethod = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try { await deletePaymentMethod(id); showToast("Deleted", `"${name}" removed`, "success", 2500); await loadMethods(); }
    catch { showToast("Error", "Failed to delete payment method", "error", 3000); }
  };

  const handleToggleMethod = async (m: PaymentMethod) => {
    if (!m.id) return;
    try { await updatePaymentMethod(m.id, { enabled: !m.enabled }); await loadMethods(); }
    catch { showToast("Error", "Failed to toggle method", "error", 3000); }
  };

  const handleConfirmTx = async (id: string, memberName: string) => {
    const feedback = feedbackInputs[id]?.trim() || "Thank you for your generous giving!";
    try {
      await updateTransactionStatus(id, "confirmed", feedback);
      showToast("Confirmed", `${memberName}'s giving confirmed`, "success", 2500);
      setFeedbackInputs((prev) => ({ ...prev, [id]: "" }));
      await loadTransactions();
    } catch { showToast("Error", "Failed to confirm transaction", "error", 3000); }
  };

  const handleRejectTx = async (id: string, memberName: string) => {
    const feedback = feedbackInputs[id]?.trim() || "We could not verify this transaction. Please contact us.";
    try {
      await updateTransactionStatus(id, "rejected", feedback);
      showToast("Rejected", `${memberName}'s giving rejected`, "info", 2500);
      setFeedbackInputs((prev) => ({ ...prev, [id]: "" }));
      await loadTransactions();
    } catch { showToast("Error", "Failed to reject transaction", "error", 3000); }
  };

  const txStats = {
    pending: transactions.filter((t) => t.status === "pending").length,
    confirmed: transactions.filter((t) => t.status === "confirmed").length,
    rejected: transactions.filter((t) => t.status === "rejected").length,
  };

  // Count unique users in chat (proxy for active chatters)
  const uniqueChatters = new Set(liveChatMsgs.map((m) => m.userId)).size;

  // ─── ADMIN TABS ───
  const ADMIN_TABS: { id: AdminTabId; label: string; icon: string }[] = [
    { id: "videos", label: "Videos", icon: "fa-video" },
    { id: "playlist", label: "Playlist", icon: "fa-list-ol" },
    { id: "live", label: "Live", icon: "fa-chart-line" },
  ];

  function formatDuration(seconds: number): string {
    if (!seconds) return "--:--";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }
  function getVideoColor(cat: string): string {
    const colors: Record<string, string> = {
      sermon: "#E8A838", worship: "#8B5CF6", event: "#3B82F6",
      announcement: "#4ADE80", teaching: "#EF4444", testimony: "#F59E0B",
    };
    return colors[cat] || "#6B6B6B";
  }
  function extractYouTubeId(url: string): string | null {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : (url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url) ? url : null);
  }

  const renderVideosTab = () => {
    const sortedVideos = [...allVideos].sort((a, b) => {
      const aTime = (a.uploadedAt as any)?.toMillis?.() || 0;
      const bTime = (b.uploadedAt as any)?.toMillis?.() || 0;
      return bTime - aTime;
    });
    const featuredCount = allVideos.filter(v => v.isFeatured).length;
    return (
      <>
        {/* ─── Stats ─── */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value" style={{ color: "var(--primary)" }}>{allVideos.length}</div>
            <div className="stat-label">Total Videos</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: "#8B5CF6" }}>{featuredCount}</div>
            <div className="stat-label">Featured</div>
          </div>
        </div>

        {/* ─── Search ─── */}
        <div className="pl-browse-search">
          <i className="fas fa-search"></i>
          <input className="form-input" type="text" placeholder="Search videos..." value={videoSearch} onChange={(e) => setVideoSearch(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>

        {/* ─── R2 Video Library Grid ─── */}
        {allVideos.length === 0 && !loading ? (
          <div className="tv-grid-empty" style={{ marginTop: 12 }}>
            <i className="fas fa-video-slash"></i>
            <span>No videos uploaded yet. Upload videos in the Content page, then come back to schedule them.</span>
          </div>
        ) : (
          <>
            <div className="tv-grid" style={{ marginTop: 12 }}>
              {(videoSearch ? sortedVideos.filter(v =>
                v.title.toLowerCase().includes(videoSearch.toLowerCase()) ||
                v.category.toLowerCase().includes(videoSearch.toLowerCase())
              ) : sortedVideos).map((video) => (
                <div key={video.id} className="tv-grid-card">
                  <div className="tv-grid-card-thumb">
                    {video.thumbnail ? (
                      <img src={video.thumbnail} alt={video.title} loading="lazy" />
                    ) : (
                      <div style={{
                        width: "100%", height: "100%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "linear-gradient(135deg, rgba(232,168,56,0.08), rgba(232,168,56,0.02))",
                        fontSize: 28, color: "var(--text-tertiary)", opacity: 0.5,
                      }}>
                        <i className="fas fa-video"></i>
                      </div>
                    )}
                    {video.duration > 0 && (
                      <div className="tv-grid-card-duration">{formatDuration(video.duration)}</div>
                    )}
                    {video.isFeatured && <div className="tv-grid-card-badge featured"><i className="fas fa-star"></i></div>}
                    {video.isHidden && <div className="tv-grid-card-badge hidden"><i className="fas fa-eye-slash"></i></div>}
                  </div>
                  <div className="tv-grid-card-info">
                    <div className="tv-grid-card-title">{video.title}</div>
                    <div className="tv-grid-card-meta" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: getVideoColor(video.category), fontWeight: 600 }}>{video.category}</span>
                      <span>·</span>
                      <span>{formatFileSize(video.fileSize)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {videoSearch && sortedVideos.filter(v =>
              v.title.toLowerCase().includes(videoSearch.toLowerCase()) ||
              v.category.toLowerCase().includes(videoSearch.toLowerCase())
            ).length === 0 && (
              <div style={{ padding: "16px 0", textAlign: "center", fontSize: 13, color: "var(--text-tertiary)" }}>
                No videos match your search
              </div>
            )}
          </>
        )}
      </>
    );
  };

  const renderPlaylistTab = () => (
    <>
      {/* ─── Currently Playing ─── */}
      <div className="section-title" style={{ marginTop: 4 }}>
        <i className="fas fa-play-circle"></i>
        Now Playing
      </div>
      {activePlaylist ? (
        <div>
          {/* TV Player */}
          <div className="tv-player-container" ref={tvPlayerTargetRef} />
          {/* Overlay info */}
          <div className="preview-card" style={{ marginTop: 8, alignItems: "center" }}>
            {isEntryBumperPlaying && (
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))",
                border: "1px solid rgba(59,130,246,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, color: "#3B82F6",
              }}>
                <i className="fas fa-film"></i>
              </div>
            )}
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: "linear-gradient(135deg, rgba(232,168,56,0.12), rgba(232,168,56,0.04))",
              border: "1px solid rgba(232,168,56,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, color: "var(--primary)",
            }}>
              <i className="fas fa-play"></i>
            </div>
            <div className="preview-info" style={{ flex: 1 }}>
              <div className="preview-title">
                {isEntryBumperPlaying ? (
                  <><i className="fas fa-film" style={{ marginRight: 4, color: "#3B82F6" }}></i> TV Intro</>
                ) : currentVideo?.title || activePlaylist.title}
              </div>
              <div className="preview-meta">
                <i className="fas fa-list-ol"></i> Video {currentTvIndex + 1} of {activeVideos.length}
                {startTvCountdown !== null && (
                  <span style={{ marginLeft: 8, color: "var(--primary)" }}>
                    · Next in {startTvCountdown}s
                  </span>
                )}
              </div>
            </div>
            <button style={{
              padding: "8px 12px", borderRadius: 10, flexShrink: 0,
              background: "var(--success)", color: "#fff", border: "none",
              fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>
              {isEntryBumperPlaying ? (
                <><i className="fas fa-film"></i> Intro</>
              ) : (
                <><i className="fas fa-circle"></i> Playing</>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="tv-grid-empty">
          <i className="fas fa-play-circle"></i>
          <span>Select a playlist below to start playing</span>
        </div>
      )}

      {/* ─── CREATE / EDIT PLAYLIST ─── */}
      <div style={{ borderTop: "1px solid var(--border)", marginTop: 12, paddingTop: 12 }}></div>
      <div className="section-title">
        <i className="fas fa-list-ol"></i>
        Manage Playlists
        <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 500 }}>
          ({playlists.length})
        </span>
      </div>

      <button
        className="btn-outline"
        onClick={() => {
          setShowAddPlaylist(!showAddPlaylist);
          if (!showAddPlaylist) {
            setEditingPlaylist(null);
            setPlName("");
            setPlVideoIds([]);
            setPlStartIndex(0);
          }
        }}
      >
        <i className={`fas fa-${showAddPlaylist ? "minus" : "plus"}`}></i>
        {editingPlaylist ? "Cancel Edit" : showAddPlaylist ? "Cancel" : "Create Playlist"}
      </button>

      {showAddPlaylist && (
        <div className="pl-builder">
          <div className="form-group">
            <label className="form-label"><i className="fas fa-tag"></i> Playlist Name</label>
            <input className="form-input" type="text" placeholder="e.g. Sunday Service" value={plName} onChange={(e) => setPlName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label"><i className="fas fa-play"></i> Start From</label>
            <select
              className="form-input"
              value={plStartIndex}
              onChange={(e) => setPlStartIndex(parseInt(e.target.value) || 0)}
            >
              {plVideoIds.length === 0 ? (
                <option value={0}>Video #1 (add videos first)</option>
              ) : (
                plVideoIds.map((id, i) => {
                  const v = allVideos.find((vid) => vid.id === id);
                  return (
                    <option key={id} value={i}>
                      Video #{i + 1}{v ? `: ${v.title}` : ""}
                    </option>
                  );
                })
              )}
            </select>
          </div>

          {/* Selected videos */}
          <div className="pl-selected-header">
            <span><i className="fas fa-video"></i> Videos ({plVideoIds.length})</span>
          </div>
          {plVideoIds.length === 0 ? (
            <div style={{ padding: "12px 0", textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
              No videos added. Tap videos below to add them.
            </div>
          ) : (
            <div className="pl-selected-list">
              {plVideoIds.map((id, i) => {
                const v = getVideoById(id);
                return (
                  <div key={id} className="pl-selected-item">
                    <div className="pl-selected-thumb" style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "linear-gradient(135deg, rgba(232,168,56,0.1), rgba(232,168,56,0.04))",
                      fontSize: 14, color: "var(--primary)",
                    }}>
                      <i className="fas fa-video"></i>
                    </div>
                    <div className="pl-selected-title">{v?.title || id}</div>
                    <div className="pl-selected-pos">
                      <button onClick={() => moveVideoUp(i)} disabled={i === 0} style={{ opacity: i === 0 ? 0.3 : 1 }}><i className="fas fa-chevron-up"></i></button>
                      <button onClick={() => moveVideoDown(i)} disabled={i >= plVideoIds.length - 1} style={{ opacity: i >= plVideoIds.length - 1 ? 0.3 : 1 }}><i className="fas fa-chevron-down"></i></button>
                    </div>
                    <button className="pl-selected-remove" onClick={() => removeVideoFromPlaylist(id)}><i className="fas fa-xmark"></i></button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Browse R2 videos to add */}
          {allVideos.length > 0 && (
            <>
              <div className="pl-selected-header" style={{ marginTop: 4 }}>
                <span><i className="fas fa-list"></i> Browse Uploaded Videos</span>
              </div>
              <div className="pl-browse-grid">
                {allVideos.map((v) => {
                  const isAdded = plVideoIds.includes(v.id);
                  return (
                    <div
                      key={v.id}
                      className={`pl-browse-item ${isAdded ? "added" : ""}`}
                      onClick={() => !isAdded && addVideoToPlaylist(v.id)}
                    >
                      <div className="pl-browse-thumb" style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "linear-gradient(135deg, rgba(232,168,56,0.08), rgba(232,168,56,0.02))",
                        fontSize: 16, color: "var(--text-tertiary)", opacity: 0.6,
                      }}>
                        <i className="fas fa-video"></i>
                      </div>
                      <div className="pl-browse-info">
                        <div className="pl-browse-title">{v.title}</div>
                        <div className="pl-browse-meta">{formatDuration(v.duration)} · {v.category}</div>
                      </div>
                      <div className={`pl-browse-add ${isAdded ? "added" : ""}`}>
                        <i className={`fas fa-${isAdded ? "check" : "plus"}`}></i>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <button
            className="btn-primary small"
            onClick={editingPlaylist ? handleUpdatePlaylist : handleAddPlaylist}
            disabled={plSaving || !plName.trim() || plVideoIds.length === 0}
          >
            {plSaving ? (
              <><i className="fas fa-spinner fa-spin"></i> Saving...</>
            ) : editingPlaylist ? (
              <><i className="fas fa-save"></i> Update Playlist</>
            ) : (
              <><i className="fas fa-save"></i> Save Playlist</>
            )}
          </button>
        </div>
      )}

      {/* ─── PLAYLISTS LIST ─── */}
      {playlistsLoading ? (
        <div className="loading-state" style={{ padding: "20px 0" }}><i className="fas fa-spinner fa-spin"></i></div>
      ) : playlists.length === 0 ? (
        <div style={{ padding: "16px 0", textAlign: "center", fontSize: 13, color: "var(--text-tertiary)" }}>
          No playlists yet. Create one above to arrange videos in playback order.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {playlists.map((p) => {
            const isActive = activePlaylistId === p.id;
            return (
              <div key={p.id} className="preview-card" style={{ alignItems: "center" }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: isActive
                    ? "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))"
                    : "linear-gradient(135deg, rgba(232,168,56,0.12), rgba(232,168,56,0.04))",
                  border: `1px solid ${isActive ? "rgba(34,197,94,0.2)" : "rgba(232,168,56,0.12)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, color: isActive ? "var(--success)" : "var(--primary)",
                }}>
                  <i className={`fas ${isActive ? "fa-play-circle" : "fa-list-ol"}`}></i>
                </div>
                <div className="preview-info" style={{ flex: 1 }}>
                  <div className="preview-title">
                    {p.title}
                    {isActive && <span style={{ fontSize: 10, color: "var(--success)", marginLeft: 6 }}>· Playing</span>}
                  </div>
                  <div className="preview-meta">
                    <i className="fas fa-play"></i> Start: Video #{p.currentIndex + 1}
                    <span style={{ marginLeft: 8 }}>· {p.videoIds.length} videos</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {!isActive && (
                    <button
                      style={{
                        width: 34, height: 34, borderRadius: 8,
                        border: "none",
                        background: "linear-gradient(135deg, var(--gradient-start), var(--gradient-end))",
                        color: "#fff", fontSize: 13, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                      onClick={() => handleActivatePlaylist(p)}
                      title="Play"
                    >
                      <i className="fas fa-play"></i>
                    </button>
                  )}
                  <button
                    style={{
                      width: 34, height: 34, borderRadius: 8,
                      border: "1px solid var(--border)", background: "var(--surface)",
                      color: "var(--primary)", fontSize: 12, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                    onClick={() => handleEditPlaylist(p)}
                    title="Edit"
                  >
                    <i className="fas fa-pen"></i>
                  </button>
                  <button
                    style={{
                      width: 34, height: 34, borderRadius: 8,
                      border: "1px solid var(--border)", background: "var(--surface)",
                      color: "var(--error)", fontSize: 13, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                    onClick={() => handleDeletePlaylist(p.id)}
                    disabled={plDeletingId === p.id}
                    title="Delete"
                  >
                    {plDeletingId === p.id ? (
                      <i className="fas fa-spinner fa-spin" style={{ fontSize: 12 }}></i>
                    ) : (
                      <i className="fas fa-trash"></i>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminTvPlayerProvider>
  );

  const renderLiveTab = () => (
    <>
      {/* ─── LIVE SUB-TABS ─── */}
      <div className="live-sub-tabs">
        <button className={`live-sub-tab${liveSubTab === "dashboard" ? " active" : ""}`} onClick={() => setLiveSubTab("dashboard")}>
          <i className="fas fa-chart-simple"></i> Dashboard
        </button>
        <button className={`live-sub-tab${liveSubTab === "chat" ? " active" : ""}`} onClick={() => setLiveSubTab("chat")}>
          <i className="fas fa-comment"></i> Chat ({liveChatMsgs.length})
        </button>
        <button className={`live-sub-tab${liveSubTab === "prayers" ? " active" : ""}`} onClick={() => setLiveSubTab("prayers")}>
          <i className="fas fa-hands-praying"></i> Prayers ({livePrayers.length})
        </button>
        <button className={`live-sub-tab${liveSubTab === "giving" ? " active" : ""}`} onClick={() => setLiveSubTab("giving")}>
          <i className="fas fa-hand-holding-heart"></i> Giving
          {txStats.pending > 0 && <span className="live-sub-badge">{txStats.pending}</span>}
        </button>
        <button className={`live-sub-tab${liveSubTab === "broadcast" ? " active" : ""} ${liveStatus?.isLive ? "live-active" : ""}`} onClick={() => setLiveSubTab("broadcast")}>
          <i className="fas fa-tower-broadcast"></i> Broadcast
          {liveStatus?.isLive && <span className="live-sub-badge" style={{ background: "rgba(239,68,68,0.2)", color: "#EF4444" }}>LIVE</span>}
        </button>
      </div>

      {/* ─── DASHBOARD ─── */}
      {liveSubTab === "dashboard" && (
        <>
          <div className="live-stats-grid">
            <div className="live-stat-card" style={{ borderColor: "rgba(59,130,246,0.2)" }}>
              <div className="live-stat-value" style={{ color: "#3B82F6" }}>{viewerCount}</div>
              <div className="live-stat-label">Active Viewers</div>
              <div className="live-stat-sub">
                <i className="fas fa-circle" style={{ fontSize: 6, color: viewerCount > 0 ? "var(--success)" : "var(--text-tertiary)" }}></i>
                {viewerCount > 0 ? "Watching now" : "No active viewers"}
              </div>
            </div>
            <div className="live-stat-card" style={{ borderColor: "rgba(232,168,56,0.2)" }}>
              <div className="live-stat-value" style={{ color: "var(--primary)" }}>{liveChatMsgs.length}</div>
              <div className="live-stat-label">Chat Messages</div>
              <div className="live-stat-sub">{uniqueChatters} unique chatters</div>
            </div>
            <div className="live-stat-card" style={{ borderColor: "rgba(139,92,246,0.2)" }}>
              <div className="live-stat-value" style={{ color: "#8B5CF6" }}>{livePrayers.length}</div>
              <div className="live-stat-label">Prayer Requests</div>
              <div className="live-stat-sub">{livePrayers.filter((p) => !p.replyText).length} unreplied</div>
            </div>
          </div>

          {/* Compact chat preview */}
          <div className="section-title" style={{ marginTop: 4 }}>
            <i className="fas fa-comment"></i> Recent Chat
            <button className="section-title-btn" onClick={() => setLiveSubTab("chat")}>View All <i className="fas fa-chevron-right"></i></button>
          </div>
          <div className="live-feed-compact">
            {liveChatMsgs.length === 0 ? (
              <div className="live-empty"><i className="fas fa-comment-dots"></i><span>No messages yet</span></div>
            ) : (
              liveChatMsgs.slice(0, 10).map((m) => (
                <div key={m.id} className="live-chat-item">
                  <div className="live-chat-header">
                    <span className="live-chat-name">{m.userName}</span>
                    <span className="live-chat-time">{m.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="live-chat-text">{m.message}</div>
                </div>
              ))
            )}
          </div>

          {/* Compact prayer preview */}
          <div className="section-title" style={{ marginTop: 16 }}>
            <i className="fas fa-hands-praying"></i> Recent Prayers
            <button className="section-title-btn" onClick={() => setLiveSubTab("prayers")}>View All <i className="fas fa-chevron-right"></i></button>
          </div>
          <div className="live-feed-compact">
            {livePrayers.length === 0 ? (
              <div className="live-empty"><i className="fas fa-pray"></i><span>No prayer requests yet</span></div>
            ) : (
              livePrayers.slice(0, 5).map((p) => (
                <div key={p.id} className="live-prayer-card">
                  <div className="live-chat-header">
                    <span className="live-chat-name"><i className="fas fa-user"></i> {p.name}</span>
                    <span className="live-chat-time">{p.createdAt.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="live-chat-text">{p.request}</div>
                  {p.replyText && <div className="tv-prayer-reply"><div className="tv-prayer-reply-text" style={{ fontSize: 11 }}><i className="fas fa-reply"></i> {p.replyText}</div></div>}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ─── FULL CHAT FEED ─── */}
      {liveSubTab === "chat" && (
        <>
          <div className="section-title"><i className="fas fa-comment"></i> Live Chat Feed ({liveChatMsgs.length} messages)</div>
          <div className="live-feed-full">
            {liveChatMsgs.length === 0 ? (
              <div className="live-empty"><i className="fas fa-comment-dots"></i><span>No messages yet</span></div>
            ) : (
              [...liveChatMsgs].reverse().map((m) => (
                <div key={m.id} className="live-chat-item">
                  <div className="live-chat-header">
                    <span className="live-chat-name">{m.userName}</span>
                    <span className="live-chat-time">{m.timestamp.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="live-chat-text">{m.message}</div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ─── FULL PRAYERS FEED ─── */}
      {liveSubTab === "prayers" && (
        <>
          <div className="section-title">
            <i className="fas fa-hands-praying"></i> Prayer Requests ({livePrayers.length})
          </div>
          <div className="live-feed-full">
            {livePrayers.length === 0 ? (
              <div className="live-empty"><i className="fas fa-pray"></i><span>No prayer requests yet</span></div>
            ) : (
              livePrayers.map((p) => (
                <div key={p.id} className="live-prayer-card">
                  <div className="live-chat-header">
                    <span className="live-chat-name"><i className="fas fa-user"></i> {p.name}</span>
                    <span className="live-chat-time">
                      {p.createdAt.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="live-chat-text">{p.request}</div>

                  {p.replyText && (
                    <div className="tv-prayer-reply">
                      <div className="tv-prayer-reply-header">
                        <i className="fas fa-reply"></i>
                        <span className="tv-prayer-reply-name">{p.repliedBy || "Admin"}</span>
                        {p.repliedAt && <span className="tv-prayer-reply-time">{p.repliedAt.toLocaleDateString([], { month: "short", day: "numeric" })}</span>}
                      </div>
                      <div className="tv-prayer-reply-text">{p.replyText}</div>
                    </div>
                  )}

                  <div className="live-prayer-reply-form">
                    {replyingTo === p.id ? (
                      <>
                        <textarea
                          className="live-prayer-reply-input"
                          placeholder="Type your reply..."
                          value={replyTexts[p.id] || ""}
                          onChange={(e) => setReplyTexts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          rows={2} maxLength={500}
                        />
                        <div className="live-prayer-reply-actions">
                          <button className="live-prayer-reply-cancel" onClick={() => { setReplyingTo(null); setReplyTexts((prev) => { const n = { ...prev }; delete n[p.id]; return n; }); }}>Cancel</button>
                          <button className="live-prayer-reply-send" onClick={async () => {
                            const text = (replyTexts[p.id] || "").trim();
                            if (!text) return;
                            setReplyingSaving(p.id);
                            try {
                              const adminName = auth.currentUser?.displayName || "Admin";
                              await replyToPrayer(p.userId, p.id, text, adminName);
                              setReplyTexts((prev) => { const n = { ...prev }; delete n[p.id]; return n; });
                              setReplyingTo(null);
                              showToast("Reply Sent", "Your response has been sent to the member", "success", 2500);
                            } catch { showToast("Error", "Could not send reply", "error", 3000); }
                            setReplyingSaving(null);
                          }} disabled={replyingSaving === p.id || !(replyTexts[p.id] || "").trim()}>
                            {replyingSaving === p.id ? <><span className="spinner" style={{ width: 14, height: 14 }}></span> Sending...</> : <><i className="fas fa-reply"></i> Reply</>}
                          </button>
                        </div>
                      </>
                    ) : (
                      <button className="live-prayer-reply-btn" onClick={() => { setReplyingTo(p.id); setReplyTexts((prev) => ({ ...prev, [p.id]: "" })); }}>
                        <i className="fas fa-reply"></i> {p.replyText ? "Edit Reply" : "Reply"}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ─── BROADCAST CONTROL ─── */}
      {liveSubTab === "broadcast" && (
        <>
          <div className="section-title" style={{ marginBottom: 12 }}>
            <i className="fas fa-tower-broadcast"></i>
            Live Stream Control
            {liveStatus?.isLive && (
              <span style={{
                marginLeft: 8, padding: "2px 10px", borderRadius: 6,
                background: "rgba(239,68,68,0.15)", color: "#EF4444",
                fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444", animation: "livePulse 1.2s ease-in-out infinite" }}></span>
                LIVE
              </span>
            )}
          </div>

          {/* Current status */}
          {liveStatus?.isLive ? (
            <div className="live-broadcast-status">
              <div className="live-broadcast-header">
                <i className="fas fa-circle" style={{ color: "#EF4444", fontSize: 10, animation: "livePulse 1.2s ease-in-out infinite" }}></i>
                <span style={{ fontWeight: 700 }}>Currently Live</span>
              </div>
              <div className="live-broadcast-info">
                <div className="live-broadcast-label">Video</div>
                <div className="live-broadcast-value">{liveStatus.liveVideoId}</div>
              </div>
              <div className="live-broadcast-info">
                <div className="live-broadcast-label">Title</div>
                <div className="live-broadcast-value">{liveStatus.liveTitle || "Live Stream"}</div>
              </div>
              <div className="live-broadcast-embed-preview">
                <iframe
                  src={`https://www.youtube.com/embed/${liveStatus.liveVideoId}?autoplay=1&mute=1`}
                  style={{
                    width: "100%", aspectRatio: "16/9", borderRadius: 10,
                    border: "1px solid var(--border)", background: "#000",
                  }}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              </div>
              <button
                className="btn-primary"
                onClick={handleEndLive}
                disabled={liveSaving}
                style={{ background: "linear-gradient(135deg, #EF4444, #DC2626)" }}
              >
                {liveSaving ? (
                  <><span className="spinner"></span> Ending...</>
                ) : (
                  <><i className="fas fa-square"></i> End Live Stream</>
                )}
              </button>
            </div>
          ) : (
            <div className="live-broadcast-form">
              <div className="form-group">
                <label className="form-label">
                  <i className="fab fa-youtube"></i>
                  YouTube Video ID or URL
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="https://youtube.com/watch?v=... or video ID"
                  value={liveUrlInput}
                  onChange={(e) => setLiveUrlInput(e.target.value)}
                />
                <span className="form-hint">
                  <i className="fas fa-circle-info"></i>
                  Paste the YouTube live stream link or ID to broadcast to all members
                </span>
              </div>
              <div className="form-group">
                <label className="form-label">
                  <i className="fas fa-heading"></i>
                  Stream Title (optional)
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="e.g. Sunday Morning Service"
                  value={liveTitleInput}
                  onChange={(e) => setLiveTitleInput(e.target.value)}
                />
              </div>
              <button
                className="btn-primary"
                onClick={handleGoLive}
                disabled={liveSaving || !liveUrlInput.trim()}
                style={{
                  background: liveUrlInput.trim()
                    ? "linear-gradient(135deg, #EF4444, #DC2626)"
                    : undefined,
                }}
              >
                {liveSaving ? (
                  <><span className="spinner"></span> Starting...</>
                ) : (
                  <><i className="fas fa-circle"></i> Go Live</>
                )}
              </button>
            </div>
          )}

          <style>{`
            @keyframes livePulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.4; transform: scale(1.5); }
            }
            .live-sub-tab.live-active {
              color: #EF4444 !important;
            }
            .live-sub-tab.live-active i {
              color: #EF4444 !important;
            }
            .live-broadcast-status {
              display: flex;
              flex-direction: column;
              gap: 12px;
            }
            .live-broadcast-header {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 12px 16px;
              background: rgba(239,68,68,0.08);
              border: 1px solid rgba(239,68,68,0.15);
              border-radius: 12px;
              font-size: 14px;
            }
            .live-broadcast-info {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 8px 12px;
              background: var(--surface);
              border: 1px solid var(--border);
              border-radius: 10px;
            }
            .live-broadcast-label {
              font-size: 11px;
              font-weight: 700;
              color: var(--text-tertiary);
              text-transform: uppercase;
              letter-spacing: 0.5px;
              min-width: 50px;
            }
            .live-broadcast-value {
              font-size: 13px;
              font-weight: 600;
              color: var(--text-primary);
              word-break: break-all;
            }
            .live-broadcast-embed-preview {
              width: 100%;
            }
            .live-broadcast-form {
              display: flex;
              flex-direction: column;
              gap: 12px;
            }
          `}</style>
        </>
      )}

      {/* ─── GIVING MANAGEMENT ─── */}
      {liveSubTab === "giving" && (
        <>
          <div className="giving-sub-tabs">
            <button className={`giving-sub-tab${givingSubTab === "methods" ? " active" : ""}`} onClick={() => setGivingSubTab("methods")}>
              <i className="fas fa-circle-dollar"></i> Methods
            </button>
            <button className={`giving-sub-tab${givingSubTab === "transactions" ? " active" : ""}`} onClick={() => setGivingSubTab("transactions")}>
              <i className="fas fa-receipt"></i> Transactions
              {txStats.pending > 0 && <span className="giving-sub-badge">{txStats.pending}</span>}
            </button>
            <button className={`giving-sub-tab${givingSubTab === "config" ? " active" : ""}`} onClick={() => setGivingSubTab("config")}>
              <i className="fas fa-gear"></i> Config
            </button>
          </div>

          {givingSubTab === "methods" && (
            <div className="live-giving-form">
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button className="btn-primary small" onClick={() => { resetMethodForm(); setShowMethodForm(true); }}>
                  <i className="fas fa-plus"></i> Add Method
                </button>
              </div>
              {methodsLoading ? (
                <div className="loading-state"><i className="fas fa-spinner fa-spin"></i><span>Loading...</span></div>
              ) : methods.length === 0 ? (
                <div className="live-empty"><i className="fas fa-circle-dollar"></i><span>No payment methods yet</span></div>
              ) : (
                methods.map((m) => (
                  <div className="pm-card" key={m.id}>
                    <div className="pm-card-header">
                      <div className="pm-icon"><i className={`fas ${m.icon || "fa-circle-dollar"}`}></i></div>
                      <div className="pm-info">
                        <div className="pm-name">{m.name}</div>
                        <div className="pm-type">{m.type} · {m.enabled ? "Enabled" : "Disabled"}</div>
                      </div>
                    </div>
                    {Object.keys(m.details).length > 0 && (
                      <div className="pm-details">{Object.entries(m.details).map(([k, v]) => <div key={k}><strong>{k}:</strong> {v}</div>)}</div>
                    )}
                    {m.instructions && <div className="pm-instr">{m.instructions}</div>}
                    <div className="pm-actions">
                      <button className="pm-btn edit" onClick={() => openEditMethod(m)}><i className="fas fa-pen"></i> Edit</button>
                      <button className="pm-btn toggle" onClick={() => handleToggleMethod(m)}><i className={`fas ${m.enabled ? "fa-toggle-on" : "fa-toggle-off"}`}></i> {m.enabled ? "Disable" : "Enable"}</button>
                      <button className="pm-btn danger" onClick={() => m.id && handleDeleteMethod(m.id, m.name)}><i className="fas fa-trash"></i> Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {givingSubTab === "transactions" && (
            <div className="live-giving-form">
              <div className="tx-stats-row">
                <div className="tx-stat-box pending"><div className="tx-stat-val">{txStats.pending}</div><div className="tx-stat-lbl">Pending</div></div>
                <div className="tx-stat-box confirmed"><div className="tx-stat-val">{txStats.confirmed}</div><div className="tx-stat-lbl">Confirmed</div></div>
                <div className="tx-stat-box rejected"><div className="tx-stat-val">{txStats.rejected}</div><div className="tx-stat-lbl">Rejected</div></div>
              </div>
              {transLoading ? (
                <div className="loading-state"><i className="fas fa-spinner fa-spin"></i><span>Loading...</span></div>
              ) : transactions.length === 0 ? (
                <div className="live-empty"><i className="fas fa-receipt"></i><span>No transactions yet</span></div>
              ) : (
                transactions.map((tx) => (
                  <div className="tx-card" key={tx.id}>
                    <div className="tx-card-header">
                      <span className="tx-member">{tx.memberName}</span>
                      <span className={`tx-badge ${tx.status}`}>{tx.status}</span>
                    </div>
                    <div className="tx-amount">KSh {tx.amount.toLocaleString()}</div>
                    <div className="tx-meta"><strong>Method:</strong> {tx.paymentMethodLabel}</div>
                    <div className="tx-meta"><strong>Code:</strong> {tx.confirmationCode}</div>
                    <div className="tx-meta"><strong>Date:</strong> {tx.createdAt ? new Date((tx.createdAt as unknown as { toMillis?: () => number })?.toMillis ? ((tx.createdAt as unknown as { toMillis: () => number }).toMillis()) : (tx.createdAt as unknown as string)).toLocaleDateString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                    {tx.adminFeedback && <div className="tx-feedback"><i className="fas fa-reply"></i> {tx.adminFeedback}</div>}
                    {tx.status === "pending" && (
                      <div className="tx-actions">
                        <input className="tx-fb-input" placeholder="Feedback (optional)" value={feedbackInputs[tx.id!] ?? ""} onChange={(e) => setFeedbackInputs((p) => ({ ...p, [tx.id!]: e.target.value }))} />
                        <button className="tx-btn confirm" onClick={() => tx.id && handleConfirmTx(tx.id, tx.memberName)}><i className="fas fa-check"></i> Confirm</button>
                        <button className="tx-btn reject" onClick={() => tx.id && handleRejectTx(tx.id, tx.memberName)}><i className="fas fa-times"></i> Reject</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {givingSubTab === "config" && (
            <div className="live-giving-form">
              <div className="form-group">
                <label className="form-label"><i className="fas fa-church"></i> Church Name</label>
                <input className="form-input" type="text" value={gcChurchName} onChange={(e) => setGcChurchName(e.target.value)} placeholder="e.g. MOUNTAIN OF DELIVERANCE CHURCH" />
              </div>
              <div className="form-group">
                <label className="form-label"><i className="fas fa-align-left"></i> Description</label>
                <textarea className="form-input" style={{ resize: "vertical", minHeight: 60, fontFamily: "inherit" }} value={gcDescription} onChange={(e) => setGcDescription(e.target.value)} placeholder="Encourage giving..." rows={2} />
              </div>
              <div className="form-group">
                <label className="form-label"><i className="fas fa-coins"></i> Giving Amounts</label>
                <input className="form-input" type="text" value={gcAmounts} onChange={(e) => setGcAmounts(e.target.value)} placeholder="$10, $25, $50, $100, Other" />
                <span className="form-hint"><i className="fas fa-info-circle"></i> Comma-separated list of amount buttons</span>
              </div>
              <div className="form-group">
                <label className="form-label"><i className="fas fa-credit-card"></i> Payment Methods (TV overlay)</label>
                <textarea className="form-input" style={{ resize: "vertical", minHeight: 80, fontFamily: "monospace", fontSize: 12 }} value={gcMethods} onChange={(e) => setGcMethods(e.target.value)} placeholder={`fa-qrcode|Scan to Give|/give\nfa-mobile-screen|Mobile Pay|/give\nfa-bank|Bank Transfer|/give`} rows={4} />
                <span className="form-hint"><i className="fas fa-info-circle"></i> One per line: <strong>icon|label|link</strong></span>
              </div>
              <button className="btn-primary" onClick={handleSaveGivingConfig} disabled={gcSaving}>
                {gcSaving ? <><span className="spinner"></span> Saving...</> : <><i className="fas fa-save"></i> Save Giving Config</>}
              </button>
            </div>
          )}

          {/* Method form modal */}
          {showMethodForm && (
            <div className="modal-overlay" onClick={() => setShowMethodForm(false)}>
              <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="modal-handle"></div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{editingMethod ? "Edit Payment Method" : "Add Payment Method"}</div>
                <div className="form-group"><label className="form-label">Method Name</label><input className="form-input" placeholder="e.g. M-Pesa Paybill" value={methodName} onChange={(e) => setMethodName(e.target.value)} /></div>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-input" value={methodType} onChange={(e) => setMethodType(e.target.value as PaymentMethod["type"])}>
                    <option value="mpesa">M-Pesa</option><option value="bank">Bank Transfer</option>
                    <option value="paypal">PayPal</option><option value="card">Card</option><option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Details (Key: Value, one per line)</label>
                  <textarea className="form-input" style={{ resize: "vertical", minHeight: 60, fontFamily: "inherit" }} placeholder={`Paybill: 123456\nAccount: Church Name`} value={methodDetails} onChange={(e) => setMethodDetails(e.target.value)} rows={3} />
                </div>
                <div className="form-group"><label className="form-label">Icon class</label><input className="form-input" placeholder="fa-mobile-screen" value={methodIcon} onChange={(e) => setMethodIcon(e.target.value)} /></div>
                <div className="form-group">
                  <label className="form-label">Instructions</label>
                  <textarea className="form-input" style={{ resize: "vertical", minHeight: 60, fontFamily: "inherit" }} placeholder="1. Go to M-Pesa\n2. Select Lipa na M-Pesa\n3. Enter Paybill..." value={methodInstructions} onChange={(e) => setMethodInstructions(e.target.value)} rows={3} />
                </div>
                <div className="form-group">
                  <label className="form-check" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={methodEnabled} onChange={(e) => setMethodEnabled(e.target.checked)} style={{ width: 20, height: 20, accentColor: "var(--primary)" }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Enabled</span>
                  </label>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button className="btn-outline small" style={{ flex: 1 }} onClick={() => { setShowMethodForm(false); resetMethodForm(); }}>Cancel</button>
                  <button className="btn-primary small" style={{ flex: 1 }} disabled={methodSaving} onClick={handleSaveMethod}>
                    {methodSaving ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Saving...</> : editingMethod ? "Update" : "Add Method"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AdminTvPlayerProvider>
  );

  // ─── Render current tab ───
  const renderAdminTabContent = () => {
    switch (activeAdminTab) {
      case "videos": return renderVideosTab();
      case "playlist": return renderPlaylistTab();
      case "live": return renderLiveTab();
      default: return null;
    }
  };

  return (
    <AdminTvPlayerProvider>
      <style>{`
        :root {
          --primary: #E8A838; --primary-light: #F5C76B; --bg: #0F0F0F;
          --surface: #1A1A1A; --surface-elevated: #242424;
          --surface-card: #1E1E1E; --surface-hover: #2A2A2A;
          --text-primary: #FFFFFF; --text-secondary: #A0A0A0; --text-tertiary: #6B6B6B;
          --border: #2A2A2A; --error: #EF4444; --success: #22C55E;
          --gradient-start: #E8A838; --gradient-end: #D4762A;
          --radius-sm: 12px; --radius-md: 16px; --radius-lg: 20px; --radius-xl: 24px;
          --radius-full: 50%;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
        html, body { height: 100%; overflow: hidden; background: var(--bg); color: var(--text-primary); }
        .app-container { height: 100%; display: flex; flex-direction: column; position: relative; overflow: hidden; }
        @media (min-width: 480px) { .app-container { max-width: 480px; margin: 0 auto; } }

        .header {
          padding: 12px 16px; display: flex; align-items: center; gap: 12px;
          flex-shrink: 0; background: var(--bg); border-bottom: 1px solid var(--border);
        }
        .header-icon {
          width: 38px; height: 38px; border-radius: var(--radius-sm);
          background: linear-gradient(135deg, #FF0000, #CC0000);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .header-icon i { font-size: 16px; color: #fff; }
        .header-info { flex: 1; min-width: 0; }
        .header-title { font-size: 16px; font-weight: 700; }
        .header-sub { font-size: 11px; color: var(--text-tertiary); margin-top: 1px; }

        .content-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; padding-bottom: 80px; }
        .content-scroll::-webkit-scrollbar { display: none; }

        .section { padding: 12px; display: flex; flex-direction: column; gap: 12px; }


        .channel-card {
          background: var(--surface-card); border: 1px solid var(--border);
          border-radius: var(--radius-lg); padding: 20px;
          display: flex; align-items: center; gap: 16px;
        }
        .channel-avatar {
          width: 56px; height: 56px; border-radius: 50%;
          overflow: hidden; flex-shrink: 0;
          background: var(--surface-elevated);
          border: 2px solid rgba(232,168,56,0.15);
        }
        .channel-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .channel-avatar-fallback {
          width: 56px; height: 56px; border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,0,0,0.1), rgba(255,0,0,0.04));
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; color: var(--text-tertiary);
        }
        .channel-info { flex: 1; min-width: 0; }
        .channel-name { font-size: 16px; font-weight: 700; }
        .channel-meta { font-size: 12px; color: var(--text-secondary); margin-top: 3px; display: flex; align-items: center; gap: 12px; }
        .channel-meta span { display: flex; align-items: center; gap: 4px; }
        .channel-meta i { font-size: 10px; color: var(--text-tertiary); }
        .channel-sync-time { font-size: 11px; color: var(--text-tertiary); margin-top: 4px; }

        .no-channel {
          background: var(--surface-card); border: 1px dashed var(--border);
          border-radius: var(--radius-lg); padding: 32px 20px;
          text-align: center;
        }
        .no-channel i { font-size: 40px; color: var(--text-tertiary); opacity: 0.3; margin-bottom: 12px; }
        .no-channel h3 { font-size: 17px; font-weight: 700; margin-bottom: 6px; }
        .no-channel p { font-size: 13px; color: var(--text-secondary); }

        .form-group { display: flex; flex-direction: column; gap: 8px; }
        .form-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; }
        .form-label i { font-size: 12px; color: var(--primary); }
        .form-input {
          width: 100%; padding: 14px 16px;
          background: var(--surface); border: 1.5px solid var(--border);
          border-radius: var(--radius-md); color: var(--text-primary);
          font-size: 14px; font-weight: 500; outline: none;
          transition: all 0.2s;
        }
        .form-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(232,168,56,0.08); }
        .form-input::placeholder { color: var(--text-tertiary); font-weight: 400; }
        .form-hint { font-size: 11px; color: var(--text-tertiary); display: flex; align-items: center; gap: 4px; }
        .form-hint i { font-size: 10px; }

        .btn-primary {
          width: 100%; padding: 16px;
          border-radius: var(--radius-md); font-size: 15px; font-weight: 700;
          border: none; cursor: pointer; transition: all 0.2s ease;
          background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
          color: #fff; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .btn-primary:active { transform: scale(0.97); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-primary.small { padding: 10px; font-size: 13px; }

        .btn-outline {
          width: 100%; padding: 14px;
          border-radius: var(--radius-md); font-size: 14px; font-weight: 600;
          border: 1.5px solid var(--border); cursor: pointer; transition: all 0.2s ease;
          background: var(--surface); color: var(--text-secondary);
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .btn-outline:active { background: var(--surface-elevated); transform: scale(0.97); }
        .btn-outline.small { padding: 8px 12px; font-size: 12px; width: auto; }

        .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .stat-card {
          background: var(--surface-card); border: 1px solid var(--border);
          border-radius: var(--radius-md); padding: 16px;
          text-align: center;
        }
        .stat-value { font-size: 28px; font-weight: 800; }
        .stat-label { font-size: 11px; color: var(--text-tertiary); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }

        .preview-card {
          background: var(--surface-card); border: 1px solid var(--border);
          border-radius: var(--radius-lg); overflow: hidden;
          display: flex; gap: 12px; padding: 12px;
          transition: all 0.2s;
        }
        .preview-card:active { background: var(--surface-elevated); }
        .preview-thumb {
          width: 80px; height: 48px; border-radius: 6px;
          overflow: hidden; flex-shrink: 0;
          background: var(--surface-elevated);
        }
        .preview-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .preview-info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
        .preview-title { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .preview-meta { font-size: 11px; color: var(--text-tertiary); margin-top: 2px; }
        .previews { display: flex; flex-direction: column; gap: 8px; }

        .section-title { font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
        .section-title i { color: var(--primary); font-size: 13px; }

        .loading-state { padding: 40px; text-align: center; color: var(--text-tertiary); display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .loading-state i { font-size: 32px; opacity: 0.3; }
        .spinner { width: 24px; height: 24px; border: 3px solid rgba(255,255,255,0.05); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes tvGridShimmer {
          0% { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }

        /* ─── Synced Videos Grid (premium card grid) ─── */
        .tv-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .tv-grid-card {
          background: var(--surface-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          overflow: hidden;
          transition: all 0.2s ease;
        }
        .tv-grid-card:active { transform: scale(0.97); background: var(--surface-elevated); }
        .tv-grid-card-thumb {
          position: relative;
          aspect-ratio: 16 / 9;
          background: var(--surface-elevated);
          overflow: hidden;
        }
        .tv-grid-card-thumb img {
          width: 100%; height: 100%; object-fit: cover;
        }
        .tv-grid-card-duration {
          position: absolute; bottom: 6px; right: 6px;
          padding: 2px 6px; border-radius: 4px;
          background: rgba(0,0,0,0.8); color: #fff;
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.3px;
        }
        .tv-grid-card-badge {
          position: absolute; top: 6px; left: 6px;
          width: 24px; height: 24px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; backdrop-filter: blur(4px);
        }
        .tv-grid-card-badge.featured {
          background: rgba(232,168,56,0.85); color: #fff;
        }
        .tv-grid-card-badge.hidden {
          background: rgba(107,107,107,0.85); color: #fff;
        }
        .tv-grid-card-info {
          padding: 8px 10px 10px;
        }
        .tv-grid-card-title {
          font-size: 12px; font-weight: 600;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden; line-height: 1.4;
        }
        .tv-grid-card-meta {
          font-size: 10px; color: var(--text-tertiary);
          margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        /* ─── Skeleton shimmer for video grid ─── */
        .tv-grid-skeleton {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .tv-grid-skeleton-card {
          background: var(--surface-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          overflow: hidden;
        }
        .tv-grid-skeleton-thumb {
          aspect-ratio: 16 / 9;
          background: linear-gradient(90deg, var(--surface-elevated) 25%, var(--surface-hover) 50%, var(--surface-elevated) 75%);
          background-size: 400px 100%;
          animation: tvGridShimmer 1.4s ease-in-out infinite;
        }
        .tv-grid-skeleton-title {
          height: 12px; margin: 10px 10px 6px; border-radius: 6px;
          background: linear-gradient(90deg, var(--surface-elevated) 25%, var(--surface-hover) 50%, var(--surface-elevated) 75%);
          background-size: 400px 100%;
          animation: tvGridShimmer 1.4s ease-in-out infinite;
        }
        .tv-grid-skeleton-meta {
          height: 10px; width: 60%; margin: 0 10px 12px; border-radius: 6px;
          background: linear-gradient(90deg, var(--surface-elevated) 25%, var(--surface-hover) 50%, var(--surface-elevated) 75%);
          background-size: 400px 100%;
          animation: tvGridShimmer 1.4s ease-in-out infinite;
        }

        .tv-grid-empty {
          padding: 24px; text-align: center; color: var(--text-tertiary);
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          background: var(--surface-card); border: 1px dashed var(--border);
          border-radius: var(--radius-lg);
        }
        .tv-grid-empty i { font-size: 28px; opacity: 0.3; }

        .tv-grid-load-more {
          width: 100%; margin-top: 12px; padding: 14px;
          border-radius: var(--radius-md); font-size: 14px; font-weight: 600;
          border: 1.5px solid var(--border); cursor: pointer; transition: all 0.2s ease;
          background: var(--surface); color: var(--text-secondary);
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .tv-grid-load-more:active { background: var(--surface-elevated); transform: scale(0.97); }
        .tv-grid-load-more:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ─── Premium TV Loading Screen ─── */
        .tv-loading-screen {
          position: fixed; inset: 0; z-index: 99999;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          background: #000;
        }
        .tv-loading-ring {
          width: 72px; height: 72px; border-radius: 50%;
          border: 3px solid rgba(232,168,56,0.08);
          border-top-color: #E8A838; border-right-color: #D4762A;
          animation: tvLoadingSpin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          display: flex; align-items: center; justify-content: center;
          position: relative;
        }
        .tv-loading-ring-inner {
          width: 48px; height: 48px; border-radius: 50%;
          border: 2px solid rgba(232,168,56,0.06);
          border-bottom-color: #E8A838; border-left-color: #D4762A;
          animation: tvLoadingSpin 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite reverse;
        }
        .tv-loading-icon {
          position: absolute; font-size: 20px; color: #E8A838;
          animation: tvLoadingPulse 1.6s ease-in-out infinite;
        }
        .tv-loading-brand {
          margin-top: 24px; font-size: 15px; font-weight: 800;
          letter-spacing: -0.3px; color: #E8A838;
          animation: tvLoadingFade 1.6s ease-in-out infinite;
        }
        .tv-loading-dots {
          margin-top: 10px; display: flex; gap: 6px;
        }
        .tv-loading-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #E8A838;
          animation: tvLoadingBounce 1.2s ease-in-out infinite;
        }
        .tv-loading-dot:nth-child(2) { animation-delay: 0.2s; }
        .tv-loading-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes tvLoadingSpin { to { transform: rotate(360deg); } }
        @keyframes tvLoadingPulse {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes tvLoadingFade {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes tvLoadingBounce {
          0%, 100% { transform: translateY(0); opacity: 0.3; }
          50% { transform: translateY(-6px); opacity: 1; }
        }

        /* ─── Skeleton shimmer for browse section ─── */
        @keyframes adminShimmer {
          0% { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }
        .pl-skeleton-list { display: flex; flex-direction: column; gap: 6px; }
        .pl-skeleton-item {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          height: 46px;
        }
        .pl-skeleton-thumb {
          width: 50px; height: 30px; border-radius: 4px; flex-shrink: 0;
          background: linear-gradient(90deg, var(--surface-elevated) 25%, var(--surface-hover) 50%, var(--surface-elevated) 75%);
          background-size: 400px 100%;
          animation: adminShimmer 1.4s ease-in-out infinite;
        }
        .pl-skeleton-line {
          flex: 1; height: 12px; border-radius: 6px;
          background: linear-gradient(90deg, var(--surface-elevated) 25%, var(--surface-hover) 50%, var(--surface-elevated) 75%);
          background-size: 400px 100%;
          animation: adminShimmer 1.4s ease-in-out infinite;
        }

        /* ─── Playlist Builder ─── */
        .pl-builder {
          background: var(--surface-card); border: 1px solid var(--border);
          border-radius: var(--radius-lg); padding: 16px;
          display: flex; flex-direction: column; gap: 12px;
        }
        .pl-selected-header {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 13px; font-weight: 600; color: var(--text-secondary);
          padding-bottom: 8px; border-bottom: 1px solid var(--border);
        }
        .pl-selected-list {
          display: flex; flex-direction: column; gap: 6px;
          max-height: 200px; overflow-y: auto;
        }
        .pl-selected-item {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 8px; border-radius: var(--radius-sm);
          background: var(--surface); border: 1px solid var(--border);
        }
        .pl-selected-thumb {
          width: 40px; height: 26px; border-radius: 4px; overflow: hidden; flex-shrink: 0;
          background: var(--surface-elevated);
        }
        .pl-selected-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .pl-selected-title { flex: 1; min-width: 0; font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pl-selected-pos {
          display: flex; gap: 2px;
        }
        .pl-selected-pos button {
          width: 24px; height: 24px; border-radius: 6px;
          background: var(--surface-elevated); border: 1px solid var(--border);
          color: var(--text-tertiary); font-size: 10px;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .pl-selected-pos button:active { background: var(--surface-hover); }
        .pl-selected-remove {
          width: 24px; height: 24px; border-radius: 6px;
          background: transparent; border: none;
          color: var(--error); font-size: 12px;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .pl-browse-search {
          position: relative;
        }
        .pl-browse-search i {
          position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
          color: var(--text-tertiary); font-size: 13px;
        }
        .pl-browse-search input {
          padding-left: 36px;
        }
        .pl-browse-grid {
          display: flex; flex-direction: column; gap: 6px;
          max-height: 240px; overflow-y: auto;
        }
        .pl-browse-item {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: var(--radius-sm);
          background: var(--surface); border: 1px solid var(--border);
          cursor: pointer; transition: all 0.15s;
        }
        .pl-browse-item:active { background: var(--surface-elevated); }
        .pl-browse-item.added { border-color: var(--success); opacity: 0.6; }
        .pl-browse-thumb {
          width: 50px; height: 30px; border-radius: 4px; overflow: hidden; flex-shrink: 0;
          background: var(--surface-elevated);
        }
        .pl-browse-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .pl-browse-info { flex: 1; min-width: 0; }
        .pl-browse-title { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pl-browse-meta { font-size: 10px; color: var(--text-tertiary); margin-top: 1px; }
        .pl-browse-add {
          width: 28px; height: 28px; border-radius: 8px;
          background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
          border: none; color: #fff; font-size: 11px;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .pl-browse-add:active { transform: scale(0.9); }
        .pl-browse-add.added { background: var(--surface-elevated); color: var(--success); }

        /* ─── Bottom Nav (mobile) ─── */
        .bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(15,15,15,0.92); backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); border-top: 1px solid var(--border); padding: 8px 0 calc(8px + env(safe-area-inset-bottom, 0px)); z-index: 1000; display: flex; justify-content: space-around; align-items: center; }
        @media (min-width: 480px) { .bottom-nav { max-width: 480px; margin: 0 auto; } }
        .nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 12px; background: none; border: none; color: var(--text-tertiary); cursor: pointer; transition: all 0.2s ease; position: relative; }
        .nav-item.active { color: var(--primary); }
        .nav-item i { font-size: 20px; transition: transform 0.2s ease; }
        .nav-item:active i { transform: scale(0.85); }
        .nav-item span { font-size: 10px; font-weight: 600; }
        .nav-item .nav-badge { position: absolute; top: 2px; right: 6px; width: 8px; height: 8px; background: var(--error); border-radius: var(--radius-full); border: 2px solid var(--bg); }

        /* ─── TOP HEADER BAR (matches member TV page) ─── */
        .tv-top-header {
          display: flex; align-items: center; padding: 8px 12px; gap: 8px;
          background: var(--bg-card); border-bottom: 1px solid var(--border);
          flex-shrink: 0; z-index: 25;
        }
        .tv-top-header-title {
          flex: 1; font-size: 15px; font-weight: 700; text-align: center;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .tv-top-header-actions { display: flex; gap: 4px; }
        .tv-top-header-btn {
          width: 34px; height: 34px; border-radius: 50%;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.06);
          color: var(--text-secondary); font-size: 14px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0; transition: all 0.2s ease;
        }
        .tv-top-header-btn:active { background: rgba(255,255,255,0.12); transform: scale(0.9); }

        .feed-section { padding: 0 var(--section-px, 16px) 16px; }
        .feed-section { --section-px: 12px; }

        .tv-top-wrap {
          margin: 0 calc(-1 * var(--section-px, 16px));
        }
        .tv-top {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 14px 0;
        }
        .tv-station {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; font-weight: 700;
        }
        .tv-station i { color: #3B82F6; font-size: 14px; }
        .tv-badges { display: flex; align-items: center; gap: 8px; }
        .tv-live-badge {
          display: flex; align-items: center; gap: 5px;
          padding: 4px 10px; border-radius: 20px;
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
          transition: all 0.3s ease;
        }
        .tv-live-badge.live {
          background: rgba(59,130,246,0.12); color: #3B82F6;
        }
        .tv-live-badge.off {
          background: rgba(107,107,107,0.12); color: var(--text-tertiary);
        }
        .tv-live-dot {
          width: 6px; height: 6px; border-radius: 50%;
        }
        .tv-live-badge.live .tv-live-dot {
          background: #3B82F6;
        }
        .tv-live-badge.off .tv-live-dot {
          background: var(--text-tertiary);
        }
        .tv-sub-badge {
          display: flex; align-items: center; gap: 4px;
          padding: 4px 10px; border-radius: 20px;
          background: var(--surface); border: 1px solid var(--border);
          font-size: 11px; font-weight: 600; color: var(--text-secondary);
        }
        .tv-sub-badge i { font-size: 10px; color: #3B82F6; }
        .tv-start-badge {
          display: flex; align-items: center; gap: 5px;
          padding: 4px 12px;
          border-radius: 20px;
          border: none;
          background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          cursor: pointer;
          animation: tvStartIn 0.3s ease;
          transition: all 0.2s;
        }
        .tv-start-badge:active { transform: scale(0.92); }
        .tv-start-badge .tv-start-countdown {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: rgba(0,0,0,0.2);
          font-size: 9px;
          font-weight: 700;
        }
        .tv-player-container {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000;
          overflow: hidden;
          z-index: 1;
        }
        .tv-player-container .plyr { width: 100%; height: 100%; }
        .tv-player-container .plyr__video-wrapper { height: 100%; }
        .tv-player-container .plyr__video-embed { aspect-ratio: auto !important; }
        .tv-player-container .plyr__video-embed,
        .tv-player-container iframe { width: 100% !important; height: 100% !important; }
        .tv-player-container .plyr__video-embed iframe { transform: scale(1.03); }
        @media (max-width: 480px) {
          .tv-player-container .plyr__controls { padding: 6px 4px !important; }
          .tv-player-container .plyr__control { padding: 8px 6px !important; min-width: 36px; min-height: 36px; }
          .tv-player-container .plyr__control svg { width: 18px; height: 18px; }
          .tv-player-container .plyr__time { font-size: 11px; }
          .tv-player-container { min-height: 240px; }
        }
        .tv-overlay {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          padding: 10px 14px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 8px;
          background: linear-gradient(0deg, rgba(0,0,0,0.8) 0%, transparent 100%);
          pointer-events: none;
        }
        .tv-overlay > * { pointer-events: auto; }
        .tv-overlay-info { flex: 1; min-width: 0; }
        .tv-overlay-now {
          font-size: 10px;
          color: #3B82F6;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 4px;
          margin-bottom: 2px;
        }
        .tv-overlay-now i { font-size: 9px; }
        .tv-overlay-title {
          font-size: 15px;
          font-weight: 700;
          color: #fff;
          text-shadow: 0 1px 4px rgba(0,0,0,0.5);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tv-expand-btn {
          width: 44px; height: 44px; border-radius: 12px;
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.9);
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.2s;
          backdrop-filter: blur(4px);
        }
        .tv-expand-btn:active { background: rgba(255,255,255,0.2); transform: scale(0.9); }
        .tv-start-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 14px;
          border-radius: 10px;
          border: none;
          background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(4px);
          animation: tvStartIn 0.3s ease;
          flex-shrink: 0;
        }
        .tv-start-btn:active { transform: scale(0.92); }
        .tv-start-countdown {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(0,0,0,0.2);
          font-size: 11px;
          font-weight: 700;
        }
        @keyframes tvStartIn {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        .tv-no-video {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 32px;
          border-radius: var(--radius-md);
          background: var(--surface-card);
          border: 1px dashed var(--border);
          color: var(--text-tertiary);
          font-size: 13px;
          margin-bottom: 10px;
          z-index: 1;
          position: relative;
        }
        .tv-no-video i { font-size: 28px; opacity: 0.4; }
        .tv-nextup {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 12px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.2s ease;
          margin-bottom: 8px;
          position: relative;
          z-index: 1;
        }
        .tv-nextup:active { background: var(--surface-elevated); transform: scale(0.98); }
        .tv-nextup-thumb {
          width: 60px; height: 36px; border-radius: 6px;
          overflow: hidden; flex-shrink: 0;
          background: var(--surface-elevated);
          position: relative;
        }
        .tv-nextup-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .tv-nextup-play-icon {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.3);
          color: rgba(255,255,255,0.9);
          font-size: 12px;
        }
        .tv-nextup-info { flex: 1; min-width: 0; }
        .tv-nextup-label {
          font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
          color: var(--primary); margin-bottom: 1px;
        }
        .tv-nextup-title {
          font-size: 12px; font-weight: 600;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .tv-nextup-btn {
          width: 30px; height: 30px; border-radius: 8px;
          background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
          border: none; color: #fff; font-size: 12px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .tv-channel-strip {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          position: relative;
          z-index: 1;
        }
        .tv-channel-avatar {
          width: 36px; height: 36px; border-radius: 50%;
          overflow: hidden; flex-shrink: 0;
          background: var(--surface-elevated);
          display: flex; align-items: center; justify-content: center;
        }
        .tv-channel-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .tv-channel-avatar i { font-size: 16px; color: #FF0000; }
        .tv-channel-info { flex: 1; min-width: 0; }
        .tv-channel-name { font-size: 13px; font-weight: 700; }
        .tv-channel-meta { font-size: 11px; color: var(--text-tertiary); margin-top: 1px; }
        .tv-watch-btn {
          flex-shrink: 0;
          padding: 7px 14px;
          border-radius: 8px;
          background: linear-gradient(135deg, #3B82F6, #6366F1);
          border: none;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          transition: all 0.2s;
        }
        .tv-watch-btn:active { transform: scale(0.95); }

        /* ─── ADMIN TV TAB BAR (matches member TV page) ─── */
        .admin-tv-tab-bar {
          display: flex; flex-shrink: 0;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          overflow-x: auto; -webkit-overflow-scrolling: touch;
        }
        .admin-tv-tab-bar::-webkit-scrollbar { display: none; }
        .admin-tv-tab-btn {
          flex: 1;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          padding: 12px 6px;
          background: none; border: none;
          color: var(--text-tertiary);
          font-size: 12px; font-weight: 600;
          cursor: pointer; position: relative; white-space: nowrap;
          transition: all 0.2s ease;
        }
        .admin-tv-tab-btn i { font-size: 14px; }
        .admin-tv-tab-btn.active { color: var(--primary); }
        .admin-tv-tab-btn.active::after {
          content: ''; position: absolute; bottom: 0; left: 20%; right: 20%;
          height: 2px; background: var(--primary);
          border-radius: 1px 1px 0 0;
        }

        /* ─── LIVE SUB-TABS ─── */
        .live-sub-tabs {
          display: flex; gap: 6px; margin-bottom: 12px;
          flex-shrink: 0; overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .live-sub-tabs::-webkit-scrollbar { display: none; }
        .live-sub-tab {
          padding: 8px 14px; border-radius: 10px; font-size: 12px; font-weight: 700;
          background: var(--surface); border: 1px solid var(--border); color: var(--text-secondary);
          cursor: pointer; transition: all 0.15s ease; position: relative;
          display: flex; align-items: center; gap: 6px;
          white-space: nowrap; flex-shrink: 0;
        }
        .live-sub-tab.active { background: rgba(232,168,56,0.12); border-color: var(--primary); color: var(--primary); }
        .live-sub-tab:active { transform: scale(0.95); }
        .live-sub-badge {
          position: absolute; top: -5px; right: -5px; width: 18px; height: 18px; border-radius: 50%;
          background: var(--error); color: #fff; font-size: 10px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
        }
        .section-title-btn {
          margin-left: auto; font-size: 11px; font-weight: 600; color: var(--primary);
          background: none; border: none; cursor: pointer;
          display: flex; align-items: center; gap: 4px;
        }
        .section-title-btn:active { opacity: 0.7; }

        .live-feed-compact {
          display: flex; flex-direction: column; gap: 6px;
          max-height: 260px; overflow-y: auto;
          background: var(--surface-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 8px;
        }
        .live-feed-compact::-webkit-scrollbar { display: none; }

        .live-feed-full {
          display: flex; flex-direction: column; gap: 6px;
          background: var(--surface-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 8px;
        }

        /* ─── LIVE DASHBOARD ─── */
        .live-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 8px;
        }
        .live-stat-card {
          background: var(--surface-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 14px 10px;
          text-align: center;
        }
        .live-stat-value { font-size: 24px; font-weight: 800; }
        .live-stat-label { font-size: 10px; color: var(--text-tertiary); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.3px; font-weight: 600; }
        .live-stat-sub { font-size: 10px; color: var(--text-tertiary); margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 4px; }

        .live-chat-feed {
          display: flex; flex-direction: column; gap: 6px;
          max-height: 300px; overflow-y: auto;
          background: var(--surface-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 8px;
        }
        .live-chat-feed::-webkit-scrollbar { display: none; }
        .live-chat-item {
          padding: 8px 10px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
        }
        .live-chat-header {
          display: flex; align-items: center; gap: 8px; margin-bottom: 3px;
        }
        .live-chat-name { font-size: 11px; font-weight: 700; color: var(--primary); }
        .live-chat-time { font-size: 9px; color: var(--text-tertiary); margin-left: auto; }
        .live-chat-text { font-size: 12px; line-height: 1.5; word-break: break-word; color: var(--text-secondary); }

        .live-empty {
          padding: 24px; text-align: center; color: var(--text-tertiary);
          display: flex; flex-direction: column; align-items: center; gap: 8px;
        }
        .live-empty i { font-size: 28px; opacity: 0.3; }

        /* ─── Prayer cards with reply ─── */
        .live-prayer-card {
          padding: 10px 12px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          display: flex; flex-direction: column; gap: 4px;
        }
        .live-prayer-card .live-chat-header { margin-bottom: 2px; }
        .live-prayer-card .live-chat-text { margin-bottom: 4px; }

        .tv-prayer-reply {
          margin-top: 8px;
          padding: 10px 12px;
          background: rgba(139,92,246,0.08);
          border: 1px solid rgba(139,92,246,0.12);
          border-radius: var(--radius-sm);
          margin-left: 12px;
        }
        .tv-prayer-reply-header {
          display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
        }
        .tv-prayer-reply-header i { font-size: 10px; color: #8B5CF6; }
        .tv-prayer-reply-name { font-size: 11px; font-weight: 700; color: #8B5CF6; }
        .tv-prayer-reply-time { font-size: 9px; color: var(--text-tertiary); margin-left: auto; }
        .tv-prayer-reply-text { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }

        .live-prayer-reply-form { margin-top: 6px; }
        .live-prayer-reply-btn {
          display: flex; align-items: center; gap: 4px;
          padding: 5px 10px; border-radius: 6px;
          background: var(--surface-elevated); border: 1px solid var(--border);
          color: var(--text-tertiary); font-size: 11px; font-weight: 600;
          cursor: pointer; transition: all 0.15s; font-family: inherit;
        }
        .live-prayer-reply-btn:active { background: var(--surface-hover); }
        .live-prayer-reply-btn i { font-size: 10px; }
        .live-prayer-reply-input {
          width: 100%; padding: 8px 10px;
          background: var(--surface-elevated); border: 1.5px solid var(--border);
          border-radius: var(--radius-sm); color: var(--text-primary);
          font-size: 12px; outline: none; font-family: inherit; resize: vertical;
          transition: all 0.2s; margin-bottom: 6px;
        }
        .live-prayer-reply-input:focus { border-color: #8B5CF6; box-shadow: 0 0 0 2px rgba(139,92,246,0.1); }
        .live-prayer-reply-actions {
          display: flex; gap: 8px; justify-content: flex-end;
        }
        .live-prayer-reply-cancel {
          padding: 6px 12px; border-radius: 6px;
          background: var(--surface); border: 1px solid var(--border);
          color: var(--text-tertiary); font-size: 11px; font-weight: 600;
          cursor: pointer; font-family: inherit;
        }
        .live-prayer-reply-cancel:active { background: var(--surface-elevated); }
        .live-prayer-reply-send {
          padding: 6px 14px; border-radius: 6px;
          background: linear-gradient(135deg, #8B5CF6, #7C3AED);
          border: none; color: #fff; font-size: 11px; font-weight: 700;
          cursor: pointer; display: flex; align-items: center; gap: 4px; font-family: inherit;
          transition: all 0.15s;
        }
        .live-prayer-reply-send:active { transform: scale(0.97); }
        .live-prayer-reply-send:disabled { opacity: 0.5; cursor: not-allowed; }

        .live-giving-form {
          display: flex; flex-direction: column; gap: 12px;
          background: var(--surface-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 16px;
        }

        /* ─── Giving Sub-Tabs ─── */
        .giving-sub-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
        .giving-sub-tab {
          padding: 6px 14px; border-radius: 10px; font-size: 12px; font-weight: 700;
          background: var(--surface); border: 1px solid var(--border); color: var(--text-secondary);
          cursor: pointer; transition: all 0.15s ease; position: relative;
          display: flex; align-items: center; gap: 6px;
        }
        .giving-sub-tab.active { background: rgba(232,168,56,0.12); border-color: var(--primary); color: var(--primary); }
        .giving-sub-tab:active { transform: scale(0.95); }
        .giving-sub-badge {
          position: absolute; top: -5px; right: -5px; width: 18px; height: 18px; border-radius: 50%;
          background: var(--error); color: #fff; font-size: 10px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
        }

        /* ─── Payment Method Cards ─── */
        .pm-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 8px; }
        .pm-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
        .pm-icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(232,168,56,0.12); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
        .pm-info { flex: 1; min-width: 0; }
        .pm-name { font-size: 14px; font-weight: 700; }
        .pm-type { font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.2px; }
        .pm-details { font-size: 12px; color: var(--text-secondary); margin: 4px 0; }
        .pm-details strong { color: var(--text-primary); }
        .pm-instr { font-size: 12px; color: var(--text-tertiary); font-style: italic; margin: 4px 0; }
        .pm-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
        .pm-btn { padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; border: none; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; gap: 4px; }
        .pm-btn:active { transform: scale(0.95); }
        .pm-btn.edit { background: var(--surface-elevated); color: var(--text-primary); border: 1px solid var(--border); }
        .pm-btn.toggle { background: rgba(232,168,56,0.1); color: var(--primary); }
        .pm-btn.danger { background: rgba(239,68,68,0.1); color: var(--error); }

        /* ─── Transaction Cards ─── */
        .tx-stats-row { display: flex; gap: 8px; margin-bottom: 12px; }
        .tx-stat-box { flex: 1; padding: 10px; border-radius: 10px; text-align: center; background: var(--surface); border: 1px solid var(--border); }
        .tx-stat-val { font-size: 20px; font-weight: 800; }
        .tx-stat-lbl { font-size: 10px; color: var(--text-tertiary); font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 2px; }
        .tx-stat-box.pending .tx-stat-val { color: var(--warning); }
        .tx-stat-box.confirmed .tx-stat-val { color: var(--success); }
        .tx-stat-box.rejected .tx-stat-val { color: var(--error); }

        .tx-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 8px; }
        .tx-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
        .tx-member { font-size: 14px; font-weight: 700; }
        .tx-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; padding: 2px 8px; border-radius: 6px; }
        .tx-badge.pending { background: rgba(245,158,11,0.12); color: var(--warning); }
        .tx-badge.confirmed { background: rgba(34,197,94,0.12); color: var(--success); }
        .tx-badge.rejected { background: rgba(239,68,68,0.12); color: var(--error); }
        .tx-amount { font-size: 20px; font-weight: 800; color: var(--primary); margin: 4px 0; }
        .tx-meta { font-size: 12px; color: var(--text-secondary); line-height: 1.6; }
        .tx-meta strong { color: var(--text-primary); }
        .tx-feedback { font-size: 12px; color: var(--text-tertiary); font-style: italic; margin-top: 6px; padding: 6px 10px; background: var(--surface-elevated); border-radius: 6px; }
        .tx-actions { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
        .tx-fb-input { flex: 1; min-width: 120px; padding: 7px 10px; border-radius: 6px; background: var(--surface-elevated); border: 1px solid var(--border); color: var(--text-primary); font-size: 12px; }
        .tx-btn { padding: 7px 14px; border-radius: 6px; font-size: 11px; font-weight: 700; border: none; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; gap: 4px; }
        .tx-btn:active { transform: scale(0.95); }
        .tx-btn.confirm { background: var(--success); color: #fff; }
        .tx-btn.reject { background: rgba(239,68,68,0.1); color: var(--error); border: 1px solid rgba(239,68,68,0.2); }

        /* ─── Modal Overlay ─── */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9000; display: flex; align-items: flex-end; justify-content: center; animation: fadeIn 0.2s ease; }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        .modal-sheet { width: 100%; max-width: 480px; max-height: 85vh; background: var(--surface); border-radius: 24px 24px 0 0; padding: 12px 20px 30px; overflow-y: auto; }
        .modal-handle { width: 40px; height: 4px; background: var(--text-tertiary); border-radius: 2px; margin: 0 auto 12px; opacity: 0.4; }

      `}</style>

      <ToastBridge />

      <div className="app-container">
        <PremiumTopBar />

        {/* ─── TOP HEADER BAR (matches member TV page) ─── */}
        <div className="tv-top-header">
          <button className="tv-top-header-btn" onClick={() => router.back()}>
            <i className="fas fa-chevron-left"></i>
          </button>
          <div className="tv-top-header-title">
            "TV Settings"
          </div>
          <div className="tv-top-header-actions">
            <button
              className="tv-top-header-btn"
              onClick={() => router.push("/tv")}
              title="Open TV in new tab"
            >
              <i className="fas fa-external-link-alt"></i>
            </button>
            <button
              className="tv-top-header-btn"
              onClick={() => router.push("/admin")}
              title="Dashboard"
            >
              <i className="fas fa-home"></i>
            </button>
          </div>
        </div>

        {/* TAB BAR */}
        <div className="admin-tv-tab-bar">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`admin-tv-tab-btn ${activeAdminTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveAdminTab(tab.id)}
            >
              <i className={`fas ${tab.icon}`}></i>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div className="content-scroll">
            {/* TV CARD — outside section wrapper for edge-to-edge */}

            {loading ? (
              <div className="tv-loading-screen">
                <div className="tv-loading-ring">
                  <div className="tv-loading-ring-inner"></div>
                  <i className="fas fa-tv tv-loading-icon"></i>
                </div>
                <div className="tv-loading-brand">Church TV</div>
                <div className="tv-loading-dots">
                  <div className="tv-loading-dot"></div>
                  <div className="tv-loading-dot"></div>
                  <div className="tv-loading-dot"></div>
                </div>
              </div>
            ) : (
              <div className="section">
                {renderAdminTabContent()}
              </div>
            )}
        </div>

        <AdminBottomNav />
      </div>
    </AdminTvPlayerProvider>
  );
}
