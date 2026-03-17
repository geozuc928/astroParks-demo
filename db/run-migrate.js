// Detection tables migration + parking space seeder.
// Reads DATABASE_URL from .env, runs migrate-detections.sql,
// then seeds parking_spaces from both east and west JSON files.
// Usage: npm run db:migrate
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[ERROR] DATABASE_URL is not set.');
  console.error('        Edit the .env file and set DATABASE_URL, then try again.');
  process.exit(1);
}

const detectionDir = path.join(__dirname, '..', 'detection');

// Map of zone name -> JSON file path
const ZONE_FILES = {
  east: path.join(detectionDir, 'parking_spaces_east.json'),
  west: path.join(detectionDir, 'parking_spaces_west.json'),
};

for (const [zone, filePath] of Object.entries(ZONE_FILES)) {
  if (!fs.existsSync(filePath)) {
    console.error(`[ERROR] detection/parking_spaces_${zone}.json not found.`);
    console.error(`        Place your ${zone} parking spaces JSON file at ${filePath}`);
    process.exit(1);
  }
}

const sql = fs.readFileSync(path.join(__dirname, 'migrate-detections.sql'), 'utf8');
const pool = new Pool({ connectionString: url });

async function seedZone(client, zone, filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let inserted = 0;
  let updated = 0;
  for (const space of data.spaces) {
    const result = await client.query(
      `INSERT INTO parking_spaces (space_key, space_label, space_type, zone, polygon_pixels)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (space_key) DO UPDATE
         SET space_label = EXCLUDED.space_label,
             space_type  = EXCLUDED.space_type,
             zone        = EXCLUDED.zone,
             polygon_pixels = EXCLUDED.polygon_pixels`,
      [space.id, space.label, space.type || 'standard', zone, JSON.stringify(space.polygonPixels)]
    );
    // rowCount 1 on insert, also 1 on update — check xmax to distinguish
    if (result.rowCount > 0) inserted++;
    else updated++;
  }
  return { inserted, total: data.spaces.length };
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('[INFO]  Running db/migrate-detections.sql...');
    await client.query(sql);
    console.log('[OK]    Detection tables ready.');

    for (const [zone, filePath] of Object.entries(ZONE_FILES)) {
      console.log(`[INFO]  Seeding ${zone} spaces from ${path.basename(filePath)}...`);
      const { inserted, total } = await seedZone(client, zone, filePath);
      console.log(`[OK]    ${zone}: ${inserted}/${total} spaces upserted.`);
    }

    await client.query('COMMIT');
    console.log('[OK]    Migration complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ERROR] Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
