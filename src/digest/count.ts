import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';

export type StatusCounts = { ok: number; retry: number; fail: number; badLines: number };

// Line counts by status for the text of one night's log. Lines that don't parse are counted, not thrown.
export function countStatuses(text: string): StatusCounts {
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0, badLines: 0 };
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const run = parseLine(line);
    if (run === null) counts.badLines++;
    else counts[run.status]++;
  }
  return counts;
}

// Same, from runs/<night>.jsonl. null when the file can't be read.
export function countNight(runsDir: string, night: string): StatusCounts | null {
  try {
    return countStatuses(readFileSync(join(runsDir, `${night}.jsonl`), 'utf8'));
  } catch {
    return null;
  }
}
