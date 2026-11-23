import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useStore } from '../stores/useStore';
import './CheckInSummary.css';

type Summary = {
  total: number; onTime: number; late: number; onTimeRate: number | null;
  weeks: { weekStart: string; from: string; to: string; total: number; onTime: number; late: number }[];
};
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function CheckInSummary() {
  const token = useStore(s => s.token);
  const history = useStore(s => s.history);
  const [range, setRange] = useState(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 27);
    return { from: dateKey(start), to: dateKey(end) };
  });
  const [applied, setApplied] = useState(range);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSummary(null);
    setError('');
    if (!token) { setLoading(false); return; }
    api.get<Summary>(`/api/checkins/me/summary?from=${applied.from}&to=${applied.to}`, token)
      .then(data => { if (active) setSummary(data); })
      .catch(() => { if (active) setError('Could not load your summary. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, applied, attempt, history]);
  const max = Math.max(1, ...summary?.weeks.map(w => w.total) ?? []);
  return <section className="checkin-summary" aria-labelledby="summary-title" aria-busy={loading}>
    <h2 id="summary-title">Check-in summary</h2>
    <form onSubmit={event => {
      event.preventDefault();
      const days = (Date.parse(range.to) - Date.parse(range.from)) / 86400000;
      if (!Number.isFinite(days) || days < 0 || days > 365) {
        setError('Choose a valid range of at most 366 days.');
        return;
      }
      setApplied({ ...range });
    }}>
      <label>From<input type="date" required value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></label>
      <label>To<input type="date" required value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></label>
      <button type="submit">Apply</button>
    </form>
    <p>Sleep dates, including both endpoints. Weeks run Monday–Sunday; edge weeks include only selected dates.</p>
    {error && <p role="alert">{error} <button type="button" onClick={() => setAttempt(a => a + 1)}>Retry</button></p>}
    {loading && <p role="status">Loading summary…</p>}
    {!loading && summary && <>
      <p>Showing {applied.from} to {applied.to}</p>
      <dl>{[
        ['Valid check-ins', summary.total], ['On-time', summary.onTime], ['Late', summary.late],
        ['On-time rate', summary.onTimeRate === null ? '—' : `${summary.onTimeRate.toFixed(1)}%`],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {summary.total === 0 && <p>No valid check-ins in this range.</p>}
      <h3>Weekly check-ins</h3>
      <div className="summary-table-wrap"><table>
        <caption className="sr-only">Weekly on-time and late check-in counts</caption>
        <thead><tr><th scope="col">Dates</th><th scope="col">Trend</th><th scope="col">On-time</th><th scope="col">Late</th><th scope="col">Total</th></tr></thead>
        <tbody>{summary.weeks.map(w => <tr key={w.weekStart}>
          <th scope="row">{w.from} – {w.to}</th>
          <td><div className="summary-bar" aria-hidden="true"><span style={{ width: `${100 * w.onTime / max}%` }} /><span style={{ width: `${100 * w.late / max}%` }} /></div></td>
          <td>{w.onTime}</td><td>{w.late}</td><td>{w.total}</td>
        </tr>)}</tbody>
      </table></div>
    </>}
    <p>On-time rate = on-time ÷ valid check-ins. Only recorded on-time and late entries count. Missing nights are excluded. No check-ins means no rate.</p>
    <p>After-midnight check-ins belong to the previous sleep date. Historical statuses stay as originally recorded.</p>
  </section>;
}
