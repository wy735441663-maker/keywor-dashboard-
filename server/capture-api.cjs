/**
 * API 抓包工具
 * 启动 Chrome + 卖家精灵扩展，监控所有网络请求
 * 用户在 Chrome 窗口中操作卖家精灵（关键词收录 → 检索 → 下载）
 * 脚本自动捕获所有 API 请求并保存到 api-capture.json
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe';
const EXTENSION_ID = 'lnbmbgocenenhhhdojdielgnmeflbnfb';
const EXTENSION_PATH = `C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Extensions\\${EXTENSION_ID}\\5.0.2_0`;
const REAL_USER_DATA = 'C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome\\User Data';

const OUTPUT_FILE = path.join(__dirname, 'api-capture.json');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else try { fs.copyFileSync(srcPath, destPath); } catch {}
  }
}

async function main() {
  // 存储捕获到的所有请求
  const capturedRequests = [];

  // 准备临时配置
  const tempProfile = path.join(os.tmpdir(), `chrome-capture-${Date.now()}`);
  const extSrc = path.join(REAL_USER_DATA, 'Default', 'Extensions', EXTENSION_ID);
  if (fs.existsSync(extSrc)) {
    copyDir(extSrc, path.join(tempProfile, 'Default', 'Extensions', EXTENSION_ID));
  }

  console.log('启动 Chrome（非无头模式，请准备操作卖家精灵）...\n');

  const browser = await puppeteer.launch({
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
      '--remote-debugging-port=0',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  // 监听所有 targets 的网络请求
  browser.on('targetcreated', async (target) => {
    try {
      // 为每个 target 创建 CDP session 来监控网络
      const client = await target.createCDPSession();
      await client.send('Network.enable');

      client.on('Network.requestWillBeSent', (params) => {
        const url = params.request?.url || '';
        // 过滤掉静态资源和无关请求
        if (/\.(png|jpg|gif|svg|css|woff|woff2|ttf|ico|js|map)(\?|$)/i.test(url)) return;
        if (url.includes('google-analytics') || url.includes('doubleclick')) return;

        capturedRequests.push({
          type: 'request',
          timestamp: new Date().toISOString(),
          targetType: target.type(),
          targetUrl: target.url(),
          method: params.request?.method,
          url: url,
          headers: params.request?.headers || {},
          postData: params.request?.postData || null,
        });
      });

      client.on('Network.responseReceived', (params) => {
        const idx = capturedRequests.findLastIndex(
          (r) => r.type === 'request' && r.url === params.response?.url
        );
        if (idx >= 0) {
          capturedRequests[idx].responseStatus = params.response?.status;
          capturedRequests[idx].responseHeaders = params.response?.headers || {};
          capturedRequests[idx].mimeType = params.response?.mimeType;
        }
      });
    } catch (e) {
      // 某些 target 可能不支持 Network domain
    }
  });

  const page = await browser.newPage();

  // 也在 page 级别监听（备用）
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (params) => {
    const url = params.request?.url || '';
    if (/\.(png|jpg|gif|svg|css|woff|ttf|ico|js|map)(\?|$)/i.test(url)) return;
    capturedRequests.push({
      type: 'page-request',
      timestamp: new Date().toISOString(),
      method: params.request?.method,
      url: url,
      headers: params.request?.headers || {},
      postData: params.request?.postData || null,
    });
  });

  // 导航到亚马逊
  console.log('访问亚马逊...');
  await page.goto('https://www.amazon.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('========================================');
  console.log('现在请在弹出的 Chrome 窗口中操作卖家精灵：');
  console.log('1. 登录卖家精灵（如果需要）');
  console.log('2. 进入"关键词收录"');
  console.log('3. 输入 ASIN: B0FQBVGWH4');
  console.log('4. 输入几个关键词（如 coat rack）');
  console.log('5. 点击"检索"，等待数据加载');
  console.log('6. 点击"下载"');
  console.log('7. 操作完成后，回到终端按 Enter');
  console.log('========================================\n');

  // 等待用户完成操作
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
  });

  console.log('正在保存捕获的请求...');

  // 筛选有意义的 API 请求
  const apiRequests = capturedRequests.filter((r) => {
    const url = r.url || '';
    // 保留非 Amazon 域名的请求（这些可能是卖家精灵 API）
    if (!url.includes('amazon.com') && !url.includes('media-amazon.com')) return true;
    // 也保留 Amazon 域名下看起来像 API 的请求
    if (url.includes('amazon.com') && /api|query|search|keyword|asin|rank/i.test(url)) return true;
    return false;
  });

  // 去重
  const seen = new Set();
  const unique = apiRequests.filter((r) => {
    const key = `${r.method || ''}:${r.url || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(unique, null, 2), 'utf-8');
  console.log(`\n捕获完成！${unique.length} 个 API 请求已保存到:`);
  console.log(`  ${OUTPUT_FILE}`);

  await browser.close();
  try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch {}
}

main().catch((err) => {
  console.error('错误:', err.message);
  process.exit(1);
});
