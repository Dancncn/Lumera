#!/usr/bin/env bash
# Install a checked artifact using one process and an atomic current symlink.
# Usage: sudo bash release.sh /opt/Lumera RELEASE_ID ARTIFACT_DIRECTORY
# ARTIFACT_DIRECTORY contains server.js, public/index.html and REVISION.
set -Eeuo pipefail

fail() { echo "[deploy] $*" >&2; exit 1; }
[[ $# -eq 3 ]] || fail "usage: release.sh APP_DIR RELEASE_ID ARTIFACT_DIRECTORY"
APP_DIR=$1
RELEASE_ID=$2
ARTIFACT_DIR=$3
SERVICE="${SERVICE:-Lumera}"
APP_USER="${APP_USER:-lumera}"
SERVICE_DIR="${SERVICE_DIR:-/etc/systemd/system}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-20}"
HEALTH_DELAY="${HEALTH_DELAY:-1}"
[[ $APP_DIR =~ ^/[a-zA-Z0-9_./-]+$ && $APP_DIR != / ]] || fail "APP_DIR must be an absolute path without spaces"
[[ $RELEASE_ID =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$ ]] || fail "invalid release ID"
[[ $SERVICE =~ ^[a-zA-Z0-9_-]+$ && $APP_USER =~ ^[a-zA-Z0-9_-]+$ ]] || fail "invalid service or user"
[[ $HEALTH_ATTEMPTS =~ ^[1-9][0-9]*$ && $HEALTH_DELAY =~ ^[0-9]+([.][0-9]+)?$ ]] || fail "invalid health retry settings"
[[ -f $ARTIFACT_DIR/server.js && -f $ARTIFACT_DIR/public/index.html && -s $ARTIFACT_DIR/REVISION ]] || fail "artifact is incomplete"
for tool in node curl flock systemctl; do command -v "$tool" >/dev/null || fail "missing $tool"; done
NODE_BIN=$(command -v node)
[[ $NODE_BIN =~ ^/[a-zA-Z0-9_./-]+$ ]] || fail "node must be installed at an absolute path without spaces"
NODE_MAJOR=$(node --version)
NODE_MAJOR=${NODE_MAJOR#v}; NODE_MAJOR=${NODE_MAJOR%%.*}
[[ $NODE_MAJOR =~ ^[0-9]+$ && $NODE_MAJOR -ge 22 ]] || fail "Node 22+ is required"

mkdir -p "$APP_DIR"
APP_DIR=$(cd "$APP_DIR" && pwd -P)
[[ $APP_DIR != / ]] || fail "refusing filesystem root"
exec 9>"$APP_DIR/.deploy.lock"
flock -n 9 || fail "another deployment is running"
RELEASE_DIR="$APP_DIR/releases/$RELEASE_ID"
[[ ! -e $RELEASE_DIR ]] || fail "release already exists: $RELEASE_ID"
[[ ! -e $APP_DIR/current || -L $APP_DIR/current ]] || fail "current must be a symlink"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR/releases" "$APP_DIR/shared/state" "$APP_DIR/shared/backups" "$SERVICE_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/shared"

TRANSACTION=$(mktemp -d "$APP_DIR/.deploy.XXXXXXXX")
trap 'rm -rf -- "$TRANSACTION"' EXIT
UNIT="$SERVICE_DIR/$SERVICE.service"
HAD_UNIT=false
[[ ! -f $UNIT ]] || { cp -p "$UNIT" "$TRANSACTION/previous.service"; HAD_UNIT=true; }
WAS_ACTIVE=false
if systemctl is-active --quiet "$SERVICE"; then WAS_ACTIVE=true; fi
PREVIOUS=''
if [[ -L $APP_DIR/current ]]; then
  PREVIOUS=$(readlink -f "$APP_DIR/current")
  [[ $PREVIOUS == "$APP_DIR/releases/"* && -f $PREVIOUS/server.js ]] || fail "current does not point to a valid release"
elif [[ -f $APP_DIR/server.js && -d $APP_DIR/public ]]; then
  # Preserve the legacy files and old service so a failed migration can restore both.
  PREVIOUS="$APP_DIR/releases/legacy-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  mkdir "$PREVIOUS"
  cp -p "$APP_DIR/server.js" "$PREVIOUS/server.js"
  cp -R "$APP_DIR/public" "$PREVIOUS/public"
  printf 'legacy flat deployment\n' > "$PREVIOUS/REVISION"
fi

MUTATING=false
NEW_RELEASE=false
atomic_link() {
  rm -f "$TRANSACTION/link"
  ln -s "$1" "$TRANSACTION/link"
  mv -Tf "$TRANSACTION/link" "$2"
}
health() {
  local body attempt
  for ((attempt=1; attempt<=HEALTH_ATTEMPTS; attempt++)); do
    if systemctl is-active --quiet "$SERVICE" &&
       body=$(curl --fail --silent --show-error --max-time 3 http://127.0.0.1:8787/healthz) &&
       [[ $body =~ \"ok\"[[:space:]]*:[[:space:]]*true ]]; then
      return 0
    fi
    sleep "$HEALTH_DELAY"
  done
  return 1
}
rollback() {
  local status=$1
  trap - ERR INT TERM
  set +e
  echo "[deploy] failed; restoring previous release" >&2
  if $MUTATING; then
    systemctl stop "$SERVICE"
    if [[ -n $PREVIOUS ]]; then atomic_link "$PREVIOUS" "$APP_DIR/current"; else rm -f "$APP_DIR/current"; fi
    if $HAD_UNIT; then cp -p "$TRANSACTION/previous.service" "$UNIT"; else rm -f "$UNIT"; fi
    systemctl daemon-reload
    if $WAS_ACTIVE; then
      if ! systemctl restart "$SERVICE" || ! health; then
        echo "[deploy] ROLLBACK NEEDS ATTENTION: inspect journalctl -u $SERVICE" >&2
      fi
    fi
  fi
  if $NEW_RELEASE; then
    if [[ $(readlink -f "$APP_DIR/current" 2>/dev/null) == "$RELEASE_DIR" ]]; then
      echo "[deploy] candidate retained because rollback did not restore current" >&2
    else
      rm -rf -- "$RELEASE_DIR"
    fi
  fi
  exit "$status"
}
trap 'rollback $?' ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM

# Copy everything before interrupting the running game process.
mkdir "$RELEASE_DIR"
NEW_RELEASE=true
cp -p "$ARTIFACT_DIR/server.js" "$ARTIFACT_DIR/REVISION" "$RELEASE_DIR/"
cp -R "$ARTIFACT_DIR/public" "$RELEASE_DIR/public"
mkdir "$RELEASE_DIR/deploy"
cp "$0" "$(dirname "$0")/Lumera.service" "$RELEASE_DIR/deploy/"
chmod -R a+rX "$RELEASE_DIR"
sed -e "s|/opt/Lumera|$APP_DIR|g" \
    -e "s|/usr/bin/node|$NODE_BIN|g" \
    -e "s|User=lumera|User=$APP_USER|" \
    "$(dirname "$0")/Lumera.service" > "$TRANSACTION/new.service"

MUTATING=true
if $WAS_ACTIVE; then systemctl stop "$SERVICE"; fi
# Legacy counters are copied only once, after the previous process has stopped.
if [[ ! -e $APP_DIR/shared/state/stats.json && -f $APP_DIR/state/stats.json ]]; then
  cp -p "$APP_DIR/state/stats.json" "$APP_DIR/shared/state/stats.json"
fi
if [[ -f $APP_DIR/shared/state/stats.json ]]; then
  cp -p "$APP_DIR/shared/state/stats.json" "$APP_DIR/shared/backups/stats-before-$RELEASE_ID.json"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR/shared"
install -m 644 "$TRANSACTION/new.service" "$UNIT"
systemctl daemon-reload
atomic_link "$RELEASE_DIR" "$APP_DIR/current"
systemctl restart "$SERVICE"
health
systemctl enable "$SERVICE"
if [[ -n $PREVIOUS ]]; then atomic_link "$PREVIOUS" "$APP_DIR/previous"; fi
echo "[deploy] OK: $RELEASE_ID ($(cat "$RELEASE_DIR/REVISION"))"
