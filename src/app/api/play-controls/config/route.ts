import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const config = {
    // Stream URL for audio.toggle()
    streamUrl: process.env.NEXT_PUBLIC_STREAM_URL || "https://azuracast.histoview.co.ke/listen/turningpoint_church/radio.mp3",
    stationId: process.env.NEXT_PUBLIC_STATION_ID || "1",

    // Button configurations organized by page/zone
    buttons: {
      admin: {
        hero: {
          play: {
            label: "Listen Live",
            playingLabel: "Pause",
            icon: "fa-play",
            playingIcon: "fa-pause",
            type: "toggle-stream",
          },
          shuffle: {
            label: "Shuffle",
            icon: "fa-shuffle",
            type: "shuffle",
          },
          expand: {
            label: "Open Radio",
            icon: "fa-expand",
            type: "navigate",
            path: "/admin/radio",
          },
        },
        autodj: {
          start: {
            label: "Start AutoDJ",
            icon: "fa-play",
            type: "api-call",
            endpoint: "/api/azuracast/toggle-autodj",
            method: "POST",
          },
          stop: {
            label: "Pause AutoDJ",
            icon: "fa-pause",
            type: "api-call",
            endpoint: "/api/azuracast/toggle-autodj",
            method: "POST",
          },
        },
        player: {
          miniPlay: {
            label: "Play",
            icon: "fa-play",
            playingIcon: "fa-stop",
            type: "toggle-stream",
          },
        },
      },
      member: {
        hero: {
          play: {
            label: "Listen Live",
            playingLabel: "Pause",
            icon: "fa-play",
            playingIcon: "fa-pause",
            type: "toggle-stream",
          },
          expand: {
            label: "Open Radio",
            icon: "fa-expand",
            type: "navigate",
            path: "/radio",
          },
        },
      },
      radio: {
        mainPlayer: {
          play: {
            label: "Play",
            playingLabel: "Pause",
            icon: "fa-play",
            playingIcon: "fa-pause",
            type: "toggle-stream",
          },
        },
      },
      station: {
        header: {
          play: {
            label: "Play",
            playingLabel: "Pause",
            icon: "fa-play",
            playingIcon: "fa-pause",
            type: "toggle-stream",
          },
        },
      },
    },

    // API endpoints used by buttons
    endpoints: {
      nowPlaying: "/api/azuracast/now-playing",
      songHistory: "/api/azuracast/song-history",
      queue: "/api/azuracast/queue",
      playlists: "/api/azuracast/playlists",
      toggleAutoDJ: "/api/azuracast/toggle-autodj",
      togglePlaylist: "/api/azuracast/toggle-playlist",
      stationStatus: "/api/azuracast/station-status",
      streamers: "/api/azuracast/streamers",
      media: "/api/azuracast/media",
    },
  };

  return NextResponse.json(config, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=300",
    },
  });
}
