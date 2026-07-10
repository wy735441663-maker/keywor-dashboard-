const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const chokidar = require('chokidar');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const storage = require('./storage.cjs');
// scraper 只在本地 Windows 环境可用，云端不需要
let scrapeKeywords = null;
try { ({ scrapeKeywords } = require('./scraper.cjs')); } catch (e) { console.log('[INFO] scraper 不可用（云端正常）'); }
const { computeAnalysis, generatePrompt } = require('./analysis.cjs');

// 文件监听：自动导入 CSV
const INBOX_DIR = path.join(__dirname, 'data-inbox');
const IMPORTED_DIR = path.join(INBOX_DIR, '.imported');
fs.mkdirSync(INBOX_DIR, { recursive: true });
fs.mkdirSync(IMPORTED_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());

// 托管前端静态文件（生产模式）
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback: 所有非 API 路由返回 index.html
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ===================== Projects API =====================

app.get('/api/projects', (req, res) => {
  res.json(storage.getProjects());
});

app.post('/api/projects', (req, res) => {
  const { name, asin, keywords, owner } = req.body;
  if (!name || !asin || !keywords || keywords.length === 0) {
    return res.status(400).json({ error: '项目名称、ASIN 和关键词不能为空' });
  }

  const projects = storage.getProjects();
  const project = {
    id: uuidv4(),
    name,
    asin,
    keywords: Array.isArray(keywords) ? keywords : keywords.split('\n').map((k) => k.trim()).filter(Boolean),
    owner: owner || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  projects.push(project);
  storage.saveProjects(projects);
  res.json(project);
});

app.put('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  const { name, asin, keywords, owner } = req.body;
  const projects = storage.getProjects();
  const idx = projects.findIndex((p) => p.id === id);

  if (idx === -1) return res.status(404).json({ error: '项目不存在' });

  projects[idx] = {
    ...projects[idx],
    name: name ?? projects[idx].name,
    asin: asin ?? projects[idx].asin,
    keywords: keywords ?? projects[idx].keywords,
    owner: owner ?? projects[idx].owner,
    updatedAt: new Date().toISOString(),
  };

  storage.saveProjects(projects);
  res.json(projects[idx]);
});

app.delete('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  let projects = storage.getProjects();
  projects = projects.filter((p) => p.id !== id);
  storage.saveProjects(projects);
  storage.clearProjectData(id);
  res.json({ success: true });
});

// ===================== Scrape API =====================

// Track running jobs
const runningJobs = new Map();

app.post('/api/projects/:id/scrape', async (req, res) => {
  const { id } = req.params;
  const project = storage.getProject(id);

  if (!project) return res.status(404).json({ error: '项目不存在' });

  if (runningJobs.has(id)) {
    return res.status(409).json({ error: '该项目正在抓取中', jobId: runningJobs.get(id) });
  }

  const jobId = uuidv4();
  runningJobs.set(id, jobId);

  const log = {
    jobId,
    projectId: id,
    projectName: project.name,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    progress: [],
    rowCount: 0,
    error: null,
  };
  storage.addScrapeLog(log);

  // Respond immediately
  res.json({ jobId, message: '抓取任务已启动' });

  // Run scraper async
  try {
    const progressLog = [];
    const data = await scrapeKeywords(project, (msg) => {
      progressLog.push(`${new Date().toISOString()} ${msg}`);
      storage.updateScrapeLog(jobId, { progress: [...progressLog] });
    });

    // Save scraped data
    storage.saveRankingData(data);

    storage.updateScrapeLog(jobId, {
      status: 'success',
      finishedAt: new Date().toISOString(),
      progress: progressLog,
      rowCount: data.length,
    });
  } catch (err) {
    storage.updateScrapeLog(jobId, {
      status: 'failed',
      finishedAt: new Date().toISOString(),
      progress: [...(log.progress || []), `错误: ${err.message}`],
      error: err.message,
    });
  } finally {
    runningJobs.delete(id);
  }
});

app.get('/api/scrape/status/:jobId', (req, res) => {
  const logs = storage.getScrapeLogs();
  const log = logs.find((l) => l.jobId === req.params.jobId);
  if (!log) return res.status(404).json({ error: '任务不存在' });
  res.json(log);
});

app.get('/api/scrape/logs', (req, res) => {
  const logs = storage.getScrapeLogs();
  const limit = parseInt(req.query.limit) || 50;
  res.json(logs.slice(0, limit));
});

// Check if a project is currently scraping
app.get('/api/projects/:id/scrape-status', (req, res) => {
  const { id } = req.params;
  const logs = storage.getScrapeLogs();
  const latest = logs.find((l) => l.projectId === id);
  res.json({
    isRunning: runningJobs.has(id),
    latestLog: latest || null,
  });
});

// ===================== Data API =====================

// 合并后的排名数据（写入 /tmp，不受部署影响）
app.get('/api/merged-data', (req, res) => {
  const tmpPath = '/tmp/merged-data.json';
  if (fs.existsSync(tmpPath)) {
    res.sendFile(tmpPath);
  } else {
    // 回退到 dist 中的静态文件（如果有）
    const distPath = path.join(distDir, 'merged-data.json');
    if (fs.existsSync(distPath)) {
      res.sendFile(distPath);
    } else {
      res.json([]);
    }
  }
});

app.get('/api/data', (req, res) => {
  const { projectId } = req.query;
  if (projectId) {
    res.json(storage.getProjectRankingData(projectId));
  } else {
    res.json(storage.getAllRankingData());
  }
});

app.get('/api/data/all', (req, res) => {
  // Return all data across all projects (for dashboard)
  res.json(storage.getAllRankingData());
});

app.delete('/api/data/:projectId', (req, res) => {
  storage.clearProjectData(req.params.projectId);
  res.json({ success: true });
});

// ===================== Schedule API =====================

app.get('/api/schedule', (req, res) => {
  res.json(storage.getSchedule());
});

app.put('/api/schedule', (req, res) => {
  const { enabled, cron: cronExpr } = req.body;
  storage.updateSchedule({ enabled, cron: cronExpr });
  setupCronJob();
  res.json(storage.getSchedule());
});

// ===================== Run All Projects =====================

app.post('/api/scrape/run-all', async (req, res) => {
  const projects = storage.getProjects();
  if (projects.length === 0) {
    return res.status(400).json({ error: '没有项目可运行' });
  }

  // Check if any project is already running
  if (runningJobs.size > 0) {
    return res.status(409).json({ error: '有项目正在抓取中，请等待完成' });
  }

  res.json({ message: `已开始抓取 ${projects.length} 个项目`, projectCount: projects.length });

  for (const project of projects) {
    const jobId = uuidv4();
    runningJobs.set(project.id, jobId);

    const log = {
      jobId,
      projectId: project.id,
      projectName: project.name,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      progress: [],
      rowCount: 0,
      error: null,
    };
    storage.addScrapeLog(log);

    try {
      const progressLog = [];
      const data = await scrapeKeywords(project, (msg) => {
        progressLog.push(`${new Date().toISOString()} ${msg}`);
        storage.updateScrapeLog(jobId, { progress: [...progressLog] });
      });
      storage.saveRankingData(data);
      storage.updateScrapeLog(jobId, {
        status: 'success',
        finishedAt: new Date().toISOString(),
        progress: progressLog,
        rowCount: data.length,
      });
    } catch (err) {
      storage.updateScrapeLog(jobId, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        error: err.message,
      });
    } finally {
      runningJobs.delete(project.id);
    }
  }
});

// ===================== Cron Job =====================

let cronJob = null;

function setupCronJob() {
  if (cronJob) cronJob.stop();

  const schedule = storage.getSchedule();
  if (!schedule.enabled) return;

  cronJob = cron.schedule(schedule.cron, async () => {
    console.log(`[${new Date().toISOString()}] 定时抓取任务触发`);

    const projects = storage.getProjects();
    for (const project of projects) {
      if (runningJobs.has(project.id)) {
        console.log(`  跳过 ${project.name}: 已在运行中`);
        continue;
      }

      const jobId = uuidv4();
      runningJobs.set(project.id, jobId);

      const log = {
        jobId,
        projectId: project.id,
        projectName: project.name,
        status: 'running',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        progress: [],
        rowCount: 0,
        error: null,
      };
      storage.addScrapeLog(log);

      try {
        const progressLog = [];
        const data = await scrapeKeywords(project, (msg) => {
          progressLog.push(`${new Date().toISOString()} ${msg}`);
          storage.updateScrapeLog(jobId, { progress: [...progressLog] });
        });
        storage.saveRankingData(data);
        storage.updateScrapeLog(jobId, {
          status: 'success',
          finishedAt: new Date().toISOString(),
          progress: progressLog,
          rowCount: data.length,
        });
      } catch (err) {
        storage.updateScrapeLog(jobId, {
          status: 'failed',
          finishedAt: new Date().toISOString(),
          error: err.message,
        });
      } finally {
        runningJobs.delete(project.id);
      }
    }

    storage.updateSchedule({ lastRun: new Date().toISOString() });
  }, {
    timezone: 'Asia/Shanghai',
  });

  console.log(`定时任务已设置: ${schedule.cron} (北京时间)`);
}

// ===================== File Watcher: 自动导入 CSV =====================

function parseCSVContent(content) {
  const lines = content.replace(/^﻿/, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const mapField = (h) => {
    const m = { '日期':'date', '关键词':'keyword', '绝对位置':'绝对位置', '绝对位置(含ad)':'绝对位置(含ad)', '月搜索量':'月搜索量', 'ABA周排名':'ABA周排名', '购买率':'购买率', 'ASIN':'asin' };
    if (m[h]) return m[h];
    for (const [k,v] of Object.entries(m)) if (h.includes(k)||k.includes(h)) return v;
    return null;
  };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    if (vals.length < 3) continue;
    const row = {};
    headers.forEach((h, j) => { const f = mapField(h); if (f) row[f] = vals[j] || ''; });
    if (row.date && row.keyword) {
      row['绝对位置'] = parseInt(row['绝对位置']) || 0;
      row['绝对位置(含ad)'] = parseInt(row['绝对位置(含ad)']) || 0;
      row['月搜索量'] = parseInt(row['月搜索量']) || 0;
      row['ABA周排名'] = parseInt(row['ABA周排名']) || 0;
      row['购买率'] = parseFloat(row['购买率']) || 0;
      rows.push(row);
    }
  }
  return rows;
}

const importedFiles = new Set();

function scanInbox() {
  try {
    const files = fs.readdirSync(INBOX_DIR).filter(f => f.endsWith('.csv') && !importedFiles.has(f));
    for (const filename of files) {
      const filePath = path.join(INBOX_DIR, filename);
      // 跳过正在写入的文件
      try { fs.accessSync(filePath, fs.constants.R_OK); } catch { continue; }

      console.log(`[收件箱] 发现新文件: ${filename}`);
      importedFiles.add(filename);

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const rows = parseCSVContent(content);

        if (rows.length === 0) {
          console.log(`[收件箱] ${filename}: 无有效数据行，跳过`);
          continue;
        }

        // 尝试匹配项目
        const firstAsin = rows[0].asin;
        const projects = storage.getProjects();
        let matchedProject = projects.find(p => p.asin === firstAsin);

        if (!matchedProject) {
          const keywords = [...new Set(rows.map(r => r.keyword))];
          matchedProject = {
            id: uuidv4(),
            name: `导入_${firstAsin}_${new Date().toISOString().split('T')[0]}`,
            asin: firstAsin,
            keywords,
            owner: 'auto-import',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          projects.push(matchedProject);
          storage.saveProjects(projects);
          console.log(`[收件箱] 自动创建项目: ${matchedProject.name}`);
        }

        const enriched = rows.map(r => ({ ...r, projectId: matchedProject.id, asin: matchedProject.asin }));
        storage.saveRankingData(enriched);

        // 移动到已导入目录
        const dest = path.join(IMPORTED_DIR, filename);
        const destUnique = fs.existsSync(dest) ? dest.replace('.csv', `_${Date.now()}.csv`) : dest;
        fs.renameSync(filePath, destUnique);

        const jobId = uuidv4();
        storage.addScrapeLog({
          jobId, projectId: matchedProject.id, projectName: matchedProject.name,
          status: 'success', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
          progress: [`从文件 ${filename} 自动导入 ${enriched.length} 条数据`],
          rowCount: enriched.length, error: null,
        });

        console.log(`[收件箱] ✅ 导入: ${enriched.length} 条 → "${matchedProject.name}"`);
      } catch (err) {
        console.error(`[收件箱] 导入失败 ${filename}: ${err.message}`);
        importedFiles.delete(filename);
      }
    }
  } catch (err) {
    // ignore directory listing errors
  }
}

// Excel 数据源文件夹监听
const SELLER_DATA_DIR = process.env.SELLER_DATA_DIR || 'C:\\Users\\Administrator\\Desktop\\文件夹\\AI学习\\try\\卖家精灵下载数据';
const UPLOAD_DIR = process.env.UPLOAD_DIR || SELLER_DATA_DIR;

// multer: 接收影刀上传的 Excel
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      // 保持原文件名，同名覆盖加时间戳
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext);
      const safe = base.replace(/[^a-zA-Z0-9_\-一-鿿]/g, '_');
      cb(null, `${safe}_${Date.now()}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('只接受 .xlsx / .xls / .csv 文件'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});
let lastMergeCount = 0;

function runMergeScript() {
  const { spawn } = require('child_process');
  const env = { ...process.env, SELLER_DATA_DIR, OUTPUT_DIR: distDir };
  const py = spawn('python3', [path.join(__dirname, 'merge_excel.py')], { env });
  let out = '';
  py.stdout.on('data', d => out += d.toString());
  py.stderr.on('data', d => out += d.toString());
  py.on('close', () => {
    const lines = out.trim().split('\n');
    const last = lines.pop() || '';
    console.log(`[数据合并] ${last}`);
  });
}

// Excel 文件夹轮询（每30秒检查新文件）
let knownExcelFiles = new Set();
function scanSellerData() {
  try {
    const files = fs.readdirSync(SELLER_DATA_DIR).filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'));
    const current = new Set(files);
    const hasNew = files.some(f => !knownExcelFiles.has(f));
    knownExcelFiles = current;
    if (hasNew) {
      console.log(`[数据合并] 检测到新 Excel，自动合并...`);
      runMergeScript();
    }
  } catch {}
}

function setupFileWatcher() {
  // 每5秒扫描 CSV 收件箱
  setInterval(scanInbox, 5000);
  console.log(`[收件箱] 监听目录 (5秒轮询): ${INBOX_DIR}`);

  // 每30秒扫描 Excel 数据文件夹
  setInterval(scanSellerData, 30000);
  // 启动时立即合并一次
  runMergeScript();
  console.log(`[数据合并] 监听目录: ${SELLER_DATA_DIR}`);
}

// ===================== Start Server =====================

const PORT = process.env.PORT || 3001;

// Inbox status
app.get('/api/inbox', (req, res) => {
  const files = fs.readdirSync(INBOX_DIR).filter(f => f.endsWith('.csv'));
  res.json({ inboxPath: INBOX_DIR, pendingFiles: files, importedCount: fs.readdirSync(IMPORTED_DIR).filter(f => f.endsWith('.csv')).length });
});

// 影刀上传 Excel
app.post('/api/upload-excel', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '未收到文件' });
  }
  const filename = req.file.filename;
  const originalname = req.file.originalname;
  console.log(`[上传] 收到: ${originalname} -> ${filename}`);

  // 立即触发合并
  runMergeScript();

  res.json({
    success: true,
    filename,
    originalname,
    size: req.file.size,
    uploadedAt: new Date().toISOString(),
  });
});

// 手动刷新合并数据
app.post('/api/refresh-data', (req, res) => {
  runMergeScript();
  res.json({ success: true, message: '正在合并...', count: lastMergeCount });
});

// AI 分析 API（流式）
app.post('/api/ai-analysis', async (req, res) => {
  try {
    const { endDate, projectName } = req.body;
    const data = require('./analysis.cjs').loadData();
    const analysis = computeAnalysis(data, endDate);
    const prompt = generatePrompt(analysis, projectName || '默认项目');

    // 设置 SSE 流式响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 先发送分析数据
    res.write(`data: ${JSON.stringify({ type: 'analysis', data: analysis })}\n\n`);

    // 延迟加载 SDK
    const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({
      baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
      apiKey: process.env.ANTHROPIC_AUTH_TOKEN || 'sk-168cfbd02e50402f887e2ea69883db2d',
    });

    const stream = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'deepseek-v4-pro[1m]',
      max_tokens: 2048,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        res.write(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    // 如果已经开始了 SSE，用 SSE 发送错误
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Excel 同步：调用 Python/openpyxl 写入（中文编码可靠）
const EXCEL_OUTPUT_DIR = process.env.EXCEL_OUTPUT_DIR || 'C:\\Users\\Administrator\\Desktop\\文件夹\\AI学习\\try\\项目名称';

app.post('/api/sync-excel', (req, res) => {
  const { spawn } = require('child_process');
  const projects = req.body;
  if (!Array.isArray(projects)) return res.status(400).json({ error: '无效数据' });

  // 写入临时文件避免编码问题
  const tmpFile = path.join(EXCEL_OUTPUT_DIR || path.join(__dirname, 'data'), '_sync_tmp.json');
  try { fs.mkdirSync(path.dirname(tmpFile), { recursive: true }); } catch {}
  fs.writeFileSync(tmpFile, JSON.stringify(projects, null, 2), 'utf-8');

  const py = spawn('python3', [path.join(__dirname, 'sync_excel.py'), tmpFile], {
    env: { ...process.env, EXCEL_OUTPUT_DIR }
  });

  let stdout = '', stderr = '';
  py.stdout.on('data', d => stdout += d.toString());
  py.stderr.on('data', d => stderr += d.toString());

  py.on('close', code => {
    try { fs.unlinkSync(tmpFile); } catch {}
    if (code !== 0) {
      console.error('[Excel] Python 错误:', stderr);
      return res.status(500).json({ error: stderr || '执行失败' });
    }
    try {
      const result = JSON.parse(stdout);
      console.log(`[Excel] 已更新 Excel_progame.xlsx: ${result.rows} 行, ${result.projects} 个项目`);
      res.json(result);
    } catch {
      res.json({ success: true, output: stdout });
    }
  });
});

app.listen(PORT, () => {
  console.log(`数据抓取服务已启动: http://localhost:${PORT}`);
  setupCronJob();
  setupFileWatcher();

  // 首次启动时初始化项目数据
  initDefaultProject();
});

function initDefaultProject() {
  const projects = storage.getProjects();
  if (projects.length === 0) {
    const defaultProject = {
      id: uuidv4(),
      name: '晾衣架',
      asin: 'B0FQBVGWH4',
      keywords: [
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
      ],
      owner: '嘻嘻',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.saveProjects([defaultProject]);
    console.log('已创建默认项目: 晾衣架');
  }
}
