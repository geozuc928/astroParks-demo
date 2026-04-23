require('dotenv').config();
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const path         = require('path');

require('./db');

const authRoutes = require('./routes/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc:  ["'self'"],
      imgSrc:     ["'self'", 'data:'],
    },
  },
}));

app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);

app.get('/', (_req, res) => res.redirect('/signup.html'));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).redirect('/signup.html');
});

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n★  AstroParks Mobile running at http://localhost:${PORT}`);
  console.log(`   Signup: http://localhost:${PORT}/signup.html\n`);
});
