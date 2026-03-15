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

// GET /api/rules — return all parking rules
app.get('/api/rules', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, rate_cents, max_hours, enforce_start, enforce_end, note FROM parking_rules ORDER BY id'
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Rules error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// POST /api/rules — add a new rule
app.post('/api/rules', async (req, res) => {
  const { rate_cents, max_hours, enforce_start, enforce_end, note } = req.body || {};
  if (!rate_cents || !max_hours) {
    return res.status(400).json({ error: 'rate_cents and max_hours are required.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO parking_rules (rate_cents, max_hours, enforce_start, enforce_end, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, rate_cents, max_hours, enforce_start, enforce_end, note`,
      [rate_cents, max_hours, enforce_start || null, enforce_end || null, note || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Add rule error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// PUT /api/rules/:id — update an existing rule
app.put('/api/rules/:id', async (req, res) => {
  const { id } = req.params;
  const { rate_cents, max_hours, enforce_start, enforce_end, note } = req.body || {};
  try {
    const result = await pool.query(
      `UPDATE parking_rules
       SET rate_cents=$1, max_hours=$2, enforce_start=$3, enforce_end=$4, note=$5
       WHERE id=$6
       RETURNING id, rate_cents, max_hours, enforce_start, enforce_end, note`,
      [rate_cents, max_hours, enforce_start || null, enforce_end || null, note || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found.' });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Update rule error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// DELETE /api/rules/:id — remove a rule
app.delete('/api/rules/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM parking_rules WHERE id=$1', [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Delete rule error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// GET /api/spaces — return all space statuses
app.get('/api/spaces', async (req, res) => {
  try {
    const result = await pool.query('SELECT space_id, status FROM space_status ORDER BY space_id');
    return res.json(result.rows);
  } catch (err) {
    console.error('Spaces error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// PUT /api/spaces/:id — update a space's status
app.put('/api/spaces/:id', async (req, res) => {
  const { status } = req.body || {};
  const allowed = ['', 'green', 'yellow', 'red'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  try {
    await pool.query(
      'INSERT INTO space_status (space_id, status) VALUES ($1, $2) ON CONFLICT (space_id) DO UPDATE SET status=$2',
      [req.params.id, status]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('Update space error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`AstroParks server running at http://localhost:${PORT}`);
});
