#!/usr/bin/env bash
# Runs once, when the Codespace is first created.
# Deliberately NOT `set -e`: a failure in one step should report itself loudly,
# not abort the rest and leave you with no dependencies and no explanation.

FAILED=0

echo ""
echo "→ 1/4  Starting Postgres"
if command -v psql >/dev/null 2>&1; then
  sudo service postgresql start
  sudo -u postgres psql -c "CREATE USER ats WITH PASSWORD 'ats' SUPERUSER;" 2>/dev/null || true
  sudo -u postgres psql -c "CREATE DATABASE bsg_ats OWNER ats;" 2>/dev/null || true
  echo "   Postgres is up."
else
  echo "   ✗ Postgres is not installed in this container."
  echo "     Everything else will still install. To get a database, either:"
  echo "       - rebuild the Codespace (Ctrl+Shift+P → Codespaces: Rebuild Container), or"
  echo "       - point server/.env at a free Neon database instead (see SETUP.md Part 5)."
  FAILED=1
fi

echo ""
echo "→ 2/4  Writing server/.env"
if [ ! -f server/.env ]; then
  cp server/.env.example server/.env
  SECRET=$(openssl rand -hex 32)
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" server/.env
  # Interview-day form links are built from this. Inside a Codespace it must be the
  # forwarded public URL, not localhost, or every link you copy is dead.
  if [ -n "$CODESPACE_NAME" ]; then
    WEB="https://${CODESPACE_NAME}-5173.app.github.dev"
    sed -i "s|^PUBLIC_WEB_URL=.*|PUBLIC_WEB_URL=$WEB|" server/.env
    sed -i "s|^WEB_ORIGINS=.*|WEB_ORIGINS=$WEB|" server/.env
  fi
  echo "   Created."
else
  echo "   Already exists — left alone."
fi

echo ""
echo "→ 3/4  Installing dependencies (this is the slow part, ~2 min)"
npm install --no-fund --no-audit             || FAILED=1
npm --prefix server install --no-fund --no-audit || FAILED=1
npm --prefix web install --no-fund --no-audit    || FAILED=1

echo ""
echo "→ 4/4  Creating tables and seed data"
if command -v psql >/dev/null 2>&1; then
  npm --prefix server run db:init || FAILED=1
else
  echo "   Skipped — no database yet."
fi

echo ""
echo "──────────────────────────────────────────────────────────"
if [ "$FAILED" = "0" ]; then
  echo "  Ready."
  echo ""
  echo "  1. Open server/.env and paste your ANTHROPIC_API_KEY"
  echo "     (optional — everything works without it, minus scoring)"
  echo "  2. Run:  npm start"
else
  echo "  Finished with errors — see the ✗ lines above."
  echo "  Send them to Claude and it will tell you what to do."
fi
echo "──────────────────────────────────────────────────────────"
echo ""
