import { describe, it, expect } from 'vitest';
import { limbLabel, partLabel } from '$lib/components/util/bodyLabels';

describe('bodyLabels.limbLabel', () => {
  it('maps a known limb id to its short abbreviation', () => {
    expect(limbLabel('left_arm')).toBe('L.Arm');
    expect(limbLabel('right_arm')).toBe('R.Arm');
    expect(limbLabel('left_leg')).toBe('L.Leg');
    expect(limbLabel('right_leg')).toBe('R.Leg');
    expect(limbLabel('head')).toBe('Head');
    expect(limbLabel('torso')).toBe('Torso');
  });

  it('humanizes an id with no abbreviation entry instead of returning the raw id', () => {
    expect(limbLabel('left_wing')).toBe('Left Wing');
  });
});

describe('bodyLabels.partLabel', () => {
  it('title-cases an underscore-separated id', () => {
    expect(partLabel('left_forearm')).toBe('Left Forearm');
  });

  it('splits a camelCase id into separate title-case words', () => {
    expect(partLabel('leftForearm')).toBe('Left Forearm');
  });

  it('never returns the raw lowercase id', () => {
    expect(partLabel('chest')).toBe('Chest');
  });
});
