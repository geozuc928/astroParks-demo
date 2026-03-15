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
| psql | any | CLI client (ships with PostgreSQL) |

---

## Quick Start

### 1. Clone the repository

```bash
git clone <repo-url>
cd astroParks-demo
```

### 2. Run the setup script

The setup script checks all prerequisites, installs dependencies, and initialises the database.

```bash
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/astroparks bash setup.sh
```

> The script will prompt for `DATABASE_URL` if it is not set.

### 3. Start the server

```bash
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/astroparks npm start
```

Open **http://localhost:3000** in your browser.

---

## Manual Setup (step by step)

If you prefer to run each step individually:

### Install Node.js dependencies

```bash
npm install
```

This installs:
- `express` — web framework / HTTP server
- `pg` — PostgreSQL client for Node.js

Packages are installed into `node_modules/` in the project root.

### Create the PostgreSQL database

```bash
createdb astroparks
# or using psql:
psql -U postgres -c "CREATE DATABASE astroparks;"
```

### Initialise tables and seed data

```bash
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/astroparks npm run db:init
```

This runs `db/init.sql`, which:
- Creates the `customers` table
- Creates the `parking_rules` table
- Seeds the parking rule: **$1.00/hr**, max **4 hrs**

Safe to re-run — the seed insert is guarded with `WHERE NOT EXISTS`.

### Start the server

```bash
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/astroparks npm start
```

---

## Environment Variables

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgres://user:pass@localhost:5432/astroparks` | PostgreSQL connection string |
| `PORT` | No | `3000` | Server port (defaults to 3000) |

Alternatively, you can use individual `PG*` variables that the `pg` library reads automatically:

```bash
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=astroparks
export PGUSER=myuser
export PGPASSWORD=mypassword
npm start
```

---

## Project Structure

```
astroParks-demo/
├── server.js            # Express server — API endpoints + static file serving
├── package.json         # Project metadata and npm scripts
├── setup.sh             # One-command setup and validation script
├── db/
│   ├── index.js         # PostgreSQL connection pool (exported singleton)
│   └── init.sql         # Schema DDL + seed data — run once before starting
└── public/              # Static frontend — served directly by Express
    ├── signup.html      # Page 1: Customer sign-up form
    ├── rules.html       # Page 2: Parking rules display
    └── style.css        # Shared stylesheet
```

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

---

## npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm start` | `node server.js` | Start the server |
| `npm run db:init` | `psql $DATABASE_URL -f db/init.sql` | Create tables and seed rules |
