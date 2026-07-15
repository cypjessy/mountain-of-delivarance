#!/usr/bin/env bash
# ============================================================================
#  Build & Publish — Full release pipeline
# ============================================================================
#  Prerequisites:
#    1. BUILD_SECRET_TOKEN set in .env.local (or exported)
#    2. NEXT_PUBLIC_API_HOST set to your Vercel domain (or use localhost:3000
#       for testing)
#    3. Git remote "origin" set up with push access
# ============================================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# Use Java 21 (Gradle 8.x doesn't support Java 26+)
JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk}"

echo "=========================================="
echo "  🚀 Build & Publish App Release"
echo "=========================================="
echo ""

# ── Step 1: Bump version ─────────────────────────────────────────────────
echo "[1/7] Bumping Android version..."
node scripts/version.mjs bump
echo ""

# ── Step 1b: Remove old APK from public/ so it doesn't get bundled into the static export ──
echo "[2/7] Removing old APK from public/ to prevent recursive bloat..."
rm -f "$PROJECT_DIR/public/app-release.apk"
echo ""

# ── Step 2: Build Next.js static export ──────────────────────────────────
echo "[3/7] Building Next.js static export..."
# Exclude API routes (they can't be statically exported)
API_DIR="$PROJECT_DIR/src/app/api"
API_BACKUP_DIR="/tmp/church-app-api-backup-release"
if [ -d "$API_DIR" ]; then
  rm -rf "$API_BACKUP_DIR"
  mkdir -p "$API_BACKUP_DIR"
  for d in "$API_DIR"/*/; do
    if [ -d "$d" ]; then
      base=$(basename "$d")
      cp -a "$d" "$API_BACKUP_DIR/$base"
      rm -rf "$d"
    fi
  done
fi

NEXT_EXPORT=true npm run build

# Restore API routes
if [ -d "$API_BACKUP_DIR" ]; then
  for d in "$API_BACKUP_DIR"/*/; do
    if [ -d "$d" ]; then
      base=$(basename "$d")
      cp -a "$d" "$API_DIR/$base"
    fi
  done
  rm -rf "$API_BACKUP_DIR"
fi
echo "  ✅ Static export complete"
echo ""

# ── Step 3: Sync web assets to Android project ───────────────────────────
echo "[4/7] Syncing web assets to Android project..."
npx cap copy android
echo "  ✅ Assets synced"
echo ""

# ── Step 4: Build Android APK ────────────────────────────────────────────
echo "[5/7] Compiling Android APK (this may take a while)..."
cd "$PROJECT_DIR/android"
JAVA_HOME="$JAVA_HOME" ./gradlew assembleRelease --no-daemon -Dorg.gradle.jvmargs="-Xmx2048m -XX:MaxMetaspaceSize=512m"
cd "$PROJECT_DIR"
echo "  ✅ APK compiled and signed with release keystore"
echo ""

# ── Step 5: Copy APK to public/ for Vercel ───────────────────────────────
echo "[6/7] Copying APK to public/..."
mkdir -p "$PROJECT_DIR/public"
cp "$PROJECT_DIR/android/app/build/outputs/apk/release/app-release.apk" \
   "$PROJECT_DIR/public/app-release.apk"
echo "  ✅ APK copied to public/app-release.apk"

# Get file size
APK_SIZE=$(stat --format=%s "$PROJECT_DIR/public/app-release.apk" 2>/dev/null || \
           stat -f%z "$PROJECT_DIR/public/app-release.apk" 2>/dev/null || echo "0")
echo "  📦 Size: $(numfmt --to=iec $APK_SIZE 2>/dev/null || echo "${APK_SIZE}B")"
echo ""

# ── Step 6: Record release in Firestore ──────────────────────────────────
echo "[7/7] Recording release in Firestore..."
node scripts/version.mjs record
echo ""

# ── Done ─────────────────────────────────────────────────────────────────
VERSION_NAME=$(grep 'versionName' "$PROJECT_DIR/android/app/build.gradle" | grep -oP '"[^"]+"' | tr -d '"')
VERSION_CODE=$(grep 'versionCode' "$PROJECT_DIR/android/app/build.gradle" | grep -oP '\d+')

# ── Commit and push to GitHub ────────────────────────────────
echo ""
echo "[7/7] Committing and pushing to GitHub..."

git add android/app/build.gradle public/app-release.apk 2>/dev/null || true

if git diff --cached --quiet; then
  echo "  ⚠️  No changes to commit"
else
  git commit -m "chore: release v${VERSION_NAME} (build ${VERSION_CODE})"
  echo "  ✅ Commit created"
  
  if git push origin main 2>/dev/null; then
    echo "  ✅ Pushed to GitHub — Vercel will deploy automatically"
  else
    echo "  ⚠️  Push failed. Push manually:"
    echo "     git push origin main"
  fi
fi

echo ""
echo "=========================================="
echo "  ✅ Release complete!"
echo "  Version: $VERSION_NAME (code $VERSION_CODE)"
echo "  APK: public/app-release.apk"
echo "  Pushed to GitHub — Vercel will deploy"
echo "=========================================="
