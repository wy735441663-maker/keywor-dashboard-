import { useState } from 'react';
import { loadAbaThresholds } from '../utils/storage';
import { getAbaGroup, NOT_FOUND_RANK } from '../data/processor';

function formatRank(val) {
  if (val == null || val === '' || val >= NOT_FOUND_RANK) return '-';
  return val;
}

function hasChange(val) {
  return val != null && val !== 0;
}

const PAGE_SIZE = 10;

export default function DetailTable({ snapshot, onKeywordClick, activeKeyword }) {
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [abaFilter, setAbaFilter] = useState('all');
  const [page, setPage] = useState(1);
  const thresholds = loadAbaThresholds();

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  let filtered = [...snapshot];
  if (abaFilter !== 'all') {
    filtered = filtered.filter((d) => getAbaGroup(d['ABA周排名'], thresholds) === abaFilter);
  }

  // 默认排序：SP关键词 → 有自然排名 → 无排名
  const getSortPriority = (d) => {
    const isSP = d.adType === 'SP';
    const hasNat = d['绝对位置'] < NOT_FOUND_RANK;
    if (isSP) return 0;
    if (hasNat) return 1;
    return 2;
  };

  if (sortField) {
    filtered.sort((a, b) => {
      const va = a[sortField] ?? 0;
      const vb = b[sortField] ?? 0;
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  } else {
    // 默认按优先级排序
    filtered.sort((a, b) => {
      const pa = getSortPriority(a);
      const pb = getSortPriority(b);
      if (pa !== pb) return pa - pb;
      // 同优先级按ABA排名升序
      return (a['ABA周排名'] || 0) - (b['ABA周排名'] || 0);
    });
  }

  // 分页
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // 切换筛选/排序时重置页码
  const handleFilterChange = (val) => { setAbaFilter(val); setPage(1); };
  const handleSortChange = (field) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
    setPage(1);
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span style={{ color: 'var(--text-muted)' }}>⇅</span>;
    return sortDir === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="section-title" style={{ marginBottom: 0 }}>关键词明细表</span>
        <div className="filter-group">
          <label>ABA分组</label>
          <select value={abaFilter} onChange={(e) => handleFilterChange(e.target.value)}>
            <option value="all">全部</option>
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
              <th onClick={() => handleSortChange('keyword')}>
                关键词 <SortIcon field="keyword" />
              </th>
              <th>翻译</th>
              <th onClick={() => handleSortChange('ABA周排名')}>
                ABA排名 <SortIcon field="ABA周排名" />
              </th>
              <th onClick={() => handleSortChange('月搜索量')}>
                月搜索量 <SortIcon field="月搜索量" />
              </th>
              <th>今日自然排名</th>
              <th>今日SP排名</th>
              <th onClick={() => handleSortChange('购买率')}>
                购买率 <SortIcon field="购买率" />
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={7} className="empty-state">暂无数据</td></tr>
            ) : (
              paged.map((d) => (
                <tr
                  key={d.keyword}
                  onClick={() => onKeywordClick(d.keyword)}
                  style={{ cursor: 'pointer' }}
                  className={d.keyword === activeKeyword ? 'active' : ''}
                >
                  <td style={{ color: d.keyword === activeKeyword ? 'var(--blue)' : 'inherit' }}>
                    {d.keyword}
                    {d.adType === 'SP' && (
                      <span style={{
                        display: 'inline-block', marginLeft: 6, padding: '1px 5px',
                        borderRadius: 3, background: '#dbeafe', color: '#1e40af',
                        fontSize: 10, fontWeight: 700, verticalAlign: 'middle',
                      }}>SP</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {d.translation || '-'}
                  </td>
                  <td>
                    <span className={`tag tag-${getAbaGroup(d['ABA周排名'], thresholds) === '大词' ? 'big' : getAbaGroup(d['ABA周排名'], thresholds) === '中词' ? 'medium' : 'small'}`}>
                      {d['ABA周排名']?.toLocaleString()}
                    </span>
                  </td>
                  <td>{d['月搜索量']?.toLocaleString()}</td>
                  <td>
                    {formatRank(d['绝对位置'])}
                    {hasChange(d.日环比变化_自然) && (
                      <span className={`change-badge ${d.日环比变化_自然 > 0 ? 'up' : 'down'}`}>
                        {d.日环比变化_自然 > 0 ? '▲' : '▼'} {Math.abs(d.日环比变化_自然)}
                      </span>
                    )}
                    {d.日环比变化_自然 === 0 && (
                      <span className="change-badge" style={{ color: 'var(--text-muted)' }}>持平</span>
                    )}
                  </td>
                  <td>
                    {formatRank(d['绝对位置(含ad)'])}
                    {hasChange(d.日环比变化_SP) && (
                      <span className={`change-badge ${d.日环比变化_SP > 0 ? 'up' : 'down'}`}>
                        {d.日环比变化_SP > 0 ? '▲' : '▼'} {Math.abs(d.日环比变化_SP)}
                      </span>
                    )}
                    {d.日环比变化_SP === 0 && (
                      <span className="change-badge" style={{ color: 'var(--text-muted)' }}>持平</span>
                    )}
                  </td>
                  <td>{(d['购买率'] * 100).toFixed(1)}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 12 }}>
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ 上一页</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button key={p}
              className="btn btn-sm"
              style={p === page ? { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)' } : {}}
              onClick={() => setPage(p)}
            >{p}</button>
          ))}
          <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页 ›</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
            {filtered.length} 条 / {totalPages} 页
          </span>
        </div>
      )}
    </div>
  );
}
