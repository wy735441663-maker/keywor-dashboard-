import { useState, useEffect } from 'react';
import { loadAbaThresholds, saveAbaThresholds } from '../utils/storage';

export default function AbaConfig() {
  const [thresholds, setThresholds] = useState({ big: 20000, medium: 50000 });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    setThresholds(loadAbaThresholds());
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleSave = () => {
    if (thresholds.big >= thresholds.medium) {
      showToast('大词阈值必须小于中词阈值', 'error');
      return;
    }
    if (thresholds.big < 0 || thresholds.medium < 0) {
      showToast('阈值不能为负数', 'error');
      return;
    }
    saveAbaThresholds(thresholds);
    showToast('ABA阈值已保存');
  };

  return (
    <div className="aba-config">
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <div className="page-header">
        <h2>ABA 排名阈值设置</h2>
        <button className="btn btn-primary" onClick={handleSave}>保存设置</button>
      </div>

      <div className="card">
        <div className="card-header">
          设置关键词大小分类的 ABA 排名阈值。修改后，看板中的分组将自动更新。
        </div>

        <div style={{ marginBottom: 20 }}>
          <div className="form-row">
            <div className="filter-group">
              <label>大词阈值（ABA排名 ≤ 此值）</label>
              <input
                type="number"
                value={thresholds.big}
                onChange={(e) => setThresholds({ ...thresholds, big: parseInt(e.target.value) || 0 })}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
                示例：20000 表示 ABA排名 ≤ 20000 的为大词
              </small>
            </div>
            <div className="filter-group">
              <label>中词阈值（ABA排名 ≤ 此值 且 {'>'} 大词阈值）</label>
              <input
                type="number"
                value={thresholds.medium}
                onChange={(e) => setThresholds({ ...thresholds, medium: parseInt(e.target.value) || 0 })}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
                示例：50000 表示 ABA排名 20001~50000 的为中词
              </small>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
          <div><span className="tag tag-big">大词</span> ABA排名 ≤ {thresholds.big.toLocaleString()}</div>
          <div style={{ marginTop: 6 }}><span className="tag tag-medium">中词</span> ABA排名 {thresholds.big.toLocaleString()} ~ {thresholds.medium.toLocaleString()}</div>
          <div style={{ marginTop: 6 }}><span className="tag tag-small">小词</span> ABA排名 &gt; {thresholds.medium.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
