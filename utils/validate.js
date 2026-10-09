// utils/validate.js
const crypto = require('crypto');
const { HttpError } = require('../middleware/errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Trimmed string, or '' when missing / not a string.
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

function requireText(v, label, max = 120) {
  const s = clean(v);
  if (!s) throw new HttpError(400, `${label} is required.`);
  if (s.length > max) throw new HttpError(400, `${label} is too long (max ${max} characters).`);
  return s;
}

function requireEmail(v) {
  const s = clean(v).toLowerCase();
  if (!s || s.length > 254 || !EMAIL_RE.test(s)) throw new HttpError(400, 'Enter a valid email address.');
  return s;
}

function requirePassword(v, label = 'Password') {
  if (typeof v !== 'string' || v.length < 8) throw new HttpError(400, `${label} must be at least 8 characters.`);
  if (v.length > 200) throw new HttpError(400, `${label} is too long.`);
  return v;
}

function positiveInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Constant-time string comparison.
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { clean, requireText, requireEmail, requirePassword, positiveInt, safeEqual };
