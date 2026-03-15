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

-- Add time-enforcement and note columns to parking_rules (idempotent)
ALTER TABLE parking_rules ADD COLUMN IF NOT EXISTS enforce_start TIME;
ALTER TABLE parking_rules ADD COLUMN IF NOT EXISTS enforce_end   TIME;
ALTER TABLE parking_rules ADD COLUMN IF NOT EXISTS note          TEXT;

-- Seed the default parking rule (idempotent)
INSERT INTO parking_rules (rate_cents, max_hours, enforce_start, enforce_end, note)
SELECT 100, 4, '08:00', '20:00', 'Monday – Saturday'
WHERE NOT EXISTS (SELECT 1 FROM parking_rules);

-- Space occupancy state
CREATE TABLE IF NOT EXISTS space_status (
  space_id INTEGER PRIMARY KEY,
  status   VARCHAR(10) DEFAULT ''
);

-- Seed all known space IDs (idempotent)
INSERT INTO space_status (space_id)
SELECT unnest(ARRAY[
  233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,
  254,255,256,257,258,259,260,261,262,263,
  264,265,267,268,
  269,270,271,272,273,274,275,276,277,278,279,280,
  281,282,283,284,285,286,287,288,289,290,291
])
ON CONFLICT DO NOTHING;
