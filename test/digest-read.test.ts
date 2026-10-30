import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('gives 5 jobs, sorted, and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('builds each row from its lines, offsets kept', () => {
    expect(night?.rows).toEqual([
      { job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00' },
      { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00' },
      { job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' },
      { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded',
        firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00' },
      { job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00' },
    ]);
  });
});

describe('readNight on synthetic nights', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (night: string, text: string) => writeFileSync(join(dir, `${night}.jsonl`), text);

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('gives no rows and no bad lines for an empty file', () => {
    write('2026-01-02', '');
    expect(readNight(dir, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('keeps a row whose owner is null', () => {
    write('2026-01-03', '{"at":"2026-01-03T01:00:00-05:00","job":"a","status":"ok","owner":null}\n');
    const n = readNight(dir, '2026-01-03');
    expect(n?.badLines).toBe(0);
    expect(n?.rows).toHaveLength(1);
    expect(n?.rows[0]?.owner).toBeNull();
    expect(n?.rows[0]?.firstAt).toBe('2026-01-03T01:00:00-05:00');
  });

  it('takes owner and error from the last line of a job', () => {
    write(
      '2026-01-04',
      [
        '{"at":"2026-01-04T01:00:00+02:00","job":"j","status":"retry","owner":"x","error":"boom"}',
        '{"at":"2026-01-04T02:00:00+02:00","job":"j","status":"fail","owner":null,"error":"dead"}',
        '',
      ].join('\n'),
    );
    const row = readNight(dir, '2026-01-04')?.rows[0];
    expect(row).toMatchObject({ owner: null, runs: 2, retries: 1, lastStatus: 'fail', lastError: 'dead' });
  });

  it('counts lines with bad JSON or bad fields, ignores blank lines', () => {
    write(
      '2026-01-05',
      [
        'not json',
        '{"at":"t","job":"j","status":"weird","owner":"x"}',
        '{"at":"t","job":"j","status":"ok"}',
        '{"job":"j","status":"ok","owner":"x"}',
        '[1,2]',
        '',
        '   ',
        '{"at":"t","job":"j","status":"ok","owner":"x"}',
        '',
      ].join('\n'),
    );
    const n = readNight(dir, '2026-01-05');
    expect(n?.badLines).toBe(5);
    expect(n?.rows).toHaveLength(1);
  });

  it('returns null for an invalid night string', () => {
    write('2026-01-06', '');
    for (const bad of ['../2026-01-06', '2026-1-6', '2026-01-06/../x', '2026-13-01', 'latest', '']) {
      expect(readNight(dir, bad)).toBeNull();
    }
  });
});
