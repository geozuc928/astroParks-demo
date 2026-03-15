// Cross-platform database initialisation script.
// Reads DATABASE_URL from .env, then executes db/init.sql.
// Usage: npm run db:init
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

const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
const pool = new Pool({ connectionString: url });

(async () => {
  const client = await pool.connect();
  try {
    console.log('[INFO]  Running db/init.sql...');
    await client.query(sql);
    console.log('[OK]    Tables created and parking rules seeded.');
  } catch (err) {
    console.error('[ERROR] Database initialisation failed:', err.message);
    console.error('        Check that DATABASE_URL in .env is correct and PostgreSQL is running.');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
