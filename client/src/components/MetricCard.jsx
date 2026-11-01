export default function MetricCard({ label, value, hint }) {
  return <div className="metric-card"><span>{label}</span><strong>{value ?? '—'}</strong>{hint && <small>{hint}</small>}</div>;
}
