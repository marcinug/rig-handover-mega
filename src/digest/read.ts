import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

// YYYY-MM-DD and a real calendar day. Checked before any path is built.
function isNight(night: string): boolean {
  if (!NIGHT.test(night)) return false;
  const d = new Date(`${night}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === night;
}

function isStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

// One line of the log, or null when it doesn't parse or a field is missing or wrong.
export function parseLine(line: string): RunLine | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const { at, job, status, owner, error } = o;
  if (typeof at !== 'string' || at === '') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (!('owner' in o) || (owner !== null && typeof owner !== 'string')) return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const parsed: RunLine = { at, job, status, owner };
  if (error !== undefined) parsed.error = error;
  return parsed;
}

function readLog(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;
  const text = readLog(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const run = parseLine(line);
    if (run === null) {
      badLines++;
      continue;
    }
    const row = byJob.get(run.job);
    if (row === undefined) {
      byJob.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error ?? null,
        firstAt: run.at,
        lastAt: run.at,
      });
    } else {
      row.owner = run.owner;
      row.runs++;
      if (run.status === 'retry') row.retries++;
      row.lastStatus = run.status;
      row.lastError = run.error ?? null;
      row.lastAt = run.at;
    }
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines };
};
