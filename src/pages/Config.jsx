import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '';

// 后端 API 操作（本地服务，持久化存储，跨设备共享）
const API = API_BASE + '/api/projects';

async function loadProjects() {
  try {
    const res = await fetch(API);
    if (res.ok) return await res.json();
  } catch {}
  return [];
}

async function createProject(data) {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return res.json();
}

async function updateProject(id, data) {
  const res = await fetch(API + '/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return res.json();
}

async function deleteProject(id) {
  await fetch(API + '/' + id, { method: 'DELETE' });
}

// 智能解析分隔符：换行、逗号、顿号、分号、空格 等
function parseItems(raw) {
  if (!raw || !raw.trim()) return [];
  // 只用换行、逗号、顿号、分号分隔，保留空格（词组）
  const cleaned = raw
    .replace(/[，,、;；]/g, '\n')   // 逗号/顿号/分号 → 换行
    .replace(/\n{2,}/g, '\n')      // 多个换行合并
    .replace(/^\n+|\n+$/g, '');    // 去掉首尾换行
  return cleaned.split('\n').map(s => s.trim()).filter(Boolean);
}

// ==================== Modal 组件 ====================
function ProjectModal({ onSave, onClose, edit }) {
  const [name, setName] = useState(edit?.name || '');
  const [asinRaw, setAsinRaw] = useState(edit ? (Array.isArray(edit.asins) ? edit.asins.join('\n') : edit.asin || '') : '');
  const [kwRaw, setKwRaw] = useState(edit ? (Array.isArray(edit.keywords) ? edit.keywords.join('\n') : edit.keywords || '') : '');
  const [owner, setOwner] = useState(edit?.owner || '');

  const handleSubmit = () => {
    const asins = parseItems(asinRaw);
    const keywords = parseItems(kwRaw);
    if (!name.trim()) return alert('请输入项目名称');
    if (asins.length === 0) return alert('请输入至少一个 ASIN');
    if (keywords.length === 0) return alert('请输入至少一个关键词');

    onSave({
      id: edit?.id || Date.now().toString(),
      name: name.trim(),
      asins,
      keywords,
      owner: owner.trim(),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '28px 30px 22px',
        width: 520, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.15)',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 20, fontSize: 17 }}>{edit ? '编辑项目' : '添加项目'}</h3>

        <div className="filter-group" style={{ marginBottom: 14, width: '100%' }}>
          <label>项目名称 *</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="例如：晾衣架" style={{ width: '100%' }} />
        </div>

        <div className="filter-group" style={{ marginBottom: 14, width: '100%' }}>
          <label>ASIN *（换行 / 逗号 / 顿号 分隔）</label>
          <textarea value={asinRaw} onChange={e => setAsinRaw(e.target.value)}
            placeholder={"B0FQBVGWH4\nB0XXXXXXX" }
            rows={3} style={{ width: '100%', resize: 'vertical' }} />
          {asinRaw.trim() && (
            <span style={{ fontSize: 11, color: 'var(--blue)', marginTop: 2 }}>
              识别到 {parseItems(asinRaw).length} 个 ASIN
            </span>
          )}
        </div>

        <div className="filter-group" style={{ marginBottom: 14, width: '100%' }}>
          <label>关键词 *（换行 / 逗号 / 顿号 分隔）</label>
          <textarea value={kwRaw} onChange={e => setKwRaw(e.target.value)}
            placeholder={"coat rack\nclothes rack"}
            rows={6} style={{ width: '100%', resize: 'vertical' }} />
          {kwRaw.trim() && (
            <span style={{ fontSize: 11, color: 'var(--blue)', marginTop: 2 }}>
              识别到 {parseItems(kwRaw).length} 个关键词
            </span>
          )}
        </div>

        <div className="filter-group" style={{ marginBottom: 20, width: '100%' }}>
          <label>负责人</label>
          <input value={owner} onChange={e => setOwner(e.target.value)}
            placeholder="例如：嘻嘻" style={{ width: '100%' }} />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {edit ? '保存修改' : '确定录入'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== 配置主页 ====================
export default function Config() {
  const [projects, setProjects] = useState([]);
  const [toast, setToast] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [mergeInfo, setMergeInfo] = useState({ loading: true, count: 0 });

  useEffect(() => {
    loadProjects().then(setProjects);
    checkData();
  }, []);
  const refreshProjects = async () => {
    const data = await loadProjects();
    setProjects(data);
  };

  const checkData = async () => {
    try {
      const res = await fetch(API_BASE + '/api/merged-data');
      if (res.ok) {
        const data = await res.json();
        setMergeInfo({ loading: false, count: data.length });
      } else {
        setMergeInfo({ loading: false, count: 0 });
      }
    } catch { setMergeInfo({ loading: false, count: 0 }); }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // 保存项目
  const handleSave = async (projectData) => {
    const payload = {
      name: projectData.name, asin: projectData.asins?.[0] || '',
      asins: projectData.asins, keywords: projectData.keywords, owner: projectData.owner,
    };
    if (editing) {
      await updateProject(editing.id, payload);
    } else {
      await createProject(payload);
    }
    await refreshProjects();
    setShowModal(false);
    setEditing(null);
    showToast('已保存「' + projectData.name + '」');
    syncToExcel();
  };

  const handleDelete = async (id) => {
    await deleteProject(id);
    await refreshProjects();
    showToast('已删除');
    syncToExcel();
  };

  const syncToExcel = async () => {
    try {
      const data = await loadProjects();
      await fetch(API_BASE + '/api/sync-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch {}
  };

  const handleEdit = (project) => {
    setEditing(project);
    setShowModal(true);
  };


  const handleRefreshData = async () => {
    showToast('正在合并 Excel 数据...');
    try {
      const res = await fetch(API_BASE + '/api/refresh-data', { method: 'POST' });
      if (res.ok) {
        // 等1秒让 Python 脚本跑完，然后刷新
        setTimeout(async () => {
          await checkData();
          window.dispatchEvent(new Event('data-updated'));
          showToast('数据合并完成，看板已更新');
        }, 2000);
      } else {
        showToast('合并失败，请检查后端', 'error');
      }
    } catch {
      showToast('后端未运行，请先启动: node server/index.cjs', 'error');
    }
  };

  // 展开每个项目为多行（ASIN × 关键词）
  const expandedRows = [];
  projects.forEach(p => {
    const asins = p.asins || [p.asin].filter(Boolean);
    const keywords = Array.isArray(p.keywords)
      ? p.keywords
      : (typeof p.keywords === 'string' ? parseItems(p.keywords) : []);

    asins.forEach(asin => {
      keywords.forEach(kw => {
        expandedRows.push({
          projectId: p.id,
          projectName: p.name,
          asin,
          keyword: kw,
          owner: p.owner || '',
        });
      });
    });
  });

  return (
    <div>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      {/* Modal */}
      {showModal && (
        <ProjectModal
          edit={editing}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}

      <div className="page-header">
        <h2>数据源 & 配置</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
            + 添加项目
          </button>
        </div>
      </div>

      {/* 项目总览卡片 */}
      {projects.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 18 }}>
          {projects.map(p => {
            const asins = p.asins || [p.asin].filter(Boolean);
            const keywords = Array.isArray(p.keywords) ? p.keywords : (typeof p.keywords === 'string' ? parseItems(p.keywords) : []);
            return (
              <div key={p.id} className="card" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                      <div>ASIN: {asins.join(', ')}</div>
                      <div>关键词: {keywords.length} 个</div>
                      {p.owner && <div>负责人: {p.owner}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => handleEdit(p)}>编辑</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>删除</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 展开明细表 */}
      {expandedRows.length > 0 && (
        <div className="card">
          <div className="card-header">
            项目明细（{expandedRows.length} 行 — 供影刀 Excel 遍历）
          </div>
          <div className="detail-table-wrap">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>项目名称</th>
                  <th>ASIN</th>
                  <th>关键词</th>
                  <th>负责人</th>
                </tr>
              </thead>
              <tbody>
                {expandedRows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{row.projectName}</td>
                    <td><code style={{ fontSize: 12, background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 3 }}>{row.asin}</code></td>
                    <td>{row.keyword}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{row.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {projects.length === 0 && (
        <div className="card">
          <div className="empty-state" style={{ padding: 48 }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>📋</p>
            <p>暂无项目，点击「+ 添加项目」开始</p>
          </div>
        </div>
      )}

      {/* 数据导入 */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">数据导入</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p>
            数据源文件夹：
            <code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: 3, marginLeft: 6 }}>
              卖家精灵下载数据\
            </code>
          </p>
          <p style={{ marginTop: 4 }}>
            状态：
            {mergeInfo.count > 0 ? (
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>已就绪，{mergeInfo.count} 条</span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>暂无数据</span>
            )}
          </p>
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-sm" onClick={handleRefreshData}>运行合并脚本</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
              python server/merge_excel.py
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
