import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'http://127.0.0.1:5191';
const quality = process.argv.includes('--high') ? 'high' : 'low';
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
    await page.addInitScript((selected) => {
      localStorage.clear();
      localStorage.setItem('nailong-city-settings',
        JSON.stringify({ quality: selected, volume: 0 }));
    }, quality);
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
      const snapshot = () => page.evaluate(() => window.__NAILONG_DEBUG__.snapshot());
      const before = await snapshot();
      await page.keyboard.down('w');
      await page.waitForFunction(() => window.__NAILONG_DEBUG__.snapshot().stride > 0.02,
        null, { timeout: 12000 });
      await page.waitForFunction((start) => {
        const now = window.__NAILONG_DEBUG__.snapshot();
        return Math.hypot(now.x - start.x, now.z - start.z) > 0.5;
      }, before, { timeout: 15000 });
      await page.keyboard.up('w');
      const after = await snapshot();
      assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.5,
        `walking failed: ${JSON.stringify({ before, after })}`);
      const cameraDistance = Math.hypot(after.camera.x - after.x,
        after.camera.z - after.z);
      assert.ok(cameraDistance > 4 && cameraDistance < 11,
        `camera not following the player: ${cameraDistance}`);

      await page.waitForFunction(() =>
        window.__NAILONG_DEBUG__.snapshot().idleFor > 1.2, null, { timeout: 90000 });
      const yawStart = (await snapshot()).camera.yaw;
      await page.keyboard.down('w');
      await page.keyboard.down('a');
      await page.waitForFunction((start) => Math.abs(
        window.__NAILONG_DEBUG__.snapshot().camera.yaw - start) > 0.15,
      yawStart, { timeout: 60000 });
      await page.keyboard.up('a');
      await page.keyboard.up('w');

      await page.evaluate(() => window.__NAILONG_DEBUG__.teleport(5, 15));
      await page.keyboard.press('KeyE');
      assert.equal((await snapshot()).car, true, 'entering car failed');
      await page.keyboard.down('w');
      await page.waitForFunction(() => Math.abs(
        window.__NAILONG_DEBUG__.snapshot().wheelAngle) > 0.02,
      null, { timeout: 12000 });
      const yawBefore = (await snapshot()).carYaw;
      await page.keyboard.down('d');
      await page.waitForFunction((start) => window.__NAILONG_DEBUG__.snapshot().carYaw
        < start - 0.01, yawBefore, { timeout: 15000 });
      await page.keyboard.up('d');
      await page.keyboard.up('w');
      const yawAfter = (await snapshot()).carYaw;
      assert.ok(yawAfter < yawBefore - 0.01,
        `steering direction wrong: ${yawBefore} -> ${yawAfter}`);
      await page.screenshot({ path: path.join(root, 'screenshots', 'driving.png') });
      await page.keyboard.press('KeyE');
      assert.equal((await snapshot()).car, false, 'exiting car failed');

      const route = [[72, 72, 0, 1], [-144, 144, 1, 0], [-144, -144, 1, 1],
        [144, -144, 2, 0]];
      for (const [x, z, job, step] of route) {
        await page.evaluate(([a, b]) => window.__NAILONG_DEBUG__.teleport(a, b), [x, z]);
        await page.waitForFunction(([j, s]) => {
          const state = window.__NAILONG_DEBUG__.snapshot();
          return state.job === j && state.step === s;
        }, [job, step], { timeout: 15000 });
      }
      const completed = await snapshot();
      assert.equal(completed.cash, 440, 'mission rewards failed');

      await page.evaluate(() => window.__NAILONG_DEBUG__.setCash(3000));
      await page.evaluate(() => window.__NAILONG_DEBUG__.openShopById('gunshop'));
      assert.equal(await page.locator('#shop-screen').isVisible(), true, 'shop failed');
      assert.ok(await page.locator('#shop-items .shop-item').count() >= 4,
        'shop items missing');
      await page.screenshot({ path: path.join(root, 'screenshots', 'shop.png') });
      await page.locator('#shop-items .shop-item').first().click();
      const bought = await snapshot();
      assert.equal(bought.weapon, 'smg', 'buying a weapon failed');
      assert.equal(bought.cash, 1750, 'weapon price not charged');
      await page.click('#shop-close');
      assert.equal(await page.locator('#shop-screen').isVisible(), false,
        'closing shop failed');

      const loaded = await snapshot();
      await page.evaluate(() => window.__NAILONG_DEBUG__.shoot());
      await page.waitForTimeout(250);
      const fired = await snapshot();
      assert.ok(fired.loaded < loaded.loaded || fired.loaded === 0,
        'shooting did not consume ammo');
      await page.evaluate(() => window.__NAILONG_DEBUG__.setWanted(0));
      await page.waitForTimeout(400);

      await page.evaluate(() => window.__NAILONG_DEBUG__.setHour(21));
      await page.waitForFunction(() =>
        document.getElementById('clock').textContent.startsWith('21:'),
      null, { timeout: 15000 });
      const clock = await page.locator('#clock').textContent();
      assert.ok(clock.startsWith('21:'), `night clock failed: ${clock}`);
      await page.screenshot({ path: path.join(root, 'screenshots', 'night.png') });

      await page.keyboard.press('KeyM');
      assert.equal(await page.locator('#full-map').isVisible(), true, 'map failed');
      await page.screenshot({ path: path.join(root, 'screenshots', 'map.png') });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#full-map').isVisible(), false, 'map close failed');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#pause-screen').isVisible(), true, 'pause failed');
      await page.screenshot({ path: path.join(root, 'screenshots', 'menu.png') });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#pause-screen').isVisible(), false,
        'resume failed');
    } else {
      assert.equal(await page.locator('#mobile-controls').isVisible(), true,
        'mobile controls are hidden');
      await page.locator('#touch-fire').click();
      assert.equal(await page.locator('#mobile-controls #touch-fire').isVisible(), true,
        'touch fire failed');
    }
    assert.deepEqual(errors, [], `${name} runtime errors`);
    console.log(`${name} OK: WebGL pixels ${JSON.stringify(pixels)}, controls and HUD verified`);
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill();
}
