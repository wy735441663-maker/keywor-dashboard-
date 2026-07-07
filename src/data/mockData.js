// 文档中列出的关键词列表（ASIN: B0FQBVGWH4, 产品: coat rack）
const KEYWORDS = [
  'coat rack', 'clothes rack', 'clothing rack', 'clothing racks for hanging clothes',
  'portable closet', 'clothes racks for hanging clothes', 'garment rack', 'closet rack',
  'heavy duty clothes rack', 'percheros para colgar ropa', 'portable clothes rack',
  'rolling clothes rack', 'wardrobe rack', 'laundry rack', 'coat racks',
  'rack for clothes to hang', 'clothing rack with wheels', 'portable closets for hanging clothes',
  'kids clothing rack', 'clothes rack heavy duty', 'hanging rack', 'hanging clothes rack',
  'clothes hanging rack', 'clothing racks', 'hanger rack', 'clothing rack with shelves',
  'clothes rack with shelves', 'perchero', 'garment racks for hanging clothes', 'dress up rack',
  'clothes rack with wheels', 'hanging racks for clothes', 'garment racks', 'small clothing rack',
  'clothes hanger rack', 'small clothes rack', 'rolling rack for clothes', 'heavy duty coat rack',
  'clothing rack heavy duty', 'heavy duty clothing rack', 'rolling clothes rack heavy duty',
  'standing closet', 'rolling rack', 'clothes racks', 'jacket rack', 'portable clothing rack',
  'closet racks for hanging clothes', 'colgador de ropa', 'rolling clothing rack', 'cloth rack',
  'collapsible clothing rack', 'metal clothes racks', 'freestanding clothes racks', 'rolling coat rack',
  'standing clothes rack', 'metal coat rack', 'free standing clothing rack', 'clothing standing rack',
  'metal clothing rack', 'laundry hanging rack', 'closet racks', 'rolling garment rack',
  'rack for clothes', 'hanging coat rack', 'racks for clothes', 'sturdy clothes rack heavy duty',
  'clothes stand', 'laundry room hanging rack', 'clothing rolling rack', 'double clothing rack',
  'black clothing rack', 'industrial clothing rack', 'hanger stand', 'perchero para ropa',
  'hanging rods for clothes', 'dress up clothes rack', 'baby clothing rack', 'stand up closet',
  'toddler clothing rack', 'cloth hanger rack stand', 'free standing clothes rack',
  'heavy duty garment rack', 'portable coat rack', 'foldable clothing rack', 'clothes rack small',
  'para colgar ropa', 'cloths rack', 'short clothing rack', 'double rod clothing rack',
  'garmet rack', 'coat hanger rack', 'clothes rack on wheels', 'hanger rack stand',
  'clothing rack small', 'rolling hanging clothes rack', 'close rack', 'closets for hanging clothes',
  'rolling racks for hanging clothes', 'clothing hanging stand', 'rolling closet', 'estante para ropa',
  'portable hanging rack for clothes', 'cloth rack stand', 'double clothes rack', 'shirt rack',
  'metal clothes rack', 'collapsible clothes rack', 'clothes hanging rack with wheels',
  'adjustable clothing rack', 'clothes rack for bedroom', 'dress rack', 'rolling wardrobe rack',
  'hanging racks for clothes heavy duty', 'heavy duty rolling clothes rack',
];

const ASIN = 'B0FQBVGWH4';

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateMonthlySearchVolume(rand) {
  const tiers = [
    { range: [500, 2000], weight: 0.15 },
    { range: [2000, 8000], weight: 0.25 },
    { range: [8000, 20000], weight: 0.30 },
    { range: [20000, 50000], weight: 0.20 },
    { range: [50000, 150000], weight: 0.10 },
  ];
  const r = rand();
  let cumulative = 0;
  for (const tier of tiers) {
    cumulative += tier.weight;
    if (r <= cumulative) {
      return Math.floor(tier.range[0] + rand() * (tier.range[1] - tier.range[0]));
    }
  }
  return 5000;
}

function generateBaseRank(rand) {
  const r = rand();
  if (r < 0.15) return Math.floor(rand() * 10) + 1;
  if (r < 0.35) return Math.floor(rand() * 20) + 3;
  if (r < 0.55) return Math.floor(rand() * 30) + 5;
  if (r < 0.75) return Math.floor(rand() * 60) + 10;
  return Math.floor(rand() * 150) + 30;
}

function generateAbaRank(rand, searchVolume) {
  if (searchVolume > 50000) return Math.floor(rand() * 15000) + 1000;
  if (searchVolume > 20000) return Math.floor(rand() * 25000) + 5000;
  if (searchVolume > 8000) return Math.floor(rand() * 30000) + 20000;
  return Math.floor(rand() * 50000) + 50000;
}

function generatePurchaseRate(rand) {
  return parseFloat((rand() * 0.15 + 0.01).toFixed(3));
}

function getDateStr(date) {
  return date.toISOString().split('T')[0];
}

export function generateMockData() {
  const data = [];
  const now = new Date();
  const seedBase = 42;

  for (let ki = 0; ki < KEYWORDS.length; ki++) {
    const kw = KEYWORDS[ki];
    const rand = seededRandom(seedBase + ki * 7);
    const searchVolume = generateMonthlySearchVolume(rand);
    const abaRank = generateAbaRank(rand, searchVolume);
    const purchaseRate = generatePurchaseRate(rand);
    const baseNaturalRank = generateBaseRank(rand);
    const baseSpRank = generateBaseRank(rand);

    for (let d = 29; d >= 0; d--) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      const dateStr = getDateStr(date);

      const dayRand = seededRandom(seedBase + ki * 7 + d * 3);
      const naturalFluctuation = Math.round((dayRand() - 0.5) * 6);
      const spFluctuation = Math.round((dayRand() - 0.5) * 8);

      let naturalRank = baseNaturalRank + Math.round((dayRand() - 0.5) * 8);
      if (d > 20) naturalRank += Math.round(dayRand() * 5);
      naturalRank += naturalFluctuation;
      naturalRank = Math.max(1, Math.min(300, naturalRank));

      let spRank = baseSpRank + Math.round((dayRand() - 0.5) * 10);
      if (d > 20) spRank += Math.round(dayRand() * 6);
      spRank += spFluctuation;
      spRank = Math.max(1, Math.min(200, spRank));

      const dailySearchVol = searchVolume + Math.round((dayRand() - 0.5) * 200);

      data.push({
        date: dateStr,
        asin: ASIN,
        keyword: kw,
        绝对位置: naturalRank,
        '绝对位置(含ad)': spRank,
        月搜索量: Math.max(100, dailySearchVol),
        ABA周排名: abaRank,
        购买率: parseFloat((purchaseRate + (dayRand() - 0.5) * 0.005).toFixed(3)),
      });
    }
  }

  return data;
}

export function getKeywords() {
  return KEYWORDS.map((kw) => ({
    keyword: kw,
    asin: ASIN,
    owner: '',
  }));
}

export default generateMockData;
