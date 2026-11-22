// Minimal multi-panel time-series chart on <canvas>, no libraries.
// One stacked panel per parameter, all sharing the same time axis.

const GAP_MS = 3 * 60 * 1000; // break the line across data gaps

export class StackedChart {
  constructor(canvas, params, { historyMs, chartBands = null }) {
    this.canvas = canvas;
    this.params = params.filter((p) => p.chart !== false);
    this.historyMs = historyMs;
    this.bands = chartBands;
    this.samples = [];
    new ResizeObserver(() => this.draw()).observe(canvas);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.draw());
  }

  setData(samples) {
    this.samples = samples;
    this.draw();
  }

  draw() {
    const { canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const css = getComputedStyle(canvas);
    const color = (name) => css.getPropertyValue(name).trim();
    const ink = color('--muted');
    const grid = color('--grid');
    const lines = [color('--accent'), color('--accent-2'), color('--accent-3')];

    const padL = 52, padR = 12, padT = 6, axisH = 22, gapY = 24;
    const n = this.params.length;
    const panelH = (h - padT - axisH - gapY * (n - 1)) / n;
    const plotW = w - padL - padR;

    const end = this.samples.length ? this.samples.at(-1).t.getTime() : Date.now();
    const start = end - this.historyMs;
    const x = (t) => padL + ((t - start) / this.historyMs) * plotW;

    g.font = '11px system-ui, sans-serif';
    g.textBaseline = 'middle';

    // Shaded spans (e.g. ISS in Earth's shadow), behind every panel.
    if (this.bands) {
      const { key, when } = this.bands;
      g.fillStyle = color('--band');
      let spanStart = null;
      const flush = (t) => {
        if (spanStart == null) return;
        const x0 = Math.max(padL, x(spanStart)), x1 = Math.min(w - padR, x(t));
        if (x1 > x0) g.fillRect(x0, padT, x1 - x0, h - padT - axisH);
        spanStart = null;
      };
      let prevT = null;
      for (const s of this.samples) {
        const t = s.t.getTime();
        if (t < start) continue;
        if (prevT != null && t - prevT > GAP_MS) flush(prevT);
        if (when(s[key])) { if (spanStart == null) spanStart = t; } else flush(t);
        prevT = t;
      }
      if (prevT != null) flush(prevT);
    }

    this.params.forEach((p, i) => {
      const top = padT + i * (panelH + gapY);
      const pts = this.samples.filter((s) => s[p.key] != null && s.t.getTime() >= start);
      const values = pts.map((s) => s[p.key]);

      const floor = p.log ? p.min / 10 : -Infinity; // log scale cannot show <= 0
      const tr = p.log ? (v) => Math.log10(Math.max(v, floor)) : (v) => v;
      let a = tr(values.length ? Math.min(...values) : p.min);
      let b = tr(values.length ? Math.max(...values) : p.max);
      if (b - a < 1e-9) {
        const d = p.log ? 0.05 : Math.max(Math.abs(a) * 0.02, 0.01);
        a -= d; b += d;
      }
      const pad = (b - a) * 0.12;
      a -= pad; b += pad;
      const y = (v) => top + panelH - ((tr(v) - a) / (b - a)) * panelH;

      // Frame + gridlines with labels
      g.strokeStyle = grid;
      g.lineWidth = 1;
      g.fillStyle = ink;
      g.textAlign = 'right';
      for (let k = 0; k <= 2; k++) {
        const yy = top + (k / 2) * panelH;
        g.beginPath(); g.moveTo(padL, yy + 0.5); g.lineTo(w - padR, yy + 0.5); g.stroke();
        const v = p.log ? Math.pow(10, b - (k / 2) * (b - a)) : b - (k / 2) * (b - a);
        g.fillText(formatTick(v), padL - 6, yy);
      }
      g.textAlign = 'left';
      g.fillText(`${p.label} (${p.unit})`, padL + 6, top + 9);

      // Line
      g.strokeStyle = lines[i % lines.length];
      g.lineWidth = 1.75;
      g.lineJoin = 'round';
      g.beginPath();
      let prev = null;
      for (const s of pts) {
        const t = s.t.getTime();
        const px = x(t), py = y(s[p.key]);
        if (prev == null || t - prev > GAP_MS) g.moveTo(px, py); else g.lineTo(px, py);
        prev = t;
      }
      g.stroke();

      // Last point marker
      if (pts.length) {
        const last = pts.at(-1);
        g.fillStyle = lines[i % lines.length];
        g.beginPath(); g.arc(x(last.t.getTime()), y(last[p.key]), 3, 0, Math.PI * 2); g.fill();
      }
    });

    // Time axis: a label every 30 minutes (local time)
    g.fillStyle = ink;
    g.textAlign = 'center';
    const step = 30 * 60 * 1000;
    const yAxis = h - axisH / 2;
    for (let t = Math.ceil(start / step) * step; t <= end; t += step) {
      const d = new Date(t);
      g.fillText(d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }), x(t), yAxis);
    }
  }
}

function formatTick(v) {
  const a = Math.abs(v);
  if (a >= 10000) return (v / 1000).toLocaleString('it-IT', { maximumFractionDigits: 0 }) + 'k';
  if (a >= 10) return v.toLocaleString('it-IT', { maximumFractionDigits: 0 });
  if (a >= 1) return v.toLocaleString('it-IT', { maximumFractionDigits: 1 });
  return v.toLocaleString('it-IT', { maximumFractionDigits: 2 });
}
