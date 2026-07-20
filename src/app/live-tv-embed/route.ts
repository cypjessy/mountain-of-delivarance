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
<html lang="en" style="margin:0;background:#000;">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
  <title>Live TV</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; width: 100vw; height: 100vh; }
    iframe { width: 100%; height: 100%; border: none; display: block; }
  </style>
</head>
<body>
  <iframe
    src="https://odysee.com/$/embed/@otvlive:a/gib254:2?autoplay=true"
    allow="autoplay; encrypted-media"
    allowFullScreen
    title="Live TV"
  ></iframe>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
