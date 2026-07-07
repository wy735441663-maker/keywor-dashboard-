/**
 * 数据处理核心模块
 * 计算日环比变化、趋势方向、7天变化等指标
 */

const FIRST_PAGE_THRESHOLD = 48;
const NOT_FOUND_RANK = 900; // 大于此值的排名视为"未找到"，图表中不显示

// 按关键词+日期排序数据
export function sortData(data) {
  return [...data].sort((a, b) => {
    if (a.keyword !== b.keyword) return a.keyword.localeCompare(b.keyword);
    return a.date.localeCompare(b.date);
  });
}

// 获取某个关键词在某天的数据
export function getKeywordDateData(data, keyword, date) {
  return data.find((d) => d.keyword === keyword && d.date === date) || null;
}

// 获取前一天日期字符串
function getPrevDate(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// 获取后一天日期字符串
function getNextDate(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// 生成日期范围内的所有日期
function getDateRange(days, endDate = null) {
  const dates = [];
  const end = endDate ? new Date(endDate) : new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// 获取数据中所有唯一日期
export function getAllDates(data) {
  const dates = new Set();
  data.forEach((d) => dates.add(d.date));
  return [...dates].sort();
}

// 获取数据中所有唯一关键词
export function getAllKeywords(data) {
  const keywords = new Set();
  data.forEach((d) => keywords.add(d.keyword));
  return [...keywords].sort();
}

// 获取数据中所有唯一ASIN
export function getAllAsins(data) {
  const asins = new Set();
  data.forEach((d) => asins.add(d.asin));
  return [...asins].sort();
}

// 获取最新日期
export function getLatestDate(data) {
  const dates = getAllDates(data);
  return dates[dates.length - 1];
}

/**
 * 核心计算：为每条数据计算日环比变化和趋势方向
 * 返回增强后的数据数组
 */
export function enrichData(data) {
  const sorted = sortData(data);
  const keywordMap = {};

  // 按关键词分组
  sorted.forEach((d) => {
    if (!keywordMap[d.keyword]) keywordMap[d.keyword] = [];
    keywordMap[d.keyword].push(d);
  });

  const enriched = [];

  Object.entries(keywordMap).forEach(([keyword, records]) => {
    // 按日期排序
    records.sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 0; i < records.length; i++) {
      const today = records[i];
      const prev = records[i - 1] || null;

      const isSP = today.adType === 'SP';
      const todayNat = today['绝对位置'] >= NOT_FOUND_RANK ? null : today['绝对位置'];
      const todaySp = (isSP && today['绝对位置(含ad)'] < NOT_FOUND_RANK) ? today['绝对位置(含ad)'] : null;
      const prevNat = prev ? (prev['绝对位置'] >= NOT_FOUND_RANK ? null : prev['绝对位置']) : null;
      const prevSp = (isSP && prev && prev['绝对位置(含ad)'] < NOT_FOUND_RANK) ? prev['绝对位置(含ad)'] : null;
      const naturalChange = (prevNat !== null && todayNat !== null) ? prevNat - todayNat : null;
      const spChange = (prevSp !== null && todaySp !== null) ? prevSp - todaySp : null;

      const naturalTrend =
        naturalChange === null ? '-' :
        naturalChange > 0 ? '上升' :
        naturalChange < 0 ? '下降' : '持平';

      const spTrend =
        spChange === null ? '-' :
        spChange > 0 ? '上升' :
        spChange < 0 ? '下降' : '持平';

      enriched.push({
        ...today,
        日环比变化_自然: naturalChange,
        日环比变化_SP: spChange,
        趋势方向_自然: naturalTrend,
        趋势方向_SP: spTrend,
        是否首页_自然: today['绝对位置'] <= FIRST_PAGE_THRESHOLD,
        是否首页_SP: today['绝对位置(含ad)'] <= FIRST_PAGE_THRESHOLD,
      });
    }
  });

  return enriched;
}

/**
 * 获取今日快照数据
 * 每个关键词的最新一条记录
 */
export function getTodaySnapshot(enrichedData, date = null) {
  const targetDate = date || getLatestDate(enrichedData);
  return enrichedData.filter((d) => d.date === targetDate);
}

/**
 * KPI 计算
 */
export function computeKPIs(snapshot) {
  const naturalUp = snapshot.filter((d) => d.日环比变化_自然 > 0).length;
  const naturalDown = snapshot.filter((d) => d.日环比变化_自然 < 0).length;
  const spUp = snapshot.filter((d) => d.日环比变化_SP > 0).length;
  const spDown = snapshot.filter((d) => d.日环比变化_SP < 0).length;
  const naturalFirstPage = snapshot.filter((d) => d.是否首页_自然).length;

  return { naturalUp, naturalDown, spUp, spDown, naturalFirstPage };
}

/**
 * 获取排行榜数据
 */
export function getRankingList(snapshot, field, order = 'desc') {
  const filtered = snapshot.filter((d) => {
    if (order === 'desc') return d[field] > 0;
    return d[field] < 0;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (order === 'desc') return b[field] - a[field];
    return a[field] - b[field];
  });

  return sorted.slice(0, 10);
}

/**
 * 获取某关键词的N天趋势数据
 */
export function getKeywordTrend(enrichedData, keyword, days = 30, endDate = null) {
  const dates = getDateRange(days, endDate);
  const keywordData = enrichedData.filter((d) => d.keyword === keyword);

  return dates
    .map((date) => {
      const record = keywordData.find((d) => d.date === date);
      if (!record) return null;
      const isSP = record.adType === 'SP';
      const nat = record['绝对位置'] >= NOT_FOUND_RANK ? null : record['绝对位置'];
      const sp = (isSP && record['绝对位置(含ad)'] < NOT_FOUND_RANK) ? record['绝对位置(含ad)'] : null;
      return {
        date,
        自然排名: nat,
        SP排名: sp,
        绝对位置: nat,
        '绝对位置(含ad)': sp,
      };
    })
    .filter(Boolean);
}

/**
 * 计算7天连续变化数据
 * 连续7天的变化 >=0 或 <=0
 */
export function getSevenDayChanges(enrichedData) {
  const keywords = getAllKeywords(enrichedData);
  const results = [];

  keywords.forEach((keyword) => {
    const records = enrichedData
      .filter((d) => d.keyword === keyword)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (records.length < 8) return;

    // 取最近7天（包含今天）
    const last7 = records.slice(-7);

    const naturalChanges = last7.map((d) => d.日环比变化_自然).filter((v) => v !== null);
    const spChanges = last7.map((d) => d.日环比变化_SP).filter((v) => v !== null);

    // 自然排名 - 连续7天变化同向
    if (naturalChanges.length >= 7) {
      const allUp = naturalChanges.every((c) => c >= 0);
      const allDown = naturalChanges.every((c) => c <= 0);
      if (allUp || allDown) {
        const sevenDaysAgo = records[records.length - 8];
        const today = records[records.length - 1];
        const totalChange = sevenDaysAgo['绝对位置'] - today['绝对位置'];

        const miniTrend = last7.map((d) => ({
          date: d.date,
          rank: d['绝对位置'],
        }));

        results.push({
          keyword,
          type: '自然',
          direction: allUp ? '上升' : '下降',
          totalChange,
          sevenDaysAgoRank: sevenDaysAgo['绝对位置'],
          todayRank: today['绝对位置'],
          miniTrend,
          abaRank: today['ABA周排名'],
          monthlySearchVolume: today['月搜索量'],
        });
      }
    }

    // SP排名 - 连续7天变化同向
    if (spChanges.length >= 7) {
      const allUp = spChanges.every((c) => c >= 0);
      const allDown = spChanges.every((c) => c <= 0);
      if (allUp || allDown) {
        const sevenDaysAgo = records[records.length - 8];
        const today = records[records.length - 1];
        const totalChange = sevenDaysAgo['绝对位置(含ad)'] - today['绝对位置(含ad)'];

        const miniTrend = last7.map((d) => ({
          date: d.date,
          rank: d['绝对位置(含ad)'],
        }));

        results.push({
          keyword,
          type: 'SP',
          direction: allUp ? '上升' : '下降',
          totalChange,
          sevenDaysAgoRank: sevenDaysAgo['绝对位置(含ad)'],
          todayRank: today['绝对位置(含ad)'],
          miniTrend,
          abaRank: today['ABA周排名'],
          monthlySearchVolume: today['月搜索量'],
        });
      }
    }
  });

  return results;
}

/**
 * 获取今日排名变化幅度最大的关键词
 */
export function getBiggestMover(enrichedData) {
  const snapshot = getTodaySnapshot(enrichedData);
  let maxChange = 0;
  let maxKeyword = null;

  snapshot.forEach((d) => {
    if (d.日环比变化_自然 !== null && Math.abs(d.日环比变化_自然) > maxChange) {
      maxChange = Math.abs(d.日环比变化_自然);
      maxKeyword = d.keyword;
    }
  });

  return maxKeyword || (snapshot.length > 0 ? snapshot[0].keyword : null);
}

/**
 * ABA排名分组
 */
export function getAbaGroup(abaRank, thresholds = { big: 20000, medium: 50000 }) {
  if (abaRank <= thresholds.big) return '大词';
  if (abaRank <= thresholds.medium) return '中词';
  return '小词';
}

/**
 * 筛选数据
 */
export function filterData(enrichedData, { dateRange, keyword, asin } = {}) {
  let result = [...enrichedData];

  if (dateRange && dateRange.length === 2) {
    result = result.filter(
      (d) => d.date >= dateRange[0] && d.date <= dateRange[1]
    );
  }

  if (keyword) {
    result = result.filter((d) => d.keyword === keyword);
  }

  if (asin) {
    result = result.filter((d) => d.asin === asin);
  }

  return result;
}

export { FIRST_PAGE_THRESHOLD, NOT_FOUND_RANK };
