import { useState, useMemo, useEffect } from 'react';
import FilterBar from '../components/FilterBar';

const API_BASE = import.meta.env.VITE_API_BASE || '';
import DateCalendar from '../components/DateCalendar';
import KPICards from '../components/KPICards';
import RankingTabs from '../components/RankingTabs';
import TrendChart from '../components/TrendChart';
import SevenDayChange from '../components/SevenDayChange';
import DetailTable from '../components/DetailTable';
import {
  enrichData,
  getTodaySnapshot,
  getAllDates,
  getAllKeywords,
  getAllAsins,
  getLatestDate,
  computeKPIs,
  getRankingList,
  getKeywordTrend,
  getSevenDayChanges,
  getBiggestMover,
} from '../data/processor';

export default function Dashboard({ rawData }) {
  // 数据处理：过滤掉 ABA=0 的关键词（不显示，数据源不变）
  const activeData = useMemo(() => rawData.filter(d => (d['ABA周排名'] || 0) > 0), [rawData]);
  const enriched = useMemo(() => enrichData(activeData), [activeData]);
  const dates = useMemo(() => getAllDates(enriched), [enriched]);
  const keywords = useMemo(() => getAllKeywords(enriched), [enriched]);
  const asins = useMemo(() => getAllAsins(enriched), [enriched]);
  const latestDate = useMemo(() => getLatestDate(enriched), [enriched]);

  // 加载项目配置（从后端 API）
  const [projects, setProjects] = useState([]);
  useEffect(() => {
    fetch(API_BASE + '/api/projects').then(r => r.json()).then(setProjects).catch(() => {})
  }, []);
  const projectNames = useMemo(() => [...new Set(projects.map(p => p.name))].sort(), [projects]);
  const owners = useMemo(() => [...new Set(projects.map(p => p.owner).filter(Boolean))].sort(), [projects]);

  // 筛选状态
  const [selectedDate, setSelectedDate] = useState(latestDate || '');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedKeyword, setSelectedKeyword] = useState('');
  const [selectedAsin, setSelectedAsin] = useState('');
  const [initialized, setInitialized] = useState(false);

  // 默认选中第一个有数据的项目
  useEffect(() => {
    if (!initialized && projectNames.length > 0) {
      // 选第一个有关键词匹配的项目
      const kwSet = new Set(keywords);
      const firstMatch = projectNames.find(pn => {
        const proj = projects.find(p => p.name === pn);
        const pkw = Array.isArray(proj?.keywords) ? proj.keywords : [];
        return pkw.some(k => kwSet.has(k));
      });
      setSelectedProject(firstMatch || projectNames[0]);
      setInitialized(true);
    }
  }, [projectNames, initialized, keywords, projects]);
  const [selectedOwner, setSelectedOwner] = useState('');

  // 根据选中项目过滤 ASIN 和关键词选项
  const filteredAsins = useMemo(() => {
    if (!selectedProject) return asins;
    const proj = projects.find(p => p.name === selectedProject);
    return proj ? (proj.asins || [proj.asin]).filter(Boolean) : asins;
  }, [selectedProject, projects, asins]);

  const filteredKeywords = useMemo(() => {
    if (!selectedProject) return keywords;
    const proj = projects.find(p => p.name === selectedProject);
    if (!proj) return keywords;
    const pkw = Array.isArray(proj.keywords) ? proj.keywords : [];
    return keywords.filter(k => pkw.includes(k));
  }, [selectedProject, projects, keywords]);

  // 从给定数据中选ABA排名最高的关键词
  const pickBestKeyword = (data) => {
    const snap = getTodaySnapshot(data);
    const ranked = snap.filter(d => (d['ABA周排名'] || 0) > 0).sort((a, b) => (a['ABA周排名'] || 999) - (b['ABA周排名'] || 999));
    return ranked[0]?.keyword || snap[0]?.keyword || '';
  };

  const defaultKeyword = useMemo(() => pickBestKeyword(enriched), [enriched]);
  const [activeKeyword, setActiveKeyword] = useState(defaultKeyword || '');

  // 筛选变化时自动切换为当前数据中最佳关键词
  useEffect(() => {
    const best = pickBestKeyword(filteredEnriched);
    if (best && best !== activeKeyword) {
      setActiveKeyword(best);
    }
  }, [selectedProject, selectedAsin, selectedOwner]);

  if (!rawData || rawData.length === 0) {
    return <div className="empty-state" style={{ padding: 60 }}>暂无数据，请先到"关键词配置"页面导入数据。</div>;
  }

  // 实际使用的日期
  const effectiveDate = selectedDate || latestDate;

  // 今日快照
  const snapshot = useMemo(
    () => getTodaySnapshot(enriched, effectiveDate),
    [enriched, effectiveDate]
  );

  // 根据项目获取关键词列表（提前，KPI也需要用）
  const getProjectKeywords = (proj) => {
    if (!proj) return [];
    const kw = proj.keywords;
    if (Array.isArray(kw)) return kw;
    if (typeof kw === 'string') return kw.split(/[\n,，、;；]+/).map(s => s.trim()).filter(Boolean);
    return [];
  };

  // 统一筛选函数：对所有数据生效（KPI + 排行榜 + 明细）
  const filterData = (data) => {
    let result = data;
    if (selectedProject) {
      const proj = projects.find(p => p.name === selectedProject);
      const pkw = getProjectKeywords(proj);
      if (pkw.length > 0) result = result.filter(d => pkw.includes(d.keyword));
      const projAsin = proj ? (proj.asins || [proj.asin]).filter(Boolean) : [];
      if (projAsin.length > 0 && !selectedAsin) {
        result = result.filter(d => projAsin.includes(d.asin));
      }
    }
    if (selectedKeyword) result = result.filter(d => d.keyword === selectedKeyword);
    if (selectedAsin) result = result.filter(d => d.asin === selectedAsin);
    if (selectedOwner) {
      const ownerProjs = projects.filter(p => p.owner === selectedOwner);
      const okw = new Set(ownerProjs.flatMap(p => getProjectKeywords(p)));
      if (okw.size > 0) result = result.filter(d => okw.has(d.keyword));
    }
    return result;
  };

  const filteredSnap = useMemo(() => filterData(snapshot), [snapshot, selectedProject, selectedKeyword, selectedAsin, selectedOwner, projects]);
  const filteredEnriched = useMemo(() => filterData(enriched), [enriched, selectedProject, selectedKeyword, selectedAsin, selectedOwner, projects]);

  // KPI（今日 + 昨日对比）——使用筛选后数据
  const kpis = useMemo(() => computeKPIs(filteredSnap), [filteredSnap]);
  const yesterdayDate = useMemo(() => {
    const d = new Date(effectiveDate); d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, [effectiveDate]);
  const yesterdaySnap = useMemo(() => getTodaySnapshot(filteredEnriched, yesterdayDate), [filteredEnriched, yesterdayDate]);
  const yesterdayKpis = useMemo(() => computeKPIs(yesterdaySnap), [yesterdaySnap]);

  // 排行榜数据 —— 使用筛选后数据
  const naturalUpList = useMemo(
    () => getRankingList(filteredSnap, '日环比变化_自然', 'desc'),
    [filteredSnap]
  );
  const naturalDownList = useMemo(
    () => getRankingList(filteredSnap, '日环比变化_自然', 'asc'),
    [filteredSnap]
  );
  const spUpList = useMemo(
    () => getRankingList(filteredSnap, '日环比变化_SP', 'desc'),
    [filteredSnap]
  );
  const spDownList = useMemo(
    () => getRankingList(filteredSnap, '日环比变化_SP', 'asc'),
    [filteredSnap]
  );
  // 折线图数据（30天窗口，以选定日期为终点）
  const trendData = useMemo(
    () => getKeywordTrend(filteredEnriched, activeKeyword, 30, effectiveDate),
    [filteredEnriched, activeKeyword, effectiveDate]
  );

  // 7天变化数据
  const sevenDayData = useMemo(() => getSevenDayChanges(filteredEnriched), [filteredEnriched]);

  // 关键词点击联动
  const handleKeywordClick = (keyword) => {
    setActiveKeyword(keyword);
  };

  
  return (
    <div>
      {/* 筛选器 */}
      <FilterBar
        projectNames={projectNames}
        selectedProject={selectedProject}
        onProjectChange={setSelectedProject}
        keywords={keywords}
        selectedKeyword={selectedKeyword}
        onKeywordChange={setSelectedKeyword}
        asins={asins}
        selectedAsin={selectedAsin}
        onAsinChange={setSelectedAsin}
        owners={owners}
        selectedOwner={selectedOwner}
        onOwnerChange={setSelectedOwner}
        filteredKeywords={filteredKeywords}
        filteredAsins={filteredAsins}
      />

      {/* 日历 + KPI 并排 */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 14, alignItems: 'stretch' }}>
        <div style={{ flexShrink: 0 }}>
          <DateCalendar
            dates={dates}
            selectedDate={effectiveDate}
            onSelect={setSelectedDate}
          />
        </div>
        <div style={{ flex: 1 }}>
          <KPICards kpis={kpis} yesterdayKpis={yesterdayKpis} />
        </div>
      </div>

      {/* 排行榜 */}
      <RankingTabs
        naturalUpList={naturalUpList}
        naturalDownList={naturalDownList}
        spUpList={spUpList}
        spDownList={spDownList}
        onKeywordClick={handleKeywordClick}
        activeKeyword={activeKeyword}
        enriched={filteredEnriched}
        effectiveDate={effectiveDate}
      />

      {/* 30天趋势折线图 */}
      <div id="trend-chart-section" style={{ marginTop: 16, marginBottom: 16 }}>
        <TrendChart
          trendData={trendData}
          keyword={activeKeyword}
          allKeywords={keywords}
          onKeywordChange={handleKeywordClick}
        />
      </div>

      {/* 明细表格 */}
      <div style={{ marginTop: 16 }}>
        <DetailTable
          snapshot={filteredSnap}
          onKeywordClick={handleKeywordClick}
          activeKeyword={activeKeyword}
        />
      </div>

      {/* 7天连续变化榜 */}
      <SevenDayChange
        sevenDayData={sevenDayData}
        onKeywordClick={handleKeywordClick}
        activeKeyword={activeKeyword}
      />
    </div>
  );
}
