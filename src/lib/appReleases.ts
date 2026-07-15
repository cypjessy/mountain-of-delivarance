/**
 * Firestore CRUD for app release versions.
 * Each release represents a built Android APK with a bumped version.
 */
import { db } from "./firebase";
import {
  doc, getDoc, getDocs, setDoc,
  collection, query, orderBy, limit, serverTimestamp,
} from "firebase/firestore";

const RELEASES_COL = "app_releases";

/* ─── Types ─── */

export interface AppRelease {
  id: string;
  versionCode: number;
  versionName: string;
  downloadUrl: string;      // URL to the APK (served from public/ via Vercel)
  fileSize: number;          // bytes
  releaseNotes: string;
  createdAt: Date | null;
}

/* ─── Read ─── */

/** Get the latest app release (highest versionCode). */
export async function getLatestRelease(): Promise<AppRelease | null> {
  const q = query(
    collection(db, RELEASES_COL),
    orderBy("versionCode", "desc"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as AppRelease;
}

/** Get all releases ordered by versionCode descending. */
export async function getAllReleases(): Promise<AppRelease[]> {
  const q = query(
    collection(db, RELEASES_COL),
    orderBy("versionCode", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppRelease));
}

/** Get a specific release by its Firestore doc ID. */
export async function getReleaseById(id: string): Promise<AppRelease | null> {
  const snap = await getDoc(doc(db, RELEASES_COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as AppRelease;
}

/* ─── Write (admin/build-token only) ─── */

export async function createRelease(
  data: Omit<AppRelease, "id" | "createdAt">
): Promise<string> {
  const ref = doc(collection(db, RELEASES_COL));
  await setDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
