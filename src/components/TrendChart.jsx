import { useRef, useEffect } from 'react';
import * as echarts from 'echarts';

export default function TrendChart({ trendData, keyword, allKeywords, onKeywordChange }) {
  const chartRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current);
    }

    const chart = instanceRef.current;

    const dates = trendData.map((d) => d.date);
    const naturalRanks = trendData.map((d) => d.自然排名);
    const spRanks = trendData.map((d) => d.SP排名);

    const allRanks = [...naturalRanks, ...spRanks].filter((r) => r && r > 0);
    const maxRank = allRanks.length > 0 ? Math.max(...allRanks) + 10 : 100;

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#e5e7eb',
        textStyle: { color: '#1f2937', fontSize: 12 },
        extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,.08); border-radius: 8px;',
        formatter: function (params) {
          let html = `<strong>${params[0].axisValue}</strong><br/>`;
          params.forEach((p) => {
            if (p.seriesName === '首页边界') return;
            html += `${p.marker} ${p.seriesName}: ${p.value || '-'}<br/>`;
          });
          return html;
        },
      },
      legend: {
        data: ['自然排名', 'SP排名', '首页边界 (Y=48)'],
        bottom: 0,
        textStyle: { color: '#6b7280', fontSize: 11 },
      },
      grid: { left: 50, right: 30, top: 20, bottom: 35 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { color: '#9ca3af', fontSize: 10, formatter: (v) => v.slice(5) },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        inverse: true,
        min: 1,
        max: maxRank,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#9ca3af', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
      },
      series: [
        {
          name: '自然排名',
          type: 'line',
          data: naturalRanks,
          smooth: true,
          symbol: 'circle', symbolSize: 5,
          lineStyle: { color: '#4f6ef7', width: 2.5 },
          itemStyle: { color: '#4f6ef7' },
          connectNulls: false,
        },
        {
          name: 'SP排名',
          type: 'line',
          data: spRanks,
          smooth: true,
          symbol: 'diamond', symbolSize: 5,
          lineStyle: { color: '#f59e0b', width: 2.5, type: 'dashed' },
          itemStyle: { color: '#f59e0b' },
          connectNulls: false,
        },
        {
          name: '首页边界 (Y=48)',
          type: 'line',
          data: dates.map(() => 48),
          symbol: 'none',
          lineStyle: { color: '#d1d5db', width: 1.5, type: 'dotted' },
          itemStyle: { color: '#d1d5db' },
        },
      ],
    };

    chart.setOption(option, true);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [trendData]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="section-title" style={{ marginBottom: 0 }}>
          30天排名趋势 — {keyword}
        </span>
        <div className="filter-group">
          <select
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            style={{ minWidth: 200 }}
          >
            {allKeywords.map((kw) => (
              <option key={kw} value={kw}>{kw}</option>
            ))}
          </select>
        </div>
      </div>
      <div ref={chartRef} style={{ width: '100%', height: 350 }} />
    </div>
  );
}
