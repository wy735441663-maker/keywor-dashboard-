const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const SCRAPE_LOGS_FILE = path.join(DATA_DIR, 'scrape_logs.json');
const RANKING_DATA_FILE = path.join(DATA_DIR, 'ranking_data.json');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(filepath, fallback = null) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return fallback;
}

function writeJSON(filepath, data) {
  ensureDir();
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

// Projects
function getProjects() {
  return readJSON(PROJECTS_FILE, []);
}

function saveProjects(projects) {
  writeJSON(PROJECTS_FILE, projects);
}

function getProject(id) {
  return getProjects().find((p) => p.id === id) || null;
}

// Scrape Logs
function getScrapeLogs() {
  return readJSON(SCRAPE_LOGS_FILE, []);
}

function addScrapeLog(log) {
  const logs = getScrapeLogs();
  logs.unshift(log);
  // Keep last 500 logs
  if (logs.length > 500) logs.length = 500;
  writeJSON(SCRAPE_LOGS_FILE, logs);
}

function updateScrapeLog(jobId, updates) {
  const logs = getScrapeLogs();
  const idx = logs.findIndex((l) => l.jobId === jobId);
  if (idx >= 0) {
    logs[idx] = { ...logs[idx], ...updates };
    writeJSON(SCRAPE_LOGS_FILE, logs);
  }
}

// Ranking Data (all scraped data from all projects)
function getAllRankingData() {
  return readJSON(RANKING_DATA_FILE, []);
}

function getProjectRankingData(projectId) {
  const all = getAllRankingData();
  return all.filter((d) => d.projectId === projectId);
}

function saveRankingData(data) {
  // Merge: remove old data for this project, add new
  const all = getAllRankingData();
  const projectId = data.length > 0 ? data[0].projectId : null;
  if (!projectId) return;

  // Remove data older than 90 days for this project
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const filtered = all.filter(
    (d) => !(d.projectId === projectId && d.date >= cutoffStr)
  );

  // Add new data
  const merged = [...filtered, ...data];
  writeJSON(RANKING_DATA_FILE, merged);
}

function clearProjectData(projectId) {
  const all = getAllRankingData();
  const filtered = all.filter((d) => d.projectId !== projectId);
  writeJSON(RANKING_DATA_FILE, filtered);
}

// Schedule
function getSchedule() {
  return readJSON(SCHEDULE_FILE, { enabled: true, cron: '0 9 * * *', lastRun: null, nextRun: null });
}

function updateSchedule(updates) {
  const current = getSchedule();
  writeJSON(SCHEDULE_FILE, { ...current, ...updates });
}

module.exports = {
  getProjects,
  saveProjects,
  getProject,
  getScrapeLogs,
  addScrapeLog,
  updateScrapeLog,
  getAllRankingData,
  getProjectRankingData,
  saveRankingData,
  clearProjectData,
  getSchedule,
  updateSchedule,
};
