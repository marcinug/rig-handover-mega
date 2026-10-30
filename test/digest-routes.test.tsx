import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';

// Synthetic runs dir. runs/ is never touched.
const NORMAL = '2026-10-30';
const EMPTY = '2026-10-31';
const BAD = '2026-11-01';
const MISSING = '2026-11-02';

const normalLines = [
  { at: '2026-10-30T05:00:01+01:00', job: 'notes/backup', status: 'fail', owner: 'lane-07', error: 'quota exceeded' },
  { at: '2026-10-30T01:00:00+01:00', job: 'lane/sync', status: 'retry', owner: 'rook' },
  { at: '2026-10-30T01:01:00+01:00', job: 'lane/sync', status: 'retry', owner: 'rook' },
  { at: '2026-10-30T01:02:00+01:00', job: 'lane/sync', status: 'retry', owner: 'rook' },
  { at: '2026-10-30T01:03:00+01:00', job: 'lane/sync', status: 'ok', owner: 'rook' },
  { at: '2026-10-30T23:00:02+01:00', job: 'digest/render', status: 'ok', owner: null },
  { at: '2026-10-30T02:00:00+01:00', job: 'fixtures/refresh', status: 'ok', owner: 'rook' },
];

const badLines = [
  '{"at":"2026-11-01T02:00:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
  'this is not json',
  '{"at":"2026-11-01T03:00:00+01:00","job":"lane/sync","status":"fail","owner":"rook","error":"timeout"}',
];

let dir: string;
let config: { adapter: string; installed: string; beatEverySeconds: number; runsDir: string };

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(join(dir, `${NORMAL}.jsonl`), normalLines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  writeFileSync(join(dir, `${EMPTY}.jsonl`), '');
  writeFileSync(join(dir, `${BAD}.jsonl`), badLines.join('\n') + '\n');
  config = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  };
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// The <tr> chunk that holds a given job name in the HTML.
function rowFor(html: string, job: string): string {
  const chunk = html.split('<tr').find((part) => part.includes(job));
  if (chunk === undefined) throw new Error(`no row for ${job}`);
  return chunk;
}

describe('GET /digest/:night (HTML)', () => {
  it('renders 200 with a table for a night with a file', async () => {
    const res = await createApp(config).request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<table');
    for (const job of ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup']) {
      expect(html).toContain(job);
    }
  });

  it('lists jobs sorted by name', async () => {
    const html = await (await createApp(config).request(`/digest/${NORMAL}`)).text();
    const positions = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup'].map((j) =>
      html.indexOf(j),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('marks rows with 3 or more retries and any fail with class warn', async () => {
    const html = await (await createApp(config).request(`/digest/${NORMAL}`)).text();
    expect(html).toContain('warn');
    expect(rowFor(html, 'lane/sync')).toContain('warn');
    expect(rowFor(html, 'notes/backup')).toContain('warn');
    expect(rowFor(html, 'fixtures/refresh')).not.toContain('warn');
    expect(rowFor(html, 'digest/render')).not.toContain('warn');
  });

  it('shows a null owner as an em dash', async () => {
    const html = await (await createApp(config).request(`/digest/${NORMAL}`)).text();
    expect(html).toContain('—');
    expect(rowFor(html, 'digest/render')).toContain('—');
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for an empty file', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('still renders 200 with the good rows when a line is bad', async () => {
    const res = await createApp(config).request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('fixtures/refresh');
    expect(html).toContain('lane/sync');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('returns the Night object exactly as readNight returns it', async () => {
    const res = await createApp(config).request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(readNight(dir, NORMAL));
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('gives rows [] and badLines 0 for an empty night', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('counts a bad line as 1 and keeps the other rows', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['fixtures/refresh', 'lane/sync']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const app = createApp(config);
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const body = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as {
      rows: { job: string }[];
    };
    const jobs = body.rows.map((r) => r.job);
    expect(jobs.length).toBeGreaterThan(0);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
