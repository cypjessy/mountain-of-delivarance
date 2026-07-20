/**
 * Shared TV player progress hook — save/resume with throttled Firestore writes.
 *
 * Eliminates the duplicate save/resume logic between Admin TV and Member TV pages.
 * Instead of writing every 5 seconds unconditionally, it:
 *   - Debounces writes (coalesces rapid seek changes)
 *   - Only writes when seek or index actually changed (≥2s threshold)
 *   - Falls back to a 30-second backup interval
 *   - Writes on page hide / beforeunload
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { getAdminTvState, saveAdminTvState } from "./r2Videos";

interface SavedSnapshot {
  currentIndex: number;
  currentSeek: number;
}

export function useTvProgress(uid?: string) {
  const [plCurrentIndex, setPlCurrentIndex] = useState(0);
  const [interruptVersion, setInterruptVersion] = useState(0);
  const [isInitialBumperPlayed, setIsInitialBumperPlayed] = useState(false);
  const [isBumperInterrupting, setIsBumperInterrupting] = useState(false);

  // ── Refs ──────────────────────────────────────────────
  const currentSeekRef = useRef(0);              // latest seek from VideoJsPlayer
  const savedSeekRef = useRef(0);                // seek value to restore after bumper
  const savedPlIndexRef = useRef(0);             // index value to restore after bumper
  const lastPlIndexRef = useRef(0);              // tracks plCurrentIndex for closure-safe reads
  const lastSavedRef = useRef<SavedSnapshot>({ currentIndex: 0, currentSeek: 0 });
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumperInterruptTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    lastPlIndexRef.current = plCurrentIndex;
  }, [plCurrentIndex]);

  // Reset savedSeekRef after a seek has been applied (interruptVersion increments)
  useEffect(() => {
    if (interruptVersion > 0) savedSeekRef.current = 0;
  }, [interruptVersion]);

  // ── Core save (actually writes to Firestore) ──
  const doSave = useCallback(async () => {
    if (!uid) return;
    const idx = lastPlIndexRef.current;
    const seek = currentSeekRef.current;
    const last = lastSavedRef.current;
    // Skip if nothing meaningfully changed
    if (idx === last.currentIndex && Math.abs(seek - last.currentSeek) < 2) return;
    try {
      await saveAdminTvState(uid, { currentIndex: idx, currentSeek: seek });
      lastSavedRef.current = { currentIndex: idx, currentSeek: seek };
    } catch { /* silent */ }
  }, [uid]);

  // ── Debounced save (coalesces rapid onTimeUpdate calls) ──
  const scheduleSave = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(doSave, 1000);
  }, [doSave]);

  // onTimeUpdate callback — call from VideoJsPlayer
  const onTimeUpdate = useCallback((time: number) => {
    currentSeekRef.current = time;
    scheduleSave();
  }, [scheduleSave]);

  // ── Backup interval (30s — ensures progress is saved even if onTimeUpdate is slow) ──
  useEffect(() => {
    if (!uid) return;
    const backup = setInterval(doSave, 30000);
    return () => clearInterval(backup);
  }, [uid, doSave]);

  // ── Save on page hide / beforeunload ──
  useEffect(() => {
    if (!uid) return;
    const handleUnload = () => doSave();
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") doSave();
    };
    window.addEventListener("beforeunload", handleUnload);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      doSave();
      window.removeEventListener("beforeunload", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [uid, doSave]);

  // ── Load saved state on mount ──
  const [loadedSavedState, setLoadedSavedState] = useState(false);
  useEffect(() => {
    if (!uid) { setLoadedSavedState(true); return; }
    let mounted = true;
    (async () => {
      try {
        const state = await getAdminTvState(uid);
        if (!mounted) return;
        if (state) {
          savedPlIndexRef.current = state.currentIndex;
          savedSeekRef.current = state.currentSeek;
          lastSavedRef.current = { currentIndex: state.currentIndex, currentSeek: state.currentSeek };
        }
      } catch { /* no saved state */ }
      if (mounted) setLoadedSavedState(true);
    })();
    return () => { mounted = false; };
  }, [uid]);

  // ── Bumper interrupt timer ──
  const startInterruptTimer = useCallback(() => {
    if (bumperInterruptTimerRef.current) clearInterval(bumperInterruptTimerRef.current);
    bumperInterruptTimerRef.current = setInterval(() => {
      savedSeekRef.current = currentSeekRef.current;
      setIsBumperInterrupting(true);
    }, 15 * 60 * 1000);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (bumperInterruptTimerRef.current) clearInterval(bumperInterruptTimerRef.current);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return {
    plCurrentIndex,
    setPlCurrentIndex,
    currentSeekRef,
    savedSeekRef,
    savedPlIndexRef,
    interruptVersion,
    setInterruptVersion,
    isInitialBumperPlayed,
    setIsInitialBumperPlayed,
    isBumperInterrupting,
    setIsBumperInterrupting,
    startInterruptTimer,
    bumperInterruptTimerRef,
    onTimeUpdate,
    loadedSavedState,
  };
}
