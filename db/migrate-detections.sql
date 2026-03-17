-- AstroParks -- Detection tables migration
-- Run via: npm run db:migrate

CREATE TABLE IF NOT EXISTS parking_spaces (
  id             SERIAL PRIMARY KEY,
  space_key      VARCHAR(50)  NOT NULL UNIQUE,  -- JSON "id" field e.g. "sp_177..."
  space_label    VARCHAR(20)  NOT NULL,          -- "278", "275", etc.
  space_type     VARCHAR(20)  DEFAULT 'standard',
  zone           VARCHAR(20)  NOT NULL DEFAULT 'default',  -- 'east' | 'west'
  polygon_pixels JSONB        NOT NULL,          -- [{x,y},{x,y},{x,y},{x,y}]
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

-- Add zone column to existing tables (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parking_spaces' AND column_name = 'zone'
  ) THEN
    ALTER TABLE parking_spaces ADD COLUMN zone VARCHAR(20) NOT NULL DEFAULT 'default';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS parking_detections (
  id           SERIAL  PRIMARY KEY,
  space_id     INTEGER NOT NULL REFERENCES parking_spaces(id),
  image_source VARCHAR(500),
  detected_at  TIMESTAMPTZ DEFAULT NOW(),
  is_occupied  BOOLEAN     NOT NULL DEFAULT FALSE,
  confidence   NUMERIC(5,4),
  car_bbox_x1  INTEGER,
  car_bbox_y1  INTEGER,
  car_bbox_x2  INTEGER,
  car_bbox_y2  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_detections_space_detected
  ON parking_detections(space_id, detected_at DESC);
