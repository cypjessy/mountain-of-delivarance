import { NextRequest, NextResponse } from "next/server";

const YT_API_KEY = process.env.YOUTUBE_API_KEY || "";
const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

interface YtChannelSnippet {
  title: string;
  thumbnails: { medium?: { url: string }; default?: { url: string } };
}

interface YtChannelStat {
  subscriberCount: string;
  videoCount: string;
}

interface YtChannelResponse {
  items?: { id: string; snippet: YtChannelSnippet; statistics: YtChannelStat }[];
}

interface YtPlaylistItem {
  snippet: {
    resourceId: { videoId: string };
    title: string;
    description: string;
    thumbnails: { medium?: { url: string }; default?: { url: string } };
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    position: number;
  };
}

interface YtPlaylistResponse {
  items?: YtPlaylistItem[];
  nextPageToken?: string;
  pageInfo: { totalResults: number };
}

interface YtVideoItem {
  id: string;
  contentDetails: { duration: string };
}

interface YtVideoResponse {
  items?: YtVideoItem[];
}

function parseDuration(iso: string): number {
  const match = iso.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return 0;
  const h = parseInt(match[1]) || 0;
  const m = parseInt(match[2]) || 0;
  const s = parseInt(match[3]) || 0;
  return h * 3600 + m * 60 + s;
}

export async function POST(req: NextRequest) {
  try {
    const { channelId } = await req.json();

    if (!channelId) {
      return NextResponse.json({ error: "channelId is required" }, { status: 400 });
    }

    if (!YT_API_KEY) {
      return NextResponse.json({ error: "YOUTUBE_API_KEY not configured" }, { status: 500 });
    }

    // Fetch channel info
    const channelUrl = `${YT_API_BASE}/channels?part=snippet,statistics&id=${channelId}&key=${YT_API_KEY}`;
    const channelRes = await fetch(channelUrl);
    if (!channelRes.ok) {
      const err = await channelRes.text().catch(() => "Unknown");
      return NextResponse.json({ error: `YouTube API error: ${err}` }, { status: 502 });
    }

    const channelData: YtChannelResponse = await channelRes.json();
    if (!channelData.items || channelData.items.length === 0) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const ch = channelData.items[0];
    const channel = {
      channelId: ch.id,
      title: ch.snippet.title,
      thumbnail: ch.snippet.thumbnails.medium?.url || ch.snippet.thumbnails.default?.url || "",
      subscriberCount: ch.statistics.subscriberCount || "0",
      videoCount: parseInt(ch.statistics.videoCount || "0"),
    };

    // Fetch all uploaded videos via the uploads playlist (UU{channelId})
    const uploadsPlaylistId = `UU${channelId}`;
    const allVideoIds: string[] = [];
    const videoMetaMap = new Map<string, { title: string; description: string; thumbnail: string; channelTitle: string; channelId: string; publishedAt: string; position: number }>();

    let nextPageToken: string | undefined;
    do {
      const playlistUrl = `${YT_API_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&key=${YT_API_KEY}${nextPageToken ? `&pageToken=${nextPageToken}` : ""}`;
      const plRes = await fetch(playlistUrl);
      if (!plRes.ok) break;

      const plData: YtPlaylistResponse = await plRes.json();
      if (!plData.items) break;

      for (const item of plData.items) {
        const videoId = item.snippet.resourceId.videoId;
        allVideoIds.push(videoId);
        videoMetaMap.set(videoId, {
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || "",
          channelTitle: item.snippet.channelTitle,
          channelId: item.snippet.channelId,
          publishedAt: item.snippet.publishedAt,
          position: item.snippet.position,
        });
      }

      nextPageToken = plData.nextPageToken;
    } while (nextPageToken && allVideoIds.length < 500);

    // Fetch video durations in batches of 50
    const durations = new Map<string, number>();
    for (let i = 0; i < allVideoIds.length; i += 50) {
      const batch = allVideoIds.slice(i, i + 50);
      const videoUrl = `${YT_API_BASE}/videos?part=contentDetails&id=${batch.join(",")}&key=${YT_API_KEY}`;
      const vidRes = await fetch(videoUrl);
      if (!vidRes.ok) continue;

      const vidData: YtVideoResponse = await vidRes.json();
      if (vidData.items) {
        for (const item of vidData.items) {
          durations.set(item.id, parseDuration(item.contentDetails.duration));
        }
      }
    }

    // Build videos array
    const videos = allVideoIds.map((id) => {
      const meta = videoMetaMap.get(id)!;
      return {
        id,
        title: meta.title,
        description: meta.description,
        thumbnail: meta.thumbnail,
        channelTitle: meta.channelTitle,
        channelId: meta.channelId,
        publishedAt: meta.publishedAt,
        duration: durations.get(id) || 0,
        position: meta.position,
        isFeatured: false,
        isHidden: false,
        syncedAt: null,
      };
    });

    return NextResponse.json({ channel, videos });
  } catch (err: any) {
    console.error("[YouTube Sync] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
