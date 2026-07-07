import { useState, useEffect } from 'react';

export default function RpaConfig() {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(setProjects)
      .catch(() => {});
  }, []);

  // 每30秒自动刷新
  useEffect(() => {
    const t = setInterval(() => {
      fetch('/api/projects').then(r => r.json()).then(setProjects).catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: 'monospace' }}>
      <h2 style={{ marginBottom: 16, fontSize: 16 }}>RPA 抓取配置</h2>
      <p style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
        影刀读取此页面，按项目遍历每一行，每行 = 一组 ASIN + 所有关键词（批量输入卖家精灵）
      </p>

      {projects.length === 0 ? (
        <p style={{ color: '#999' }}>暂无项目，请先在「数据源 & 配置」页面保存项目</p>
      ) : (
        <table border="1" cellPadding="8" cellSpacing="0"
          style={{ borderCollapse: 'collapse', width: '100%', background: '#fff', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              <th style={{ width: 80, textAlign: 'left' }}>序号</th>
              <th style={{ width: 120, textAlign: 'left' }}>项目名称</th>
              <th style={{ width: 160, textAlign: 'left' }}>ASIN</th>
              <th style={{ textAlign: 'left' }}>关键词（\n 分隔）</th>
              <th style={{ width: 100, textAlign: 'left' }}>负责人</th>
              <th style={{ width: 80, textAlign: 'left' }}>关键词个数</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project, idx) => {
              const keywords = Array.isArray(project.keywords) ? project.keywords
                : (typeof project.keywords === 'string' ? project.keywords.split('\n').map(k => k.trim()).filter(Boolean) : []);
              const asins = project.asins || [project.asin].filter(Boolean);
              const asinText = asins.join('\n');

              return (
                <tr key={project.id || idx} data-project={project.name}>
                  <td>{idx + 1}</td>
                  <td className="rpa-project-name">{project.name}</td>
                  <td className="rpa-asin">{asinText}</td>
                  <td className="rpa-keywords" style={{ whiteSpace: 'pre-wrap' }}>
                    {keywords.join('\n')}
                  </td>
                  <td className="rpa-owner">{project.owner}</td>
                  <td className="rpa-kw-count">{keywords.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 20, padding: 12, background: '#f9f9f9', borderRadius: 6, fontSize: 13, lineHeight: 1.8 }}>
        <strong>影刀操作指引</strong>
        <ol style={{ marginTop: 8, paddingLeft: 20 }}>
          <li>打开此页面：<code>/rpa-config</code></li>
          <li>使用「循环相似元素」定位 <code>tbody tr</code> 行</li>
          <li>每行读取：
            <ul>
              <li>ASIN → <code>.rpa-asin</code> 元素的文本</li>
              <li>关键词 → <code>.rpa-keywords</code> 元素的文本（\n 分隔）</li>
              <li>项目名称 → <code>.rpa-project-name</code> 元素的文本</li>
            </ul>
          </li>
          <li>在卖家精灵中批量输入 ASIN + 关键词 → 检索 → 下载</li>
          <li>CSV 文件保存到 <code>server\data-inbox\</code> 文件夹</li>
          <li>进入下一行循环</li>
        </ol>
      </div>
    </div>
  );
}
