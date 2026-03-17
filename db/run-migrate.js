// Detection tables migration + parking space seeder.
// Reads DATABASE_URL from .env, runs migrate-detections.sql,
// then seeds parking_spaces from detection/parking_spaces.json.
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

const spacesJsonPath = path.join(__dirname, '..', 'detection', 'parking_spaces.json');
if (!fs.existsSync(spacesJsonPath)) {
  console.error('[ERROR] detection/parking_spaces.json not found.');
  console.error('        Place your parking spaces JSON file at detection/parking_spaces.json');
  process.exit(1);
}

const sql = fs.readFileSync(path.join(__dirname, 'migrate-detections.sql'), 'utf8');
const spacesData = JSON.parse(fs.readFileSync(spacesJsonPath, 'utf8'));
const pool = new Pool({ connectionString: url });

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('[INFO]  Running db/migrate-detections.sql...');
    await client.query(sql);
    console.log('[OK]    Detection tables created.');

    console.log('[INFO]  Seeding parking_spaces from parking_spaces.json...');
    let inserted = 0;
    let skipped = 0;
    for (const space of spacesData.spaces) {
      const result = await client.query(
        `INSERT INTO parking_spaces (space_key, space_label, space_type, polygon_pixels)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (space_key) DO NOTHING`,
        [space.id, space.label, space.type || 'standard', JSON.stringify(space.polygonPixels)]
      );
      if (result.rowCount > 0) inserted++;
      else skipped++;
    }

    await client.query('COMMIT');
    console.log(`[OK]    Seeded ${inserted} spaces (${skipped} already existed).`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ERROR] Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
