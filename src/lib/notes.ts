import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface TvNote {
  videoId: string;
  videoTitle: string;
  content: string; // Markdown-like formatted text
  updatedAt: Date | null;
}

export async function saveUserNote(
  uid: string,
  videoId: string,
  videoTitle: string,
  content: string
): Promise<void> {
  const ref = doc(db, "users", uid, "tv_notes", videoId);
  await setDoc(ref, {
    videoId,
    videoTitle,
    content,
    updatedAt: serverTimestamp(),
  });
}

export async function getUserNote(
  uid: string,
  videoId: string
): Promise<TvNote | null> {
  const ref = doc(db, "users", uid, "tv_notes", videoId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    ...data,
    updatedAt: (data.updatedAt as any)?.toDate?.() || data.updatedAt || null,
  } as TvNote;
}

export async function getAllUserNotes(
  uid: string
): Promise<TvNote[]> {
  const col = collection(db, "users", uid, "tv_notes");
  const q = query(col, orderBy("updatedAt", "desc"), limit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      updatedAt: (data.updatedAt as any)?.toDate?.() || data.updatedAt || null,
    } as TvNote;
  });
}

export async function deleteUserNote(
  uid: string,
  videoId: string
): Promise<void> {
  const ref = doc(db, "users", uid, "tv_notes", videoId);
  await deleteDoc(ref);
}
