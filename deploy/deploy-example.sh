#!/usr/bin/env bash
# Run on the VPS: bash /opt/Lumera/deploy.sh [commit-or-tag]
# Copy this wrapper outside the checkout; it builds an immutable Git revision.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/Lumera}"
REPO_DIR="${REPO_DIR:-$APP_DIR/repo}"
BRANCH="${BRANCH:-main}"
REF="${1:-origin/$BRANCH}"

git -C "$REPO_DIR" fetch --quiet origin "$BRANCH"
REVISION=$(git -C "$REPO_DIR" rev-parse --verify "$REF^{commit}")
mkdir -p "$APP_DIR"
APP_DIR=$(cd "$APP_DIR" && pwd -P)
BUILD_DIR=$(mktemp -d "$APP_DIR/build.XXXXXXXX")
trap 'rm -rf -- "$BUILD_DIR"' EXIT
git -C "$REPO_DIR" archive "$REVISION" | tar -x -C "$BUILD_DIR"

echo "Building and checking $REVISION"
npm --prefix "$BUILD_DIR/web" ci
npm --prefix "$BUILD_DIR/server" ci
npm --prefix "$BUILD_DIR/web" run typecheck
npm --prefix "$BUILD_DIR/web" run test:typecheck
npm --prefix "$BUILD_DIR/web" run test:engine
npm --prefix "$BUILD_DIR/web" run sim
npm --prefix "$BUILD_DIR/web" run sim:weather
npm --prefix "$BUILD_DIR/server" run typecheck
npm --prefix "$BUILD_DIR/server" test
npm --prefix "$BUILD_DIR/web" run build
npm --prefix "$BUILD_DIR/server" run build
npm --prefix "$BUILD_DIR/server" run test:smoke
cp -R "$BUILD_DIR/web/dist" "$BUILD_DIR/server/dist/public"
printf '%s\n' "$REVISION" > "$BUILD_DIR/server/dist/REVISION"

RELEASE_ID="${REVISION:0:12}-$(date -u +%Y%m%dT%H%M%SZ)"
if [[ $EUID -eq 0 ]]; then
  bash "$BUILD_DIR/deploy/release.sh" "$APP_DIR" "$RELEASE_ID" "$BUILD_DIR/server/dist"
else
  sudo bash "$BUILD_DIR/deploy/release.sh" "$APP_DIR" "$RELEASE_ID" "$BUILD_DIR/server/dist"
fi
