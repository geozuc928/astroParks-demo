require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const Stripe = require('stripe');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || '');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
}));

app.get('/', (req, res) => {
  res.redirect('/login.html');
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated.' });
  next();
}

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------

app.post('/api/auth/signup', async (req, res) => {
  const { email, password, license_plate } = req.body || {};

  if (!email || !password || !license_plate) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO customers (email, password_hash, license_plate)
       VALUES ($1, $2, $3)
       RETURNING id, email, license_plate`,
      [email.trim().toLowerCase(), password_hash, license_plate.trim().toUpperCase()]
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

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, license_plate, password_hash FROM customers WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    const customer = result.rows[0];
    if (!customer) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, customer.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    req.session.userId = customer.id;
    req.session.email = customer.email;
    req.session.license_plate = customer.license_plate;

    return res.json({ email: customer.email, license_plate: customer.license_plate });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated.' });
  return res.json({ email: req.session.email, license_plate: req.session.license_plate });
});

// ---------------------------------------------------------------------------
// Parking rules
// ---------------------------------------------------------------------------

app.get('/api/rules', async (req, res) => {
  try {
    const result = await pool.query('SELECT rate_cents, max_hours FROM parking_rules LIMIT 1');
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

// ---------------------------------------------------------------------------
// Parking session routes
// ---------------------------------------------------------------------------

app.post('/api/sessions/start', requireAuth, async (req, res) => {
  const customerId = req.session.userId;
  const licensePlate = req.session.license_plate;

  try {
    // Prevent duplicate active sessions
    const existing = await pool.query(
      `SELECT id FROM parking_sessions
       WHERE customer_id = $1 AND in_lot = TRUE AND exited_at IS NULL`,
      [customerId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'You already have an active parking session.' });
    }

    const result = await pool.query(
      `INSERT INTO parking_sessions (customer_id, license_plate, in_lot, paid)
       VALUES ($1, $2, TRUE, FALSE)
       RETURNING id, license_plate, entered_at, in_lot, paid`,
      [customerId, licensePlate]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Session start error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

app.get('/api/sessions/active', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, license_plate, entered_at, in_lot, paid, paid_at, amount_cents
       FROM parking_sessions
       WHERE customer_id = $1 AND in_lot = TRUE AND exited_at IS NULL
       ORDER BY entered_at DESC
       LIMIT 1`,
      [req.session.userId]
    );
    if (result.rows.length === 0) return res.json(null);
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Active session error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ---------------------------------------------------------------------------
// Payment routes
// ---------------------------------------------------------------------------

app.post('/api/payments/checkout', requireAuth, async (req, res) => {
  try {
    const rulesResult = await pool.query('SELECT rate_cents, max_hours FROM parking_rules LIMIT 1');
    if (rulesResult.rows.length === 0) {
      return res.status(404).json({ error: 'Parking rules not configured.' });
    }
    const { rate_cents, max_hours } = rulesResult.rows[0];

    const sessionResult = await pool.query(
      `SELECT id, license_plate, entered_at FROM parking_sessions
       WHERE customer_id = $1 AND in_lot = TRUE AND paid = FALSE AND exited_at IS NULL
       ORDER BY entered_at DESC LIMIT 1`,
      [req.session.userId]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'No active unpaid parking session found. Please start a session first.' });
    }

    const parkingSession = sessionResult.rows[0];
    const enteredAt = new Date(parkingSession.entered_at);
    const now = new Date();
    const durationMinutes = Math.max(1, Math.ceil((now - enteredAt) / 60000));

    // Bill by the hour (minimum 1 hour)
    const hours = Math.max(1, Math.ceil(durationMinutes / 60));
    const cappedHours = Math.min(hours, max_hours);
    const amount_cents = cappedHours * rate_cents;

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amount_cents,
          product_data: {
            name: `AstroParks Parking — ${parkingSession.license_plate}`,
            description: `${cappedHours} hr${cappedHours !== 1 ? 's' : ''} @ $${(rate_cents / 100).toFixed(2)}/hr`,
          },
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/payment-confirm.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/rules.html`,
      metadata: { parking_session_id: String(parkingSession.id) },
    });

    // Store the stripe session id on the parking session for later verification
    await pool.query(
      'UPDATE parking_sessions SET stripe_session_id = $1, amount_cents = $2 WHERE id = $3',
      [checkoutSession.id, amount_cents, parkingSession.id]
    );

    return res.json({ url: checkoutSession.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Failed to create payment session. Please try again.' });
  }
});

app.get('/api/payments/verify', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id is required.' });

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id);
    if (checkoutSession.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed.' });
    }

    const parkingSessionId = checkoutSession.metadata.parking_session_id;

    const result = await pool.query(
      `UPDATE parking_sessions
       SET paid = TRUE, paid_at = NOW()
       WHERE id = $1 AND paid = FALSE
       RETURNING id, license_plate, entered_at, paid_at, amount_cents, in_lot`,
      [parkingSessionId]
    );

    const row = result.rows[0];
    if (!row) {
      // Already marked paid — fetch the existing record
      const existing = await pool.query(
        'SELECT id, license_plate, entered_at, paid_at, amount_cents, in_lot FROM parking_sessions WHERE id = $1',
        [parkingSessionId]
      );
      return res.json(existing.rows[0]);
    }

    return res.json(row);
  } catch (err) {
    console.error('Payment verify error:', err);
    return res.status(500).json({ error: 'Failed to verify payment. Please contact support.' });
  }
});

// ---------------------------------------------------------------------------
// Admin — master vehicle database
// ---------------------------------------------------------------------------

app.get('/api/admin/vehicles', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         ps.id            AS session_id,
         ps.license_plate,
         c.email,
         ps.in_lot,
         ps.paid,
         ps.entered_at,
         ps.paid_at,
         ps.amount_cents
       FROM parking_sessions ps
       JOIN customers c ON c.id = ps.customer_id
       ORDER BY ps.entered_at DESC`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Admin vehicles error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`AstroParks server running at http://localhost:${PORT}`);
});
