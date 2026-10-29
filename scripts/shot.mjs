import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'http://127.0.0.1:5192';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js',
  '--host', '127.0.0.1', '--port', '5192', '--strictPort'], {
  cwd: root, stdio: 'pipe', windowsHide: true,
});

async function ready() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Vite exited');
    try { if ((await fetch(url)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Vite did not start');
}

let browser;
try {
  await ready();
  await mkdir(path.join(root, 'screenshots'), { recursive: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1 });
  page.on('pageerror', (error) => console.error('PAGE ERROR:', error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('CONSOLE ERROR:', message.text());
  });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('nailong-city-settings',
      JSON.stringify({ quality: 'high', volume: 0 }));
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html[data-game-ready="true"]', { timeout: 60000 });
  await page.waitForTimeout(6000);
  console.log('render info', await page.evaluate(() =>
    window.__NAILONG_DEBUG__?.info()));
  await page.screenshot({ path: path.join(root, 'screenshots', 'high.png') });
  await page.screenshot({ path: path.join(root, 'screenshots', 'detail.png'),
    clip: { x: 320, y: 160, width: 640, height: 360 } });
  console.log('saved high.png, detail.png');
  await page.evaluate(() => window.__NAILONG_DEBUG__?.setHour(18.6));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(root, 'screenshots', 'dusk.png') });
  await page.evaluate(() => window.__NAILONG_DEBUG__?.setHour(21.6));
  await page.waitForTimeout(2500);
  console.log('night info', await page.evaluate(() =>
    window.__NAILONG_DEBUG__?.info()));
  await page.screenshot({ path: path.join(root, 'screenshots', 'night.png') });
  await page.screenshot({ path: path.join(root, 'screenshots', 'night-detail.png'),
    clip: { x: 320, y: 160, width: 640, height: 360 } });
  await page.evaluate(() => window.__NAILONG_DEBUG__?.setHour(12));
  await page.evaluate(() => window.__NAILONG_DEBUG__?.teleport(6, 22));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(root, 'screenshots', 'car.png') });
  console.log('saved dusk.png, night.png, car.png');
} finally {
  await browser?.close();
  server.kill();
}
