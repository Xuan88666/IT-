import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

async function screenshot(name) {
  await page.screenshot({ path: `d:/Desktop/IT运维百宝箱/screenshots/${name}.png`, fullPage: false });
  console.log('screenshot:', name);
}

await page.goto('http://localhost:8787/');
await page.waitForTimeout(1000);
await screenshot('01-login');

await page.fill('#auth-password', 'AdminPass123!');
await page.click('[data-action="auth-login"]');
await page.waitForTimeout(2000);
await screenshot('02-dashboard');

await page.click('[data-tool="process-list"]');
await page.waitForTimeout(3000);
await screenshot('03-tool-output');

await page.click('[data-action="open-search"]');
await page.waitForTimeout(500);
await page.fill('#bento-search-input', '打印');
await page.waitForTimeout(500);
await screenshot('04-search');

await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.click('[data-action="open-notifications"]');
await page.waitForTimeout(500);
await screenshot('05-notifications');

await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.click('[data-action="open-settings"]');
await page.waitForTimeout(500);
await screenshot('06-settings');

await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.click('[data-nav="knowledge"]');
await page.waitForTimeout(1000);
await screenshot('07-knowledge');

await browser.close();
console.log('all done');
