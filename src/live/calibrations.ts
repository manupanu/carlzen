import { CALIBRATION_VERSION, type Calibration, type RGB } from './recognizer';

const KEY = 'coachmag.calibrations';
const LEGACY_KEY = 'coachmag.calibration';
const MAX_KEPT = 6;
/** Summed |difference| of the light and dark colour below which two calibrations are the same board style. */
const SAME_STYLE = 60;

const dist = (a: RGB, b: RGB) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const styleDistance = (cal: Calibration, light: RGB, dark: RGB) =>
  dist(cal.light, light) + dist(cal.dark, dark);

export function loadCalibrations(): Calibration[] {
  const out: Calibration[] = [];
  for (const key of [KEY, LEGACY_KEY]) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? 'null');
      for (const cal of Array.isArray(parsed) ? parsed : [parsed]) {
        if (cal?.version === CALIBRATION_VERSION) out.push(cal);
      }
    } catch {
      /* storage unavailable or corrupt */
    }
  }
  return out.slice(0, MAX_KEPT);
}

/** Adds a calibration, replacing one for the same board colours. Most recent first. */
export function remember(list: Calibration[], cal: Calibration): Calibration[] {
  const kept = list.filter((c) => styleDistance(c, cal.light, cal.dark) >= SAME_STYLE);
  const next = [cal, ...kept].slice(0, MAX_KEPT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}

/** The calibration made for board colours like these, if there is one. */
export function closestCalibration(list: Calibration[], light: RGB, dark: RGB): Calibration | null {
  let best: Calibration | null = null;
  let bestD = SAME_STYLE;
  for (const cal of list) {
    const d = styleDistance(cal, light, dark);
    if (d < bestD) {
      bestD = d;
      best = cal;
    }
  }
  return best;
}
