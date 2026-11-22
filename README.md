# Solar Sound

Listen to the solar wind and the International Space Station in real time.

Solar Sound is a small static web app (plain HTML + JavaScript, no framework, no build step)
that turns live data into sound with the Web Audio API: solar wind measurements from NOAA's
Space Weather Prediction Center, and the position of the ISS. The Sun plays the bass line,
the ISS a melody above it.

**Live demo:** https://sentichiparlaora.github.io/solar-sound/

## How it works

### Solar wind

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

### International Space Station

Every 10 seconds the app asks [wheretheiss.at](https://wheretheiss.at/) for the current
position of the ISS. On load it also fetches the last 2 hours (one point every 2 minutes)
for the chart.

| Measurement     | Range mapped                 | Sound           |
| --------------- | ---------------------------- | --------------- |
| Latitude        | −51.6° → +51.6° (linear)     | Pitch, 440 → 1760 Hz (log scale): it rises and falls once per ~92-minute orbit |
| Altitude        | 410 → 440 km (linear)        | Volume          |
| Sunlight        | in Earth's shadow / in sunlight | Timbre: dark and muffled in shadow, bright in sunlight |

Longitude and speed are shown but not sonified (speed changes by less than 1%).
The ISS voice uses a triangle wave and sits two octaves above the Sun, so the two are easy
to tell apart.

### Interface

Each source has its own panel with the latest values in large type, a chart of the
last 2 hours and a **“Nel mix”** switch to mute it. In the ISS chart, grey bands mark the
time spent in Earth's shadow.

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

Both APIs send `Access-Control-Allow-Origin: *`, so no proxy is needed.

## Project structure

```
index.html
css/style.css
js/
  main.js              app wiring: polling, readouts, chart, audio
  sources/
    index.js           registry of data sources
    solarWind.js       NOAA solar wind source (documents the source contract)
    iss.js             ISS position source
  audio/sonifier.js    Web Audio engine (one voice per source)
  ui/chart.js          canvas chart, no libraries
  util/scale.js        normalization and frequency helpers
```

## Adding a data source

Sources are self-contained modules. The rest of the app depends only on this contract
(documented in `js/sources/solarWind.js`; `js/sources/iss.js` is a full example):

```js
export default {
  id: 'my-source',
  name: 'La mia sorgente',
  pollMs: 30_000,
  historyMs: 2 * 60 * 60 * 1000,
  voice: { lowHz: 220, highHz: 880, wave: 'sine' },        // optional
  chartBands: { key: 'flag', when: (v) => v === 1, label: '…' }, // optional
  params: [
    // role: 'pitch' | 'volume' | 'timbre' | null (display only)
    { key: 'value', label: 'Valore', unit: 'u', digits: 1,
      min: 0, max: 100, log: false, role: 'pitch' },
    // optional per param: format(v) for text, primary: false, chart: false
  ],
  async fetch() {
    // return samples sorted oldest -> newest: [{ t: Date, value: 42 }, ...]
  },
};
```

Then add it to `js/sources/index.js`. Each source gets its own panel, chart and audio voice,
so sources can play together.

## Credits

Data: [NOAA SWPC Real-Time Solar Wind](https://www.swpc.noaa.gov/products/real-time-solar-wind)
and [Where the ISS at?](https://wheretheiss.at/).
This project is not affiliated with or endorsed by NOAA or wheretheiss.at.

## License

[MIT](LICENSE)
