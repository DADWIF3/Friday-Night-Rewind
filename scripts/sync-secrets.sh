#!/usr/bin/env bash
# Promote build-time secrets into Worker runtime secrets.
#
# Cloudflare's dashboard has two separate "Variables and secrets" panels:
# one under Builds (available only while the build container runs) and one
# under Runtime (what the deployed Worker actually reads). A value set in the
# first is invisible to the second. This bridges them, so the Builds entry is
# the single place a secret has to be set.
#
# The value is piped straight into wrangler and never printed.
set -u

sync() {
  local name="$1" value="${2:-}"
  if [ -z "$value" ]; then
    echo "  $name: not set as a build secret; skipping"
    return 0
  fi
  if printf '%s' "$value" | npx wrangler secret put "$name" >/dev/null 2>&1; then
    echo "  $name: synced to runtime"
  else
    # Non-fatal: a failure here must not break an otherwise good deploy.
    echo "  $name: sync failed (check the build API token's Workers permissions)"
  fi
}

echo "==> Syncing build secrets to Worker runtime"
sync ADMIN_PASSWORD "${ADMIN_PASSWORD:-}"
sync RESEND_API_KEY "${RESEND_API_KEY:-}"
