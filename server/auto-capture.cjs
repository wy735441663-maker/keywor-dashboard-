/**
 * 自动抓包 + 数据提取
 * 1. 启动 Chrome + 卖家精灵
 * 2. CDP 监控所有网络请求（包括响应 body）
 * 3. Puppeteer 自动化操作卖家精灵
 * 4. 从 API 响应中直接提取关键词排名数据
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const EXTENSION_ID = 'lnbmbgocenenhhhdojdielgnmeflbnfb';
const EXTENSION_PATH = `C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Extensions\\${EXTENSION_ID}\\5.0.2_0`;
const REAL_USER_DATA = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\User Data';
const AMAZON = 'https://www.amazon.com/';
const EMAIL = 'JINKAI001';
const PWD = 'Jinkai@2025';
const TARGET_ASIN = 'B0FQBVGWH4';
const TARGET_KW = ['coat rack', 'clothes rack', 'clothing rack'];

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, e.name), dp = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(sp, dp);
    else try { fs.copyFileSync(sp, dp); } catch {}
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const allRequests = [];
  const responseBodies = [];

  // 准备临时 profile
  const tmp = path.join(os.tmpdir(), `chrome-auto-${Date.now()}`);
  const extSrc = path.join(REAL_USER_DATA, 'Default', 'Extensions', EXTENSION_ID);
  if (fs.existsSync(extSrc)) copyDir(extSrc, path.join(tmp, 'Default', 'Extensions', EXTENSION_ID));

  console.log('启动 Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: tmp,
    headless: false,
    defaultViewport: { width: 1440, height: 900 },
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  // 全局 CDP 监控：跟踪所有 target
  const cdpSessions = [];

  browser.on('targetcreated', async (target) => {
    try {
      const client = await target.createCDPSession();
      await client.send('Network.enable', { maxTotalBufferSize: 50000000, maxResourceBufferSize: 25000000 });

      client.on('Network.requestWillBeSent', (p) => {
        const url = p.request?.url || '';
        if (/\.(png|jpg|gif|svg|css|woff2?|ttf|ico|js|map)(\?|$)/i.test(url)) return;
        allRequests.push({
          ts: Date.now(),
          targetType: target.type(),
          targetUrl: target.url(),
          method: p.request?.method,
          url,
          reqHeaders: p.request?.headers || {},
          postData: p.request?.postData,
        });
      });

      client.on('Network.responseReceived', (p) => {
        const url = p.response?.url || '';
        if (/\.(png|jpg|gif|svg|css|woff2?|ttf|ico|js|map)(\?|$)/i.test(url)) return;
        // 记录响应
        const idx = allRequests.findLastIndex(r => r.url === url);
        if (idx >= 0) {
          allRequests[idx].status = p.response?.status;
          allRequests[idx].mimeType = p.response?.mimeType;
          allRequests[idx].resHeaders = p.response?.headers || {};
          allRequests[idx].requestId = p.requestId;
        }
      });

      // 获取响应 body
      client.on('Network.loadingFinished', async (p) => {
        const idx = allRequests.findLastIndex(r => r.requestId === p.requestId);
        if (idx >= 0 && allRequests[idx].mimeType === 'application/json') {
          try {
            const resp = await client.send('Network.getResponseBody', { requestId: p.requestId });
            if (resp?.body) {
              const body = resp.body;
              allRequests[idx].responseBody = body.substring(0, 50000); // 最多50k
              responseBodies.push({
                url: allRequests[idx].url,
                status: allRequests[idx].status,
                body: body.substring(0, 50000),
              });
            }
          } catch {}
        }
      });

      cdpSessions.push(client);
    } catch {}
  });

  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // 导航到亚马逊
  console.log('1. 访问亚马逊...');
  await page.goto(AMAZON, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('   等待 15 秒让卖家精灵加载...');
  await sleep(15000);

  // 尝试自动化操作
  console.log('2. 查找卖家精灵入口...');

  // 策略：尝试在页面上找到并点击卖家精灵的入口
  let found = false;
  const clickTargets = [
    // 尝试各种可能的卖家精灵入口选择器
    () => page.evaluate(() => {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const text = el.textContent || '';
        const cls = el.className || '';
        const title = el.title || '';
        if (text === '卖家精灵' || text === 'Seller Sprite' || cls.includes('sprite') || title.includes('sprite')) {
          el.click();
          return 'clicked text/class match';
        }
      }
      return null;
    }),
    // Element Plus 按钮
    () => page.evaluate(() => {
      const btns = document.querySelectorAll('.el-button, button');
      for (const b of btns) {
        if ((b.textContent || '').includes('精灵')) { b.click(); return 'clicked el-button'; }
      }
      return null;
    }),
  ];

  for (const fn of clickTargets) {
    const result = await fn();
    if (result) { console.log(`   ${result}`); found = true; break; }
  }

  if (!found) console.log('   未找到卖家精灵入口，尝试定位...');

  // 等待面板出现并尝试登录
  await sleep(5000);
  console.log('3. 检查并处理登录...');

  try {
    const inputs = await page.$$('input');
    const textInputs = [];
    for (const inp of inputs) {
      const type = await inp.evaluate(el => el.type);
      if (type === 'text' || type === 'email' || type === 'password') {
        textInputs.push({ el: inp, type });
      }
    }
    console.log(`   找到 ${textInputs.length} 个输入框`);

    // 填写邮箱
    for (const { el, type } of textInputs) {
      if (type === 'password') continue;
      try {
        await el.click({ clickCount: 3 });
        await el.type(EMAIL, { delay: 30 });
        console.log('   已填写邮箱');
        break;
      } catch {}
    }

    // 填写密码
    for (const { el, type } of textInputs) {
      if (type !== 'password') continue;
      try {
        await el.click({ clickCount: 3 });
        await el.type(PWD, { delay: 30 });
        console.log('   已填写密码');
        break;
      } catch {}
    }

    // 点击登录
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button, .el-button');
      for (const b of btns) {
        if ((b.textContent || '').trim() === '登录' || (b.textContent || '').includes('Login')) {
          b.click(); return true;
        }
      }
    });
    console.log('   已点击登录');
    await sleep(8000);
  } catch (e) {
    console.log(`   登录异常: ${e.message}`);
  }

  // 查找关键词收录
  console.log('4. 查找关键词收录...');
  await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if ((el.textContent || '').includes('关键词收录')) {
        el.click(); return;
      }
    }
  });
  await sleep(5000);

  // 填写 ASIN 和关键词
  console.log('5. 填写 ASIN 和关键词...');
  try {
    const inputs = await page.$$('input[type="text"]:not([readonly])');
    if (inputs.length > 0) {
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].type(TARGET_ASIN, { delay: 30 });
      console.log(`   已填 ASIN: ${TARGET_ASIN}`);
    }
  } catch (e) { console.log(`   填 ASIN 失败: ${e.message}`); }

  try {
    const textareas = await page.$$('textarea');
    if (textareas.length > 0) {
      const kwText = TARGET_KW.join('\n');
      await page.evaluate((el, text) => {
        el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, textareas[0], kwText);
      console.log(`   已填 ${TARGET_KW.length} 个关键词`);
    }
  } catch (e) { console.log(`   填关键词失败: ${e.message}`); }

  // 点击检索
  console.log('6. 点击检索...');
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button, .el-button');
    for (const b of btns) {
      const t = (b.textContent || '').trim();
      if (t.includes('检索') || t.includes('查询') || t.includes('搜索') || t === '开始') {
        b.click(); return;
      }
    }
  });
  console.log('   检索已触发，等待 API 响应（60秒）...');
  await sleep(60000);

  // 收集结果
  console.log('7. 收集数据...');

  // 尝试从页面提取表格数据
  const tableData = await page.evaluate(() => {
    const rows = [];
    const tables = document.querySelectorAll('table, .el-table, .vxe-table');
    for (const t of tables) {
      const trs = t.querySelectorAll('tr, .el-table__row, .vxe-body--row');
      trs.forEach(tr => {
        const cells = tr.querySelectorAll('td, th, .el-table__cell, .vxe-body--column');
        const vals = Array.from(cells).map(c => (c.textContent || '').trim());
        if (vals.length >= 3) rows.push(vals);
      });
    }
    return rows;
  });
  console.log(`   从页面提取到 ${tableData.length} 行数据`);

  // 保存所有结果
  const outputDir = path.join(__dirname, 'data');
  fs.mkdirSync(outputDir, { recursive: true });

  // 保存捕获的 API 请求
  const apiReqs = allRequests.filter(r => {
    const url = r.url || '';
    return !url.includes('amazon.com') && !url.includes('media-amazon.com')
           && !url.includes('google') && !url.includes('doubleclick')
           && !url.includes('cloudfront');
  });
  fs.writeFileSync(path.join(outputDir, 'captured-api.json'), JSON.stringify(apiReqs, null, 2));

  // 保存响应 bodies
  fs.writeFileSync(path.join(outputDir, 'response-bodies.json'), JSON.stringify(responseBodies, null, 2));

  // 保存提取的表格数据
  fs.writeFileSync(path.join(outputDir, 'table-data.json'), JSON.stringify(tableData, null, 2));

  // 保存所有请求摘要
  const summary = allRequests.map(r => `${r.method || '?'} ${r.status || '?'} ${r.url}`).join('\n');
  fs.writeFileSync(path.join(outputDir, 'all-requests.txt'), summary);

  console.log(`\n结果保存:`);
  console.log(`  API 请求: ${apiReqs.length} 条 → server/data/captured-api.json`);
  console.log(`  响应数据: ${responseBodies.length} 条 → server/data/response-bodies.json`);
  console.log(`  表格数据: ${tableData.length} 行 → server/data/table-data.json`);
  console.log(`  全部请求: ${allRequests.length} 条 → server/data/all-requests.txt`);

  await browser.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  console.log('完成。');
}

main().catch(e => { console.error('错误:', e.message); process.exit(1); });
