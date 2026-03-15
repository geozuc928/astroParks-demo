-- AstroParks Demo — Database initialization

CREATE TABLE IF NOT EXISTS parking_rules (
  id          SERIAL PRIMARY KEY,
  rate_cents  INTEGER NOT NULL,   -- stored as cents (100 = $1.00)
  max_hours   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  license_plate VARCHAR(20)  NOT NULL,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- Seed the single parking rule (idempotent)
INSERT INTO parking_rules (rate_cents, max_hours)
SELECT 100, 4
WHERE NOT EXISTS (SELECT 1 FROM parking_rules);
