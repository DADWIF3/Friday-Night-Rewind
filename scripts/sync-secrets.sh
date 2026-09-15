#!/usr/bin/env bash
# Promote build-time secrets into Worker runtime secrets.
#
# Cloudflare has two separate "Variables and secrets" panels: one under Builds
# (visible only while the build container runs) and one under Runtime (what the
# deployed Worker reads). A value set in the first is invisible to the second.
# This bridges them so the Builds entry is the only place a secret is set.
#
# Secret values are piped straight into wrangler and never printed. The status
# file records outcomes only, and scrubs the value defensively in case wrangler
# ever echoes it in an error.
set -u

# Status file stays out of dist so it is not published; the sync outcome
# shows in the build log.
DIAG="/tmp/fnr-build-status.txt"
: > "$DIAG"
log() { echo "$1"; echo "$1" >> "$DIAG"; }

scrub() {
  local out="$1" value="$2"
  [ -n "$value" ] && out="${out//$value/<redacted>}"
  # Keep it short and single-line.
  printf '%s' "$out" | tr '\n' ' ' | cut -c1-300
}

sync() {
  local name="$1" value="${2:-}"
  if [ -z "$value" ]; then
    log "$name: absent from build env"
    return 0
  fi
  local out rc
  out="$(printf '%s' "$value" | npx wrangler secret put "$name" 2>&1)"; rc=$?
  if [ $rc -eq 0 ]; then
    log "$name: synced ok"
  else
    log "$name: FAILED rc=$rc :: $(scrub "$out" "$value")"
  fi
}

log "build-at: $(date -u +%FT%TZ)"
sync ADMIN_PASSWORD "${ADMIN_PASSWORD:-}"
sync RESEND_API_KEY "${RESEND_API_KEY:-}"
