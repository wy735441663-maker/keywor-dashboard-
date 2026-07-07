/**
 * AI 分析引擎：计算关键指标，生成 prompt
 */
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'public', 'merged-data.json');
const NOT_FOUND = 999;
const FIRST_PAGE = 48;

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return []; }
}

function getWeekLabel(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${monday.toISOString().split('T')[0]} ~ ${sunday.toISOString().split('T')[0]}`;
}

function getDateRange(dateStr, days) {
  const dates = [];
  const end = new Date(dateStr);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function computeAnalysis(data, endDate) {
  const dates = getDateRange(endDate, 7);
  const prevEnd = new Date(endDate);
  prevEnd.setDate(prevEnd.getDate() - 7);
  const prevDates = getDateRange(prevEnd.toISOString().split('T')[0], 7);

  // Group keywords
  const keywordMap = {};
  data.forEach(d => {
    if (!keywordMap[d.keyword]) keywordMap[d.keyword] = { records: [], isSP: false };
    keywordMap[d.keyword].records.push(d);
    if (d.adType === 'SP') keywordMap[d.keyword].isSP = true;
  });

  // Compute current week and previous week averages
  const currentWeek = { natural: {}, sp: {} };
  const previousWeek = { natural: {}, sp: {} };

  Object.entries(keywordMap).forEach(([kw, info]) => {
    const curRecs = info.records.filter(r => dates.includes(r.date));
    const prevRecs = info.records.filter(r => prevDates.includes(r.date));

    const curNat = avgRank(curRecs, '绝对位置');
    const prevNat = avgRank(prevRecs, '绝对位置');
    const curSP = avgRank(curRecs, '绝对位置(含ad)');
    const prevSP = avgRank(prevRecs, '绝对位置(含ad)');

    if (curNat !== null) currentWeek.natural[kw] = { rank: curNat, prev: prevNat, sp: info.isSP };
    if (curSP !== null && info.isSP) currentWeek.sp[kw] = { rank: curSP, prev: prevSP };
  });

  // Natural ranking changes
  const naturalChanges = [];
  Object.entries(currentWeek.natural).forEach(([kw, info]) => {
    if (info.prev !== null) {
      naturalChanges.push({ keyword: kw, current: info.rank, previous: info.prev, change: info.prev - info.rank, sp: info.sp });
    }
  });
  naturalChanges.sort((a, b) => b.change - a.change);

  // SP ranking changes
  const spChanges = [];
  Object.entries(currentWeek.sp).forEach(([kw, info]) => {
    if (info.prev !== null) {
      spChanges.push({ keyword: kw, current: info.rank, previous: info.prev, change: info.prev - info.rank });
    }
  });
  spChanges.sort((a, b) => b.change - a.change);

  // SP bidding analysis
  const spBidding = [];
  Object.entries(currentWeek.sp).forEach(([kw, info]) => {
    const natInfo = currentWeek.natural[kw];
    const spTrend = info.prev !== null ? info.prev - info.rank : 0;
    const natTrend = natInfo && natInfo.prev !== null ? natInfo.prev - natInfo.rank : 0;

    let recommendation = 'hold';
    if (spTrend < -3 && natTrend >= 0) recommendation = 'increase';
    else if (spTrend > 3 && natTrend > 3) recommendation = 'decrease';
    else if (spTrend < -5) recommendation = 'review_increase';
    else if (natTrend < -3 && spTrend <= 0) recommendation = 'review_listing';

    spBidding.push({
      keyword: kw, spCurrent: info.rank, spPrevious: info.prev, spChange: spTrend,
      natCurrent: natInfo ? natInfo.rank : null, natChange: natTrend, recommendation,
    });
  });
  spBidding.sort((a, b) => a.spChange - b.spChange);

  // ABA group analysis
  const abaGroups = { big: [], medium: [], small: [] };
  const latestDate = [...new Set(data.map(d => d.date))].sort().pop();
  const latest = data.filter(d => d.date === latestDate);
  latest.forEach(d => {
    const aba = d['ABA周排名'] || 0;
    const nat = d['绝对位置'] < NOT_FOUND ? d['绝对位置'] : null;
    if (aba <= 20000) abaGroups.big.push({ keyword: d.keyword, aba, rank: nat, sp: d.adType === 'SP' });
    else if (aba <= 50000) abaGroups.medium.push({ keyword: d.keyword, aba, rank: nat, sp: d.adType === 'SP' });
    else abaGroups.small.push({ keyword: d.keyword, aba, rank: nat, sp: d.adType === 'SP' });
  });

  // First page count
  const fpCount = latest.filter(d => d['绝对位置'] <= FIRST_PAGE).length;
  const spFpCount = latest.filter(d => d.adType === 'SP' && d['绝对位置(含ad)'] <= FIRST_PAGE).length;

  // Purchase rate analysis
  const highRankLowPurchase = [];
  const lowRankHighPurchase = [];
  latest.forEach(d => {
    const rate = d['购买率'] || 0;
    const nat = d['绝对位置'] < NOT_FOUND ? d['绝对位置'] : null;
    if (nat && nat <= 20 && rate < 0.02) highRankLowPurchase.push(d);
    if ((!nat || nat > 50) && rate > 0.05) lowRankHighPurchase.push(d);
  });

  return {
    period: { start: dates[0], end: dates[dates.length - 1], weekLabel: endDate },
    summary: {
      totalKeywords: Object.keys(keywordMap).length,
      spKeywords: Object.values(keywordMap).filter(v => v.isSP).length,
      naturalUp: naturalChanges.filter(c => c.change > 0).length,
      naturalDown: naturalChanges.filter(c => c.change < 0).length,
      spUp: spChanges.filter(c => c.change > 0).length,
      spDown: spChanges.filter(c => c.change < 0).length,
      firstPage: fpCount,
      spFirstPage: spFpCount,
    },
    naturalTop10Up: naturalChanges.filter(c => c.change > 0).slice(0, 10),
    naturalTop10Down: naturalChanges.filter(c => c.change < 0).reverse().slice(0, 10),
    spTop10Up: spChanges.filter(c => c.change > 0).slice(0, 10),
    spTop10Down: spChanges.filter(c => c.change < 0).reverse().slice(0, 10),
    spBidding: spBidding.slice(0, 15),
    abaGroups: {
      big: { count: abaGroups.big.length, withRank: abaGroups.big.filter(k => k.rank).length, spCount: abaGroups.big.filter(k => k.sp).length },
      medium: { count: abaGroups.medium.length, withRank: abaGroups.medium.filter(k => k.rank).length, spCount: abaGroups.medium.filter(k => k.sp).length },
      small: { count: abaGroups.small.length, withRank: abaGroups.small.filter(k => k.rank).length, spCount: abaGroups.small.filter(k => k.sp).length },
    },
    efficiency: {
      highRankLowPurchase: highRankLowPurchase.slice(0, 5),
      lowRankHighPurchase: lowRankHighPurchase.slice(0, 5),
    },
    dataPeriod: latestDate,
  };
}

function avgRank(records, field) {
  const valid = records.filter(r => r[field] < NOT_FOUND);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((s, r) => s + r[field], 0) / valid.length);
}

function generatePrompt(analysis, projectName) {
  const { summary, naturalTop10Up, naturalTop10Down, spTop10Up, spTop10Down, spBidding, abaGroups, efficiency } = analysis;

  const increaseList = spBidding.filter(b => b.recommendation === 'increase' || b.recommendation === 'review_increase');
  const decreaseList = spBidding.filter(b => b.recommendation === 'decrease');

  return `你是亚马逊广告投放分析师。以下是「${projectName}」项目过去7天（${analysis.period.start} ~ ${analysis.period.end}）的关键词排名数据。

## 一、排名异动摘要
- 总关键词: ${summary.totalKeywords} 个（SP关键词: ${summary.spKeywords} 个）
- 自然排名上升: ${summary.naturalUp} 词，下降: ${summary.naturalDown} 词
- SP排名上升: ${summary.spUp} 词，下降: ${summary.spDown} 词
- 自然首页(≤48): ${summary.firstPage} 词，SP首页: ${summary.spFirstPage} 词

## 二、自然排名飙升 TOP 10
${naturalTop10Up.map((c, i) => `${i+1}. ${c.keyword}: ${c.previous}→${c.current}（↑${c.change}）`).join('\n')}

## 三、自然排名暴跌 TOP 10
${naturalTop10Down.map((c, i) => `${i+1}. ${c.keyword}: ${c.previous}→${c.current}（↓${Math.abs(c.change)}）`).join('\n')}

## 四、SP排名变化 TOP 10
上升: ${spTop10Up.map(c => `${c.keyword} ↑${c.change}`).join(', ') || '无'}
下降: ${spTop10Down.map(c => `${c.keyword} ↓${Math.abs(c.change)}`).join(', ') || '无'}

## 五、SP竞价建议
需考虑加价（排名下降，自然稳定）:
${increaseList.length > 0 ? increaseList.map(b => `- ${b.keyword}: SP ${b.spPrevious}→${b.spCurrent}（↓${Math.abs(b.spChange)}），自然排名稳定`).join('\n') : '无'}

可考虑降价（排名和自然都在上升）:
${decreaseList.length > 0 ? decreaseList.map(b => `- ${b.keyword}: SP ↑${b.spChange}，自然也上升`).join('\n') : '无'}

## 六、ABA分组统计
- 大词(≤2万): ${abaGroups.big.count} 词，有排名 ${abaGroups.big.withRank} 词，SP ${abaGroups.big.spCount} 词
- 中词(2-5万): ${abaGroups.medium.count} 词，有排名 ${abaGroups.medium.withRank} 词，SP ${abaGroups.medium.spCount} 词
- 小词(>5万): ${abaGroups.small.count} 词，有排名 ${abaGroups.small.withRank} 词，SP ${abaGroups.small.spCount} 词

## 七、投放效率
高排名低转化（曝光好但Listing需优化）:
${efficiency.highRankLowPurchase.map(d => `- ${d.keyword}: 排名${d['绝对位置']} 购买率${(d['购买率']*100).toFixed(1)}%`).join('\n') || '无'}

低排名高转化（可加大投放）:
${efficiency.lowRankHighPurchase.map(d => `- ${d.keyword}: 排名${d['绝对位置'] < NOT_FOUND ? d['绝对位置'] : '无'} 购买率${(d['购买率']*100).toFixed(1)}%`).join('\n') || '无'}

---
请给出：
1. **本周排名异动分析**：哪些词值得关注，可能的原因
2. **SP竞价调整建议**：具体哪些词该加价/降价，幅度建议
3. **下周关键词策略**：重点防守/进攻的词，结构优化建议
4. **风险提示**：排名持续下滑的词，建议采取措施

输出格式：每条结论附数据依据，简洁有力。`;
}

module.exports = { loadData, computeAnalysis, generatePrompt, NOT_FOUND };
