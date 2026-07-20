import { NextResponse } from "next/server";

const DEFAULT_CONFIG = {
  streamUrl: "https://azuracast.histoview.co.ke/listen/mountain_of_delivarance_church/radio.mp3",
  stationId: "1",
  buttons: {
    admin: {
      hero: {
        play: { label: "Listen Live", playingLabel: "Pause", icon: "fa-play", playingIcon: "fa-pause", type: "toggle-stream" },
        shuffle: { label: "Shuffle", icon: "fa-shuffle", type: "shuffle" },
        expand: { label: "Open Radio", icon: "fa-expand", type: "navigate", path: "/admin/radio" },
      },
      player: {
        miniPlay: { label: "Play", icon: "fa-play", playingIcon: "fa-stop", type: "toggle-stream" },
      },
    },
    member: {
      hero: {
        play: { label: "Listen Live", playingLabel: "Pause", icon: "fa-play", playingIcon: "fa-pause", type: "toggle-stream" },
        expand: { label: "Open Radio", icon: "fa-expand", type: "navigate", path: "/radio" },
      },
    },
    radio: {
      mainPlayer: {
        play: { label: "Play", playingLabel: "Pause", icon: "fa-play", playingIcon: "fa-pause", type: "toggle-stream" },
      },
    },
    station: {
      header: {
        play: { label: "Play", playingLabel: "Pause", icon: "fa-play", playingIcon: "fa-pause", type: "toggle-stream" },
      },
    },
  },
  endpoints: {},
};

export async function GET() {
  return NextResponse.json(DEFAULT_CONFIG);
}
