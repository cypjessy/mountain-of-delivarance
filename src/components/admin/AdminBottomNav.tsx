"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface NavTab {
  tab: string;
  icon: string;
  label: string;
  showBadge?: boolean;
  showLiveDot?: boolean;
}

const tabs: NavTab[] = [
  { tab: "dashboard", icon: "fa-chart-line", label: "Dashboard" },
  { tab: "radio", icon: "fa-tower-broadcast", label: "Radio" },
  { tab: "tv", icon: "fa-tv", label: "TV", showLiveDot: true },
  { tab: "meetings", icon: "fa-people-group", label: "Meetings" },
  { tab: "content", icon: "fa-photo-film", label: "Content" },
  { tab: "members", icon: "fa-users", label: "Members", showBadge: true },
];

const tabRoutes: Record<string, string> = {
  dashboard: "/admin",
  radio: "/admin/radio",
  tv: "/admin/tv",
  meetings: "/admin/meetings",
  content: "/admin/content",
  members: "/admin/members",
};

export default function AdminBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [showSidebar, setShowSidebar] = useState(false);
  const [liveTvActive, setLiveTvActive] = useState(false);

  useEffect(() => {
    const check = () => setShowSidebar(window.innerWidth >= 1400);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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

  const activeTab = Object.entries(tabRoutes).find(
    ([, route]) => pathname === route || (route !== "/admin" && pathname?.startsWith(route + "/"))
  )?.[0] || "dashboard";

  const navigate = (tab: string) => {
    const route = tabRoutes[tab];
    if (route) router.push(route);
  };

  return (
    <>
      <style>{`
        .nav-live-dot { position: absolute; top: 1px; right: 8px; width: 8px; height: 8px; background: #EF4444; border-radius: 50%; border: 2px solid var(--bg,#0F0F0F); animation: navLivePulse 1.5s ease-in-out infinite; }
        @keyframes navLivePulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.3); opacity: 0.6; } }
      `}</style>
    <nav className={showSidebar ? "admin-sidebar" : "bottom-nav"}>
      {tabs.map((tab) => (
        <button
          key={tab.tab}
          className={`nav-item${tab.tab === activeTab ? " active" : ""}`}
          onClick={() => navigate(tab.tab)}
          style={tab.showLiveDot ? { position: "relative" } : undefined}
        >
          <i className={`fas ${tab.icon}`}></i>
          {tab.showLiveDot && liveTvActive && <span className="nav-live-dot"></span>}
          <span>{tab.label}</span>
          {tab.showBadge && <span className="nav-badge"></span>}
        </button>
      ))}
    </nav>
    </>
  );
}
