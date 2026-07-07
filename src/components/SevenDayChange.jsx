import { useState, useRef, useEffect } from 'react';
import * as echarts from 'echarts';
import { loadAbaThresholds } from '../utils/storage';
import { getAbaGroup } from '../data/processor';

function MiniTrendChart({ data }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const dates = data.map((d) => d.date.slice(5));
    const ranks = data.map((d) => d.rank);
    const isUp = data[data.length - 1].rank <= data[0].rank;

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#e5e7eb',
        textStyle: { color: '#1f2937', fontSize: 11 },
        formatter: (params) => {
          const p = params[0];
          return `${p.axisValue}<br/>排名: ${p.value}`;
        },
      },
      grid: { left: 30, right: 4, top: 4, bottom: 12 },
      xAxis: { type: 'category', data: dates, show: false },
      yAxis: { type: 'value', inverse: true, show: false, min: Math.min(...ranks) - 2, max: Math.max(...ranks) + 2 },
      series: [{
        type: 'line', data: ranks, smooth: true, symbol: 'none',
        lineStyle: { color: isUp ? '#10b981' : '#ef4444', width: 1.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: isUp ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)' },
            { offset: 1, color: 'rgba(255,255,255,0)' },
          ]),
        },
      }],
    }, true);
    return () => chart.dispose();
  }, [data]);

  return <div ref={ref} className="mini-trend" style={{ width: 100, height: 36 }} />;
}

export default function SevenDayChange({ sevenDayData, onKeywordClick, activeKeyword }) {
  const [tab, setTab] = useState('自然');
  const [abaFilter, setAbaFilter] = useState('all');
  const thresholds = loadAbaThresholds();

  const filtered = sevenDayData.filter((d) => {
    if (d.type !== tab) return false;
    if (abaFilter !== 'all') return getAbaGroup(d.abaRank, thresholds) === abaFilter;
    return true;
  });

  // 按变化幅度排序（上升在前，下降在后）
  const sorted = [...filtered].sort((a, b) => {
    // 上升优先
    if (a.direction !== b.direction) return a.direction === '上升' ? -1 : 1;
    // 同方向按变化幅度排序
    return b.totalChange - a.totalChange;
  });

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
          <button className={`tab ${tab === '自然' ? 'active' : ''}`} onClick={() => setTab('自然')}>
            连续7天变化 — 自然排名
          </button>
          <button className={`tab ${tab === 'SP' ? 'active' : ''}`} onClick={() => setTab('SP')}>
            SP排名
          </button>
        </div>
        <div className="filter-group">
          <select value={abaFilter} onChange={(e) => setAbaFilter(e.target.value)}>
            <option value="all">全部词</option>
            <option value="大词">大词</option>
            <option value="中词">中词</option>
            <option value="小词">小词</option>
          </select>
        </div>
      </div>

      <div className="detail-table-wrap">
        <table className="detail-table">
          <thead>
            <tr>
              <th>#</th>
              <th>关键词</th>
              <th>方向</th>
              <th>7天前排名</th>
              <th>今日排名</th>
              <th>总变化</th>
              <th>7日趋势</th>
              <th>ABA排名</th>
              <th>月搜索量</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={9} className="empty-state">暂无连续7天变化数据</td></tr>
            ) : (
              sorted.map((d, i) => (
                <tr key={`${d.keyword}-${d.type}`}
                  onClick={() => onKeywordClick(d.keyword)}
                  style={{ cursor: 'pointer' }}
                  className={d.keyword === activeKeyword ? 'active' : ''}
                >
                  <td>{i + 1}</td>
                  <td style={{ color: d.keyword === activeKeyword ? 'var(--blue)' : 'inherit', fontWeight: 600 }}>
                    {d.keyword}
                  </td>
                  <td>
                    <span className={`change-badge ${d.direction === '上升' ? 'up' : 'down'}`}
                      style={{ fontSize: 12 }}>
                      {d.direction === '上升' ? '▲ 上升' : '▼ 下降'}
                    </span>
                  </td>
                  <td>{d.sevenDaysAgoRank}</td>
                  <td>{d.todayRank}</td>
                  <td>
                    <span className={`change-badge ${d.direction === '上升' ? 'up' : 'down'}`}>
                      {d.direction === '上升' ? '+' : ''}{d.totalChange}
                    </span>
                  </td>
                  <td><MiniTrendChart data={d.miniTrend} /></td>
                  <td>
                    <span className={`tag tag-${getAbaGroup(d.abaRank, thresholds) === '大词' ? 'big' : getAbaGroup(d.abaRank, thresholds) === '中词' ? 'medium' : 'small'}`}>
                      {d.abaRank?.toLocaleString()}
                    </span>
                  </td>
                  <td>{d.monthlySearchVolume?.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
