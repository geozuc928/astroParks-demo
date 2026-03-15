# AstroParks Demo

A two-page parking app demo built with Node.js, Express, and PostgreSQL.

---

## Pages

| Page | URL | Description |
|------|-----|-------------|
| Sign Up | `/signup.html` | Customer registration (name, email, license plate) |
| Parking Rules | `/rules.html` | Displays rate and maximum duration |

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| [Node.js](https://nodejs.org) | v16+ | JavaScript runtime |
| [npm](https://www.npmjs.com) | v7+ | Bundled with Node.js |
| [PostgreSQL](https://www.postgresql.org/download/) | v13+ | Database server |

> **No need to install psql separately.** Database initialisation now runs through Node.js directly.

---

## Configuration

All environment variables are stored in a `.env` file in the project root. **You only need to edit this once.**

### 1. Copy the example file

```bash
# macOS / Linux
cp .env.example .env

# Windows (Command Prompt)
copy .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

### 2. Edit `.env` with your PostgreSQL credentials

```env
DATABASE_URL=postgres://YOUR_USER:YOUR_PASSWORD@localhost:5432/astroparks
PORT=3000
```

Replace `YOUR_USER` and `YOUR_PASSWORD` with your PostgreSQL username and password.
The default PostgreSQL superuser is usually `postgres`.

**Example:**
```env
DATABASE_URL=postgres://postgres:mypassword@localhost:5432/astroparks
PORT=3000
```

---

## Quick Start

### 1. Clone the repository

```bash
git clone <repo-url>
cd astroParks-demo
```

### 2. Configure `.env`

Follow the [Configuration](#configuration) steps above.

### 3. Run the setup script (macOS / Linux)

```bash
bash setup.sh
```

### 3. Manual setup (Windows or step-by-step)

```bash
# Install dependencies
npm install

# Create the PostgreSQL database (run once)
psql -U postgres -c "CREATE DATABASE astroparks;"

# Initialise tables and seed parking rules
npm run db:init

# Start the server
npm start
```

Open **http://localhost:3000** in your browser.

---

## Running on Windows (PowerShell)

All commands work directly in PowerShell — no special prefix needed because credentials are read from `.env`:

```powershell
# Install dependencies
npm install

# Initialise the database
npm run db:init

# Start the server
npm start
```

---

## Project Structure

```
astroParks-demo/
├── .env                 # Your local config (gitignored — never committed)
├── .env.example         # Safe template — copy to .env and fill in values
├── server.js            # Express server — API endpoints + static file serving
├── package.json         # Project metadata and npm scripts
├── setup.sh             # One-command setup script (macOS/Linux)
├── db/
│   ├── index.js         # PostgreSQL connection pool (reads from .env)
│   ├── init.sql         # Schema DDL + seed data
│   └── run-init.js      # Cross-platform DB init runner (used by npm run db:init)
└── public/              # Static frontend — served directly by Express
    ├── signup.html      # Page 1: Customer sign-up form
    ├── rules.html       # Page 2: Parking rules display
    └── style.css        # Shared stylesheet
```

---

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start the web server |
| `npm run db:init` | Create tables and seed parking rules (run once) |

---

## API Endpoints

### `POST /api/signup`

Register a new customer.

**Request body (JSON)**
```json
{
  "username": "Parker1",
  "email": "Parker1@astroparks.io",
  "license_plate": "ABC123"
}
```

**Responses**

| Status | Meaning |
|--------|---------|
| `201` | Customer created successfully |
| `400` | Missing required field |
| `409` | Email already registered |
| `500` | Server error |

---

### `GET /api/rules`

Returns the current parking rules.

**Response (200)**
```json
{
  "rate_cents": 100,
  "rate_display": "$1.00/hr",
  "max_hours": 4,
  "max_display": "4 hrs"
}
```

---

## Database Schema

```sql
-- Parking rules (seeded via db/init.sql)
CREATE TABLE parking_rules (
  id          SERIAL PRIMARY KEY,
  rate_cents  INTEGER NOT NULL,   -- e.g. 100 = $1.00
  max_hours   INTEGER NOT NULL
);

-- Customer registrations
CREATE TABLE customers (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  license_plate VARCHAR(20)  NOT NULL,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);
```

---

## Test Data

| Field | Value |
|-------|-------|
| Name | Parker1 |
| Email | Parker1@astroparks.io |
| License Plate | ABC123 |
| Rate | $1.00/hr |
| Max Duration | 4 hrs |
