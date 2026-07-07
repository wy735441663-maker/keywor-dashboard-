/**
 * 使用真实 Chrome profile + CDP 进行抓取
 * Chrome 已被 kill，profile 可用
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\User Data';
const AMAZON = 'https://www.amazon.com/';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

  log('启动 Chrome（真实 profile）...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: USER_DATA,
    headless: false,
    defaultViewport: { width: 1440, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=TranslateUI',
      // 不加 --disable-extensions-except，让所有扩展正常加载
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  log('已启动！等待扩展加载（10秒）...');
  await sleep(10000);

  // 列出所有页面
  const pages = await browser.pages();
  log(`当前 ${pages.length} 个页面:`);
  for (const p of pages) {
    log(`  ${p.url().substring(0, 120)}`);
  }

  // 找亚马逊页面
  let amzPage = pages.find(p => p.url().includes('amazon'));
  if (!amzPage) {
    log('没有亚马逊页面，创建新页面...');
    amzPage = await browser.newPage();
    await amzPage.goto(AMAZON, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(10000);
  } else {
    log('复用现有亚马逊页面');
    await amzPage.bringToFront();
    await sleep(2000);
  }

  log('检查卖家精灵扩展...');

  // 检查扩展是否注入
  const extInfo = await amzPage.evaluate(() => {
    const body = document.body?.innerHTML || '';
    return {
      hasSS: body.includes('卖家精灵') || body.includes('sellersprite'),
      elButtons: document.querySelectorAll('.el-button').length,
      bodyLen: body.length,
    };
  });
  log(`扩展状态: hasSS=${extInfo.hasSS}, el-buttons=${extInfo.elButtons}, body=${extInfo.bodyLen}chars`);

  // 截图
  await amzPage.screenshot({ path: path.join(__dirname, 'debug-real-01-amazon.png') });
  log('截图: debug-real-01-amazon.png');

  // 尝试在页面上查找卖家精灵面板
  log('查找卖家精灵入口...');

  // 找浮动按钮
  const floatBtn = await amzPage.evaluate(() => {
    // 卖家精灵在亚马逊页面上通常有一个浮动图标
    const all = document.querySelectorAll('div, img, span, iframe');
    const found = [];
    for (const el of all) {
      const cls = (el.className || '').toString();
      const id = (el.id || '').toString();
      const src = (el.src || '').toString();
      const alt = (el.alt || '').toString();

      if (cls.includes('sprite') || id.includes('sprite') || src.includes('sprite') ||
          cls.includes('ss-') || id.includes('ss-') ||
          cls.includes('seller') || id.includes('seller')) {
        found.push({ cls: cls.substring(0, 60), id, tag: el.tagName });
        if (found.length >= 5) break;
      }
    }
    return found;
  });
  log(`  疑似卖家精灵元素: ${JSON.stringify(floatBtn.slice(0, 5))}`);

  // 尝试点击卖家精灵入口
  const clicked = await amzPage.evaluate(() => {
    // 策略1: 精确查找
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const text = (el.textContent || '').trim();
      if (text === '卖家精灵' || text === 'Seller Sprite') {
        el.click(); return 'clicked-text';
      }
    }

    // 策略2: 属性查找
    for (const el of all) {
      const cls = (el.className || '').toString();
      const title = (el.title || '').toString();
      if (cls.includes('sellersprite') || title.includes('sellersprite') ||
          cls.includes('卖家精灵') || title.includes('卖家精灵')) {
        el.click(); return 'clicked-attr';
      }
    }

    // 策略3: 找 iframe
    const iframes = document.querySelectorAll('iframe');
    for (const f of iframes) {
      const src = (f.src || '').toLowerCase();
      if (src.includes('sprite') || src.includes('seller')) {
        return 'found-iframe:' + src.substring(0, 60);
      }
    }

    return 'not-found';
  });
  log(`  点击结果: ${clicked}`);
  await sleep(5000);

  await amzPage.screenshot({ path: path.join(__dirname, 'debug-real-02-panel.png') });
  log('截图: debug-real-02-panel.png');

  // 检查是否有弹窗或面板出现
  const panelInfo = await amzPage.evaluate(() => {
    const dialogs = document.querySelectorAll('.el-dialog, .el-drawer, .ant-modal, [role="dialog"]');
    const texts = [];
    dialogs.forEach(d => texts.push((d.textContent || '').substring(0, 200)));
    // 也检查 body 中是否出现了登录相关文字
    const body = document.body?.innerText || '';
    const hasLogin = body.includes('登录') && body.includes('密码');
    return { dialogCount: dialogs.length, dialogTexts: texts.slice(0, 3), bodyHasLogin: hasLogin };
  });
  log(`  面板状态: ${JSON.stringify(panelInfo)}`);

  // 查找关键词收录
  log('查找关键词收录...');
  const kwLink = await amzPage.evaluate(() => {
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const text = (el.textContent || '').trim();
      if (text.includes('关键词收录')) { el.click(); return 'clicked:' + text.substring(0, 30); }
    }
    return 'not-found';
  });
  log(`  关键词收录: ${kwLink}`);
  await sleep(5000);

  await amzPage.screenshot({ path: path.join(__dirname, 'debug-real-03-kwtool.png') });
  log('截图: debug-real-03-kwtool.png');

  // 保持浏览器打开让用户手动操作
  log('----------------------------------------');
  log('Chrome 窗口已打开。如果自动操作失败，');
  log('请手动完成：关键词收录 → 输入ASIN/关键词 → 检索 → 下载');
  log('完成后按 Ctrl+C 停止此脚本');
  log('----------------------------------------');

  // 等待用户中断
  await new Promise(() => {});
}

main().catch(e => { console.error('错误:', e.message); process.exit(1); });
