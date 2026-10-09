// config.js — one place for tunables. Everything can be overridden with env vars.
function validTimezone(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; }
}

const tz = process.env.APP_TIMEZONE || 'Africa/Accra';

module.exports = {
  PORT: process.env.PORT || 3000,
  IS_PROD: process.env.NODE_ENV === 'production',
  // Late cut-off times ("09:15") and record dates/times are interpreted in this zone.
  TIMEZONE: validTimezone(tz) ? tz : 'UTC',
  // Public base URL used inside the QR code (falls back to the request's own host).
  PUBLIC_URL: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  // The dashboard rotates the code every 60s. A code stops working if it is not
  // rotated within CODE_TTL_MS, so a forgotten/closed dashboard cannot be used remotely.
  CODE_TTL_MS: 120 * 1000,
  // After a rotation the previous code still works briefly (students mid-typing).
  PREV_CODE_GRACE_MS: 15 * 1000,
  BCRYPT_ROUNDS: 10,
  MAX_ROSTER_IMPORT: 5000,
  MAX_RECORDS: 50000
};
