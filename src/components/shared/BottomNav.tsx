"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface BottomNavProps {
  activeTab?: "home" | "tv" | "radio" | "meetings" | "gallery";
}

export default function BottomNav({ activeTab: propActiveTab }: BottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [liveTvActive, setLiveTvActive] = useState(false);

  // Listen for live TV status
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "tv_live_status", "main"), (snap: any) => {
      if (snap.exists()) {
        const d = snap.data();
        setLiveTvActive(d.isLive && !!d.liveVideoId);
      } else {
        setLiveTvActive(false);
      }
    });
    return () => unsub();
  }, []);

  // Auto-detect active tab from pathname if not provided as prop
  const detectedTab = (() => {
    if (pathname === "/dashboard") return "home";
    if (pathname === "/tv") return "tv";
    if (pathname === "/radio") return "radio";
    if (pathname === "/meetings") return "meetings";
    if (pathname === "/gallery") return "gallery";
    return null;
  })();

  const activeTab = propActiveTab || detectedTab || "home";

  const navigate = (path: string) => {
    router.push(path);
  };

  return (
    <>
      <style>{`
        .nav-live-dot { position: absolute; top: 1px; right: 8px; width: 8px; height: 8px; background: #EF4444; border-radius: 50%; border: 2px solid var(--bg,#0F0F0F); animation: navLivePulse 1.5s ease-in-out infinite; }
        @keyframes navLivePulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.3); opacity: 0.6; } }
      `}</style>
    <nav className="bottom-nav">
      <button
        className={`nav-item${activeTab === "home" ? " active" : ""}`}
        onClick={() => navigate("/dashboard")}
      >
        <i className="fas fa-house"></i>
        <span>Home</span>
      </button>
      <button
        className={`nav-item${activeTab === "tv" ? " active" : ""}`}
        onClick={() => navigate("/tv")}
        style={{ position: "relative" }}
      >
        <i className="fas fa-tv"></i>
        {liveTvActive && <span className="nav-live-dot"></span>}
        <span>TV</span>
      </button>
      <button
        className={`nav-item${activeTab === "radio" ? " active" : ""}`}
        onClick={() => navigate("/radio")}
      >
        <i className="fas fa-radio"></i>
        <span>Radio</span>
      </button>
      <button
        className={`nav-item${activeTab === "meetings" ? " active" : ""}`}
        onClick={() => navigate("/meetings")}
      >
        <i className="fas fa-people-group"></i>
        <span>Meetings</span>
      </button>
      <button
        className={`nav-item${activeTab === "gallery" ? " active" : ""}`}
        onClick={() => navigate("/gallery")}
      >
        <i className="fas fa-images"></i>
        <span>Gallery</span>
      </button>
    </nav>
    </>
  );
}
