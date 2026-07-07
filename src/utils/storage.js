const STORAGE_KEYS = {
  RAW_DATA: 'kd_raw_data',
  CONFIG: 'kd_config',
  ABA_THRESHOLDS: 'kd_aba_thresholds',
};

export function saveRawData(data) {
  try {
    localStorage.setItem(STORAGE_KEYS.RAW_DATA, JSON.stringify(data));
  } catch (e) {
    console.error('数据存储失败，可能数据量过大', e);
  }
}

export function loadRawData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RAW_DATA);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('数据读取失败', e);
    return null;
  }
}

export function saveConfig(config) {
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIG);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveAbaThresholds(thresholds) {
  localStorage.setItem(STORAGE_KEYS.ABA_THRESHOLDS, JSON.stringify(thresholds));
}

export function loadAbaThresholds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ABA_THRESHOLDS);
    return raw ? JSON.parse(raw) : { big: 20000, medium: 50000 };
  } catch (e) {
    return { big: 20000, medium: 50000 };
  }
}

export function clearAllData() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}
