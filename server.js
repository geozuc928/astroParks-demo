require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Redirect root to signup
app.get('/', (req, res) => {
  res.redirect('/signup.html');
});

// POST /api/signup — register a new customer
app.post('/api/signup', async (req, res) => {
  const { username, email, license_plate } = req.body || {};

  if (!username || !email || !license_plate) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO customers (username, email, license_plate)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, license_plate`,
      [username.trim(), email.trim().toLowerCase(), license_plate.trim().toUpperCase()]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That email address is already registered.' });
    }
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/rules — return the parking rules
app.get('/api/rules', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT rate_cents, max_hours FROM parking_rules LIMIT 1'
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No parking rules configured.' });
    }
    const { rate_cents, max_hours } = result.rows[0];
    return res.json({
      rate_cents,
      rate_display: `$${(rate_cents / 100).toFixed(2)}/hr`,
      max_hours,
      max_display: `${max_hours} hr${max_hours !== 1 ? 's' : ''}`,
    });
  } catch (err) {
    console.error('Rules error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// POST /api/detections — accept detection results from Python detector
app.post('/api/detections', async (req, res) => {
  const { image_source, detected_at, spaces } = req.body || {};

  if (!Array.isArray(spaces) || spaces.length === 0) {
    return res.status(400).json({ error: 'spaces must be a non-empty array.' });
  }

  try {
    // Look up all referenced space labels in one query
    const labels = [...new Set(spaces.map(s => s.space_label))];
    const labelRows = await pool.query(
      `SELECT id, space_label FROM parking_spaces WHERE space_label = ANY($1)`,
      [labels]
    );
    const labelToId = {};
    for (const row of labelRows.rows) labelToId[row.space_label] = row.id;

    // Build bulk insert
    const values = [];
    const params = [];
    let idx = 1;
    for (const s of spaces) {
      const spaceId = labelToId[s.space_label];
      if (!spaceId) continue; // skip unknown labels
      values.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++})`);
      params.push(
        spaceId,
        image_source || null,
        detected_at || null,
        s.is_occupied === true,
        s.confidence != null ? s.confidence : null,
        s.car_bbox_x1 != null ? s.car_bbox_x1 : null,
        s.car_bbox_y1 != null ? s.car_bbox_y1 : null,
        s.car_bbox_x2 != null ? s.car_bbox_x2 : null,
        s.car_bbox_y2 != null ? s.car_bbox_y2 : null
      );
    }

    if (values.length === 0) {
      return res.status(400).json({ error: 'No recognised space labels in payload.' });
    }

    await pool.query(
      `INSERT INTO parking_detections
       (space_id, image_source, detected_at, is_occupied,
        confidence, car_bbox_x1, car_bbox_y1, car_bbox_x2, car_bbox_y2)
       VALUES ${values.join(',')}`,
      params
    );

    return res.status(201).json({ inserted: values.length });
  } catch (err) {
    console.error('Detections error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/spaces — return current occupancy state for all parking spaces
app.get('/api/spaces', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ps.space_label, ps.polygon_pixels,
              COALESCE(d.is_occupied, FALSE) AS is_occupied,
              d.confidence,
              d.detected_at AS last_detected_at
       FROM parking_spaces ps
       LEFT JOIN LATERAL (
         SELECT is_occupied, confidence, detected_at
         FROM parking_detections
         WHERE space_id = ps.id
         ORDER BY detected_at DESC
         LIMIT 1
       ) d ON TRUE
       ORDER BY ps.space_label`
    );

    const spaces = result.rows;
    const occupied_count = spaces.filter(s => s.is_occupied).length;
    const timestamps = spaces.map(s => s.last_detected_at).filter(Boolean);
    const last_run_at = timestamps.length
      ? timestamps.reduce((a, b) => (a > b ? a : b))
      : null;

    return res.json({
      spaces,
      total_spaces: spaces.length,
      occupied_count,
      available_count: spaces.length - occupied_count,
      last_run_at,
    });
  } catch (err) {
    console.error('Spaces error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`AstroParks server running at http://localhost:${PORT}`);
});
