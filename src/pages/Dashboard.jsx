import { useState, useMemo, useEffect } from 'react';
import FilterBar from '../components/FilterBar';
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
  // 数据处理
  const enriched = useMemo(() => enrichData(rawData), [rawData]);
  const dates = useMemo(() => getAllDates(enriched), [enriched]);
  const keywords = useMemo(() => getAllKeywords(enriched), [enriched]);
  const asins = useMemo(() => getAllAsins(enriched), [enriched]);
  const latestDate = useMemo(() => getLatestDate(enriched), [enriched]);

  // 加载项目配置（从后端 API）
  const [projects, setProjects] = useState([]);
  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(setProjects).catch(() => {});
  }, []);
  const projectNames = useMemo(() => [...new Set(projects.map(p => p.name))].sort(), [projects]);
  const owners = useMemo(() => [...new Set(projects.map(p => p.owner).filter(Boolean))].sort(), [projects]);

  // 筛选状态
  const [selectedDate, setSelectedDate] = useState(latestDate || '');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedKeyword, setSelectedKeyword] = useState('');
  const [selectedAsin, setSelectedAsin] = useState('');
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

  // 当前选中的关键词（用于折线图联动）
  const defaultKeyword = useMemo(() => getBiggestMover(enriched), [enriched]);
  const [activeKeyword, setActiveKeyword] = useState(defaultKeyword || '');

  useEffect(() => {
    if (defaultKeyword && !activeKeyword) {
      setActiveKeyword(defaultKeyword);
    }
  }, [defaultKeyword]);

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

  // KPI（今日 + 昨日对比）
  const kpis = useMemo(() => computeKPIs(snapshot), [snapshot]);
  const yesterdayDate = useMemo(() => {
    const d = new Date(effectiveDate); d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, [effectiveDate]);
  const yesterdaySnapshot = useMemo(() => getTodaySnapshot(enriched, yesterdayDate), [enriched, yesterdayDate]);
  const yesterdayKpis = useMemo(() => computeKPIs(yesterdaySnapshot), [yesterdaySnapshot]);

  // 排行榜数据
  const naturalUpList = useMemo(
    () => getRankingList(snapshot, '日环比变化_自然', 'desc'),
    [snapshot]
  );
  const naturalDownList = useMemo(
    () => getRankingList(snapshot, '日环比变化_自然', 'asc'),
    [snapshot]
  );
  const spUpList = useMemo(
    () => getRankingList(snapshot, '日环比变化_SP', 'desc'),
    [snapshot]
  );
  const spDownList = useMemo(
    () => getRankingList(snapshot, '日环比变化_SP', 'asc'),
    [snapshot]
  );

  // 折线图数据（30天窗口，以选定日期为终点）
  const trendData = useMemo(
    () => getKeywordTrend(enriched, activeKeyword, 30, effectiveDate),
    [enriched, activeKeyword, effectiveDate]
  );

  // 7天变化数据
  const sevenDayData = useMemo(() => getSevenDayChanges(enriched), [enriched]);

  // 关键词点击联动
  const handleKeywordClick = (keyword) => {
    setActiveKeyword(keyword);
  };

  // 根据项目获取关键词列表（处理字符串/数组两种情况）
  const getProjectKeywords = (proj) => {
    if (!proj) return [];
    const kw = proj.keywords;
    if (Array.isArray(kw)) return kw;
    if (typeof kw === 'string') return kw.split(/[\n,，、;；]+/).map(s => s.trim()).filter(Boolean);
    return [];
  };

  // 筛选后的明细数据
  const filteredSnapshot = useMemo(() => {
    let result = snapshot;
    // 项目筛选：优先按项目关键词过滤（未选ASIN时），选了ASIN则只按ASIN过滤
    if (selectedProject && !selectedAsin && !selectedKeyword) {
      const proj = projects.find(p => p.name === selectedProject);
      const pkw = getProjectKeywords(proj);
      if (pkw.length > 0) result = result.filter(d => pkw.includes(d.keyword));
    }
    if (selectedKeyword) result = result.filter(d => d.keyword === selectedKeyword);
    if (selectedAsin) result = result.filter(d => d.asin === selectedAsin);
    if (selectedOwner) {
      const proj = projects.find(p => p.owner === selectedOwner);
      const pkw = getProjectKeywords(proj);
      if (pkw.length > 0) result = result.filter(d => pkw.includes(d.keyword));
    }
    return result;
  }, [snapshot, selectedKeyword, selectedAsin, selectedProject, selectedOwner, projects]);

  // 将筛选后的snapshot传给RankingTabs
  const filteredNaturalUp = useMemo(() => {
    if (!selectedKeyword && !selectedAsin) return naturalUpList;
    return getRankingList(filteredSnapshot, '日环比变化_自然', 'desc');
  }, [filteredSnapshot, naturalUpList, selectedKeyword, selectedAsin]);

  const filteredNaturalDown = useMemo(() => {
    if (!selectedKeyword && !selectedAsin) return naturalDownList;
    return getRankingList(filteredSnapshot, '日环比变化_自然', 'asc');
  }, [filteredSnapshot, naturalDownList, selectedKeyword, selectedAsin]);

  const filteredSpUp = useMemo(() => {
    if (!selectedKeyword && !selectedAsin) return spUpList;
    return getRankingList(filteredSnapshot, '日环比变化_SP', 'desc');
  }, [filteredSnapshot, spUpList, selectedKeyword, selectedAsin]);

  const filteredSpDown = useMemo(() => {
    if (!selectedKeyword && !selectedAsin) return spDownList;
    return getRankingList(filteredSnapshot, '日环比变化_SP', 'asc');
  }, [filteredSnapshot, spDownList, selectedKeyword, selectedAsin]);

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
        naturalUpList={filteredNaturalUp}
        naturalDownList={filteredNaturalDown}
        spUpList={filteredSpUp}
        spDownList={filteredSpDown}
        onKeywordClick={handleKeywordClick}
        activeKeyword={activeKeyword}
        enriched={enriched}
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
          snapshot={filteredSnapshot}
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
