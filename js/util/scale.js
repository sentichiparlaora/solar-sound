// Small numeric helpers shared by sources, audio and UI.

export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/**
 * Normalize a raw value to 0..1 according to a parameter definition
 * ({ min, max, log }). Values outside the range are clamped.
 */
export function normalize(value, { min, max, log = false }) {
  if (value == null || !Number.isFinite(value)) return null;
  if (log) {
    const v = Math.max(value, min);
    return clamp((Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min)));
  }
  return clamp((value - min) / (max - min));
}

/** Map 0..1 to a frequency on a logarithmic (musical) scale. */
export const toFrequency = (n, lowHz, highHz) => lowHz * Math.pow(highHz / lowHz, n);

const NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

/** Nearest note name for a frequency, e.g. "La3". */
export function noteName(freq) {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}
