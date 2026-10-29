import * as THREE from 'three';

function random(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function texture(size, paint, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  paint(canvas.getContext('2d'), size);
  const result = new THREE.CanvasTexture(canvas);
  result.colorSpace = THREE.SRGBColorSpace;
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.repeat.set(repeatX, repeatY);
  result.anisotropy = 8;
  return result;
}

function grain(ctx, size, seed, count, colors) {
  const next = random(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(next() * colors.length)];
    const width = 1 + next() * 2;
    ctx.fillRect(next() * size, next() * size, width, width);
  }
}

const asphaltCanvas = (ctx, size) => {
  ctx.fillStyle = '#535d60';
  ctx.fillRect(0, 0, size, size);
  grain(ctx, size, 9802, 4800, ['#4f585b', '#626d70', '#596265', '#4b5558']);
  const next = random(651);
  ctx.lineWidth = 1;
  for (let i = 0; i < 11; i++) {
    ctx.strokeStyle = i % 3 ? '#313e43' : '#7c898b';
    ctx.globalAlpha = 0.14;
    ctx.beginPath();
    let x = next() * size;
    let y = next() * size;
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (next() - 0.5) * 17;
      y += next() * 13;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

const pavementCanvas = (ctx, size) => {
  ctx.fillStyle = '#dddcd0';
  ctx.fillRect(0, 0, size, size);
  grain(ctx, size, 2204, 6200, ['#c6c9c0', '#edebdf', '#adb5ac']);
  ctx.strokeStyle = '#b0b7ae';
  ctx.lineWidth = 2;
  for (let i = 0; i <= size; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
};

const stuccoCanvas = (ctx, size) => {
  ctx.fillStyle = '#f1eee5';
  ctx.fillRect(0, 0, size, size);
  grain(ctx, size, 3012, 7000, ['#fffdf4', '#c6c6bd', '#e1ded2']);
  ctx.fillStyle = '#cfd0c6';
  for (let i = 0; i < size; i += 64) ctx.fillRect(0, i, size, 2);
};

const brickCanvas = (ctx, size) => {
  ctx.fillStyle = '#d2c7b7';
  ctx.fillRect(0, 0, size, size);
  const next = random(702);
  for (let row = 0; row < 16; row++) {
    for (let col = -1; col < 8; col++) {
      const x = col * 37 + (row % 2) * 18;
      ctx.fillStyle = ['#e0d4c2', '#f0e1cd', '#d6c5b3', '#e8d9c6'][Math.floor(next() * 4)];
      ctx.fillRect(x + 1, row * 16 + 1, 35, 14);
    }
  }
  grain(ctx, size, 303, 2200, ['#c8b8a7', '#f9ead6']);
};

const tileCanvas = (ctx, size) => {
  ctx.fillStyle = '#dce4df';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#acbebd';
  for (let x = 0; x < size; x += 24) ctx.fillRect(x, 0, 2, size);
  for (let y = 0; y < size; y += 56) ctx.fillRect(0, y, size, 3);
  grain(ctx, size, 818, 2200, ['#edf2ea', '#b9c9c7']);
};

function glassCanvas(lit) {
  return (ctx, size) => {
    ctx.fillStyle = lit ? '#a98867' : '#a4aaa2';
    ctx.fillRect(0, 0, size, size);
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    if (lit) {
      gradient.addColorStop(0, '#e8c98d');
      gradient.addColorStop(0.48, '#786d59');
      gradient.addColorStop(1, '#f4d396');
    } else {
      gradient.addColorStop(0, '#90b5bd');
      gradient.addColorStop(0.36, '#365e69');
      gradient.addColorStop(0.65, '#53717c');
      gradient.addColorStop(1, '#9bc5c6');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(8, 8, size - 16, size - 16);
    ctx.fillStyle = lit ? '#f5dca8' : '#b8dce0';
    ctx.globalAlpha = lit ? 0.34 : 0.27;
    ctx.beginPath();
    ctx.moveTo(size * 0.63, 8);
    ctx.lineTo(size * 0.88, 8);
    ctx.lineTo(size * 0.42, size - 8);
    ctx.lineTo(size * 0.25, size - 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = lit ? '#715b4c' : '#7d9799';
    ctx.fillRect(size / 2 - 3, 8, 6, size - 16);
    ctx.fillRect(8, size * 0.54, size - 16, 4);
    ctx.fillStyle = '#f6f2dc';
    ctx.globalAlpha = 0.7;
    ctx.fillRect(2, 2, size - 4, 4);
    ctx.globalAlpha = 1;
  };
}

export function createSurfaces() {
  return {
    roadVertical: texture(512, asphaltCanvas, 1, 42),
    roadHorizontal: texture(512, asphaltCanvas, 42, 1),
    pavement: texture(256, pavementCanvas, 7, 7),
    facades: [texture(256, stuccoCanvas, 2, 4), texture(256, brickCanvas, 2, 4),
      texture(256, tileCanvas, 2, 4)],
    windows: [texture(128, glassCanvas(false)), texture(128, glassCanvas(true))],
  };
}
