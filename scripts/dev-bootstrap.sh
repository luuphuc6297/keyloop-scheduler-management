#!/usr/bin/env bash
#
# Keyloop Scheduler — one-command bootstrap.
# Run from repo root: `pnpm setup`
#
# What it does:
#   1. Verifies node, pnpm, docker are available
#   2. Copies .env.example → .env if missing
#   3. `pnpm install`
#   4. Brings up the FULL stack:
#        - postgres + redis (default profile)
#        - jaeger + prometheus + grafana + otel-collector (observability profile)
#   5. Waits for Postgres to be healthy
#   6. Runs migrations
#   7. Runs the dev seed (creates demo login users + customers + vehicles)
#   8. Prints credentials + every dashboard URL
#
# Idempotent — safe to re-run.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ANSI colors
G="\033[0;32m"; Y="\033[0;33m"; R="\033[0;31m"; B="\033[0;34m"; C="\033[0;36m"; N="\033[0m"

step() { echo -e "${B}==>${N} $1"; }
ok()   { echo -e "${G}✓${N} $1"; }
warn() { echo -e "${Y}!${N} $1"; }
fail() { echo -e "${R}✗${N} $1"; exit 1; }

# ----- 1. Prereqs -----
step "Checking prerequisites"

command -v node >/dev/null    || fail "node not found. Install Node 20+ (https://nodejs.org)"
command -v pnpm >/dev/null    || fail "pnpm not found. Install: npm i -g pnpm"
command -v docker >/dev/null  || fail "docker not found. Install Docker Desktop (https://docker.com)"

NODE_VER=$(node -v | cut -dv -f2 | cut -d. -f1)
[ "$NODE_VER" -ge 20 ] || fail "node $NODE_VER is too old; need 20+"

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  fail "docker compose not found"
fi
ok "node $(node -v), pnpm $(pnpm -v), $DC"

# ----- 2. .env -----
step "Checking .env"
if [ ! -f .env ]; then
  cp .env.example .env
  ok "Created .env from .env.example"
else
  ok ".env exists"
fi

# ----- 3. pnpm install -----
step "Installing dependencies"
pnpm install --silent 2>&1 | tail -3
ok "Dependencies installed"

# ----- 4. Full Docker stack -----
step "Starting full stack: postgres + redis + jaeger + prometheus + grafana + otel-collector"
$DC --profile observability up -d
ok "All containers up"

# ----- 5. Wait for Postgres -----
step "Waiting for Postgres to accept connections"
for i in $(seq 1 30); do
  if $DC exec -T postgres pg_isready -U scheduler_owner -d scheduler >/dev/null 2>&1; then
    ok "Postgres ready"
    break
  fi
  if [ "$i" = "30" ]; then
    fail "Postgres did not become ready in 30s. Check '$DC logs postgres'"
  fi
  sleep 1
done

# ----- 6. Migrations -----
step "Running migrations"
pnpm --filter @keyloop/api migration:run 2>&1 | tail -10
ok "Migrations applied"

# ----- 7. Seed -----
step "Seeding dev data"
pnpm --filter @keyloop/api seed:dev 2>&1 | tail -8
ok "Seed complete"

# ----- 8. Banner + start dev servers -----
echo ""
echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo -e "${G}  Stack ready. Starting dev servers (Ctrl+C to stop)${N}"
echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo ""
echo -e "  ${B}App:${N}            ${C}http://localhost:3000${N}"
echo -e "  ${B}Login:${N}          ${Y}admin@nyc-auto.local${N} / ${Y}Demo1234!${N}"
echo ""
echo -e "  ${B}Grafana SLOs:${N}   ${C}http://localhost:3030${N}  (anonymous admin)"
echo -e "  ${B}Prometheus:${N}     ${C}http://localhost:9090${N}"
echo -e "  ${B}Jaeger traces:${N}  ${C}http://localhost:16686${N}  (service: scheduler-api)"
echo ""
echo -e "  ${B}Tear it all down later:${N}  ${Y}$DC --profile observability down${N}"
echo ""
echo -e "${B}==>${N} Launching API + web in parallel..."
echo ""

# Replace the script process with `pnpm dev` — Ctrl+C cleanly stops both servers.
# `pnpm dev` is defined at root as `pnpm --parallel -r run dev` so API and web
# come up together, in a single terminal, with combined logs.
exec pnpm dev
