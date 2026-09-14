#!/usr/bin/env bash
# Friday Night Rewind — first-time deploy to Cloudflare.
#
# Creates the D1 database and R2 bucket, applies the schema, prompts for the
# secrets, and deploys the Worker. Safe to re-run: each step checks whether the
# resource already exists before creating it.
#
#   bash deploy.sh
#
# Requires: an authenticated wrangler (either `npx wrangler login`, or
# CLOUDFLARE_API_TOKEN set in the environment).

set -euo pipefail
cd "$(dirname "$0")"

DB_NAME="friday-night-rewind"
BUCKET="friday-night-rewind-uploads"
w() { npx wrangler "$@"; }

echo "==> Checking Cloudflare authentication"
if ! w whoami >/dev/null 2>&1; then
  echo "Not authenticated. Run 'npx wrangler login' first, or set CLOUDFLARE_API_TOKEN." >&2
  exit 1
fi
w whoami | sed -n '1,6p'

echo
echo "==> D1 database"
if w d1 list 2>/dev/null | grep -q "$DB_NAME"; then
  echo "    '$DB_NAME' already exists."
else
  w d1 create "$DB_NAME"
  echo
  echo "    Copy the database_id printed above into wrangler.jsonc, then re-run this script."
  exit 0
fi

if grep -q "PLACEHOLDER_RUN_WRANGLER_D1_CREATE" wrangler.jsonc; then
  echo "    wrangler.jsonc still has the placeholder database_id. Paste the real id first." >&2
  exit 1
fi

echo
echo "==> R2 bucket"
if w r2 bucket list 2>/dev/null | grep -q "$BUCKET"; then
  echo "    '$BUCKET' already exists."
else
  w r2 bucket create "$BUCKET"
fi

echo
echo "==> Applying schema (safe to repeat; all statements are IF NOT EXISTS)"
w d1 execute "$DB_NAME" --remote --file=./schema.sql

echo
echo "==> Secrets"
# `wrangler secret put` reads the value from an interactive prompt. When an
# agent runs this script non-interactively there is no safe way to supply it,
# so SKIP_SECRETS=1 defers both to the Cloudflare dashboard instead.
if [[ "${SKIP_SECRETS:-0}" == "1" ]]; then
  echo "    Skipping (SKIP_SECRETS=1). Set these in the Cloudflare dashboard:"
  echo "      Workers & Pages -> $(grep -o '\"name\": \"[^\"]*' wrangler.jsonc | head -1 | cut -d'\"' -f4)"
  echo "      -> Settings -> Variables and Secrets -> Add -> Encrypt"
  echo "      ADMIN_PASSWORD  (required; /admin returns 503 without it)"
  echo "      RESEND_API_KEY  (optional; lead-notification email)"
else
  echo "    ADMIN_PASSWORD protects /admin. Without it /admin returns 503."
  echo "    Choose something long. It is typed directly into wrangler, never stored in this repo."
  w secret put ADMIN_PASSWORD

  echo
  read -r -p "    Set RESEND_API_KEY now for lead-notification email? [y/N] " reply
  if [[ "$reply" =~ ^[Yy]$ ]]; then
    w secret put RESEND_API_KEY
  else
    echo "    Skipped. Submissions will still be stored; you just won't get an email."
  fi
fi

echo
echo "==> Building the site"
npm run build

echo
echo "==> Deploying"
w deploy

echo
echo "Done. Check the URL printed above, then:"
echo "  - visit /api/health  → should report db:true, uploads:true, email:true/false"
echo "  - visit /admin       → sign in with the password you just set"
echo "  - submit the free-preview form and confirm it appears in /admin"
