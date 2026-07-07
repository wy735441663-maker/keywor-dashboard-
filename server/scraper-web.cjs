/**
 * 卖家精灵网页版 (sellersprite.com) 自动抓取
 * 登录 → 关键词收录 → 输入 → 检索 → 下载
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'https://www.sellersprite.com';
const EMAIL = 'JINKAI001';
const PWD = 'Jinkai@2025';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ts() { return new Date().toISOString().split('T')[1].split('.')[0]; }

async function scrapeWeb(project, onProgress = () => {}) {
  const { asin, keywords } = project;
  const log = (msg) => { const m = `[${ts()}] ${msg}`; console.log(m); onProgress(m); };

  log('启动 Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // 下载目录
    const downloadDir = path.join(__dirname, 'downloads');
    fs.mkdirSync(downloadDir, { recursive: true });
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    // 清空旧 CSV
    fs.readdirSync(downloadDir).filter(f => f.endsWith('.csv')).forEach(f => {
      try { fs.unlinkSync(path.join(downloadDir, f)); } catch {}
    });

    // ===== 步骤1: 登录 =====
    const LOGIN_URL = `${BASE}/cn/w/user/login`;
    log(`登录: ${LOGIN_URL}`);
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(3000);

    // 等待登录表单完全渲染
    await sleep(3000);
    await page.screenshot({ path: path.join(__dirname, 'debug-login-before.png') });
    log('截图: debug-login-before.png');

    // 直接用 JS 操作 DOM（绕过 click 限制）
    log('填写登录凭据...');
    const fillResult = await page.evaluate((email, pwd) => {
      // 填邮箱
      const inputs = document.querySelectorAll('input');
      let emailDone = false, pwdDone = false;
      for (const inp of inputs) {
        const ph = (inp.placeholder || '').toLowerCase();
        const name = (inp.name || '').toLowerCase();
        if (!emailDone && (ph.includes('手机') || ph.includes('邮箱') || name.includes('email') || (!ph && inp.type === 'text' && !inp.readOnly))) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(inp, email);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          inp.dispatchEvent(new Event('blur', { bubbles: true }));
          emailDone = true;
        }
        if (!pwdDone && (inp.type === 'password' || name.includes('password') || ph.includes('密码'))) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(inp, pwd);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          pwdDone = true;
        }
      }
      return { emailDone, pwdDone, inputCount: inputs.length };
    }, EMAIL, PWD);
    log(`  填表结果: ${JSON.stringify(fillResult)}`);

    // 点击登录按钮
    log('点击登录...');
    const loginClicked = await page.evaluate(() => {
      const btns = document.querySelectorAll('button, [role="button"], .btn, a.btn');
      for (const btn of btns) {
        const text = (btn.textContent || '').trim();
        if (text === '立即登录' || text === '登录' || text === '登 录' || text === 'Login') {
          btn.click();
          return text;
        }
      }
      // fallback: 点击包含"登录"的按钮
      for (const btn of btns) {
        if ((btn.textContent || '').includes('登录')) {
          btn.click();
          return btn.textContent.trim();
        }
      }
      return null;
    });
    log(`  点击: ${loginClicked || 'FAIL'}`);

    log('等待登录完成...');
    await sleep(8000);

    // 检查登录结果
    const currentUrl = page.url();
    log(`登录后 URL: ${currentUrl}`);

    if (currentUrl.includes('/login') || currentUrl.includes('error')) {
      // 可能需要验证码
      await page.screenshot({ path: path.join(__dirname, 'debug-login-result.png') });
      log('登录可能失败（验证码？），截图: debug-login-result.png');
      // 等人工处理
      log('等待60秒供人工完成验证...');
      await sleep(60000);
    }

    // ===== 步骤2: 关键词收录 =====
    const KW_URL = `${BASE}/v2/keyword-checker`;
    log(`进入关键词收录: ${KW_URL}`);
    await page.goto(KW_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(5000);

    // 先截图看页面状态
    await page.screenshot({ path: path.join(__dirname, 'debug-kw-01-initial.png') });
    log('截图: debug-kw-01-initial.png');

    // 分析页面
    let kwInfo = await page.evaluate(() => {
      const inputs = [];
      document.querySelectorAll('input:not([type="hidden"]), textarea').forEach(el => {
        inputs.push({ tag: el.tagName, placeholder: (el.placeholder || '').substring(0, 60) });
      });
      const buttons = [];
      document.querySelectorAll('button:not([class*="video"]):not([class*="player"])').forEach(el => {
        const t = (el.textContent || '').trim();
        if (t && t.length < 30) buttons.push(t);
      });
      return { url: window.location.href, inputs, buttons };
    });
    log(`页面: ${kwInfo.url}, 输入框: ${JSON.stringify(kwInfo.inputs)}, 按钮: ${JSON.stringify(kwInfo.buttons.slice(0,10))}`);

    // 点击"新建"按钮创建新词库
    log('点击"新建"...');
    const newClicked = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        if ((btn.textContent || '').trim() === '新建') {
          btn.click(); return true;
        }
      }
      return false;
    });
    log(`  新建: ${newClicked ? 'OK' : '未找到'}`);
    await sleep(4000);

    // 截图看新建后的表单
    await page.screenshot({ path: path.join(__dirname, 'debug-kw-02-new-form.png') });
    log('截图: debug-kw-02-new-form.png');

    // 重新分析页面（看是否出现新表单）
    kwInfo = await page.evaluate(() => {
      const inputs = [];
      document.querySelectorAll('input:not([type="hidden"]), textarea').forEach(el => {
        inputs.push({ tag: el.tagName, placeholder: (el.placeholder || '').substring(0, 80), name: el.name || '' });
      });
      const buttons = [];
      document.querySelectorAll('button').forEach(el => {
        const t = (el.textContent || '').trim();
        if (t && t.length < 30) buttons.push(t);
      });
      // 也看弹窗/dialog
      const dialogs = document.querySelectorAll('.el-dialog, .el-drawer, .ant-modal, [role="dialog"]');
      const dialogTexts = [];
      dialogs.forEach(d => dialogTexts.push((d.textContent || '').substring(0, 200)));
      return { url: window.location.href, inputs, buttons, dialogs: dialogTexts.length };
    });
    log(`  表单: ${JSON.stringify(kwInfo.inputs)}`);
    log(`  按钮: ${JSON.stringify(kwInfo.buttons.slice(0, 15))}`);
    log(`  弹窗: ${kwInfo.dialogs}个`);

    // 填 ASIN - 查找新出现的输入框
    log(`填写 ASIN: ${asin}`);
    const asinDone = await page.evaluate((val) => {
      const inputs = document.querySelectorAll('input[type="text"]:not([readonly]):not([disabled])');
      for (const inp of inputs) {
        const ph = (inp.placeholder || '').toLowerCase();
        const name = (inp.name || '').toLowerCase();
        const label = (inp.getAttribute('aria-label') || '').toLowerCase();
        // 优先匹配 ASIN 相关
        if (ph.includes('asin') || name.includes('asin') || label.includes('asin')) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(inp, val);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return 'asin-match';
        }
      }
      // fallback: 第一个宽输入框
      for (const inp of inputs) {
        const rect = inp.getBoundingClientRect();
        if (rect.width > 150 && rect.height > 20 && !inp.readOnly) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(inp, val);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return 'first-wide';
        }
      }
      return false;
    }, asin);
    log(`  ASIN: ${asinDone}`);

    // 填关键词 - 找 textarea
    log(`填写 ${keywords.length} 个关键词...`);
    const kwDone = await page.evaluate((text) => {
      const textareas = document.querySelectorAll('textarea:not([readonly]):not([disabled])');
      for (const ta of textareas) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, text);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      // fallback: 大的 input
      const inputs = document.querySelectorAll('input[type="text"]:not([readonly])');
      for (const inp of inputs) {
        const rect = inp.getBoundingClientRect();
        if (rect.width > 300) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(inp, text);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          return 'fallback-input';
        }
      }
      return false;
    }, keywords.join('\n'));
    log(`  关键词: ${kwDone}`);

    await sleep(1000);
    await page.screenshot({ path: path.join(__dirname, 'debug-kw-03-filled.png') });
    log('截图: debug-kw-03-filled.png');

    // 点击检索/查询
    log('点击检索...');
    const searchDone = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        const t = (b.textContent || '').trim();
        if (t.includes('检索') || t.includes('查询') || t.includes('搜索') || t === '开始') {
          b.click(); return t;
        }
      }
      return null;
    });
    log(`  检索: ${searchDone || 'FAIL - 未找到按钮'}`);

    if (!searchDone) {
      await page.screenshot({ path: path.join(__dirname, 'debug-kw-page.png') });
      log('截图: debug-kw-page.png');
    }

    // ===== 步骤3: 等待数据加载 =====
    log('等待数据加载（最多120秒）...');
    let dataLoaded = false;
    for (let i = 0; i < 24; i++) {
      await sleep(5000);
      const stats = await page.evaluate(() => {
        const tables = document.querySelectorAll('table, .el-table, .ant-table');
        let rows = 0;
        tables.forEach(t => {
          rows += t.querySelectorAll('tr, .el-table__row').length;
        });
        // 也检查 Element Plus 分页
        const pagination = document.querySelector('.el-pagination, .ant-pagination');
        return { rows, hasPagination: !!pagination };
      });
      if (i % 4 === 0 || stats.rows > 0) {
        log(`  ${(i+1)*5}s: ${stats.rows} 行, 分页=${stats.hasPagination}`);
      }
      if (stats.rows > 1 && stats.hasPagination) {
        dataLoaded = true;
        break;
      }
    }

    if (!dataLoaded) {
      log('警告: 未检测到数据表格');
      await page.screenshot({ path: path.join(__dirname, 'debug-results.png') });
      log('截图: debug-results.png');
    }

    // ===== 步骤4: 下载 CSV =====
    log('点击下载...');
    const downloadClicked = await page.evaluate(() => {
      const all = document.querySelectorAll('button, a, span, i, svg');
      for (const el of all) {
        const text = (el.textContent || '').trim();
        const title = (el.getAttribute('title') || '').trim();
        if (text.includes('下载') || text.includes('导出') || title.includes('下载') || title.includes('导出') ||
            text === 'CSV' || text === 'Excel') {
          el.click(); return text || title;
        }
      }
      return null;
    });
    log(`  下载: ${downloadClicked || '未找到下载按钮'}`);

    // 等文件
    log('等待下载...');
    let csvPath = null;
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const files = fs.readdirSync(downloadDir).filter(f => f.endsWith('.csv'));
      if (files.length > 0) {
        csvPath = path.join(downloadDir, files.sort((a, b) =>
          fs.statSync(path.join(downloadDir, b)).mtimeMs - fs.statSync(path.join(downloadDir, a)).mtimeMs
        )[0]);
        log(`  下载完成: ${files[0]}`);
        break;
      }
    }

    // ===== 步骤5: 解析数据 =====
    let data = [];

    if (csvPath) {
      const content = fs.readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length > 1) {
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          if (vals.length < 3) continue;
          const row = { projectId: project.id, asin };
          headers.forEach((h, j) => {
            const v = vals[j] || '';
            if (h === '日期' || h.includes('Date')) row.date = v;
            else if (h === '关键词' || h.includes('Keyword')) row.keyword = v;
            else if (h === '绝对位置') row['绝对位置'] = parseInt(v) || 0;
            else if (h === '绝对位置(含ad)') row['绝对位置(含ad)'] = parseInt(v) || 0;
            else if (h.includes('搜索量')) row['月搜索量'] = parseInt(v) || 0;
            else if (h.includes('ABA')) row['ABA周排名'] = parseInt(v) || 0;
            else if (h.includes('购买') || h.includes('转化')) row['购买率'] = parseFloat(v) || 0;
          });
          if (row.date && row.keyword) data.push(row);
        }
      }
      log(`解析完成: ${data.length} 条数据`);
    } else {
      // 无下载，尝试从页面提取
      log('无下载文件，从页面提取...');
      data = await page.evaluate((pid, asinVal) => {
        const rows = [];
        document.querySelectorAll('table, .el-table').forEach(table => {
          const headers = [];
          table.querySelectorAll('th, .el-table__header th').forEach(th => headers.push((th.textContent || '').trim()));
          table.querySelectorAll('tbody tr, .el-table__row').forEach(tr => {
            const cells = tr.querySelectorAll('td, .el-table__cell');
            const vals = Array.from(cells).map(c => (c.textContent || '').trim());
            if (vals.length >= 3) {
              const row = { projectId: pid, asin: asinVal };
              headers.forEach((h, j) => {
                const v = vals[j] || '';
                if (/^\d{4}-\d{2}-\d{2}$/.test(v)) row.date = v;
                else if (h.includes('关键词') || h.includes('Keyword') || j === 1) row.keyword = v;
                else if (h === '绝对位置') row['绝对位置'] = parseInt(v) || 0;
                else if (h.includes('含ad')) row['绝对位置(含ad)'] = parseInt(v) || 0;
                else if (h.includes('搜索量')) row['月搜索量'] = parseInt(v) || 0;
                else if (h.includes('ABA')) row['ABA周排名'] = parseInt(v) || 0;
              });
              if (row.date && row.keyword) rows.push(row);
            }
          });
        });
        return rows;
      }, project.id, asin);
      log(`页面提取: ${data.length} 条`);
    }

    return data;

  } finally {
    await browser.close();
  }
}

// 直接运行
if (require.main === module) {
  scrapeWeb({
    id: 'test',
    name: '晾衣架',
    asin: 'B0FQBVGWH4',
    keywords: ['coat rack', 'clothes rack', 'clothing rack'],
  }, console.log).then(data => {
    console.log(`\n=== 真实数据: ${data.length} 条 ===`);
    if (data.length > 0) {
      console.log('样本:', JSON.stringify(data.slice(0, 3), null, 2));
      // 保存数据
      fs.writeFileSync(path.join(__dirname, 'data', 'scraped-data.json'), JSON.stringify(data, null, 2));
      console.log('已保存到 server/data/scraped-data.json');
    }
    process.exit(0);
  }).catch(e => {
    console.error('失败:', e.message);
    process.exit(1);
  });
}

module.exports = { scrapeWeb };
