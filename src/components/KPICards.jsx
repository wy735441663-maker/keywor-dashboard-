function KpiItem({ label, value, yesterday, metric }) {
  const diff = yesterday != null ? value - yesterday : null;
  const pct = yesterday && yesterday > 0 ? ((diff / yesterday) * 100).toFixed(0) : null;

  return (
    <div style={{
      background: '#fff', borderRadius: 10, border: '1px solid var(--border)',
      padding: '20px 16px 18px', display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center', textAlign: 'center',
      gap: 8, boxShadow: 'var(--shadow)', flex: 1, minWidth: 0,
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{
        fontSize: 40, fontWeight: 700, letterSpacing: '-1px',
        lineHeight: 1, margin: '2px 0',
        ...(metric === 'up' ? { color: 'var(--green)' } : metric === 'down' ? { color: 'var(--red)' } : { color: 'var(--blue)' }),
      }}>
        {value}
      </span>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
        <div>昨日 {yesterday ?? '-'}</div>
        {diff != null && diff !== 0 && (
          <div style={{ color: diff > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
            {diff > 0 ? '▲' : '▼'} {Math.abs(diff)}
            {pct != null && <span style={{ marginLeft: 3 }}>{diff > 0 ? '+' : ''}{pct}%</span>}
          </div>
        )}
        {diff === 0 && <div style={{ color: 'var(--text-muted)' }}>持平</div>}
      </div>
    </div>
  );
}

export default function KPICards({ kpis, yesterdayKpis }) {
  const y = yesterdayKpis || {};

  return (
    <div style={{
      background: '#fff', borderRadius: 10, border: '1px solid var(--border)',
      padding: '20px 22px', boxShadow: 'var(--shadow)',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      height: '100%',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10,
      }}>
        <KpiItem label="自然上升词" value={kpis.naturalUp} yesterday={y.naturalUp} metric="up" />
        <KpiItem label="自然下降词" value={kpis.naturalDown} yesterday={y.naturalDown} metric="down" />
        <KpiItem label="SP上升词" value={kpis.spUp} yesterday={y.spUp} metric="up" />
        <KpiItem label="SP下降词" value={kpis.spDown} yesterday={y.spDown} metric="down" />
        <KpiItem label="自然首页词" value={kpis.naturalFirstPage} yesterday={y.naturalFirstPage} metric="neutral" />
      </div>
    </div>
  );
}
