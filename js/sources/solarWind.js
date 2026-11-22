// Real-time solar wind from NOAA SWPC, measured by the active spacecraft at L1.
//
// Every data source in Solar Sound exports an object with this shape:
//
//   {
//     id:        unique string
//     name:      label shown in the UI
//     pollMs:    how often fetch() is called
//     historyMs: how much history the chart shows
//     params: [  one entry per measured quantity
//       { key, label, unit, digits, min, max, log, role }
//     ]          role is 'pitch' | 'volume' | 'timbre' (or null = display only)
//     fetch():   async, resolves to samples sorted oldest -> newest:
//                [{ t: Date, <key>: number|null, ... }]
//   }
//
// The app only depends on this contract, so a new source (e.g. the ISS)
// is just another file in this folder registered in ./index.js.

const URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json';

export default {
  id: 'solar-wind',
  name: 'Vento solare',
  pollMs: 60_000,
  historyMs: 2 * 60 * 60 * 1000,

  params: [
    { key: 'speed', label: 'Velocità', unit: 'km/s', digits: 0,
      min: 250, max: 800, log: false, role: 'pitch' },
    { key: 'density', label: 'Densità', unit: 'p/cm³', digits: 2,
      min: 0.1, max: 50, log: true, role: 'volume' },
    { key: 'temperature', label: 'Temperatura', unit: 'K', digits: 0,
      min: 1e4, max: 1e6, log: true, role: 'timbre' },
  ],

  async fetch() {
    const res = await fetch(URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`NOAA HTTP ${res.status}`);
    const rows = await res.json();

    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

    // Newest records come first; keep only the active spacecraft.
    return rows
      .filter((r) => r.active === true)
      .map((r) => ({
        t: new Date(r.time_tag + 'Z'), // time_tag is UTC without a zone suffix
        speed: num(r.proton_speed),
        density: num(r.proton_density),
        temperature: num(r.proton_temperature),
        spacecraft: r.source,
      }))
      .filter((s) => !Number.isNaN(s.t.getTime()))
      .sort((a, b) => a.t - b.t);
  },
};
