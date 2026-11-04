import { describe, expect, it } from 'vitest';

import { BYTES_PER_MB, localToday, MS_PER_HOUR } from './index.js';

describe('units', () => {
  it('derives larger units from smaller ones', () => {
    expect(MS_PER_HOUR).toBe(3_600_000);
    expect(BYTES_PER_MB).toBe(1_048_576);
  });

  it("gives today's date in the device's time zone", () => {
    const now = new Date(2026, 10, 4, 23, 30);
    expect(localToday(now)).toBe('2026-11-04');
  });
});
