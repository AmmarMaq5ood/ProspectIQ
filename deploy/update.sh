#!/usr/bin/env bash
# Update the running ProspectIQ on the VPS. Run as the site user from the repo
# folder, after the code has been pulled:  bash deploy/update.sh
# Used by the GitHub Actions deploy job; safe to run by hand too.
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="$HOME/.npm-global/bin:$(npm prefix -g 2>/dev/null)/bin:/usr/local/bin:$PATH"
APP="${PM2_NAME:-prospectiq}"

echo "== $(date -u +%FT%TZ) updating $(pwd) to $(git rev-parse --short HEAD)"
npm ci --no-audit --no-fund
npm run build

if pm2 describe "$APP" >/dev/null 2>&1; then
  pm2 restart "$APP" --update-env
else
  pm2 start server/dist/index.js --name "$APP" --cwd "$(pwd)"
fi
pm2 save >/dev/null

# Health check through the app itself (port and prefix from .env).
PORT=$(grep -E '^PORT=' .env | cut -d= -f2- | tr -d '[:space:]'); PORT=${PORT:-3000}
BASE=$(grep -E '^BASE_PATH=' .env | cut -d= -f2- | tr -d '[:space:]')
URL="http://127.0.0.1:${PORT}${BASE}/api/health"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if OUT=$(curl -sf "$URL"); then echo "== healthy: $OUT"; exit 0; fi
  sleep 1
done
echo "!! $URL did not answer; last log lines:"
pm2 logs "$APP" --nostream --lines 30 || true
exit 1
