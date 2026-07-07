import { useState, useRef, useEffect } from 'react';
import * as echarts from 'echarts';
import { getAbaGroup, NOT_FOUND_RANK } from '../data/processor';
import { loadAbaThresholds } from '../utils/storage';

function formatRank(val) {
  if (val == null || val === '' || val >= NOT_FOUND_RANK) return '-';
  return val;
}

// 迷你7天折线图
function MiniLine({ keyword, enriched, effectiveDate, field }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);

    // 取 effectiveDate 往前7天的数据
    const end = new Date(effectiveDate);
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const records = enriched.filter(r => r.keyword === keyword);
    const values = dates.map(date => {
      const r = records.find(r => r.date === date);
      if (!r) return null;
      const v = r[field];
      return (v && v < NOT_FOUND_RANK) ? v : null;
    });

    const validValues = values.filter(v => v !== null);
    if (validValues.length === 0) {
      chart.dispose();
      return;
    }

    const isUp = validValues.length >= 2 && validValues[validValues.length - 1] <= validValues[0];

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#e5e7eb',
        textStyle: { color: '#1d1d1f', fontSize: 11 },
        extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,.08); border-radius: 8px;',
        formatter: (params) => {
          const p = params[0];
          if (p.value == null) return `${p.axisValue}<br/>无数据`;
          return `${p.axisValue}<br/>排名: ${p.value}`;
        },
      },
      grid: { left: 4, right: 4, top: 8, bottom: 6 },
      xAxis: { type: 'category', data: dates.map(d => d.slice(5)), show: false },
      yAxis: {
        type: 'value', inverse: true, show: false,
        min: Math.min(...validValues) - 5,
        max: Math.max(...validValues) + 5,
      },
      series: [{
        type: 'line', data: values, smooth: true, symbol: 'none',
        lineStyle: { color: isUp ? '#30b158' : '#ff3b30', width: 1.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: isUp ? 'rgba(48,177,88,0.12)' : 'rgba(255,59,48,0.1)' },
            { offset: 1, color: 'rgba(255,255,255,0)' },
          ]),
        },
      }],
    }, true);

    return () => chart.dispose();
  }, [keyword, enriched, effectiveDate, field]);

  return <div ref={ref} style={{ width: 72, height: 32 }} />;
}

export default function RankingTabs({
  naturalUpList, naturalDownList, spUpList, spDownList,
  onKeywordClick, activeKeyword, enriched, effectiveDate,
}) {
  const [tab, setTab] = useState('natural');
  const [abaFilter, setAbaFilter] = useState('all');
  const thresholds = loadAbaThresholds();

  const filterByAba = (list) => {
    if (abaFilter === 'all') return list;
    return list.filter(d => getAbaGroup(d['ABA周排名'], thresholds) === abaFilter);
  };

  const renderList = (list, isUp) => {
    const changeField = tab === 'natural' ? '日环比变化_自然' : '日环比变化_SP';
    const rankField = tab === 'natural' ? '绝对位置' : '绝对位置(含ad)';

    const filtered = filterByAba(list);
    if (filtered.length === 0) {
      return <div className="empty-state" style={{ padding: 24 }}>暂无数据</div>;
    }

    return (
      <div>
        {/* 字段标签 — 与数据行严格对齐 */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '4px 12px 6px',
          fontSize: 10, color: 'var(--text-muted)', fontWeight: 600,
          letterSpacing: '.3px', borderBottom: '1px dashed var(--border)',
        }}>
          <span style={{ width: 24, flexShrink: 0 }}></span>
          <span style={{ flex: '1 1 0', minWidth: 0, marginRight: 8 }}>关键词</span>
          <span style={{ width: 66, flexShrink: 0, textAlign: 'left', paddingLeft: 4 }}>ABA排名</span>
          <span style={{ width: 40, flexShrink: 0, textAlign: 'left' }}>昨日</span>
          <span style={{ width: 84, flexShrink: 0, textAlign: 'left', paddingLeft: 6 }}>7日趋势</span>
          <span style={{ width: 60, flexShrink: 0, textAlign: 'right' }}>今日/幅度</span>
        </div>
        {filtered.map((item, i) => {
          const change = item[changeField] || 0;
          const todayRank = item[rankField];
          const yesterdayRank = (todayRank < NOT_FOUND_RANK && change !== null)
            ? todayRank + change : null;
          const isActive = item.keyword === activeKeyword;

          return (
            <div key={item.keyword}
              className={`ranking-item${isActive ? ' active' : ''}`}
              onClick={() => onKeywordClick(item.keyword)}
              style={{ padding: '8px 12px' }}
            >
              <span className="ranking-rank" style={{ flexShrink: 0 }}>{i + 1}</span>

              <div style={{ flex: '1 1 0', minWidth: 0, marginRight: 8 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: isActive ? 'var(--blue)' : 'var(--text)',
                }} title={item.keyword}>{item.keyword}</div>
              </div>

              <div style={{ flexShrink: 0, width: 66, textAlign: 'left', paddingLeft: 4 }}>
                <span className={`tag tag-${getAbaGroup(item['ABA周排名'], thresholds) === '大词' ? 'big' : getAbaGroup(item['ABA周排名'], thresholds) === '中词' ? 'medium' : 'small'}`}
                  style={{ fontSize: 11 }}>
                  {(item['ABA周排名'] / 10000).toFixed(1)}万
                </span>
              </div>

              <div style={{ flexShrink: 0, width: 40, textAlign: 'left', fontSize: 12, color: 'var(--text-muted)' }}>
                {formatRank(yesterdayRank)}
              </div>

              {/* 迷你7天折线图 */}
              <div style={{ flexShrink: 0, margin: '0 6px' }}>
                <MiniLine keyword={item.keyword} enriched={enriched} effectiveDate={effectiveDate}
                  field={tab === 'natural' ? '绝对位置' : '绝对位置(含ad)'} />
              </div>

              <div style={{ flexShrink: 0, width: 60, textAlign: 'right' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  {formatRank(todayRank)}
                </span>
                <span className={`change-badge ${change > 0 ? 'up' : change < 0 ? 'down' : ''}`}
                  style={{ display: 'block', fontSize: 11, marginTop: 1 }}>
                  {change > 0 ? '▲' : change < 0 ? '▼' : '━'} {Math.abs(change)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
          <button className={`tab ${tab === 'natural' ? 'active' : ''}`} onClick={() => setTab('natural')}>
            自然排名榜
          </button>
          <button className={`tab ${tab === 'sp' ? 'active' : ''}`} onClick={() => setTab('sp')}>
            SP排名榜
          </button>
        </div>
        <div className="filter-group">
          <select value={abaFilter} onChange={e => setAbaFilter(e.target.value)}>
            <option value="all">全部词</option>
            <option value="大词">大词</option>
            <option value="中词">中词</option>
            <option value="小词">小词</option>
          </select>
        </div>
      </div>


      <div className="ranking-grid">
        <div>
          <div className="sub-section-title" style={{ color: 'var(--green)' }}>
            {tab === 'natural' ? '上升榜 Top 10' : 'SP上升榜 Top 10'}
          </div>
          {renderList(tab === 'natural' ? naturalUpList : spUpList, true)}
        </div>
        <div>
          <div className="sub-section-title" style={{ color: 'var(--red)' }}>
            {tab === 'natural' ? '下降榜 Top 10' : 'SP下降榜 Top 10'}
          </div>
          {renderList(tab === 'natural' ? naturalDownList : spDownList, false)}
        </div>
      </div>
    </div>
  );
}
