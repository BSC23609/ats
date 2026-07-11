#!/usr/bin/env bash
# Runs once, when the Codespace is first created.
set -e

echo "→ Starting Postgres"
sudo service postgresql start
sudo -u postgres psql -c "CREATE USER ats WITH PASSWORD 'ats' SUPERUSER;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE bsg_ats OWNER ats;" 2>/dev/null || true

echo "→ Writing server/.env"
if [ ! -f server/.env ]; then
  cp server/.env.example server/.env
  # A different random secret for every Codespace.
  SECRET=$(openssl rand -hex 32)
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" server/.env
  # Form links must point at the Codespace's public URL, not at localhost, or the
  # interview-day links you copy will be dead outside this browser tab.
  if [ -n "$CODESPACE_NAME" ]; then
    WEB="https://${CODESPACE_NAME}-5173.app.github.dev"
    sed -i "s|^PUBLIC_WEB_URL=.*|PUBLIC_WEB_URL=$WEB|" server/.env
    sed -i "s|^WEB_ORIGINS=.*|WEB_ORIGINS=$WEB|" server/.env
  fi
fi

echo "→ Installing dependencies"
npm install --silent
(cd server && npm install --silent)
(cd web && npm install --silent)

echo "→ Creating tables and seed data"
(cd server && npm run db:init)

echo ""
echo "──────────────────────────────────────────────"
echo " Ready. Add your Anthropic key to server/.env"
echo " to switch on resume scoring, then run:  npm start"
echo "──────────────────────────────────────────────"
