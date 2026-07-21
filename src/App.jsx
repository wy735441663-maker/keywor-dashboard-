import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import Dashboard from './pages/Dashboard';
import Config from './pages/Config';
import RpaConfig from './pages/RpaConfig';
import AbaConfig from './components/AbaConfig';
import { generateMockData } from './data/mockData';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export default function App() {
  const [rawData, setRawData] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dataSource, setDataSource] = useState('mock');

  const loadData = useCallback(async () => {
    // 优先加载合并的 Excel 数据
    try {
      const res = await fetch(API_BASE + '/api/merged-data?t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setDataSource('excel');
          return data;
        }
      }
    } catch {}

    // 回退到模拟数据
    setDataSource('mock');
    return generateMockData();
  }, []);

  useEffect(() => {
    loadData().then(data => {
      setRawData(data);
      setDataLoaded(true);
    });
  }, [loadData]);

  // 监听数据更新事件
  useEffect(() => {
    const handler = () => {
      loadData().then(data => setRawData(data));
    };
    window.addEventListener('data-updated', handler);
    // Auto-refresh every 60 seconds
    const interval = setInterval(() => {
      loadData().then(data => setRawData(data));
    }, 60000);
    return () => {
      window.removeEventListener('data-updated', handler);
      clearInterval(interval);
    };
  }, [loadData]);

  const refreshData = () => {
    loadData().then(data => setRawData(data));
  };

  if (!dataLoaded) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="app">
      <nav className="top-nav">
        <div className="nav-brand">亚马逊关键词排名看板</div>
        <div className="nav-links">
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            看板
          </NavLink>
          <NavLink to="/config" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            数据源 & 配置
          </NavLink>
          <NavLink to="/aba-config" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            ABA阈值
          </NavLink>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: 4 }}>
            {dataSource === 'excel' ? '卖家精灵数据' : '模拟数据'}
          </span>
          <button className="btn btn-sm" onClick={refreshData}>刷新数据</button>
        </div>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard rawData={rawData} />} />
          <Route path="/config" element={<Config />} />
          <Route path="/aba-config" element={<AbaConfig />} />
          <Route path="/rpa-config" element={<RpaConfig />} />
        </Routes>
      </main>
    </div>
  );
}
