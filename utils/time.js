// utils/time.js
const { TIMEZONE } = require('../config');

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

const nowIso = () => new Date().toISOString();

// Wall-clock parts of a moment in the app timezone.
function localParts(input) {
  const p = {};
  for (const part of fmt.formatToParts(new Date(input))) p[part.type] = part.value;
  const hour = Number(p.hour);
  const minute = Number(p.minute);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    minutes: hour * 60 + minute
  };
}

const CUTOFF_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const isCutoff = (s) => typeof s === 'string' && CUTOFF_RE.test(s);
const cutoffMinutes = (s) => { const m = CUTOFF_RE.exec(s); return Number(m[1]) * 60 + Number(m[2]); };

module.exports = { nowIso, localParts, isCutoff, cutoffMinutes };
