import { describe, it, expect, afterEach } from 'vitest';
import { setVerboseLogging, isVerboseLogging } from '$lib/game/core/util/logSink';

describe('verbose logging flag', () => {
  afterEach(() => setVerboseLogging(false));

  it('setVerboseLogging(true) turns the flag on', () => {
    expect(isVerboseLogging()).toBe(false);
    setVerboseLogging(true);
    expect(isVerboseLogging()).toBe(true);
  });

  it('setVerboseLogging(false) turns the flag back off', () => {
    setVerboseLogging(true);
    expect(isVerboseLogging()).toBe(true);
    setVerboseLogging(false);
    expect(isVerboseLogging()).toBe(false);
  });
});
