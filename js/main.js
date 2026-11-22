// Solar Sound — app wiring: poll sources, update readouts, chart and audio.

import { sources } from './sources/index.js';
import { Sonifier } from './audio/sonifier.js';
import { StackedChart } from './ui/chart.js';
import { normalize, noteName } from './util/scale.js';

const sonifier = new Sonifier();
const button = document.getElementById('listen');
const panels = document.getElementById('sources');

// Build one panel (readouts + chart) per source and start polling it.
for (const source of sources) {
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
      <p class="status" role="status">Caricamento dati…</p>
    </header>
    <div class="readouts"></div>
    <p class="note" aria-live="polite"></p>
    <canvas class="chart" aria-label="Grafico delle ultime 2 ore"></canvas>
  `;

  const readouts = root.querySelector('.readouts');
  const values = {};
  const roleText = { pitch: 'altezza', volume: 'volume', timbre: 'timbro' };
  for (const p of source.params) {
    const el = document.createElement('div');
    el.className = 'readout';
    el.innerHTML = `
      <span class="label">${p.label}</span>
      <span class="value">–</span>
      <span class="unit">${p.unit}${p.role ? ` · ${roleText[p.role]}` : ''}</span>
    `;
    readouts.append(el);
    values[p.key] = el.querySelector('.value');
  }

  return {
    root,
    values,
    status: root.querySelector('.status'),
    note: root.querySelector('.note'),
    chart: new StackedChart(root.querySelector('.chart'), source.params, source),
    lastSample: null,
  };
}

async function poll(source, panel) {
  try {
    const samples = await source.fetch();
    const recent = samples.filter((s) => s.t >= samples.at(-1).t - source.historyMs);
    if (!recent.length) throw new Error('nessun dato attivo');

    // Latest sample per parameter (a field can be null in the newest record).
    const latest = {};
    for (const p of source.params) {
      const s = [...recent].reverse().find((r) => r[p.key] != null);
      latest[p.key] = s ? s[p.key] : null;
    }

    for (const p of source.params) {
      const v = latest[p.key];
      panel.values[p.key].textContent = v == null
        ? '–'
        : v.toLocaleString('it-IT', { maximumFractionDigits: p.digits, minimumFractionDigits: p.digits });
    }

    const controls = {};
    for (const p of source.params) {
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
  updateStatus(panel);
  setTimeout(() => poll(source, panel), source.pollMs);
}

function updateStatus(panel) {
  const s = panel.lastSample;
  let text = '';
  if (s) {
    const time = s.t.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const ageMin = Math.max(0, Math.round((Date.now() - s.t) / 60000));
    text = `Dato delle ${time} (${ageMin} min fa)${s.spacecraft ? ` · satellite ${s.spacecraft}` : ''}`;
  }
  if (panel.error) text = `Errore nel caricamento, riprovo tra un minuto. ${text}`;
  panel.status.textContent = text || 'Caricamento dati…';
  panel.status.classList.toggle('error', Boolean(panel.error));
}
