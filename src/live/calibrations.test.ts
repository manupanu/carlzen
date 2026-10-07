import { beforeEach, describe, expect, it } from 'vitest';
import { closestCalibration, loadCalibrations, remember } from './calibrations';
import { CALIBRATION_VERSION, type Calibration, type RGB } from './recognizer';

const cal = (light: RGB, dark: RGB): Calibration => ({
  version: CALIBRATION_VERSION,
  flipped: false,
  light,
  dark,
  templates: {},
  unknownThreshold: 10,
  colourPenalty: 15,
});

beforeEach(() => {
  const data = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
});

const green = cal([235, 236, 208], [119, 149, 86]);
const brown = cal([240, 217, 181], [181, 136, 99]);
const blue = cal([222, 227, 230], [140, 162, 173]);

describe('calibration library', () => {
  it('keeps one calibration per board style and picks the right one', () => {
    let list = remember([], green);
    list = remember(list, brown);
    list = remember(list, blue);
    expect(closestCalibration(list, [236, 236, 209], [120, 148, 87])).toBe(green);
    expect(closestCalibration(list, [239, 218, 180], [180, 137, 100])).toBe(brown);
    expect(closestCalibration(list, [222, 226, 231], [141, 160, 172])).toBe(blue);
  });

  it('returns nothing for a style it has not seen', () => {
    const list = remember([], green);
    expect(closestCalibration(list, [200, 120, 120], [90, 40, 40])).toBeNull();
  });

  it('replaces a calibration of the same style instead of piling up', () => {
    let list = remember([], green);
    const newer = cal([236, 236, 208], [119, 150, 86]);
    list = remember(list, newer);
    expect(list).toHaveLength(1);
    expect(list[0]).toBe(newer);
  });

  it('survives a reload and ignores calibrations of an older format', () => {
    remember([], green);
    localStorage.setItem('coachmag.calibration', JSON.stringify({ ...brown, version: 1 }));
    const loaded = loadCalibrations();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].light).toEqual(green.light);
  });
});
