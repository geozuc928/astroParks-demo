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

# ─── 3. Install Node dependencies ────────────────────────────────────────────
info "Installing Node.js dependencies..."
REQUIRED_PACKAGES=("express" "pg" "dotenv")
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
ok "node_modules ready (express, pg, dotenv)"

# ─── 4. Verify critical files are in place ───────────────────────────────────
info "Verifying project files..."
FILES=("server.js" "db/index.js" "db/init.sql" "db/run-init.js" "public/signup.html" "public/rules.html" "public/style.css")
for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    fail "Missing file: $f — please re-clone or restore the repository."
  fi
done
ok "All project files present"

# ─── 5. Check .env file ───────────────────────────────────────────────────────
info "Checking .env file..."
if [ ! -f ".env" ]; then
  warn ".env file not found — creating from .env.example..."
  cp .env.example .env
  warn "Edit .env and set your DATABASE_URL, then re-run this script."
  echo ""
  echo "  nano .env   (Linux/macOS)"
  echo "  notepad .env  (Windows)"
  echo ""
  exit 0
fi
ok ".env file found"

# ─── 6. Initialise the database ──────────────────────────────────────────────
info "Initialising database (npm run db:init)..."
if npm run db:init; then
  ok "Database tables created and parking rules seeded"
else
  fail "Database initialisation failed. Check DATABASE_URL in your .env file."
fi

# ─── 7. Done ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗"
echo -e "║         Setup complete!              ║"
echo -e "╚══════════════════════════════════════╝${NC}"
echo ""
echo "  Start the server:"
echo -e "    ${CYAN}npm start${NC}"
echo ""
echo "  Then open: http://localhost:3000"
echo ""
