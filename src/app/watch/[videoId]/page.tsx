import { getVideos } from "@/lib/youtube";
import WatchPageClient from "./WatchPageClient";

// Only pre-generate the most recent 20 videos at build time.
// dynamicParams: false means any unlisted video IDs will 404 — acceptable since
// most users only access recent videos. Prevents 36MB+ of static exports.
export const dynamicParams = false;

export async function generateStaticParams() {
  try {
    const videos = await getVideos({ max: 20 });
    return videos.map((v) => ({ videoId: v.id }));
  } catch (e) {
    console.warn("[WatchPage] generateStaticParams failed — no watch pages will be pre-generated.", e);
    return [];
  }
}

export default function WatchPage() {
  return <WatchPageClient />;
}
