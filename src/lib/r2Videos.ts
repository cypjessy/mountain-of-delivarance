/**
 * Firestore CRUD for R2 video metadata & R2 TV scheduled playlists.
 */
import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";

/* ─── Types ─────────────────────────────────────────────────── */

export interface R2Video {
  id: string;
  title: string;
  description: string;
  url: string;          // R2 public URL
  key: string;          // R2 object key
  fileSize: number;
  contentType: string;
  originalName: string;
  duration: number;     // seconds (from metadata or manual input)
  thumbnail: string;    // optional thumbnail URL
  category: string;     // e.g. "sermon", "worship", "event", "announcement"
  isFeatured: boolean;
  isHidden: boolean;
  uploadedAt: Date | null;
}

export interface R2TvPlaylist {
  id: string;
  title: string;
  videoIds: string[];          // R2 video document IDs (ordered playback)
  currentIndex: number;        // index of the video to start from (0 = first)
  isActive: boolean;
  createdAt: Date | null;
}

const VIDEOS_COL = "r2_videos";
const PLAYLIST_COL = "r2_tv_playlists";

/* ─── R2 Videos CRUD ───────────────────────────────────────── */

export async function getR2Videos(opts?: {
  max?: number;
  includeHidden?: boolean;
}): Promise<R2Video[]> {
  let q = query(collection(db, VIDEOS_COL), orderBy("uploadedAt", "desc"));
  if (opts?.max) q = query(q, limit(opts.max));
  const snap = await getDocs(q);
  let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as R2Video));
  if (!opts?.includeHidden) list = list.filter((v) => !v.isHidden);
  return list;
}

export async function getR2Video(id: string): Promise<R2Video | null> {
  const snap = await getDoc(doc(db, VIDEOS_COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as R2Video;
}

export async function addR2Video(
  data: Omit<R2Video, "id" | "uploadedAt">
): Promise<string> {
  const ref = doc(collection(db, VIDEOS_COL));
  await setDoc(ref, {
    ...data,
    uploadedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateR2Video(
  id: string,
  data: Partial<R2Video>
): Promise<void> {
  const ref = doc(db, VIDEOS_COL, id);
  await setDoc(ref, data, { merge: true });
}

export async function deleteR2Video(id: string): Promise<void> {
  await deleteDoc(doc(db, VIDEOS_COL, id));
}

/* ─── R2 TV Playlist CRUD ─────────────────────────────────── */

export async function getR2TvPlaylists(): Promise<R2TvPlaylist[]> {
  const q = query(collection(db, PLAYLIST_COL), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as R2TvPlaylist));
}

export async function addR2TvPlaylist(
  data: Omit<R2TvPlaylist, "id" | "createdAt">
): Promise<string> {
  const ref = doc(collection(db, PLAYLIST_COL));
  await setDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteR2TvPlaylist(id: string): Promise<void> {
  await deleteDoc(doc(db, PLAYLIST_COL, id));
}

export async function updateR2TvPlaylist(
  id: string,
  data: Partial<R2TvPlaylist>
): Promise<void> {
  await setDoc(doc(db, PLAYLIST_COL, id), data, { merge: true });
}
