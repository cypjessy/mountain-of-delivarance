/**
 * Route handler for /live-tv-embed.
 *
 * Returns raw HTML with the Odysee iframe, bypassing Next.js App Router's
 * root layout. This ensures that when the APK loads this page in an iframe,
 * it does NOT bring in the full app layout (nav, topbar, etc.) that would
 * cause an "app within an app" effect.
 */

export const dynamic = "force-static";

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover" />
  <title>MOD NAKURU | Live TV</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root { --primary: #E8A838; --primary-light: #F5C76B; --bg: #0F0D0A; --surface: #181512; --border: #2B2720; }
    html, body {
      width: 100%; height: 100%; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg); color: #fff;
    }
    .app {
      display: flex; flex-direction: column; height: 100%; width: 100%;
    }
    .topbar {
      display: flex; align-items: center; gap: 10px;
      padding: env(safe-area-inset-top, 8px) 14px 8px;
      background: var(--bg); border-bottom: 1px solid var(--border); flex-shrink: 0;
      z-index: 10;
    }
    .topbar-back {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: rgba(255,255,255,0.08); color: #fff;
      font-size: 16px; cursor: pointer; display: flex;
      align-items: center; justify-content: center; flex-shrink: 0;
      transition: background 0.2s;
    }
    .topbar-back:active { background: rgba(255,255,255,0.15); }
    .topbar-brand { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
    .topbar-logo {
      width: 28px; height: 28px; border-radius: 8px;
      background: linear-gradient(135deg, var(--primary), var(--primary-light));
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 800; color: #fff; flex-shrink: 0;
    }
    .topbar-title { font-size: 14px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .topbar-title span { color: var(--primary); }
    .topbar-badge {
      display: flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 20px;
      background: rgba(232,168,56,0.15); color: var(--primary);
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px; flex-shrink: 0;
    }
    .topbar-badge-dot {
      width: 5px; height: 5px; border-radius: 50%; background: #EF4444;
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    .player-wrap {
      flex: 1; position: relative; overflow: hidden; background: #000;
    }
    .player-wrap iframe {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      border: none; display: block;
    }
    .bottom-bar {
      display: flex; align-items: center; justify-content: center; gap: 16px;
      padding: 10px 14px env(safe-area-inset-bottom, 10px);
      background: var(--bg); border-top: 1px solid var(--border); flex-shrink: 0;
    }
    .bottom-bar span {
      font-size: 11px; color: rgba(255,255,255,0.4);
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="topbar">
      <button class="topbar-back" onclick="window.history.back()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="topbar-brand">
        <div class="topbar-logo">M</div>
        <div class="topbar-title">MOD NAKURU <span>|</span> Live TV</div>
      </div>
      <div class="topbar-badge"><span class="topbar-badge-dot"></span> LIVE</div>
    </div>
    <div class="player-wrap">
      <iframe
        src="https://odysee.com/$/embed/@otvlive:a/gib254:2?autoplay=true"
        allow="autoplay; encrypted-media"
        allowFullScreen
        title="Live TV"
      ></iframe>
    </div>
    <div class="bottom-bar">
      <span>Mountain of Deliverance Church</span>
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
