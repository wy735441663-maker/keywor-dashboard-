import Papa from 'papaparse';

/**
 * 解析卖家精灵导出的CSV文件
 * 映射CSV列名到系统内部字段名
 */
const FIELD_MAPPING = {
  '日期': 'date',
  '关键词': 'keyword',
  '绝对位置': '绝对位置',
  '绝对位置(含ad)': '绝对位置(含ad)',
  '月搜索量': '月搜索量',
  'ABA周排名': 'ABA周排名',
  '购买率': '购买率',
  'ASIN': 'asin',
};

const REVERSE_MAPPING = Object.fromEntries(
  Object.entries(FIELD_MAPPING).map(([k, v]) => [v, k])
);

export function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete: (results) => {
        try {
          const data = mapFields(results.data);
          resolve(data);
        } catch (e) {
          reject(e);
        }
      },
      error: (err) => reject(err),
    });
  });
}

function mapFields(rows) {
  return rows
    .filter((row) => {
      const keys = Object.keys(row);
      return keys.length > 1 && keys.some((k) => row[k] && row[k].trim());
    })
    .map((row) => {
      const mapped = {};

      // 尝试自动映射：先检查CSV列名是否匹配我们的中文列名
      for (const [csvCol, value] of Object.entries(row)) {
        const trimmed = (value || '').trim();

        if (FIELD_MAPPING[csvCol]) {
          // 按映射表处理
          const internalField = FIELD_MAPPING[csvCol];
          if (['绝对位置', '绝对位置(含ad)', '月搜索量', 'ABA周排名'].includes(internalField)) {
            mapped[internalField] = parseInt(trimmed, 10) || 0;
          } else if (internalField === '购买率') {
            mapped[internalField] = parseFloat(trimmed) || 0;
          } else {
            mapped[internalField] = trimmed;
          }
        } else {
          // 未映射的列，保留原始名
          mapped[csvCol] = trimmed;
        }
      }

      return mapped;
    });
}

/**
 * 导出数据为CSV（用于下载/备份）
 */
export function exportCSV(data) {
  const headers = ['日期', '关键词', '绝对位置', '绝对位置(含ad)', '月搜索量', 'ABA周排名', '购买率', 'ASIN'];
  const rows = data.map((d) =>
    headers.map((h) => {
      const field = FIELD_MAPPING[h] || h;
      return d[field] !== undefined ? d[field] : '';
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}
