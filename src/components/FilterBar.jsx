export default function FilterBar({
  projectNames, selectedProject, onProjectChange,
  keywords, selectedKeyword, onKeywordChange,
  asins, selectedAsin, onAsinChange,
  owners, selectedOwner, onOwnerChange,
  filteredKeywords, filteredAsins,
}) {
  const kwOptions = selectedProject ? filteredKeywords : keywords;
  const asOptions = selectedProject ? filteredAsins : asins;

  return (
    <div className="filter-bar card" style={{ marginBottom: 14 }}>
      <div className="filter-group">
        <label>项目名称</label>
        <select value={selectedProject} onChange={(e) => { onProjectChange(e.target.value); onAsinChange(''); onKeywordChange(''); }}>
          <option value="">全部项目</option>
          {projectNames.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="filter-group">
        <label>ASIN</label>
        <select value={selectedAsin} onChange={(e) => onAsinChange(e.target.value)}>
          <option value="">全部ASIN</option>
          {asOptions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className="filter-group">
        <label>关键词</label>
        <select value={selectedKeyword} onChange={(e) => onKeywordChange(e.target.value)}>
          <option value="">全部关键词</option>
          {kwOptions.map(kw => <option key={kw} value={kw}>{kw}</option>)}
        </select>
      </div>
      <div className="filter-group">
        <label>负责人</label>
        <select value={selectedOwner} onChange={(e) => onOwnerChange(e.target.value)}>
          <option value="">全部负责人</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    </div>
  );
}
