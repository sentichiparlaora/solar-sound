// Solar Sound — app wiring: poll sources, update readouts, chart and audio.

import { sources } from './sources/index.js';
import { Sonifier } from './audio/sonifier.js';
import { StackedChart } from './ui/chart.js';
import { normalize, noteName } from './util/scale.js';

const ROLE_TEXT = { pitch: 'altezza', volume: 'volume', timbre: 'timbro' };

const sonifier = new Sonifier();
const button = document.getElementById('listen');
const panels = document.getElementById('sources');

// Build one panel (readouts + chart) per source and start polling it.
for (const source of sources) {
  sonifier.register(source.id, source.voice);
  const panel = renderPanel(source);
  panels.append(panel.root);
  poll(source, panel);
}

button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    if (sonifier.running) {
      await sonifier.stop();
      setButton(false);
    } else {
      await sonifier.start();
      setButton(true);
    }
  } catch (err) {
    console.error(err);
    alert('Impossibile avviare l’audio in questo browser.');
  } finally {
    button.disabled = false;
  }
});

function setButton(playing) {
  button.textContent = playing ? 'Ferma l’ascolto' : 'Ascolta il Sole';
  button.setAttribute('aria-pressed', String(playing));
  document.body.classList.toggle('playing', playing);
}

function renderPanel(source) {
  const root = document.createElement('section');
  root.className = 'source';
  root.innerHTML = `
    <header class="source-head">
      <h2>${source.name}</h2>
      <label class="mix"><input type="checkbox" checked> Nel mix</label>
      <p class="status" role="status">Caricamento dati…</p>
    </header>
    <div class="readouts"></div>
    <div class="readouts secondary"></div>
    <p class="note" aria-live="polite"></p>
    <canvas class="chart" aria-label="Grafico delle ultime 2 ore"></canvas>
    ${source.chartBands ? `<p class="legend"><span class="swatch"></span> Fasce grigie: ${source.chartBands.label}</p>` : ''}
  `;

  const [primary, secondary] = root.querySelectorAll('.readouts');
  const values = {};
  for (const p of source.params) {
    const el = document.createElement('div');
    el.className = 'readout';
    const unit = [p.unit, p.role && ROLE_TEXT[p.role]].filter(Boolean).join(' · ');
    el.innerHTML = `
      <span class="label">${p.label}</span>
      <span class="value">–</span>
      <span class="unit">${unit}</span>
    `;
    (p.primary === false ? secondary : primary).append(el);
    values[p.key] = el.querySelector('.value');
  }
  if (!secondary.children.length) secondary.remove();

  root.querySelector('.mix input').addEventListener('change', (e) => {
    sonifier.setEnabled(source.id, e.target.checked);
  });

  const canvas = root.querySelector('.chart');
  const plotted = source.params.filter((p) => p.chart !== false).length;
  canvas.style.height = `${plotted * 100 + 30}px`;

  return {
    root,
    values,
    status: root.querySelector('.status'),
    note: root.querySelector('.note'),
    chart: new StackedChart(canvas, source.params, source),
    lastSample: null,
  };
}

function formatValue(p, v) {
  if (v == null) return '–';
  if (p.format) return p.format(v);
  return v.toLocaleString('it-IT', { maximumFractionDigits: p.digits, minimumFractionDigits: p.digits });
}

async function poll(source, panel) {
  try {
    const samples = await source.fetch();
    if (!samples.length) throw new Error('nessun dato');
    const recent = samples.filter((s) => s.t >= samples.at(-1).t - source.historyMs);

    // Latest value per parameter (a field can be null in the newest record).
    const latest = {};
    for (const p of source.params) {
      const s = recent.findLast((r) => r[p.key] != null);
      latest[p.key] = s ? s[p.key] : null;
    }

    const controls = {};
    for (const p of source.params) {
      panel.values[p.key].textContent = formatValue(p, latest[p.key]);
      if (p.role && latest[p.key] != null) controls[p.role] = normalize(latest[p.key], p);
    }
    sonifier.update(source.id, controls);

    const f = sonifier.frequencyOf(source.id);
    panel.note.textContent = f ? `Nota attuale ≈ ${Math.round(f)} Hz (${noteName(f)})` : '';

    panel.chart.setData(recent);
    panel.lastSample = recent.at(-1);
    panel.error = null;
  } catch (err) {
    console.error(`[${source.id}]`, err);
    panel.error = err;
  }
  updateStatus(source, panel);
  setTimeout(() => poll(source, panel), source.pollMs);
}

function updateStatus(source, panel) {
  const s = panel.lastSample;
  const retry = source.pollMs >= 60_000 ? 'tra un minuto' : 'tra pochi secondi';
  let text = '';
  if (s) {
    const time = s.t.toLocaleTimeString('it-IT', {
      hour: '2-digit', minute: '2-digit', second: source.pollMs < 60_000 ? '2-digit' : undefined,
    });
    const ageMin = Math.max(0, Math.round((Date.now() - s.t) / 60000));
    text = `Dato delle ${time}${ageMin ? ` (${ageMin} min fa)` : ''}${s.spacecraft ? ` · satellite ${s.spacecraft}` : ''}`;
  }
  if (panel.error) text = `Errore nel caricamento, riprovo ${retry}. ${text}`;
  panel.status.textContent = text || 'Caricamento dati…';
  panel.status.classList.toggle('error', Boolean(panel.error));
}
