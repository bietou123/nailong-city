import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'http://127.0.0.1:5191';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js',
  '--host', '127.0.0.1', '--port', '5191', '--strictPort'], {
  cwd: root, stdio: 'pipe', windowsHide: true,
});

async function ready() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Vite exited before becoming ready');
    try { if ((await fetch(url)).ok) return; } catch { /* Starting up. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Vite did not start within 20 seconds');
}

async function checkCanvas(page) {
  return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
    const canvas = document.getElementById('scene');
    const gl = canvas.getContext('webgl2');
    const samples = [];
    for (const [u, v] of [[0.5, 0.5], [0.18, 0.45], [0.82, 0.45], [0.5, 0.15]]) {
      const pixel = new Uint8Array(4);
      gl.readPixels(Math.floor(canvas.width * u), Math.floor(canvas.height * v),
        1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      samples.push(Array.from(pixel));
    }
    resolve(samples);
  })));
}

let browser;
try {
  await ready();
  await mkdir(path.join(root, 'screenshots'), { recursive: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.error('PAGE ERROR:', error.message); });
    page.on('console', (message) => {
      if (message.type() === 'error') { errors.push(message.text()); console.error('CONSOLE ERROR:', message.text()); }
    });
    await page.addInitScript(() => localStorage.setItem('nailong-city-settings',
      JSON.stringify({ quality: 'low', volume: 0 })));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('html[data-game-ready="true"]', { timeout: 30000 });
    await page.waitForTimeout(800);
    const pixels = await checkCanvas(page);
    assert.ok(pixels.some((pixel) => pixel[3] > 0), `${name} canvas is blank`);
    assert.ok(new Set(pixels.map((pixel) => pixel.join(','))).size > 1,
      `${name} canvas has no scene color variation: ${JSON.stringify(pixels)}`);
    await page.screenshot({ path: path.join(root, 'screenshots', `${name}.png`) });
    const status = await page.evaluate(() => {
      const mission = document.querySelector('.mission').getBoundingClientRect();
      const stats = document.querySelector('.status').getBoundingClientRect();
      return { overlap: mission.right > stats.left && mission.left < stats.right &&
        mission.bottom > stats.top && mission.top < stats.bottom,
      viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth };
    });
    assert.equal(status.overlap, false, `${name} HUD overlaps`);
    assert.ok(status.scrollWidth <= status.viewport, `${name} has horizontal overflow`);
    if (name === 'desktop') {
      const before = await page.evaluate(() => window.__NAILONG_DEBUG__.snapshot());
      await page.keyboard.down('w');
      await page.waitForTimeout(700);
      const during = await page.evaluate(() => window.__NAILONG_DEBUG__.snapshot());
      await page.waitForTimeout(800);
      await page.keyboard.up('w');
      const after = await page.evaluate(() => window.__NAILONG_DEBUG__.snapshot());
      assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.5,
        `walking failed: ${JSON.stringify({ before, during, after })}`);
      await page.evaluate(() => window.__NAILONG_DEBUG__.teleport(5, 15));
      await page.keyboard.press('KeyE');
      assert.equal((await page.evaluate(() => window.__NAILONG_DEBUG__.snapshot())).car,
        true, 'entering car failed');
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(350);
      await page.keyboard.up('KeyW');
      await page.keyboard.press('KeyE');
      assert.equal((await page.evaluate(() => window.__NAILONG_DEBUG__.snapshot())).car,
        false, 'exiting car failed');
      let stage = 0;
      for (const [x, z] of [[72, 72], [-144, 144], [-144, -144], [144, -144]]) {
        await page.evaluate(([a, b]) => window.__NAILONG_DEBUG__.teleport(a, b), [x, z]);
        stage++;
        await page.waitForFunction((expected) =>
          window.__NAILONG_DEBUG__.snapshot().stage === expected,
        stage, { timeout: 15000 });
      }
      const completed = await page.evaluate(() => window.__NAILONG_DEBUG__.snapshot());
      assert.equal(completed.stage, 4, 'mission progression failed');
      assert.equal(completed.cash, 440, 'mission rewards failed');
      await page.keyboard.press('KeyM');
      assert.equal(await page.locator('#full-map').isVisible(), true, 'map failed');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#pause-screen').isVisible(), true, 'pause failed');
      await page.screenshot({ path: path.join(root, 'screenshots', 'menu.png') });
    } else {
      assert.equal(await page.locator('#mobile-controls').isVisible(), true,
        'mobile controls are hidden');
    }
    assert.deepEqual(errors, [], `${name} runtime errors`);
    console.log(`${name} OK: WebGL pixels ${JSON.stringify(pixels)}, controls and HUD verified`);
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill();
}
