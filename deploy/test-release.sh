#!/usr/bin/env bash
# Offline integration test: real filesystem/symlinks, fake systemd/HTTP/user tools.
# Run on Linux/WSL. No network requests, privilege escalation or live service changes.
set -Eeuo pipefail
HERE=$(cd "$(dirname "$0")" && pwd -P)
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/lumera-release-test.XXXXXXXX")
[[ $ROOT == "${TMPDIR:-/tmp}/lumera-release-test."* ]] || exit 1
trap 'rm -rf -- "$ROOT"' EXIT
mkdir "$ROOT/bin"
export REAL_CP
REAL_CP=$(command -v cp)
export PATH="$ROOT/bin:$PATH"
export HEALTH_ATTEMPTS=2 HEALTH_DELAY=0

cat > "$ROOT/bin/node" <<'STUB'
#!/usr/bin/env bash
echo v22.0.0
STUB
cat > "$ROOT/bin/id" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
cat > "$ROOT/bin/chown" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
cat > "$ROOT/bin/cp" <<'STUB'
#!/usr/bin/env bash
for arg in "$@"; do
  if [[ $arg == */artifacts/bad-copy/server.js ]]; then exit 1; fi
done
exec "$REAL_CP" "$@"
STUB
cat > "$ROOT/bin/systemctl" <<'STUB'
#!/usr/bin/env bash
set -eu
echo "$*" >> "$TEST_STATE/calls"
case "$1" in
  is-active) [[ -f $TEST_STATE/active ]] ;;
  stop) rm -f "$TEST_STATE/active" ;;
  restart)
    if [[ $(cat "$TEST_APP/current/server.js" 2>/dev/null || cat "$TEST_APP/server.js") == bad-restart ]]; then exit 1; fi
    touch "$TEST_STATE/active" ;;
  daemon-reload|enable) exit 0 ;;
  *) echo "unexpected systemctl command: $*" >&2; exit 1 ;;
esac
STUB
cat > "$ROOT/bin/curl" <<'STUB'
#!/usr/bin/env bash
set -eu
case $(cat "$TEST_APP/current/server.js" 2>/dev/null || cat "$TEST_APP/server.js") in
  bad-health) exit 22 ;;
  bad-response) echo '{"ok":false}' ;;
  *) echo '{"ok":true,"rooms":0}' ;;
esac
STUB
chmod +x "$ROOT/bin/"*

new_case() {
  export TEST_APP="$ROOT/$1/app" TEST_STATE="$ROOT/$1/fake-system"
  export SERVICE_DIR="$ROOT/$1/units"
  mkdir -p "$TEST_APP" "$TEST_STATE" "$SERVICE_DIR"
}
artifact() {
  local out="$ROOT/artifacts/$1"
  mkdir -p "$out/public"
  printf '%s\n' "$2" > "$out/server.js"
  printf '<html>%s</html>\n' "$1" > "$out/public/index.html"
  printf 'commit-%s\n' "$1" > "$out/REVISION"
}
release() { bash "$HERE/release.sh" "$TEST_APP" "$1" "$ROOT/artifacts/$1"; }
expect_fail() { if "$@"; then echo 'Expected deployment failure' >&2; exit 1; fi; }
assert_current() { [[ $(basename "$(readlink -f "$TEST_APP/current")") == "$1" ]]; }
assert_no_transactions() { [[ -z $(find "$TEST_APP" -maxdepth 1 -name '.deploy.*' -type d -print -quit) ]]; }

artifact good-one good
artifact good-two good
artifact bad-health bad-health
artifact bad-response bad-response
artifact bad-restart bad-restart
artifact bad-copy good

new_case normal
release good-one
assert_current good-one
[[ -f $TEST_STATE/active && -f $SERVICE_DIR/Lumera.service ]]
grep -F "ExecStart=$ROOT/bin/node $TEST_APP/current/server.js" "$SERVICE_DIR/Lumera.service" >/dev/null
grep -F "Environment=STATS_FILE=$TEST_APP/shared/state/stats.json" "$SERVICE_DIR/Lumera.service" >/dev/null
printf '{"visits":123}\n' > "$TEST_APP/shared/state/stats.json"
release good-two
assert_current good-two
[[ $(basename "$(readlink -f "$TEST_APP/previous")") == good-one ]]
cmp "$TEST_APP/shared/state/stats.json" "$TEST_APP/shared/backups/stats-before-good-two.json"
cp "$SERVICE_DIR/Lumera.service" "$ROOT/expected.service"
CALLS_BEFORE=$(wc -l < "$TEST_STATE/calls")
expect_fail release bad-copy
assert_current good-two
[[ ! -e $TEST_APP/releases/bad-copy && -f $TEST_STATE/active ]]
# Only the initial is-active probe may have run; no stop/restart on a copy failure.
[[ $(wc -l < "$TEST_STATE/calls") -eq $((CALLS_BEFORE + 1)) ]]
assert_no_transactions
for broken in bad-health bad-response bad-restart; do
  expect_fail release "$broken"
  assert_current good-two
  [[ ! -e $TEST_APP/releases/$broken && -f $TEST_STATE/active ]]
  cmp "$ROOT/expected.service" "$SERVICE_DIR/Lumera.service"
  assert_no_transactions
done
expect_fail release good-two
assert_current good-two
echo 'PASS: successful release, custom path, backups, copy failure, rejected duplicate and rollback'

new_case first-failure
expect_fail release bad-health
[[ ! -e $TEST_APP/current && ! -e $TEST_APP/releases/bad-health && ! -e $SERVICE_DIR/Lumera.service && ! -e $TEST_STATE/active ]]
assert_no_transactions
echo 'PASS: first failed deployment removes candidate and generated service'

new_case legacy
printf 'old-flat\n' > "$TEST_APP/server.js"
mkdir -p "$TEST_APP/public" "$TEST_APP/state"
printf 'old-page\n' > "$TEST_APP/public/index.html"
printf '{"visits":456}\n' > "$TEST_APP/state/stats.json"
printf 'old-service\n' > "$SERVICE_DIR/Lumera.service"
touch "$TEST_STATE/active"
expect_fail release bad-health
[[ $(cat "$SERVICE_DIR/Lumera.service") == old-service && -f $TEST_STATE/active ]]
[[ $(cat "$TEST_APP/current/server.js") == old-flat ]]
[[ $(cat "$TEST_APP/server.js") == old-flat ]]
cmp "$TEST_APP/state/stats.json" "$TEST_APP/shared/state/stats.json"
release good-one
assert_current good-one
[[ $(cat "$TEST_APP/previous/server.js") == old-flat ]]
cmp "$TEST_APP/state/stats.json" "$TEST_APP/shared/backups/stats-before-good-one.json"
echo 'PASS: legacy flat deployment migrates and can roll back without losing counters'

new_case missing-artifact
expect_fail bash "$HERE/release.sh" "$TEST_APP" missing "$ROOT/no-such-artifact"
[[ ! -e $TEST_STATE/calls && ! -e $TEST_APP/current ]]
echo 'PASS: invalid artifact rejected before touching a service'

new_case lock
exec 8>"$TEST_APP/.deploy.lock"
flock -n 8
expect_fail release good-one
[[ ! -e $TEST_STATE/calls ]]
flock -u 8
echo 'PASS: concurrent deployment lock'
echo 'All offline deployment tests passed.'
