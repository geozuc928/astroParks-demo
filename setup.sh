#!/usr/bin/env bash
# AstroParks Demo — Setup & Run Script
# Usage: bash setup.sh

set -e

# ─── Colours ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}    $1"; }
info() { echo -e "${CYAN}[INFO]${NC}  $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $1"; }
fail() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗"
echo -e "║       AstroParks Demo Setup          ║"
echo -e "╚══════════════════════════════════════╝${NC}"
echo ""

# ─── 1. Check Node.js (requires >= 16) ──────────────────────────────────────
info "Checking Node.js..."
if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Install it from https://nodejs.org (v16+)"
fi
NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 16 ]; then
  fail "Node.js v$NODE_VER found — v16 or higher required."
fi
ok "Node.js v$NODE_VER"

# ─── 2. Check npm ────────────────────────────────────────────────────────────
info "Checking npm..."
if ! command -v npm &>/dev/null; then
  fail "npm is not installed. It normally ships with Node.js."
fi
ok "npm v$(npm --version)"

# ─── 3. Check PostgreSQL client (psql) ───────────────────────────────────────
info "Checking PostgreSQL client (psql)..."
if ! command -v psql &>/dev/null; then
  warn "psql not found. Install the PostgreSQL client:"
  warn "  Ubuntu/Debian : sudo apt install postgresql-client"
  warn "  macOS         : brew install libpq && brew link --force libpq"
  warn "  Or install full PostgreSQL from https://www.postgresql.org/download/"
  echo ""
  warn "Skipping database initialisation — run 'npm run db:init' manually once psql is available."
  SKIP_DB=1
else
  ok "psql $(psql --version | awk '{print $3}')"
  SKIP_DB=0
fi

# ─── 4. Install Node dependencies ────────────────────────────────────────────
info "Installing Node.js dependencies..."
REQUIRED_PACKAGES=("express" "pg")
MISSING=()
for pkg in "${REQUIRED_PACKAGES[@]}"; do
  if [ ! -d "node_modules/$pkg" ]; then
    MISSING+=("$pkg")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  info "Missing packages: ${MISSING[*]} — running npm install..."
  npm install
else
  info "All packages already installed — running npm install to verify..."
  npm install --prefer-offline 2>&1 | tail -1
fi
ok "node_modules ready (express, pg)"

# ─── 5. Verify critical files are in place ───────────────────────────────────
info "Verifying project files..."
FILES=("server.js" "db/index.js" "db/init.sql" "public/signup.html" "public/rules.html" "public/style.css")
for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    fail "Missing file: $f — please re-clone or restore the repository."
  fi
done
ok "All project files present"

# ─── 6. Resolve DATABASE_URL ─────────────────────────────────────────────────
if [ -z "$DATABASE_URL" ]; then
  warn "DATABASE_URL is not set."
  echo ""
  echo "  Set it before running this script, for example:"
  echo "    export DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/astroparks"
  echo "    bash setup.sh"
  echo ""
  echo "  Or supply it inline:"
  echo "    DATABASE_URL=postgres://... bash setup.sh"
  echo ""
  read -r -p "  Enter DATABASE_URL now (or press Enter to skip DB init): " INPUT_URL
  if [ -n "$INPUT_URL" ]; then
    export DATABASE_URL="$INPUT_URL"
  else
    warn "Skipping database initialisation. Run 'npm run db:init' manually."
    SKIP_DB=1
  fi
fi

# ─── 7. Initialise the database ──────────────────────────────────────────────
if [ "${SKIP_DB:-0}" -eq 0 ]; then
  info "Initialising database..."
  if psql "$DATABASE_URL" -f db/init.sql; then
    ok "Database tables created and parking rules seeded"
  else
    fail "Database initialisation failed. Check your DATABASE_URL and PostgreSQL connection."
  fi
fi

# ─── 8. Done — launch server ─────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗"
echo -e "║         Setup complete!              ║"
echo -e "╚══════════════════════════════════════╝${NC}"
echo ""
echo "  Start the server:"
echo -e "    ${CYAN}DATABASE_URL=<your-url> npm start${NC}"
echo ""
echo "  Then open: http://localhost:3000"
echo ""
