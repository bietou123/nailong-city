import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'assets');
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const images = [];
try {
  const page = await browser.newPage();
  for (const size of [16, 32, 48, 64, 128, 256]) {
    const data = await page.evaluate((pixels) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = pixels;
      const ctx = canvas.getContext('2d');
      ctx.scale(pixels / 256, pixels / 256);
      ctx.fillStyle = '#ffda69';
      ctx.beginPath();
      ctx.roundRect(0, 0, 256, 256, 22);
      ctx.fill();
      ctx.fillStyle = '#2b5554';
      for (const [x, y, w] of [[11, 184, 37], [54, 157, 35], [95, 175, 30],
        [132, 146, 40], [179, 170, 33], [215, 184, 28]]) {
        ctx.fillRect(x, y, w, 256 - y);
      }
      ctx.fillStyle = '#263f40';
      ctx.font = '900 171px Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('N.', 20, 112);
      return canvas.toDataURL('image/png').split(',')[1];
    }, size);
    images.push({ size, data: Buffer.from(data, 'base64') });
  }
} finally {
  await browser.close();
}

await writeFile(path.join(folder, 'icon.png'), images.at(-1).data);
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach(({ size, data }, index) => {
  const cursor = 6 + index * 16;
  header.writeUInt8(size === 256 ? 0 : size, cursor);
  header.writeUInt8(size === 256 ? 0 : size, cursor + 1);
  header.writeUInt16LE(1, cursor + 4);
  header.writeUInt16LE(32, cursor + 6);
  header.writeUInt32LE(data.length, cursor + 8);
  header.writeUInt32LE(offset, cursor + 12);
  offset += data.length;
});
await writeFile(path.join(folder, 'icon.ico'), Buffer.concat([header,
  ...images.map(({ data }) => data)]));
console.log('Generated 16-256 px Windows icon in assets/');
