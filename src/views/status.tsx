import type { StatusCounts } from '../digest/count.js';
import type { Status } from '../status.js';

function Counts({ counts }: { counts: StatusCounts | null }) {
  if (counts === null) return <span>—</span>;
  return (
    <span>
      {counts.ok} ok · {counts.retry} retry · {counts.fail} fail
      {counts.badLines > 0 && (
        <>
          {' · '}
          <span class="warn">{counts.badLines} bad {counts.badLines === 1 ? 'line' : 'lines'}</span>
        </>
      )}
    </span>
  );
}

export function StatusBoard({ status }: { status: Status }) {
  return (
    <>
      <h1>status</h1>
      <table>
        <tbody>
          <tr><th>adapter</th><td>{status.adapter}</td></tr>
          <tr><th>installed</th><td>{status.installed}</td></tr>
          <tr>
            <th>last beat</th>
            <td>{status.lastBeat ? `${status.lastBeat.at} · pid ${status.lastBeat.pid}` : <span class="warn">none</span>}</td>
          </tr>
        </tbody>
      </table>
      <h2>nights on disk</h2>
      {status.nights.length === 0 ? (
        <p class="mute">nothing in runs/</p>
      ) : (
        <ul>
          {status.nights.map((n) => (
            <li>
              <a href={`/digest/${n}`}>{n}</a> · <Counts counts={status.counts[n] ?? null} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
