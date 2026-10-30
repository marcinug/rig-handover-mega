import { describe, expect, it } from 'vitest';
import { countStatuses } from '../src/digest/count.js';

const line = (status: string) => JSON.stringify({ at: '2026-10-28T01:00:00+01:00', job: 'j', status, owner: null });

describe('countStatuses', () => {
  it('counts lines by status and counts bad lines', () => {
    const text = [line('ok'), line('ok'), line('retry'), line('fail'), 'not json', line('weird'), ''].join('\n');
    expect(countStatuses(text)).toEqual({ ok: 2, retry: 1, fail: 1, badLines: 2 });
  });
  it('gives zeros for an empty file', () => {
    expect(countStatuses('')).toEqual({ ok: 0, retry: 0, fail: 0, badLines: 0 });
  });
});
