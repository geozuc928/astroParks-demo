-- AstroParks Demo — Database initialization

CREATE TABLE IF NOT EXISTS parking_rules (
  id          SERIAL PRIMARY KEY,
  rate_cents  INTEGER NOT NULL,   -- stored as cents (100 = $1.00)
  max_hours   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  license_plate VARCHAR(20)  NOT NULL,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- Add password_hash to existing deployments that used the old schema
ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NOT NULL DEFAULT '';

-- Remove username column requirement (it was never used in auth)
-- (existing username column is kept for backwards compat if present)

CREATE TABLE IF NOT EXISTS parking_sessions (
  id                SERIAL PRIMARY KEY,
  customer_id       INTEGER REFERENCES customers(id),
  license_plate     VARCHAR(20)  NOT NULL,
  entered_at        TIMESTAMPTZ  DEFAULT NOW(),
  exited_at         TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  stripe_session_id VARCHAR(255),
  amount_cents      INTEGER,
  in_lot            BOOLEAN DEFAULT TRUE,
  paid              BOOLEAN DEFAULT FALSE
);

-- Seed the single parking rule (idempotent)
INSERT INTO parking_rules (rate_cents, max_hours)
SELECT 100, 4
WHERE NOT EXISTS (SELECT 1 FROM parking_rules);
