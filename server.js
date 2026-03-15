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

app.listen(PORT, () => {
  console.log(`AstroParks server running at http://localhost:${PORT}`);
});
