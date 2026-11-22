# Solar Sound

Listen to the solar wind in real time.

Solar Sound is a small static web app (plain HTML + JavaScript, no framework, no build step)
that turns live solar wind measurements from NOAA's Space Weather Prediction Center into sound
with the Web Audio API.

## How it works

Every 60 seconds the app downloads
[`rtsw_wind_1m.json`](https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json),
the 1-minute real-time solar wind feed measured at the L1 Lagrange point,
about 1.5 million km from Earth. The feed mixes several spacecraft; only records with
`"active": true` are used.

| Measurement          | Range mapped             | Sound           |
| -------------------- | ------------------------ | --------------- |
| `proton_speed`       | 250 → 800 km/s (linear)  | Pitch, 110 → 880 Hz (3 octaves, log scale) |
| `proton_density`     | 0.1 → 50 p/cm³ (log)     | Volume          |
| `proton_temperature` | 10⁴ → 10⁶ K (log)        | Timbre: low-pass cutoff and sine → sawtooth blend (hotter = brighter) |

Values outside the ranges are clamped. Changes glide over about three seconds, and a slow
tremolo keeps a steady wind from sounding like a flat test tone.

The page shows the latest values in large type and a chart of the last 2 hours
(speed, density and temperature in three stacked panels).

Audio starts only after you click **“Ascolta il Sole”**, as browsers require.
The interface is in Italian.

## Run it

The app uses ES modules, so it must be served over HTTP. Opening `index.html` straight
from disk (`file://`) will not work.

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static host works too. On GitHub Pages: *Settings → Pages → Deploy from a branch*,
choose `main` and `/ (root)`.

The NOAA feed sends `Access-Control-Allow-Origin: *`, so no proxy is needed.

## Project structure

```
index.html
css/style.css
js/
  main.js              app wiring: polling, readouts, chart, audio
  sources/
    index.js           registry of data sources
    solarWind.js       NOAA solar wind source
  audio/sonifier.js    Web Audio engine (one voice per source)
  ui/chart.js          canvas chart, no libraries
  util/scale.js        normalization and frequency helpers
```

## Adding a data source

Sources are self-contained modules. The rest of the app depends only on this contract
(documented in `js/sources/solarWind.js`):

```js
export default {
  id: 'iss',
  name: 'Stazione Spaziale',
  pollMs: 5_000,
  historyMs: 2 * 60 * 60 * 1000,
  params: [
    // role: 'pitch' | 'volume' | 'timbre' | null (display only)
    { key: 'altitude', label: 'Altitudine', unit: 'km', digits: 1,
      min: 400, max: 430, log: false, role: 'pitch' },
  ],
  async fetch() {
    // return samples sorted oldest -> newest: [{ t: Date, altitude: 418.2 }, ...]
  },
};
```

Then add it to `js/sources/index.js`. Each source gets its own panel, chart and audio voice,
so sources can play together.

## Credits

Data: [NOAA SWPC Real-Time Solar Wind](https://www.swpc.noaa.gov/products/real-time-solar-wind).
This project is not affiliated with or endorsed by NOAA.

## License

[MIT](LICENSE)
