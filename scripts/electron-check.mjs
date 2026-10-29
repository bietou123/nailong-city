import { _electron as electron } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = await electron.launch({ args: ['.', '--gamedebug'], cwd: root });
const page = await app.firstWindow();
page.on('pageerror', (error) => console.error('PAGE ERROR:', error.message));
page.on('console', (message) => {
  if (message.type() === 'error') console.error('CONSOLE ERROR:', message.text());
});
await page.waitForSelector('html[data-game-ready="true"]', { timeout: 40000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  window.__audio = { tones: 0, buffers: 0, context: null };
  const Original = window.AudioContext;
  const proto = Original.prototype;
  const makeOscillator = proto.createOscillator;
  const makeBuffer = proto.createBufferSource;
  proto.createOscillator = function patched(...args) {
    window.__audio.tones++;
    return makeOscillator.apply(this, args);
  };
  proto.createBufferSource = function patched(...args) {
    window.__audio.buffers++;
    return makeBuffer.apply(this, args);
  };
  window.AudioContext = class extends Original {
    constructor(...args) {
      super(...args);
      window.__audio.context = this;
    }
  };
});
const snapshot = () => page.evaluate(() => window.__NAILONG_DEBUG__.snapshot());
const report = (label, value) => console.log(label, JSON.stringify(value));

const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};

const start = await snapshot();
await hold('ArrowUp', 1500);
const afterArrow = await snapshot();
report('ARROWUP', { moved: Math.hypot(afterArrow.x - start.x, afterArrow.z - start.z).toFixed(2),
  from: [start.x.toFixed(1), start.z.toFixed(1)], to: [afterArrow.x.toFixed(1), afterArrow.z.toFixed(1)] });

await hold('w', 1500);
const afterW = await snapshot();
report('W', { moved: Math.hypot(afterW.x - afterArrow.x, afterW.z - afterArrow.z).toFixed(2) });

const yawA = (await snapshot()).camera.yaw;
await hold('ArrowLeft', 800);
const yawB = (await snapshot()).camera.yaw;
report('ARROWLEFT', { yaw: [yawA.toFixed(2), yawB.toFixed(2)], turned: (yawB - yawA).toFixed(2) });

await page.mouse.click(700, 400);
await page.waitForTimeout(500);
const lockReal = await page.evaluate(() => Boolean(document.pointerLockElement));
const yawC = (await snapshot()).camera.yaw;
await page.mouse.move(1000, 400, { steps: 8 });
await page.waitForTimeout(400);
const yawD = (await snapshot()).camera.yaw;
report('MOUSE', { locked: lockReal, yaw: [yawC.toFixed(2), yawD.toFixed(2)] });

await page.evaluate(() => window.__NAILONG_DEBUG__.teleport(5, 15));
await page.keyboard.press('KeyE');
await page.waitForTimeout(300);
const inCar = (await snapshot()).car;
await hold('w', 1200);
const driven = await snapshot();
report('CAR', { entered: inCar, speedUp: driven.wheelAngle !== null });
await hold('ArrowRight', 800);
const steered = await snapshot();
report('CAR STEER', { yaw: [driven.carYaw.toFixed(2), steered.carYaw.toFixed(2)] });
await page.keyboard.press('KeyE');

await page.evaluate(() => window.__NAILONG_DEBUG__.shoot());
await page.waitForTimeout(400);
report('AUDIO', await page.evaluate(() => ({
  tones: window.__audio.tones, buffers: window.__audio.buffers,
  state: window.__audio.context?.state,
  volume: window.__audio.context ? 'created' : 'missing',
})));

await app.close();
