const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CHROME_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const EXTENSION_ID = 'lnbmbgocenenhhhdojdielgnmeflbnfb';
const EXTENSION_PATH = `C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Extensions\\${EXTENSION_ID}\\5.0.2_0`;
const REAL_USER_DATA = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\User Data';

// 卖家精灵的独立页面
const COLLECTION_PAGE = `chrome-extension://${EXTENSION_ID}/collection/index.html`;
const LOGIN_PAGE = `chrome-extension://${EXTENSION_ID}/src/popup/index.html`;

const AMAZON_URL = 'https://www.amazon.com/';
const SELLER_SPRITE_EMAIL = 'JINKAI001';
const SELLER_SPRITE_PASSWORD = 'Jinkai@2025';

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      try { fs.copyFileSync(srcPath, destPath); } catch {}
    }
  }
}

function prepareTempProfile() {
  const tempDir = path.join(os.tmpdir(), `chrome-scrape-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // 复制扩展文件
  const extSrc = path.join(REAL_USER_DATA, 'Default', 'Extensions', EXTENSION_ID);
  const extDest = path.join(tempDir, 'Default', 'Extensions', EXTENSION_ID);
  if (fs.existsSync(extSrc)) copyDir(extSrc, extDest);

  // 复制扩展设置（保存登录状态）
  const settingsDirs = ['Local Extension Settings', 'Sync Extension Settings', 'IndexedDB', 'Local Storage'];
  const defaultDir = path.join(REAL_USER_DATA, 'Default');
  const tempDefaultDir = path.join(tempDir, 'Default');

  for (const dir of settingsDirs) {
    const src = path.join(defaultDir, dir);
    if (fs.existsSync(src)) {
      try { copyDir(src, path.join(tempDefaultDir, dir)); } catch {}
    }
  }

  // 复制 Preferences
  for (const f of ['Preferences', 'Secure Preferences']) {
    const fp = path.join(defaultDir, f);
    if (fs.existsSync(fp)) {
      try { fs.copyFileSync(fp, path.join(tempDefaultDir, f)); } catch {}
    }
  }

  return tempDir;
}

async function scrapeKeywords(project, onProgress = () => {}) {
  const { asin, keywords } = project;
  const log = (msg) => {
    console.log(`[Scraper] ${msg}`);
    onProgress(msg);
  };

  if (!fs.existsSync(EXTENSION_PATH)) {
    throw new Error('未找到卖家精灵扩展，请确认已安装');
  }

  log('准备浏览器环境...');
  const tempProfile = prepareTempProfile();

  let browser;
  try {
    log('启动Chrome...');
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      userDataDir: tempProfile,
      headless: false,
      defaultViewport: { width: 1440, height: 900 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--disable-blink-features=AutomationControlled',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    // 设置下载目录
    const downloadDir = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

    // 清空旧下载文件
    const oldFiles = fs.readdirSync(downloadDir).filter((f) => f.endsWith('.csv'));
    for (const f of oldFiles) {
      try { fs.unlinkSync(path.join(downloadDir, f)); } catch {}
    }

    const page = await browser.newPage();

    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
    });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // === 第一步：访问亚马逊 ===
    log('访问亚马逊...');
    await page.goto(AMAZON_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    log('等待页面加载稳定（10秒）...');
    await sleep(10000);

    // === 第二步：等待卖家精灵注入 ===
    // 卖家精灵需要时间激活其content script
    log('等待卖家精灵插件注入（30秒）...');
    for (let i = 0; i < 6; i++) {
      await sleep(5000);
      const detected = await safeEval(page, () => {
        return !!(document.querySelector('.el-button') || document.querySelector('[class*="sprite"]'));
      });
      if (detected) {
        log(`卖家精灵已检测到 (${(i+1)*5}秒)`);
        break;
      }
    }

    // === 第三步：尝试打开卖家精灵面板 ===
    log('尝试打开卖家精灵面板...');
    try {
      await safeClick(page, '.el-button', log);
      await sleep(3000);
    } catch {}

    // === 第四步：处理登录 ===
    const needsLogin = await safeEval(page, () => {
      const body = document.body?.innerText || '';
      return body.includes('登录') && body.includes('密码');
    });

    if (needsLogin) {
      log('需要登录卖家精灵...');
      try {
        await page.type('input[type="text"]', SELLER_SPRITE_EMAIL, { delay: 50 });
        await page.type('input[type="password"]', SELLER_SPRITE_PASSWORD, { delay: 50 });
        log('凭据已填写，点击登录...');
        await safeClick(page, 'button', log, '登录');
        await sleep(8000);
      } catch (e) {
        log(`自动登录失败: ${e.message}`);
      }
    }

    // === 第五步：在卖家精灵面板中查找关键词收录 ===
    log('查找关键词收录入口...');
    const kwToolFound = await safeEval(page, () => {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if ((el.textContent || '').includes('关键词收录')) {
          el.click();
          return true;
        }
      }
      return false;
    });

    if (!kwToolFound) {
      log('请在弹出的Chrome窗口中手动操作卖家精灵：');
      log('1. 如果看到登录框，请登录');
      log('2. 找到并点击"关键词收录"功能');
      log('3. 输入ASIN和关键词');
      log('4. 点击"检索"');
      log('5. 等待数据加载完成');
      log('等待120秒供手动操作...');
      await sleep(120000);
    } else {
      log('已点击关键词收录入口');
      await sleep(3000);

      // 填ASIN和关键词
      try {
        await page.type('input[type="text"]:not([readonly])', asin, { delay: 30 });
        log(`ASIN已填写: ${asin}`);
      } catch {}

      try {
        const kwText = keywords.join('\n');
        const textareas = await page.$$('textarea');
        if (textareas.length > 0) {
          await textareas[0].click({ clickCount: 3 });
          await textareas[0].type(kwText, { delay: 2 });
          log(`关键词已填写: ${keywords.length}个`);
        }
      } catch {}

      // 点击检索
      log('点击检索...');
      try { await safeClick(page, 'button', log, '检索'); } catch {}

      // 等待数据加载
      log('等待数据加载（卖家精灵需要较长时间）...');
      log('如果Chrome窗口显示验证码，请手动完成...');
      await sleep(120000); // 2分钟等待
    }

    // === 第四步：获取数据 ===
    // 先尝试点击下载按钮
    log('尝试下载数据...');
    const downloaded = await clickDownload(page, downloadDir, log);

    if (!downloaded) {
      // 备用方案：直接从页面提取表格数据
      log('下载未触发，尝试从页面直接提取数据...');
      const extractedData = await extractDataFromPage(page, project.id, asin, log);
      if (extractedData && extractedData.length > 0) {
        log(`从页面提取了 ${extractedData.length} 条数据`);
        return extractedData;
      }

      // 最后方案：等待手动下载
      log('请在Chrome窗口中手动点击下载，等待60秒...');
      const csvPath = await waitForDownload(downloadDir, 60000);
      if (csvPath) {
        const data = parseCSVData(csvPath, project.id);
        log(`从下载文件获取 ${data.length} 条数据`);
        return data;
      }

      throw new Error('未能获取数据，请检查卖家精灵页面');
    }

    const data = parseCSVData(downloaded, project.id);
    log(`抓取完成！${data.length} 条数据`);
    return data;

  } finally {
    if (browser) await browser.close().catch(() => {});
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch {}
  }
}

// ========== Helpers ==========

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function safeEval(page, fn, fallback = null) {
  try { return await page.evaluate(fn); }
  catch { return fallback; }
}

async function safeClick(page, selector, log, label = '') {
  try {
    const el = await page.$(selector);
    if (el) {
      await el.click();
      if (label) log(`已点击: ${label}`);
      return true;
    }
  } catch {}
  return false;
}

async function checkSSInjected(page) {
  // 卖家精灵V5在Amazon页面上注入的特征元素
  return await page.evaluate(() => {
    const html = document.body ? document.body.innerHTML : '';
    // 卖家精灵5.0的特征：使用Element Plus，可能通过Web Component或独立div注入
    return (
      html.includes('sellersprite') ||
      html.includes('卖家精灵') ||
      !!document.querySelector('[class*="sellersprite"]') ||
      !!document.querySelector('[class*="seller-sprite"]') ||
      !!document.querySelector('#sellersprite-app') ||
      !!document.querySelector('[data-sellersprite]') ||
      // Element Plus风格的浮动按钮
      !!document.querySelector('.el-button--primary')
    );
  });
}

async function checkSSLogin(page) {
  try {
    // 在卖家精灵面板中查看是否需要登录
    // 尝试打开卖家精灵面板
    return await page.evaluate(() => {
      // 查找登录相关提示
      const body = document.body.innerText || '';
      // 卖家精灵面板内可能有登录提示
      return !body.includes('卖家精灵会员') && !body.includes('已登录');
    });
  } catch { return false; }
}

async function navigateToSSKeywordTool(page, log) {
  try {
    // 策略1：查找页面上卖家精灵的浮动按钮并点击
    const clickedFloat = await page.evaluate(() => {
      // 卖家精灵的浮动图标通常在页面右侧或底部
      const allElements = document.querySelectorAll('div, img, button, span');
      for (const el of allElements) {
        const title = (el.title || '').toLowerCase();
        const alt = (el.alt || '').toLowerCase();
        const cls = (el.className || '').toLowerCase();
        if (title.includes('sellersprite') || title.includes('卖家精灵') ||
            alt.includes('sellersprite') || alt.includes('卖家精灵') ||
            cls.includes('sellersprite') || cls.includes('精灵')) {
          el.click();
          return true;
        }
      }
      return false;
    });

    if (clickedFloat) {
      log('已点击卖家精灵浮动按钮');
      await sleep(3000);
    }

    // 策略2：在卖家精灵面板中查找关键词收录
    const foundKWTool = await page.evaluate(() => {
      const allElements = document.querySelectorAll('div, span, a, li, button, p');
      for (const el of allElements) {
        const text = el.textContent || '';
        if (text.includes('关键词收录') || text.includes('关键词查询') || text.includes('Keyword Tracker')) {
          el.click();
          return true;
        }
      }
      // Element Plus tabs
      const tabs = document.querySelectorAll('.el-tabs__item, .el-menu-item');
      for (const tab of tabs) {
        if ((tab.textContent || '').includes('关键词收录') || (tab.textContent || '').includes('关键词')) {
          tab.click();
          return true;
        }
      }
      return false;
    });

    if (foundKWTool) {
      log('已进入关键词收录');
      await sleep(2000);
      return;
    }

    // 策略3：查找任何可点击的包含"收录"的元素
    const foundAny = await page.evaluate(() => {
      const els = document.querySelectorAll('*');
      for (const el of els) {
        if (el.onclick || el.getAttribute('@click') || el.getAttribute('v-on:click')) {
          const text = el.textContent || '';
          if (text.includes('收录')) {
            el.click();
            return true;
          }
        }
      }
      return false;
    });

    if (!foundKWTool && !foundAny) {
      log('未自动找到入口，请手动操作Chrome窗口。等待60秒...');
      log('请在卖家精灵面板中找到"关键词收录"功能并点击进入');
      await sleep(60000);
    }
  } catch (e) {
    log(`导航卖家精灵: ${e.message}`);
  }
}

async function handleLogin(page, log) {
  try {
    // 查找邮箱/用户名输入框
    const emailSelectors = [
      'input[type="text"]',
      'input[type="email"]',
      'input[placeholder*="邮箱"]',
      'input[placeholder*="账号"]',
      'input[placeholder*="email"]',
      'input[name="username"]',
      'input[name="email"]',
      '.el-input__inner[placeholder*="邮箱"]',
      '.el-input__inner[placeholder*="账号"]',
    ];

    for (const sel of emailSelectors) {
      const input = await page.$(sel);
      if (input) {
        await input.click({ clickCount: 3 });
        await input.type(SELLER_SPRITE_EMAIL, { delay: 50 });
        log('已填写邮箱');
        break;
      }
    }

    // 密码输入框
    const pwdInput = await page.$('input[type="password"], input[placeholder*="密码"], .el-input__inner[type="password"]');
    if (pwdInput) {
      await pwdInput.click({ clickCount: 3 });
      await pwdInput.type(SELLER_SPRITE_PASSWORD, { delay: 50 });
      log('已填写密码');
    }

    // 点击登录按钮
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button, .el-button');
      for (const b of btns) {
        if ((b.textContent || '').includes('登录') || (b.textContent || '').includes('Login')) {
          b.click();
          return;
        }
      }
    });

    log('登录请求已发送，等待...');
    await sleep(5000);
  } catch (e) {
    log(`登录处理: ${e.message}`);
  }
}

async function fillAsinInput(page, asin, log) {
  // Element Plus 的 el-input 通常包含 .el-input__inner
  const strategies = [
    // 通过placeholder查找
    () => page.$('input[placeholder*="ASIN"], input[placeholder*="asin"], input[placeholder*="Asin"]'),
    // 通过label文字查找
    async () => {
      const labels = await page.$$('.el-form-item__label, label, span');
      for (const label of labels) {
        const text = await page.evaluate((el) => el.textContent, label);
        if (text && text.toUpperCase().includes('ASIN')) {
          // 找到label旁边的input
          const parent = await label.evaluateHandle((el) => el.closest('.el-form-item, .form-item, .form-row, div'));
          const input = await parent.$('input');
          if (input) return input;
        }
      }
      return null;
    },
    // 通过Element Plus组件查找
    () => page.$('.el-input__inner'),
    // 第一个text input
    () => page.$('input[type="text"]:not([readonly]):not([disabled])'),
  ];

  for (const strategy of strategies) {
    const input = await strategy();
    if (input) {
      try {
        await input.click({ clickCount: 3 });
        await input.type(asin, { delay: 30 });
        log(`ASIN已填写: ${asin}`);
        return true;
      } catch {}
    }
  }
  return false;
}

async function fillKeywordsInput(page, keywords, log) {
  // 关键词通常在textarea或多行输入框中
  const text = keywords.join('\n');

  const strategies = [
    () => page.$('textarea'),
    () => page.$('textarea[placeholder*="关键词"], textarea[placeholder*="keyword"]'),
    () => page.$('.el-textarea__inner'),
    // 大的input
    async () => {
      const inputs = await page.$$('input[type="text"]');
      for (const inp of inputs) {
        const size = await inp.boundingBox();
        if (size && size.width > 300) return inp;
      }
      return null;
    },
  ];

  for (const strategy of strategies) {
    const input = await strategy();
    if (input) {
      try {
        await input.click({ clickCount: 3 });
        // 对于大量关键词，使用evaluate直接设置值更快
        await page.evaluate((el, val) => {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, input, text);
        log(`已填入 ${keywords.length} 个关键词`);
        return true;
      } catch {}
    }
  }
  return false;
}

async function clickSearchButton(page, log) {
  const searchTerms = ['检索', '查询', '搜索', '开始检索', '开始查询', 'Search', 'Query', '开始'];
  return await page.evaluate((terms) => {
    const btns = document.querySelectorAll('button, .el-button, a[role="button"]');
    for (const b of btns) {
      const text = (b.textContent || '').trim();
      for (const t of terms) {
        if (text === t || text.includes(t)) {
          b.click();
          return true;
        }
      }
    }
    return false;
  }, searchTerms);
}

async function waitForTableData(page, log) {
  const start = Date.now();
  // 先等30秒固定时间让搜索启动
  log('等待30秒让检索启动...');
  await sleep(30000);

  while (Date.now() - start < 180000) {
    await sleep(5000);
    const elapsed = Math.round((Date.now() - start) / 1000);

    const stats = await page.evaluate(() => {
      // 查找数据表格（Element Plus table / VXE Table）
      const tables = document.querySelectorAll('table, .el-table, .vxe-table, .el-table__body');
      let totalRows = 0;
      let hasDataRows = false;

      for (const t of tables) {
        const rows = t.querySelectorAll('tr, .el-table__row, .vxe-body--row');
        totalRows += rows.length;
        // 检查是否有包含数字的行（排名数据）
        for (const r of rows) {
          const text = r.textContent || '';
          if (/\d+/.test(text) && text.length > 10) {
            hasDataRows = true;
          }
        }
      }

      // 也检查是否有"共X条"这类分页信息
      const pagination = document.querySelector('.el-pagination, .vxe-pager, [class*="pagination"]');
      const paginationText = pagination ? pagination.textContent : '';

      return { totalRows, hasDataRows, paginationText };
    });

    log(`[${elapsed}s] 表格状态: ${stats.totalRows}行, 有数据=${stats.hasDataRows}, 分页=${stats.paginationText}`);

    if (stats.hasDataRows && stats.totalRows > 1) {
      log('检测到数据表格已加载');
      return true;
    }
  }
  return false;
}

async function clickDownload(page, downloadDir, log) {
  const downloadTerms = ['下载', '导出', 'Download', 'Export', 'CSV', 'Excel'];
  const clicked = await page.evaluate((terms) => {
    const elements = document.querySelectorAll('button, a, .el-button, span[class*="download"], i[class*="download"]');
    for (const el of elements) {
      const text = (el.textContent || '').trim();
      for (const t of terms) {
        if (text === t || text.includes(t)) {
          el.click();
          return true;
        }
      }
    }
    return false;
  }, downloadTerms);

  if (clicked) {
    return await waitForDownload(downloadDir, 15000);
  }
  return null;
}

async function waitForDownload(downloadDir, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await sleep(1000);
    const files = fs.readdirSync(downloadDir)
      .filter((f) => f.endsWith('.csv') || f.endsWith('.xlsx'))
      .map((f) => ({ name: f, time: fs.statSync(path.join(downloadDir, f)).mtimeMs }));
    if (files.length > 0) {
      return path.join(downloadDir, files.sort((a, b) => b.time - a.time)[0].name);
    }
  }
  return null;
}

async function extractDataFromPage(page, projectId, asin, log) {
  try {
    return await page.evaluate((pid, asinVal) => {
      const rows = [];
      const tables = document.querySelectorAll('table, .el-table, .vxe-table');

      for (const table of tables) {
        const headers = [];
        const ths = table.querySelectorAll('th, .el-table__header th, .vxe-header--column');
        ths.forEach((th) => headers.push((th.textContent || '').trim()));

        const trs = table.querySelectorAll('tbody tr, .el-table__row, .vxe-body--row');
        trs.forEach((tr) => {
          const cells = tr.querySelectorAll('td, .el-table__cell, .vxe-body--column');
          const values = [];
          cells.forEach((td) => values.push((td.textContent || '').trim()));

          if (values.length >= 3) {
            const row = { projectId: pid };
            headers.forEach((h, i) => {
              const v = values[i] || '';
              if (h.includes('日期') || h.includes('Date')) row.date = v;
              else if (h.includes('关键词') || h.includes('Keyword')) row.keyword = v;
              else if (h === '绝对位置') row['绝对位置'] = parseInt(v) || 0;
              else if (h.includes('含ad') || h.includes('SP')) row['绝对位置(含ad)'] = parseInt(v) || 0;
              else if (h.includes('搜索量')) row['月搜索量'] = parseInt(v) || 0;
              else if (h.includes('ABA')) row['ABA周排名'] = parseInt(v) || 0;
              else if (h.includes('购买') || h.includes('转化')) row['购买率'] = parseFloat(v) || 0;
            });
            row.asin = asinVal;
            if (row.keyword && row.date) rows.push(row);
          }
        });
      }
      return rows;
    }, projectId, asin);
  } catch (e) {
    log(`页面提取失败: ${e.message}`);
    return [];
  }
}

function parseCSVData(filePath, projectId) {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/^﻿/, '');
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const columnMap = buildColumnMap(headers);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 3) continue;
    const row = { projectId, date: '', keyword: '', asin: '' };

    for (const [csvCol, internalField] of Object.entries(columnMap)) {
      const idx = headers.indexOf(csvCol);
      if (idx >= 0 && idx < values.length) {
        const val = values[idx].trim();
        if (['绝对位置', '绝对位置(含ad)', '月搜索量', 'ABA周排名'].includes(internalField)) {
          row[internalField] = parseInt(val, 10) || 0;
        } else if (internalField === '购买率') {
          row[internalField] = parseFloat(val) || 0;
        } else {
          row[internalField] = val;
        }
      }
    }
    if (row.keyword && row.date) rows.push(row);
  }
  return rows;
}

function buildColumnMap(headers) {
  const mapping = {
    '日期': 'date', '关键词': 'keyword', '绝对位置': '绝对位置',
    '绝对位置(含ad)': '绝对位置(含ad)', '月搜索量': '月搜索量',
    'ABA周排名': 'ABA周排名', '购买率': '购买率', 'ASIN': 'asin',
  };
  const result = {};
  for (const h of headers) {
    const t = h.trim();
    if (mapping[t]) { result[t] = mapping[t]; continue; }
    for (const [key, value] of Object.entries(mapping)) {
      if (t.includes(key) || key.includes(t)) { result[t] = value; break; }
    }
  }
  return result;
}

function parseCSVLine(line) {
  const result = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += char;
  }
  result.push(current);
  return result;
}

module.exports = { scrapeKeywords };
