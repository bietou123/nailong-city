import * as THREE from 'three';

function random(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function canvasEl(size, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  paint(canvas.getContext('2d'), size);
  return canvas;
}

function textureOf(canvas, repeatX = 1, repeatY = 1,
  colorSpace = THREE.SRGBColorSpace) {
  const result = new THREE.CanvasTexture(canvas);
  result.colorSpace = colorSpace;
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.repeat.set(repeatX, repeatY);
  result.anisotropy = 8;
  return result;
}

function texture(size, paint, repeatX = 1, repeatY = 1) {
  return textureOf(canvasEl(size, paint), repeatX, repeatY);
}

// Tangent-space normals derived from the painted surface, so asphalt and paving
// joints catch the sun instead of reading as flat coloured planes.
function normalFrom(source, strength) {
  const size = source.width;
  const sourceData = source.getContext('2d').getImageData(0, 0, size, size).data;
  const mask = size - 1;
  const luma = (x, y) => {
    const index = ((y & mask) * size + (x & mask)) * 4;
    return (sourceData[index] * 0.299 + sourceData[index + 1] * 0.587 +
      sourceData[index + 2] * 0.114) / 255;
  };
  return canvasEl(size, (ctx) => {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = (luma(x - 1, y) - luma(x + 1, y)) * strength;
        const ny = (luma(x, y - 1) - luma(x, y + 1)) * strength;
        const length = Math.hypot(nx, ny, 1);
        const index = (y * size + x) * 4;
        image.data[index] = (nx / length * 0.5 + 0.5) * 255;
        image.data[index + 1] = (ny / length * 0.5 + 0.5) * 255;
        image.data[index + 2] = (1 / length * 0.5 + 0.5) * 255;
        image.data[index + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
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
  ctx.fillStyle = '#73797c';
  ctx.fillRect(0, 0, size, size);
  grain(ctx, size, 9802, 5600, ['#696f72', '#7b8184', '#757b7e', '#646a6d', '#83898c']);
  const next = random(651);
  ctx.lineWidth = 1;
  for (let i = 0; i < 11; i++) {
    ctx.strokeStyle = i % 3 ? '#4d5457' : '#8b9295';
    ctx.globalAlpha = 0.11;
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
  ctx.globalAlpha = 0.055;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? '#828a8c' : '#5b6265';
    const radius = 28 + next() * 52;
    ctx.beginPath();
    ctx.arc(next() * size, next() * size, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

// Polished tar and oil stains are what make a road look wet in the light; without a
// roughness map the whole surface is a uniform matte grey.
const asphaltRoughnessCanvas = (ctx, size) => {
  ctx.fillStyle = '#cfcfcf';
  ctx.fillRect(0, 0, size, size);
  const next = random(9142);
  for (let i = 0; i < 24; i++) {
    ctx.globalAlpha = 0.22 + next() * 0.3;
    const shade = 105 + next() * 55;
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    const radius = 14 + next() * 52;
    ctx.beginPath();
    ctx.ellipse(next() * size, next() * size, radius, radius * (0.35 + next() * 0.7),
      next() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < 2600; i++) {
    const shade = 130 + next() * 120;
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(next() * size, next() * size, 2 + next() * 4, 2 + next() * 4);
  }
  ctx.globalAlpha = 1;
};

const pavementCanvas = (ctx, size) => {
  ctx.fillStyle = '#a9a79f';
  ctx.fillRect(0, 0, size, size);
  grain(ctx, size, 2204, 6200, ['#98968e', '#b6b3aa', '#8d8b84']);
  ctx.strokeStyle = '#8a8881';
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
  ctx.fillStyle = '#cec8bc';
  ctx.fillRect(0, 0, size, size);
  grain(ctx, size, 3012, 7000, ['#ded8cc', '#b4afa4', '#c5c0b4']);
  ctx.fillStyle = '#a9a49a';
  for (let i = 0; i < size; i += 64) ctx.fillRect(0, i, size, 2);
};

const brickCanvas = (ctx, size) => {
  ctx.fillStyle = '#8a6a57';
  ctx.fillRect(0, 0, size, size);
  const next = random(702);
  for (let row = 0; row < 16; row++) {
    for (let col = -1; col < 8; col++) {
      const x = col * 37 + (row % 2) * 18;
      ctx.fillStyle = ['#96745f', '#a67e63', '#7c5d4d', '#8f6c58'][Math.floor(next() * 4)];
      ctx.fillRect(x + 1, row * 16 + 1, 35, 14);
    }
  }
  grain(ctx, size, 303, 2200, ['#6f5344', '#b08a6d']);
};

const tileCanvas = (ctx, size) => {
  ctx.fillStyle = '#b9c1c2';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#8f9a9e';
  for (let x = 0; x < size; x += 24) ctx.fillRect(x, 0, 2, size);
  for (let y = 0; y < size; y += 56) ctx.fillRect(0, y, size, 3);
  grain(ctx, size, 818, 2200, ['#c8cfcf', '#98a4a7']);
};

function glassCanvas(lit) {
  return (ctx, size) => {
    ctx.fillStyle = lit ? '#8a6e52' : '#6f7c80';
    ctx.fillRect(0, 0, size, size);
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    if (lit) {
      gradient.addColorStop(0, '#f0cd93');
      gradient.addColorStop(0.48, '#5c4c3d');
      gradient.addColorStop(1, '#ffd79b');
    } else {
      gradient.addColorStop(0, '#7e959c');
      gradient.addColorStop(0.36, '#28373e');
      gradient.addColorStop(0.65, '#3c4e56');
      gradient.addColorStop(1, '#8aa0a6');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(8, 8, size - 16, size - 16);
    ctx.fillStyle = lit ? '#ffe3ad' : '#c3d6da';
    ctx.globalAlpha = lit ? 0.3 : 0.22;
    ctx.beginPath();
    ctx.moveTo(size * 0.63, 8);
    ctx.lineTo(size * 0.88, 8);
    ctx.lineTo(size * 0.42, size - 8);
    ctx.lineTo(size * 0.25, size - 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = lit ? '#5f4a3a' : '#58676b';
    ctx.fillRect(size / 2 - 3, 8, 6, size - 16);
    ctx.fillRect(8, size * 0.54, size - 16, 4);
    ctx.fillStyle = '#d8d4c4';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(2, 2, size - 4, 4);
    ctx.globalAlpha = 1;
  };
}

export function createSurfaces() {
  const asphalt = canvasEl(512, asphaltCanvas);
  const asphaltNormal = normalFrom(asphalt, 2.6);
  const asphaltRoughness = canvasEl(512, asphaltRoughnessCanvas);
  const pavement = canvasEl(256, pavementCanvas);
  const pavementNormal = normalFrom(pavement, 2.0);
  const datamap = (canvas, repeatX, repeatY) =>
    textureOf(canvas, repeatX, repeatY, THREE.NoColorSpace);
  const facades = [canvasEl(512, stuccoCanvas), canvasEl(512, brickCanvas),
    canvasEl(512, tileCanvas)];
  return {
    roadVertical: textureOf(asphalt, 1, 42),
    roadHorizontal: textureOf(asphalt, 42, 1),
    roadVerticalNormal: datamap(asphaltNormal, 1, 42),
    roadHorizontalNormal: datamap(asphaltNormal, 42, 1),
    roadVerticalRoughness: datamap(asphaltRoughness, 1, 42),
    roadHorizontalRoughness: datamap(asphaltRoughness, 42, 1),
    pavement: textureOf(pavement, 7, 7),
    pavementNormal: datamap(pavementNormal, 7, 7),
    facades: facades.map((canvas) => textureOf(canvas, 2, 4)),
    facadeNormals: facades.map((canvas) => datamap(normalFrom(canvas, 1.5), 2, 4)),
    windows: [texture(128, glassCanvas(false)), texture(128, glassCanvas(true))],
  };
}
