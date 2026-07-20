# MOUNTAIN OF DELIVERANCE CHURCH — App Architecture & Operations Manual

> **Prepared for:** Client IT Team  
> **App:** MOD NAKURU (Mountain of Deliverance Church)  
> **Platforms:** Web (Vercel) + Android APK (Capacitor)  
> **Last Updated:** July 2026

---

# 1. System Overview

The app is a **Next.js 16** single-page church application serving both as a **responsive web app** (hosted on Vercel) and a **bundled Android APK** (via Capacitor 8). It connects to multiple cloud services for radio streaming, video content, payments, and storage.

```
┌──────────────────────────────────────────────────────────┐
│                    USERS (Web + Android APK)              │
├──────────────────────────────────────────────────────────┤
│                      Cloudflare DNS                       │
│                  mountain-of-delivarance.vercel.app       │
├──────────────────────────────────────────────────────────┤
│                    VERCEL (Hosting)                       │
│  ┌────────────────────────────────────────────────────┐   │
│  │              Next.js 16 Application                │   │
│  │  ┌────────────┐  ┌────────┐  ┌──────────────────┐ │   │
│  │  │ Static     │  │ API    │  │ Middleware (CORS) │ │   │
│  │  │ Pages      │  │ Routes │  │                  │ │   │
│  │  └────────────┘  └────────┘  └──────────────────┘ │   │
│  └────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────┤
│   ┌──────────────────────────────────────────────────┐   │
│   │  CONTA BO VPS (173.249.50.98)                     │   │
│   │  ┌──────────────┐  ┌──────────┐  ┌────────────┐ │   │
│   │  │ AzuraCast    │  │ LiveKit  │  │ BunnyCDN   │ │   │
│   │  │ (Radio)      │  │ (Audio   │  │ (Storage)  │ │   │
│   │  │              │  │  Rooms)  │  │            │ │   │
│   │  └──────────────┘  └──────────┘  └────────────┘ │   │
│   └──────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────┤
│     ┌────────────────────────────────────────────────┐   │
│     │              FIREBASE (Google Cloud)             │   │
│     │  ┌──────────┐  ┌───────────┐  ┌─────────────┐ │   │
│     │  │ Auth     │  │ Firestore │  │ FCM (Push)  │ │   │
│     │  └──────────┘  └───────────┘  └─────────────┘ │   │
│     └────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌──────────────┐  ┌────────┐  ┌────────┐ │
│  │Paystack │  │Cloudflare R2 │  │YouTube │  │GitHub  │ │
│  │(Payments)│  │(Video Store) │  │(Content)│  │(Source)│ │
│  └─────────┘  └──────────────┘  └────────┘  └────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

# 2. Deployed URL

| Environment | URL |
|-------------|-----|
| **Production (Web)** | https://mountain-of-delivarance.vercel.app |
| **Android APK** | https://mountain-of-delivarance.vercel.app/app-release.apk |
| **Source Code** | https://github.com/anomalyco/churchproject (assumed) |

---

# 3. Hosting & Infrastructure

## 3.1 Vercel (Primary Hosting)
- **Platform:** Vercel (Free/Hobby tier assumed)
- **Deployment:** Automatic via Git push to `main` branch
- **Domains:** `mountain-of-delivarance.vercel.app`
- **Environment Variables:** Set in Vercel Project Settings → Environment Variables
- **Build Command:** `npm run build`
- **Output Directory:** `.next` (default)

## 3.2 Contabo VPS (Self-Hosted Services)
- **Provider:** Contabo
- **IP Address:** `173.249.50.98`
- **SSH Credentials:**
  - **User:** `root`
  - **Password:** `mastar2000`
  - **Port:** `22`
- **Services Running on VPS:**
  - **AzuraCast** — Radio streaming platform (Docker-based)
  - **LiveKit** — Audio meeting rooms (Docker-based or standalone)
  - **BunnyCDN Storage API** — accessed via public endpoints (not self-hosted)

---

# 4. External Services & Credentials

## 4.1 Firebase (Google Cloud)

| Variable | Value |
|----------|-------|
| Project ID | `campuslink-3fykr` |
| API Key | `AIzaSyDK-rVtXljBJmufyWGaUjCV7OaaDgY9pxU` |
| Auth Domain | `campuslink-3fykr.firebaseapp.com` |
| Storage Bucket | `campuslink-3fykr.firebasestorage.app` |
| Messaging Sender ID | `91011410422` |
| App ID | `1:91011410422:web:cf25d539063c8daf247fd7` |

**Services Used:**
- **Firebase Auth** — Email/Password + Google sign-in for members and admins
- **Firestore Database** — All app data: users, meetings, content, giving, radio config, YT videos/channel, TV playlists, app releases, etc.
- **FCM (Cloud Messaging)** — Push notifications for app updates

---

## 4.2 AzuraCast (Radio Streaming)

| Variable | Value |
|----------|-------|
| URL | `https://azuracast.histoview.co.ke` |
| API Key | `27b63ceb8aa83480:2b36bb02900b47e87303afe30e87a557` |
| Station ID | `5` |
| Stream URL | `https://azuracast.histoview.co.ke/listen/mountain_of_delivarance_church/radio.mp3` |
| Public Embed URL | `https://azuracast.histoview.co.ke/public/mountain_of_delivarance_church` |
| Station Shortcode | `mountain_of_delivarance_church` |

**Running on:** Contabo VPS (`173.249.50.98`) via Docker

**API Endpoints Used (admin radio page):**
- `GET /api/nowplaying/{stationId}` — Now playing + listener stats
- `GET /api/station/{id}/status` — Backend/frontend running status
- `GET /api/station/{id}/queue` — Upcoming queue
- `GET /api/station/{id}/playlists` — All playlists
- `PUT /api/station/{id}/playlist/{plId}/toggle` — Enable/disable playlist
- `POST/PUT/DELETE /api/station/{id}/playlists` / `playlist/{id}` — CRUD playlists
- `GET /api/station/{id}/files` — Media files
- `POST /api/station/{id}/files/upload` — Upload media
- `PUT/DELETE /api/station/{id}/file/{fileId}` — Update/delete file
- `GET/POST/PUT/DELETE /api/station/{id}/streamers` — DJ/streamer accounts
- `GET /api/station/{id}/history` — Song history

**Known API Quirks:**
- `PUT /playlist/{id}/toggle` returns `{"success": true}` — must re-fetch playlist after toggle
- `POST /station/{id}/backend` returns HTTP 405 — `toggleAutoDJ` falls back to enabling/disabling all playlists
- Song request endpoint disabled (`enable_requests: false`)
- Schedule API requires `days: [0, 0]` for Sunday (single `[0]` gets normalized to `[]`)

---

## 4.3 YouTube Data API

| Variable | Value |
|----------|-------|
| Channel ID | `UClJC1T28ehRu4iEOfspIIvQ` |
| API Key | `AIzaSyALrqAmub3vsSUgkme6_6EoOoAUMOdAhxs` |

**Usage:** Server-side sync endpoint (`POST /api/youtube/sync`) fetches:
- Channel info (title, thumbnail, subscriber count)
- Uploaded videos (title, description, thumbnails, duration)
- Pagination via uploads playlist (`UU{channelId}`), max 500 videos

Data is stored in Firestore collections: `youtube_channel`, `youtube_videos`, `youtube_series`.

---

## 4.4 Paystack (Payments)

| Variable | Value |
|----------|-------|
| **Public Key** | `pk_live_06577a2f472241bb1a42af4327f7eeba7cd9790b` |
| **Secret Key** | `sk_live_… (redacted)` |

**Status:** **LIVE** (keys start with `pk_live_` / `sk_live_`)

**Pricing Plans:**
| Plan | Amount (KES) |
|------|-------------|
| VPS S | 2,960 |
| VPS M | 5,790 |

**API Routes:**
- `POST /api/paystack/initialize` — Initialize transaction
- `POST /api/paystack/verify` — Verify transaction

---

## 4.5 Cloudflare R2 (Video Storage)

| Variable | Value |
|----------|-------|
| Account ID | `ef71c807eed4f7ee1ffabc8740f0f311` |
| Access Key ID | `599589709dd3e5fbe541c126cfc65b75` |
| Secret Access Key | `0e91d7069533cd6c0c76079f9dcb90844a60511a4059e2d8e51875ec23475376` |
| Bucket Name | `streamvault-videos` |
| Public URL | `https://pub-0e4217240ac94f0daf254eb0379f8726.r2.dev` |

**Usage:** S3-compatible storage for sermon videos and video content. Presigned URLs are generated server-side for client uploads.

**API Routes:**
- `POST /api/r2/presign` — Generate presigned upload URL
- `DELETE /api/r2/delete` — Delete file by key

---

## 4.6 BunnyCDN (Media Storage — Images, Photos, Gallery)

| Variable | Value |
|----------|-------|
| Storage Zone | `histoview` |
| API Key | `213c0699-7662-4802-8017bd573513-a997-4abe` |
| Storage Host | `jh.storage.bunnycdn.com` |
| CDN URL | `https://histoview.b-cdn.net` |
| Max Upload Size | 10 MB |

**Usage:** Church gallery images, sermon photos, and general media uploads. Max file size: 10MB. Allowed types: JPG, PNG, WEBP, GIF, AVIF.

**API Routes:**
- `DELETE /api/content/delete` — Delete files
- `GET /api/content/storage-stats` — Storage usage stats

---

## 4.7 LiveKit (Audio Meeting Rooms)

| Variable | Value |
|----------|-------|
| API Key | `4920c1a635210e92b200bd1a31fa6540` |
| API Secret | `ec237ed300e0294fca45aff5de552b0f4928fe1463b94c7805f763d9a7276dd6` |
| WebSocket URL | `wss://azuracast.histoview.co.ke:8443` |

**Running on:** Contabo VPS (`173.249.50.98`)

**Usage:** Live audio rooms for prayer meetings, hosted on the same VPS as AzuraCast.

---

## 4.8 Build & Release

| Variable | Value |
|----------|-------|
| **Build Secret Token** | `mdb_release_8xK2pL9mQ4vR7nW3jF6tY1cH5bN0aSd` |
| **Release Admin Email** | `kiseroderick4@gmail.com` |
| **Release Admin Password** | `Mastar2000#` |
| **Admin Registration Token** | `faithstream-admin-2026` |

**Build Process:**
1. `bash build-apk.sh` — Development APK build
2. `bash scripts/build-and-publish.sh` — Full release pipeline (bump version → build static export → sync Android → compile APK → record release in Firestore → push to GitHub)

**API Routes (protected by Build Secret):**
- `POST /api/releases/create` — Record new release in Firestore (Bearer: `BUILD_SECRET_TOKEN`)
- `POST /api/notify-update` — Send FCM push notification about app update (Bearer: `BUILD_SECRET_TOKEN`)

---

# 5. Application Architecture

## 5.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16.2.9 |
| **UI Library** | React 19.2.4 |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS v4 + PostCSS |
| **State Management** | Zustand 5 |
| **Auth** | Firebase Auth (Email/Password + Google) |
| **Database** | Firestore (NoSQL) |
| **Push Notifications** | Firebase Cloud Messaging (FCM) |
| **Mobile Wrapper** | Capacitor 8 (Android) |
| **Video Player** | Vidstack + Plyr + Video.js |
| **Radio Streaming** | AzuraCast API (client-side) |
| **Audio Context** | Custom AudioContext provider with background playback |
| **Payments** | Paystack (inline.js SDK) |
| **Object Storage** | Cloudflare R2 (S3-compatible) |
| **CDN** | BunnyCDN |
| **Audio Meetings** | LiveKit |
| **Icons** | Font Awesome 6.5.1 |

## 5.2 Directory Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout: Auth → Audio → TV → Toast → ErrorBoundary
│   ├── page.tsx            # Login page (632 lines)
│   ├── middleware.ts        # CORS middleware for Capacitor WebView
│   ├── admin/              # Admin dashboard & management
│   │   ├── layout.tsx      # Admin auth guard (useRequireRole("admin"))
│   │   ├── page.tsx        # Main admin dashboard (radio stats, TV glance, activities)
│   │   ├── radio/page.tsx  # Radio management (Overview, Media, Playlists, Go Live)
│   │   ├── tv/page.tsx     # TV management (Channel, Videos, Playlists, Broadcast, Live)
│   │   ├── accounts/       # Account management
│   │   ├── content/        # Content management
│   │   ├── meetings/       # Meeting management
│   │   ├── members/        # Members management
│   │   └── register/       # Admin registration
│   ├── api/                # Backend API routes (server-side)
│   │   ├── youtube/sync/   # YouTube sync endpoint
│   │   ├── r2/presign/     # R2 presigned upload URL
│   │   ├── r2/delete/      # R2 file deletion
│   │   ├── paystack/       # Payment initialization & verification
│   │   ├── content/        # BunnyCDN delete & storage stats
│   │   ├── releases/create/# App release recording
│   │   ├── notify-update/  # FCM push to all users
│   │   └── play-controls/config/ # Radio play config
│   ├── dashboard/          # Member dashboard
│   ├── radio-station/      # Public radio station page
│   ├── tv/                 # Public TV page
│   ├── live/               # Live TV page
│   ├── live-tv-embed/      # Live TV embed
│   ├── give/               # Giving page
│   ├── gallery/            # Photo gallery
│   ├── meetings/           # View meetings
│   ├── prayer/             # Prayer requests
│   └── watch/              # Watch page
├── components/
│   ├── admin/              # Admin components (radio tabs, etc.)
│   ├── auth/               # Auth-related components
│   ├── dashboard/          # Dashboard components
│   ├── meetings/           # Meeting components
│   ├── radio/              # Radio components
│   ├── radio-station/      # Public radio components
│   ├── shared/             # Shared components
│   ├── tv/                 # TV components
│   └── ui/                 # UI primitives (Toast, etc.)
├── hooks/                  # Custom hooks
└── lib/                    # Business logic & API clients
    ├── firebase.ts         # Firebase init, offline persistence, getDocWithRetry
    ├── AuthProvider.tsx    # Auth state + role-based routing
    ├── azuracast.ts        # AzuraCast API client (993 lines)
    ├── youtube.ts          # Firestore CRUD for YouTube/TV (699 lines)
    ├── radioConfig.ts      # Radio config Firestore CRUD
    ├── r2.ts               # Cloudflare R2 S3 client
    ├── bunny.ts            # BunnyCDN storage client
    ├── paystack.ts         # Client-side Paystack SDK
    ├── paystack-server.ts  # Server-side Paystack
    ├── churchConfig.ts     # Church configuration
    ├── useAppStore.ts      # Zustand global store
    ├── audio/AudioContext.tsx # Audio player context with background playback
    └── tv/                 # TV player provider & fullscreen utils
```

## 5.3 Firestore Database Schema

### Collections:

| Collection | Documents | Purpose |
|-----------|-----------|---------|
| `users/{uid}` | Per user | User profiles, roles (admin/member), FCM tokens |
| `users/{uid}/tv_state/main` | Per user | Personalized TV playlist & progress |
| `users/{uid}/tv_notes/{videoId}` | Per user | Notes on videos |
| `users/{uid}/tv_prayers/{prayerId}` | Per user | Prayer replies |
| `youtube_channel/main` | Singleton | Synced YouTube channel info |
| `youtube_videos/{videoId}` | Per video | Synced YouTube video metadata |
| `youtube_series/{seriesId}` | Per series | Video series grouping |
| `tv_playlists/{playlistId}` | Per playlist | Scheduled TV playlists |
| `tv_broadcast/main` | Singleton | Generated daily broadcast schedule |
| `tv_live_status/main` | Singleton | Live stream status |
| `tv_giving_config/main` | Singleton | TV giving configuration |
| `tv_active_viewers/{uid}` | Per viewer | Active viewer heartbeats |
| `radioConfig/main` | Singleton | Radio station configuration |
| `app_releases/{id}` | Per release | App version release records |
| `meetings/{meetingId}` | Per meeting | Meeting schedules |
| `content/{contentId}` | Per item | Church content (sermons, etc.) |
| `giving/{docId}` | Per record | Giving records |
| `subscriptions/{subId}` | Per sub | Subscription data |
| `albums/{albumId}` | Per album | Photo albums |
| `album_entries/{entryId}` | Per entry | Album photos |

---

# 6. VPS Services (Contabo — 173.249.50.98)

## 6.1 SSH Access
```
ssh root@173.249.50.98
# Password: mastar2000
```

## 6.2 Services Running

### AzuraCast (Radio)
- **Type:** Docker container(s)
- **URL:** https://azuracast.histoview.co.ke
- **Ports:** 80/443 (HTTP/HTTPS), 8443 (LiveKit)
- **Config:** `/var/azuracast/` (assumed)
- **Admin Access:** https://azuracast.histoview.co.ke/admin
- **Station:** Mountain of Deliverance Church (ID: 5)
- **Stream URL:** https://azuracast.histoview.co.ke/listen/mountain_of_delivarance_church/radio.mp3

### LiveKit (Audio Meetings)
- **Type:** Docker or standalone service
- **URL:** wss://azuracast.histoview.co.ke:8443
- **API Key:** `4920c1a635210e92b200bd1a31fa6540`
- **API Secret:** `ec237ed300e0294fca45aff5de552b0f4928fe1463b94c7805f763d9a7276dd6`

### Reverse Proxy (Nginx assumed)
- Manages SSL/TLS for `azuracast.histoview.co.ke` and LiveKit
- SSL certificates managed via Certbot (Let's Encrypt)

---

# 7. Key Features Walkthrough

## 7.1 Radio Management (`/admin/radio`)
**4 Tabs:**

| Tab | Features |
|-----|----------|
| **Overview** | Now Playing display, song history, listener count, Play Control Center (Schedule/Playlist/Single Track modes), station status, AutoDJ toggle |
| **Media** | File library with search/filter, upload, edit metadata, delete, drag-drop |
| **Playlists** | Create/edit/delete playlists (standard, scheduled), add/remove songs, schedule view |
| **Go Live** | Live streamer management, connection info (server/mount/stream key), DJ accounts CRUD |

**Play Control Center (embedded in Overview):**
- **Schedule Mode** — Lists scheduled playlists with toggle switches
- **Playlist Mode** — Lists unscheduled playlists with "Play" button
- **Single Track Mode** — Lists media files, creates/reuses `__single__` playlist

## 7.2 TV Management (`/admin/tv`)
**Channel Tab:**
- Connect YouTube channel via sync (server-side API call → client saves to Firestore)
- View channel info (name, avatar, subscriber count)
- Paginated video grid with lazy loading
- Edit video metadata, delete videos

**Playlists Tab:**
- Create/edit/delete scheduled playlists
- Add/remove videos to playlists
- Recurring or date-specific scheduling

**Broadcast Tab:**
- Generate daily broadcast schedule from playlists
- Time-synced TV programming

**Live Tab:**
- Manual "Go Live" / "End Live" toggle
- Live stream status indicator (static — requires OAuth for full YouTube Live)

## 7.3 Payments (Giving)
- **Processor:** Paystack (live mode)
- **Plans:** VPS S (KES 2,960) / VPS M (KES 5,790)
- **Flow:** Initialize → Paystack inline popup → Verify → Update Firestore

## 7.4 Mobile APK
- **Framework:** Capacitor 8
- **Build:** Static export (API routes excluded, restored after build)
- **App ID:** `com.mountainofdeliverance.church`
- **App Name:** "MOUNTAIN OF DELIVERANCE CHURCH"
- **Background Audio:** Supported via AudioContext provider + Media Session API
- **Push Notifications:** FCM via Capacitor plugin
- **CORS:** Middleware allows `file://` origin + `capacitor://localhost`

---

# 8. API Routes Summary

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/youtube/sync` | POST | None | Fetch YouTube channel + videos (server-side API key) |
| `/api/r2/presign` | POST | None | Generate R2 presigned upload URL |
| `/api/r2/delete` | DELETE | None | Delete from R2 |
| `/api/paystack/initialize` | POST | None | Init Paystack transaction |
| `/api/paystack/verify` | POST | None | Verify Paystack transaction |
| `/api/content/delete` | DELETE | None | Delete from BunnyCDN |
| `/api/content/storage-stats` | GET | None | BunnyCDN storage usage |
| `/api/releases/create` | POST | Bearer token | Record new app release |
| `/api/notify-update` | POST | Bearer token | FCM push to all users |
| `/api/play-controls/config` | GET | None | Radio play button config |

**Note:** All API routes are deployed on Vercel. The Android APK calls these via `NEXT_PUBLIC_API_HOST` (`https://mountain-of-delivarance.vercel.app`). All AzuraCast API calls go directly from the client to `azuracast.histoview.co.ke` (no Vercel proxy).

---

# 9. Environment Variables (Complete)

> Copy these to Vercel Project Settings → Environment Variables.  
> The `.env.local` file in the repo is the single source of truth.

```env
# ============================================================
# FIREBASE
# ============================================================
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDK-rVtXljBJmufyWGaUjCV7OaaDgY9pxU
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=campuslink-3fykr.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=campuslink-3fykr
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=campuslink-3fykr.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=91011410422
NEXT_PUBLIC_FIREBASE_APP_ID=1:91011410422:web:cf25d539063c8daf247fd7

# ============================================================
# CHURCH CONFIG
# ============================================================
NEXT_PUBLIC_CHURCH_ID=mountain_of_deliverance
NEXT_PUBLIC_CHURCH_NAME=MOUNTAIN OF DELIVERANCE CHURCH
NEXT_PUBLIC_CHURCH_TAGLINE=Worship. Word. Community.

# ============================================================
# BUNNYCDN
# ============================================================
BUNNY_STORAGE_API_KEY=213c0699-7662-4802-8017bd573513-a997-4abe
NEXT_PUBLIC_BUNNY_STORAGE_API_KEY=213c0699-7662-4802-8017bd573513-a997-4abe
NEXT_PUBLIC_BUNNY_STORAGE_ZONE=histoview
NEXT_PUBLIC_BUNNY_STORAGE_HOST=jh.storage.bunnycdn.com
NEXT_PUBLIC_BUNNY_CDN_URL=https://histoview.b-cdn.net
BUNNY_STORAGE_ZONE=histoview
BUNNY_STORAGE_HOST=jh.storage.bunnycdn.com
BUNNY_CDN_URL=https://histoview.b-cdn.net
NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB=10

# ============================================================
# AZURACAST
# ============================================================
NEXT_PUBLIC_AZURACAST_URL=https://azuracast.histoview.co.ke
NEXT_PUBLIC_AZURACAST_API_KEY=27b63ceb8aa83480:2b36bb02900b47e87303afe30e87a557
NEXT_PUBLIC_STREAM_URL=https://azuracast.histoview.co.ke/listen/mountain_of_delivarance_church/radio.mp3
NEXT_PUBLIC_STATION_ID=5
NEXT_PUBLIC_AZURACAST_PUBLIC_EMBED_URL=https://azuracast.histoview.co.ke/public/mountain_of_delivarance_church

# ============================================================
# YOUTUBE
# ============================================================
NEXT_PUBLIC_YOUTUBE_CHANNEL_ID=UClJC1T28ehRu4iEOfspIIvQ
YOUTUBE_API_KEY=AIzaSyALrqAmub3vsSUgkme6_6EoOoAUMOdAhxs

# ============================================================
# ADMIN
# ============================================================
NEXT_PUBLIC_ADMIN_REG_TOKEN=faithstream-admin-2026

# ============================================================
# VERCEL
# ============================================================
NEXT_PUBLIC_VERCEL_URL=https://mountain-of-delivarance.vercel.app

# ============================================================
# LIVEKIT
# ============================================================
NEXT_PUBLIC_LIVEKIT_API_KEY=4920c1a635210e92b200bd1a31fa6540
NEXT_PUBLIC_LIVEKIT_API_SECRET=ec237ed300e0294fca45aff5de552b0f4928fe1463b94c7805f763d9a7276dd6
NEXT_PUBLIC_LIVEKIT_URL=wss://azuracast.histoview.co.ke:8443
LIVEKIT_API_KEY=4920c1a635210e92b200bd1a31fa6540
LIVEKIT_API_SECRET=ec237ed300e0294fca45aff5de552b0f4928fe1463b94c7805f763d9a7276dd6
LIVEKIT_URL=wss://azuracast.histoview.co.ke:8443

# ============================================================
# PAYSTACK
# ============================================================
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_live_06577a2f472241bb1a42af4327f7eeba7cd9790b
PAYSTACK_SECRET_KEY=sk_live_… (redacted)

# ============================================================
# CLOUDFLARE R2
# ============================================================
R2_ACCOUNT_ID=ef71c807eed4f7ee1ffabc8740f0f311
R2_ACCESS_KEY_ID=599589709dd3e5fbe541c126cfc65b75
R2_SECRET_ACCESS_KEY=0e91d7069533cd6c0c76079f9dcb90844a60511a4059e2d8e51875ec23475376
R2_BUCKET_NAME=streamvault-videos
R2_PUBLIC_URL=https://pub-0e4217240ac94f0daf254eb0379f8726.r2.dev

# ============================================================
# BUILD / RELEASE
# ============================================================
BUILD_SECRET_TOKEN=mdb_release_8xK2pL9mQ4vR7nW3jF6tY1cH5bN0aSd
RELEASE_ADMIN_EMAIL=kiseroderick4@gmail.com
RELEASE_ADMIN_PASSWORD=Mastar2000#

# ============================================================
# API HOST (for static export / APK)
# ============================================================
NEXT_PUBLIC_API_HOST=https://mountain-of-delivarance.vercel.app
```

---

# 10. Firestore Security Rules

Located at `firestore.rules` in the repo root. Key rules:
- **Users:** Members read/write own doc; Admins read/write all
- **Public data:** `meetings`, `content`, `albums`, `album_entries`, `giving`, `subscriptions`, `tv_broadcast`, `tv_giving_config`, `tv_live_status`, `youtube_channel`, `youtube_videos`, `youtube_series`, `tv_playlists` — read for all authenticated users, write for admins only
- **Admin-only:** `radioConfig/main`, `app_releases`, `tv_active_viewers` — read/write for admins only
- **Prayer replies:** Admins can write to `users/{userId}/tv_prayers/{prayerId}`
- **Offline persistence:** Enabled via `enableIndexedDbPersistence(db)` for Capacitor reliability

---

# 11. Build Pipeline

## Development
```bash
npm run dev              # Start Next.js dev server (localhost:3000)
npm run build            # Production build
npm run lint             # ESLint
```

## APK Build
```bash
bash build-apk.sh
# Creates: ~/Documents/MOUNTAIN OF DELIVERANCE CHURCH.apk
# Process: Backup API → Static export → Restore API → Capacitor sync → Gradle assembleRelease
```

## Full Release
```bash
bash scripts/build-and-publish.sh
# Process: Bump version → Remove old APK → Static export → Sync to Android → Clean → Build APK → Copy to public/ → Record in Firestore → Commit & push to GitHub
```

---

# 12. Deployment Checklist

When deploying changes:
1. Push to GitHub `main` branch → Vercel auto-deploys
2. Verify at https://mountain-of-delivarance.vercel.app
3. For Android: run `bash scripts/build-and-publish.sh` locally
4. New APK becomes available at https://mountain-of-delivarance.vercel.app/app-release.apk
5. Run `POST /api/notify-update` (with Bearer build secret) to push notification to all users

---

# 13. Troubleshooting

**Radio not playing?**
- Check https://azuracast.histoview.co.ke/admin → Station is running
- Verify `NEXT_PUBLIC_STREAM_URL` is correct
- Check VPS SSH → `docker ps` → AzuraCast containers are running

**TV sync failing?**
- Verify `YOUTUBE_API_KEY` is valid and YouTube Data API v3 is enabled in Google Cloud Console
- Check `NEXT_PUBLIC_YOUTUBE_CHANNEL_ID`

**Payments not processing?**
- Verify Paystack keys are live (`pk_live_` / `sk_live_`)
- Check Paystack dashboard for transaction logs

**APK build fails?**
- Ensure Java 21 is installed (`/usr/lib/jvm/java-21-openjdk`)
- Run `npx cap copy android` before building
- Check Android SDK path in environment

**CORS errors in APK?**
- Middleware at `src/middleware.ts` handles file:// and capacitor:// origins
- Ensure `NEXT_PUBLIC_API_HOST` is set to Vercel URL
