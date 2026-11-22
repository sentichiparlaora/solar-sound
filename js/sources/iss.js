// International Space Station position from wheretheiss.at (NORAD id 25544).
// Follows the source contract documented in ./solarWind.js.
//
// The API returns the current position and, for the chart, positions at up
// to 10 arbitrary timestamps per request. The service asks for about one
// request per second at most, so the history is fetched sequentially.

const BASE = 'https://api.wheretheiss.at/v1/satellites/25544';
const HISTORY_MS = 2 * 60 * 60 * 1000;
const HISTORY_STEP_S = 120;
const BATCH = 10;

const toSample = (r) => ({
  t: new Date(r.timestamp * 1000),
  latitude: r.latitude,
  longitude: r.longitude,
  altitude: r.altitude,
  velocity: r.velocity,
  sunlit: r.visibility === 'eclipsed' ? 0 : 1,
});

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`wheretheiss.at HTTP ${res.status}`);
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let buffer = [];

async function loadHistory(nowS) {
  const stamps = [];
  for (let t = nowS - HISTORY_MS / 1000; t < nowS; t += HISTORY_STEP_S) stamps.push(Math.round(t));
  const out = [];
  for (let i = 0; i < stamps.length; i += BATCH) {
    const list = stamps.slice(i, i + BATCH).join(',');
    const rows = await getJSON(`${BASE}/positions?timestamps=${list}&units=kilometers`);
    out.push(...rows.map(toSample));
    await sleep(1100);
  }
  return out;
}

export default {
  id: 'iss',
  name: 'Stazione Spaziale Internazionale',
  pollMs: 10_000,
  historyMs: HISTORY_MS,

  // Higher register and a softer wave than the Sun, so the two voices separate.
  voice: { lowHz: 440, highHz: 1760, wave: 'triangle', sub: 0.1 },

  // Grey bands on the chart where the ISS is in Earth's shadow.
  chartBands: { key: 'sunlit', when: (v) => v === 0, label: 'in ombra' },

  params: [
    { key: 'latitude', label: 'Latitudine', unit: '°', digits: 1,
      min: -51.6, max: 51.6, log: false, role: 'pitch' },
    { key: 'altitude', label: 'Altitudine', unit: 'km', digits: 1,
      min: 410, max: 440, log: false, role: 'volume' },
    { key: 'sunlit', label: 'Illuminazione', unit: '', min: 0, max: 1, role: 'timbre',
      chart: false, format: (v) => (v ? 'Al sole' : 'In ombra') },
    { key: 'longitude', label: 'Longitudine', unit: '°', digits: 1,
      min: -180, max: 180, role: null, primary: false, chart: false },
    { key: 'velocity', label: 'Velocità', unit: 'km/h', digits: 0,
      min: 27000, max: 28000, role: null, primary: false, chart: false },
  ],

  async fetch() {
    const now = toSample(await getJSON(`${BASE}?units=kilometers`));
    if (!buffer.length) {
      try {
        buffer = await loadHistory(now.t.getTime() / 1000);
      } catch (err) {
        console.warn('[iss] history unavailable, starting from now', err);
      }
    }
    if (!buffer.length || now.t > buffer.at(-1).t) buffer.push(now);
    const cutoff = now.t.getTime() - HISTORY_MS;
    buffer = buffer.filter((s) => s.t.getTime() >= cutoff);
    return buffer.slice();
  },
};
