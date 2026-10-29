import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSurfaces } from './surfaces.js';

export const CITY_LIMIT = 298;
export const ROAD_STEP = 72;
export const GARAGE = { x: 216, z: 0 };

const mat = (color, roughness = 0.86, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
const materials = {
  sidewalk: mat('#dadbd0'), curb: mat('#e4e3d8'),
  stripe: mat('#e9e6cf'), grass: mat('#7fb080'), trunk: mat('#977b61'),
  foliage: mat('#438e6b'), leafLight: mat('#7da976'), dark: mat('#293e46'),
  glass: mat('#75b8bc', 0.29, 0.3), metal: mat('#57696d', 0.43, 0.62),
  white: mat('#f9f2da'), orange: mat('#f4a94e'), yellow: mat('#ffda53'),
};
const box = new THREE.BoxGeometry(1, 1, 1);

function mesh(geometry, material, parent, x, y, z) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = false;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function cube(parent, material, x, y, z, width, height, depth) {
  const object = mesh(box, material, parent, x, y, z);
  object.scale.set(width, height, depth);
  return object;
}

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function textSign(label, fill = '#fff8e4', background = '#194a4b') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#eec47b';
  ctx.fillRect(0, 0, 12, 128);
  ctx.fillRect(0, 120, 512, 8);
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 7; i++) ctx.fillRect(i * 81 + 20, 12, 18, 11);
  ctx.globalAlpha = 1;
  ctx.fillStyle = fill;
  ctx.font = 'bold 57px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
}

function addSign(parent, label, x, y, z, width, front = true, fill, background) {
  const sign = mesh(new THREE.PlaneGeometry(width, width / 4),
    textSign(label, fill, background), parent, x, y, z);
  if (!front) sign.rotation.y = Math.PI;
  return sign;
}

function staticCollider(physics, x, z, width, depth, height) {
  const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(
    new CANNON.Vec3(width / 2, height / 2, depth / 2)) });
  body.position.set(x, height / 2, z);
  physics.addBody(body);
  return body;
}

function building(scene, physics, rng, x, z, width, depth, height, district, windows, surfaces, colliders) {
  const palettes = [
    ['#e4ba96', '#d39e7e'], ['#e6dbbc', '#c7b897'], ['#adc7bc', '#85a9a1'],
    ['#d5abb0', '#b98490'], ['#95bbc4', '#6c9ca9'], ['#bbb7b0', '#96938f'],
  ];
  const palette = palettes[Math.floor(rng() * palettes.length)];
  const style = Math.floor(rng() * 3);
  const facade = new THREE.MeshStandardMaterial({ color: palette[0],
    map: surfaces.facades[style], roughness: style === 2 ? 0.51 : 0.87,
    metalness: style === 2 ? 0.18 : 0 });
  const border = mat(palette[1]);
  const structure = cube(scene, facade, x, height / 2, z, width, height, depth);
  structure.castShadow = true;
  cube(scene, border, x, height + 0.35, z, width + 0.65, 0.7, depth + 0.65);
  cube(scene, border, x, 1.45, z + depth / 2 + 0.07, width, 2.9, 0.15);
  cube(scene, border, x, 1.45, z - depth / 2 - 0.07, width, 2.9, 0.15);
  if (style === 2 && height > 24) {
    cube(scene, materials.metal, x, height + 0.8, z, width * 0.7, 0.8, depth * 0.72);
    cube(scene, materials.dark, x - 1.7, height + 2.2, z + 1.2, 4, 2, 3.4);
  } else if (height > 26) {
    cube(scene, border, x + 2.5, height + 0.9, z - 3, 6, 1.1, 5);
  }
  const rows = Math.min(11, Math.floor((height - 3) / 3.3));
  const cols = Math.max(2, Math.floor(width / 3.1));
  const sideCols = Math.max(2, Math.floor(depth / 3.1));
  const nearCenter = Math.abs(x) + Math.abs(z) < 230;
  for (let row = 0; row < rows; row++) {
    const wy = 4.4 + row * 3.3;
    for (let col = 0; col < cols; col++) {
      const wx = x + (col + 0.5 - cols / 2) * (width - 1.4) / cols;
      windows.push([wx, wy, z + depth / 2 + 0.09,
        Math.min(1.55, (width - 1.4) / cols - 0.35), 1.7, 0.12,
        rng() > 0.83 || district === 'harbor' && rng() > 0.89]);
      windows.push([wx, wy, z - depth / 2 - 0.09,
        Math.min(1.55, (width - 1.4) / cols - 0.35), 1.7, 0.12, rng() > 0.86]);
    }
    for (let col = 0; col < sideCols; col++) {
      const wz = z + (col + 0.5 - sideCols / 2) * (depth - 1.4) / sideCols;
      windows.push([x + width / 2 + 0.09, wy, wz, 0.12, 1.7,
        Math.min(1.55, (depth - 1.4) / sideCols - 0.35), rng() > 0.88]);
      windows.push([x - width / 2 - 0.09, wy, wz, 0.12, 1.7,
        Math.min(1.55, (depth - 1.4) / sideCols - 0.35), rng() > 0.86]);
    }
  }
  if (nearCenter) {
    for (let col = 0; col < cols; col++) {
      const wx = x + (col + 0.5 - cols / 2) * (width - 1.4) / cols;
      const windowWidth = Math.min(1.7, (width - 1.4) / cols - 0.25);
      windows.push([wx, 1.45, z + depth / 2 + 0.28,
        windowWidth, 2.15, 0.12, false]);
      windows.push([wx, 1.45, z - depth / 2 - 0.28,
        windowWidth, 2.15, 0.12, false]);
    }
    for (let col = 0; col < sideCols; col++) {
      const wz = z + (col + 0.5 - sideCols / 2) * (depth - 1.4) / sideCols;
      const windowWidth = Math.min(1.7, (depth - 1.4) / sideCols - 0.25);
      windows.push([x + width / 2 + 0.29, 1.45, wz,
        0.12, 2.15, windowWidth, false]);
      windows.push([x - width / 2 - 0.29, 1.45, wz,
        0.12, 2.15, windowWidth, false]);
    }
  }
  if (nearCenter && style !== 2) {
    for (const side of [-1, 1]) {
      cube(scene, border, x + side * (width / 2 + 0.13), height / 2, z,
        0.23, height, 0.65);
      cube(scene, border, x, height / 2, z + side * (depth / 2 + 0.14),
        0.65, height, 0.23);
    }
    for (let floor = 3; floor < height - 1; floor += 9.9) {
      cube(scene, border, x, floor, z + depth / 2 + 0.16, width + 0.2, 0.15, 0.27);
      cube(scene, border, x, floor, z - depth / 2 - 0.16, width + 0.2, 0.15, 0.27);
    }
  }
  const labels = ['甜 甜 圈', '漫游咖啡', '街角小店', '海风唱片', '新鲜果汁', '晚风书屋'];
  const label = labels[Math.floor(rng() * labels.length)];
  if (rng() > 0.32 && height < 36) {
    addSign(scene, label, x, 2.12,
      z + depth / 2 + 0.25, Math.min(width - 2, 11));
    addSign(scene, label, x, 2.12,
      z - depth / 2 - 0.25, Math.min(width - 2, 11), false);
  }
  if (nearCenter || height < 35) {
    const shop = height < 35;
    const awning = mat(['#dd8777', '#d9b877', '#5f9891'][style]);
    for (const side of [-1, 1]) {
      cube(scene, shop ? awning : materials.metal, x, 3.06,
        z + side * (depth / 2 + 0.75), Math.min(width - 1, shop ? 14 : 8),
        0.17, 1.45);
      cube(scene, materials.glass, x, 1.35, z + side * (depth / 2 + 0.18),
        Math.min(width - 2, shop ? 11 : 7), 2.35, 0.1);
      for (const offset of [-1.7, 1.7]) cube(scene, materials.metal,
        x + offset, 1.4, z + side * (depth / 2 + 0.25), 0.08, 2.5, 0.08);
    }
    const nearRoad = Math.round(x / ROAD_STEP) * ROAD_STEP;
    const side = nearRoad < x ? -1 : 1;
    cube(scene, shop ? awning : materials.metal, x + side * (width / 2 + 0.75),
      3.05, z, 1.45, 0.17, Math.min(depth - 1, shop ? 13 : 8));
    cube(scene, materials.glass, x + side * (width / 2 + 0.17), 1.3, z,
      0.12, 2.2, Math.min(depth - 2, shop ? 11 : 7));
    cube(scene, materials.dark, x + side * (width / 2 + 0.28), 1.37, z + 2,
      0.14, 2.6, 1.65);
    if (shop) {
      const sign = mesh(new THREE.PlaneGeometry(Math.min(depth - 2, 11), 1.8),
        textSign(label), scene, x + side * (width / 2 + 0.28), 2.35, z);
      sign.rotation.y = side * Math.PI / 2;
    }
  }
  colliders?.push(staticCollider(physics, x, z, width, depth, height));
}

function tree(scene, x, z, palm = false) {
  const height = palm ? 6.1 : 3.5;
  const trunk = mesh(new THREE.CylinderGeometry(palm ? 0.21 : 0.31, 0.43, height, 8),
    materials.trunk, scene, x, height / 2, z);
  trunk.castShadow = true;
  if (palm) {
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      const frond = mesh(new THREE.SphereGeometry(1, 9, 6),
        i % 2 ? materials.foliage : materials.leafLight, scene,
        x + Math.sin(angle) * 1.05, 6.25, z + Math.cos(angle) * 1.05);
      frond.scale.set(0.45, 0.15, 1.65);
      frond.rotation.y = angle;
      frond.rotation.x = -0.1;
    }
  } else {
    for (const [dx, dy, dz, radius] of [[0, 4.1, 0, 1.55],
      [-0.85, 3.8, 0.15, 1.04], [0.86, 3.85, 0, 1.13],
      [0.15, 4.25, -0.85, 0.98]]) {
      const crown = mesh(new THREE.IcosahedronGeometry(radius, 1),
        dx > 0 ? materials.leafLight : materials.foliage,
        scene, x + dx, dy, z + dz);
      crown.castShadow = dx === 0;
    }
  }
}

function park(scene, rng, x, z, landmark = false) {
  cube(scene, materials.grass, x, 0.13, z, 56, 0.12, 56);
  cube(scene, materials.sidewalk, x, 0.22, z, 5, 0.05, 56);
  cube(scene, materials.sidewalk, x, 0.22, z, 56, 0.05, 5);
  const planter = mat('#d4a992');
  for (let i = 0; i < 11; i++) {
    const tx = x + (rng() - 0.5) * 48;
    const tz = z + (rng() - 0.5) * 48;
    if (Math.abs(tx - x) > 4 && Math.abs(tz - z) > 4) tree(scene, tx, tz);
  }
  for (const shift of [-16, 16]) {
    cube(scene, planter, x + shift, 0.55, z + 13, 5, 0.6, 1.3);
    cube(scene, materials.dark, x + shift, 0.9, z + 13, 5, 0.25, 1.2);
  }
  if (landmark) {
    const rim = mesh(new THREE.CylinderGeometry(3.35, 3.45, 0.9, 24),
      materials.curb, scene, x, 0.63, z);
    rim.castShadow = true;
    mesh(new THREE.CylinderGeometry(2.95, 2.95, 0.05, 24),
      mat('#62b7c3', 0.22, 0.12), scene, x, 1.1, z);
    mesh(new THREE.CylinderGeometry(0.38, 0.6, 1.9, 12),
      materials.curb, scene, x, 1.95, z);
    mesh(new THREE.SphereGeometry(0.85, 14, 9),
      mat('#c0e7d7', 0.25), scene, x, 3.1, z);
  }
}

function streetLamp(scene, x, z, lamps) {
  cube(scene, materials.metal, x, 3.65, z, 0.18, 7.3, 0.18);
  cube(scene, materials.metal, x + 0.85, 7.3, z, 1.82, 0.14, 0.16);
  const shade = cube(scene, new THREE.MeshStandardMaterial({ color: '#f7e5b2',
    roughness: 0.25, emissive: '#ffd98a', emissiveIntensity: 0.08 }),
  x + 1.55, 7.19, z, 0.67, 0.12, 0.44);
  cube(scene, materials.dark, x, 0.29, z, 0.44, 0.58, 0.44);
  lamps.push({ material: shade.material, x: x + 1.4, y: 6.4, z });
}

function streetFurniture(scene, x, z, rng) {
  const bench = mat('#986e55');
  cube(scene, bench, x, 0.68, z, 3.6, 0.19, 0.67);
  cube(scene, bench, x, 1.14, z - 0.3, 3.6, 0.82, 0.13);
  for (const side of [-1, 1]) cube(scene, materials.metal,
    x + side * 1.37, 0.39, z, 0.17, 0.6, 0.5);
  if (rng() > 0.55) {
    const can = mesh(new THREE.CylinderGeometry(0.32, 0.31, 0.8, 10),
      materials.metal, scene, x + 3.1, 0.45, z + 0.3);
    can.castShadow = true;
  }
}

function trafficSignal(scene, x, z, alongX) {
  const signal = mat('#243943', 0.55, 0.36);
  cube(scene, materials.metal, x, 3.3, z, 0.18, 6.6, 0.18);
  cube(scene, materials.metal, x + (alongX ? -1.5 : 1.5), 6.4, z,
    3.1, 0.15, 0.15);
  const housingX = x + (alongX ? -2.9 : 2.9);
  cube(scene, signal, housingX, 5.83, z, 0.42, 1.13, 0.41);
  for (const [height, color] of [[6.15, '#e6705f'], [5.83, '#e6c06a'],
    [5.52, '#64b890']]) {
    const lightMaterial = new THREE.MeshStandardMaterial({ color,
      emissive: color, emissiveIntensity: 0.72 });
    for (const face of [-1, 1]) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 9, 7), lightMaterial);
      light.position.set(housingX, height, z + face * 0.24);
      scene.add(light);
    }
  }
}

function busStop(scene, x, z) {
  const glass = new THREE.MeshStandardMaterial({ color: '#8fc1c5',
    roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.69 });
  for (const shift of [-3.2, 3.2]) {
    cube(scene, materials.metal, x + 1.35, 1.46, z + shift, 0.15, 2.9, 0.15);
    cube(scene, materials.metal, x - 0.85, 1.46, z + shift, 0.15, 2.9, 0.15);
  }
  cube(scene, materials.dark, x + 0.25, 3.02, z, 2.9, 0.19, 7.1);
  cube(scene, glass, x + 1.43, 1.53, z, 0.08, 2.46, 6.2);
  cube(scene, mat('#d2a568'), x + 0.15, 0.67, z, 1.25, 0.18, 4.1);
  cube(scene, materials.metal, x + 0.15, 0.35, z - 1.5, 0.1, 0.52, 0.11);
  cube(scene, materials.metal, x + 0.15, 0.35, z + 1.5, 0.1, 0.52, 0.11);
  const banner = mesh(new THREE.PlaneGeometry(3.1, 0.77),
    textSign('CITY 07', '#fff3d5', '#2f716d'), scene, x - 1.01, 2.51, z);
  banner.rotation.y = -Math.PI / 2;
}

function roadMarkings(scene) {
  const dashes = [];
  const crossings = [];
  const stops = [];
  const edges = [];
  for (let line = -4; line <= 4; line++) {
    const road = line * ROAD_STEP;
    for (let block = -4; block < 4; block++) {
      const middle = (block + 0.5) * ROAD_STEP;
      for (const side of [-1, 1]) {
        edges.push([road + side * 6.9, middle, 0.085, ROAD_STEP - 31]);
        edges.push([middle, road + side * 6.9, ROAD_STEP - 31, 0.085]);
      }
    }
    for (let mark = -295; mark <= 295; mark += 13) {
      if (Math.abs(mark - Math.round(mark / ROAD_STEP) * ROAD_STEP) < 13) continue;
      dashes.push([road, mark, 0.16, 3.9]);
      dashes.push([mark, road, 3.9, 0.16]);
    }
    for (let other = -4; other <= 4; other++) {
      const cross = other * ROAD_STEP;
      for (const side of [-1, 1]) {
        stops.push([road, cross + side * 17, 11.1, 0.25]);
        stops.push([road + side * 17, cross, 0.25, 11.1]);
        for (let lane = -4; lane <= 4; lane++) {
          crossings.push([road + lane * 1.18, cross + side * 11.6, 0.73, 3.2]);
          crossings.push([road + side * 11.6, cross + lane * 1.18, 3.2, 0.73]);
        }
      }
    }
  }
  const plane = new THREE.PlaneGeometry(1, 1);
  const dummy = new THREE.Object3D();
  for (const [positions, color, height] of [
    [dashes, '#e0d6ab', 0.116], [crossings, '#cecec3', 0.119],
    [stops, '#ede6cc', 0.12], [edges, '#d9ddcf', 0.113],
  ]) {
    const instances = new THREE.InstancedMesh(plane,
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }), positions.length);
    positions.forEach(([x, z, width, depth], index) => {
      dummy.position.set(x, height, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(width, depth, 1);
      dummy.updateMatrix();
      instances.setMatrixAt(index, dummy.matrix);
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.frustumCulled = false;
    scene.add(instances);
  }
}

export function makeCar(scene, color, x, z, yaw = 0, type = 'city') {
  const group = new THREE.Group();
  const paint = mat(color, 0.26, 0.28);
  const tires = mat('#202b32');
  const rims = mat('#b5c5c0', 0.21, 0.7);
  const windshield = new THREE.MeshStandardMaterial({ color: '#6296a5',
    roughness: 0.09, metalness: 0.56, side: THREE.DoubleSide });
  const trim = mat('#2d4045', 0.45, 0.3);
  const brakeLights = new THREE.MeshStandardMaterial({ color: '#bd3e3c',
    emissive: '#d33736', emissiveIntensity: 0.34 });
  const headlights = new THREE.MeshStandardMaterial({ color: '#f8ecd2',
    emissive: '#ffe5a7', emissiveIntensity: 0.45 });
  const wheels = [];
  const length = type === 'van' ? 5.4 : 4.5;
  const chassis = mesh(new RoundedBoxGeometry(2.65, 0.82, length, 3, 0.18),
    paint, group, 0, 0.92, 0);
  chassis.castShadow = true;
  cube(group, trim, 0, 0.56, 0, 2.48, 0.22, length - 0.3);
  mesh(new RoundedBoxGeometry(2.18, type === 'van' ? 1.15 : 0.88,
    type === 'van' ? 2.65 : 2.45, 3, 0.18), paint, group, 0, 1.58, -0.28);
  cube(group, trim, 0, 1.93, -0.32, 1.94, 0.05, 1.72);
  function glassPanel(points) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    mesh(geometry, windshield, group, 0, 0, 0);
  }
  glassPanel([[-0.97, 1.3, 1.0], [0.97, 1.3, 1.0],
    [0.95, 1.91, 0.6], [-0.95, 1.91, 0.6]]);
  glassPanel([[0.95, 1.3, -1.57], [-0.95, 1.3, -1.57],
    [-0.95, 1.91, -1.38], [0.95, 1.91, -1.38]]);
  for (const side of [-1, 1]) {
    glassPanel([[side * 1.105, 1.27, 0.68], [side * 1.105, 1.27, -1.36],
      [side * 1.105, 1.89, -1.29], [side * 1.105, 1.89, 0.48]]);
    cube(group, paint, side * 1.14, 1.1, 0.66, 0.15, 0.18, 0.34);
    cube(group, trim, side * 1.22, 1.26, 0.83, 0.28, 0.16, 0.35);
    cube(group, trim, side * 1.33, 0.82, -0.18, 0.06, 0.04, 1.5);
    for (const front of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 1.35, 0.47, front * 1.48);
      group.add(pivot);
      const tire = mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.28, 16),
        tires, pivot, 0, 0, 0);
      tire.rotation.z = Math.PI / 2;
      const rim = mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.30, 12),
        rims, pivot, side * 0.02, 0, 0);
      rim.rotation.z = Math.PI / 2;
      wheels.push(pivot);
    }
    cube(group, headlights, side * 0.89, 0.95, length / 2 + 0.01, 0.61, 0.24, 0.08);
    cube(group, brakeLights, side * 0.89, 0.98, -length / 2 - 0.01, 0.61, 0.22, 0.08);
  }
  cube(group, trim, 0, 0.59, length / 2 + 0.07, 2.1, 0.15, 0.14);
  cube(group, trim, 0, 0.59, -length / 2 - 0.07, 2.1, 0.15, 0.14);
  cube(group, materials.white, 0, 0.92, -length / 2 - 0.075, 0.78, 0.27, 0.03);
  cube(group, trim, 0, 0.82, length / 2 + 0.08, 0.76, 0.28, 0.05);
  if (type === 'police') {
    cube(group, materials.white, 0, 2.04, 0, 0.88, 0.12, 0.3);
    cube(group, mat('#e05c59'), -0.22, 2.12, 0, 0.4, 0.15, 0.32);
    cube(group, mat('#4bacc6'), 0.22, 2.12, 0, 0.4, 0.15, 0.32);
  }
  group.userData.wheels = wheels;
  group.userData.brakeLights = brakeLights;
  group.userData.headlights = headlights;
  group.userData.type = type;
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  scene.add(group);
  return group;
}

function dragon(scene) {
  const group = new THREE.Group();
  const yellow = mat('#fbd340', 0.52);
  const pale = mat('#ffefae', 0.72);
  const orange = mat('#eb9a54', 0.64);
  const blush = mat('#ed9990');
  const black = mat('#20383a', 0.19);
  function sphere(parent, material, x, y, z, sx, sy, sz) {
    const part = mesh(new THREE.SphereGeometry(1, 24, 16), material, parent, x, y, z);
    part.scale.set(sx, sy, sz);
    part.castShadow = true;
    return part;
  }
  sphere(group, yellow, 0, 1.21, 0, 0.82, 0.99, 0.7);
  sphere(group, pale, 0, 1.22, 0.57, 0.56, 0.73, 0.22);
  const head = new THREE.Group();
  head.position.set(0, 2.17, 0.13);
  group.add(head);
  sphere(head, yellow, 0, 0.18, 0, 0.88, 0.74, 0.76);
  sphere(head, pale, 0, -0.06, 0.66, 0.57, 0.31, 0.34);
  sphere(head, orange, 0, -0.07, 0.974, 0.155, 0.07, 0.06);
  for (const side of [-1, 1]) {
    sphere(head, pale, side * 0.34, 0.18, 0.71, 0.24, 0.3, 0.16);
    sphere(head, black, side * 0.34, 0.16, 0.86, 0.13, 0.19, 0.08);
    sphere(head, pale, side * 0.37 - 0.035, 0.25, 0.93, 0.043, 0.06, 0.024);
    sphere(head, blush, side * 0.67, -0.1, 0.61, 0.17, 0.09, 0.05);
    sphere(head, yellow, side * 0.79, 0.03, -0.25, 0.22, 0.3, 0.22);
    const horn = mesh(new THREE.ConeGeometry(0.23, 0.75, 9), pale,
      head, side * 0.54, 0.89, -0.2);
    horn.rotation.z = side * 0.23;
  }
  const arms = [];
  const legs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.69, 1.65, 0.18);
    group.add(arm);
    sphere(arm, yellow, side * 0.22, -0.21, 0.08, 0.27, 0.45, 0.3);
    sphere(arm, pale, side * 0.3, -0.44, 0.17, 0.21, 0.16, 0.23);
    arms.push(arm);
    const leg = new THREE.Group();
    leg.position.set(side * 0.4, 0.61, 0.05);
    group.add(leg);
    sphere(leg, yellow, 0, -0.18, 0.02, 0.33, 0.43, 0.42);
    sphere(leg, pale, 0, -0.46, 0.33, 0.3, 0.14, 0.37);
    legs.push(leg);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 1.06, -0.64);
  group.add(tail);
  const tailShape = sphere(tail, yellow, 0, -0.13, -0.52, 0.39, 0.37, 0.93);
  tailShape.rotation.x = -0.32;
  sphere(tail, orange, 0, -0.19, -1.25, 0.18, 0.17, 0.19);
  for (let i = 0; i < 4; i++) {
    const spike = mesh(new THREE.ConeGeometry(0.26 - i * 0.025, 0.64, 7),
      orange, group, 0, 2.82 - i * 0.43, -0.53 - i * 0.13);
    spike.rotation.x = -0.62;
  }
  group.userData.rig = { head, arms, legs, tail };
  group.userData.materials = { body: yellow, belly: pale, accent: orange };
  scene.add(group);
  return group;
}

export function createWorld(scene, physics) {
  const rng = randomGenerator(20261029);
  const windows = [];
  const lamps = [];
  const windowMaterials = [];
  const colliders = [];
  const surfaces = createSurfaces();
  const roadVertical = new THREE.MeshStandardMaterial({ map: surfaces.roadVertical,
    color: '#f6f7f5', roughness: 1 });
  const roadHorizontal = new THREE.MeshStandardMaterial({ map: surfaces.roadHorizontal,
    color: '#f6f7f5', roughness: 1 });
  const pavement = new THREE.MeshStandardMaterial({ map: surfaces.pavement,
    color: '#f7f6ee', roughness: 0.98 });
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physics.addBody(ground);
  const base = mesh(new THREE.PlaneGeometry(1400, 1400), mat('#a6b9a4'), scene, 0, -0.065, 0);
  base.rotation.x = -Math.PI / 2;
  const sea = mesh(new THREE.PlaneGeometry(1400, 800), mat('#68c6c9', 0.5), scene, 0, -0.025, -705);
  sea.rotation.x = -Math.PI / 2;
  const beach = mesh(new THREE.PlaneGeometry(620, 39), mat('#e5d59f'), scene, 0, 0.015, -319);
  beach.rotation.x = -Math.PI / 2;
  for (let line = -4; line <= 4; line++) {
    const coordinate = line * ROAD_STEP;
    mesh(new THREE.PlaneGeometry(15, 614), roadVertical, scene,
      coordinate, 0.065, 0).rotation.x = -Math.PI / 2;
    mesh(new THREE.PlaneGeometry(614, 15), roadHorizontal, scene,
      0, 0.07, coordinate).rotation.x = -Math.PI / 2;
  }
  roadMarkings(scene);
  const parkBlocks = new Set(['-2,1', '2,-2', '1,1', '-3,-3', '-1,0']);
  for (let i = -4; i < 4; i++) {
    for (let j = -4; j < 4; j++) {
      const x = (i + 0.5) * ROAD_STEP;
      const z = (j + 0.5) * ROAD_STEP;
      cube(scene, materials.curb, x, 0.13, z, 58.5, 0.19, 58.5);
      cube(scene, pavement, x, 0.22, z, 56, 0.05, 56);
      if (parkBlocks.has(`${i},${j}`)) {
        park(scene, rng, x, z, i === -1 && j === 0);
      } else {
        const district = z < -140 ? 'harbor' : 'center';
        const split = rng() > 0.4;
        for (const half of [-1, 1]) {
          const bx = x + (split ? half * 12.1 : 0);
          const bz = z + (split ? 0 : half * 12.1);
          const width = split ? 20 + rng() * 2.3 : 35 + rng() * 4;
          const depth = split ? 35 + rng() * 4 : 20 + rng() * 2.3;
          const height = i === 0 && j === 0 ? 15 + rng() * 9 :
            12 + rng() * (Math.abs(i) < 2 && Math.abs(j) < 2 ? 43 : 23);
          building(scene, physics, rng, bx, bz, width, depth,
            height, district, windows, surfaces, colliders);
        }
      }
      if ((i + j) % 3 === 0) streetLamp(scene, x - 27, z - 27, lamps);
      if (rng() > 0.56) tree(scene, x - 25, z + 25, z < -140);
      if (Math.abs(i) < 3 && Math.abs(j) < 3 && (i + j) % 2 === 0)
        streetFurniture(scene, x - 19, z + 25, rng);
    }
  }
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      if (i === 0 && j === 0) continue;
      trafficSignal(scene, i * ROAD_STEP + 8.7, j * ROAD_STEP + 8.7, (i + j) % 2 === 0);
    }
  }
  for (let z = -255; z <= 252; z += 43) {
    if (Math.abs(z) < 14 || z > 12 && z < 63) continue;
    tree(scene, -11.6, z);
    tree(scene, 11.6, z + 12);
  }
  tree(scene, -11.6, 28);
  tree(scene, 11.6, 27);
  busStop(scene, 10.5, 43);
  busStop(scene, -11.2, -101);
  const dummy = new THREE.Object3D();
  for (const lit of [false, true]) {
    for (const side of [false, true]) {
      const instances = windows.filter((window) => window[6] === lit &&
        (window[3] < window[5]) === side);
      const glass = new THREE.MeshStandardMaterial({ map: surfaces.windows[lit ? 1 : 0],
        color: '#ffffff', roughness: 0.23, metalness: 0.14, side: THREE.DoubleSide,
        emissive: lit ? '#bd824c' : '#193942', emissiveIntensity: lit ? 0.19 : 0.05 });
      if (lit) windowMaterials.push(glass);
      const geometry = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
        glass, instances.length);
      instances.forEach((window, index) => {
        dummy.position.set(window[0], window[1], window[2]);
        dummy.rotation.y = side ? Math.PI / 2 : 0;
        dummy.scale.set(side ? window[5] : window[3], window[4], 1);
        dummy.updateMatrix();
        geometry.setMatrixAt(index, dummy.matrix);
      });
      geometry.instanceMatrix.needsUpdate = true;
      geometry.frustumCulled = false;
      scene.add(geometry);
    }
  }
  for (let x = -270; x <= 270; x += 29) tree(scene, x, -313, true);
  const garagePad = cube(scene, mat('#ebbd76'), GARAGE.x, 0.2, GARAGE.z, 16, 0.16, 17);
  garagePad.rotation.y = 0;
  addSign(scene, '修 理 站', GARAGE.x, 3.1, GARAGE.z - 9, 11, false,
    '#ffffff', '#245f60');

  const cars = [];
  const colors = ['#e88370', '#f6c55c', '#71b6b2', '#f2f0dc', '#8c94b9', '#b7d6a5'];
  const carSpots = [
    [5, 19, 0], [-5, -43, Math.PI], [77, -18, 0], [-76, 39, Math.PI],
    [148, 109, 0], [-148, -94, Math.PI], [220, 38, 0], [-220, 123, Math.PI],
    [4, -183, 0], [-4, 188, Math.PI], [145, -219, 0], [-143, 220, Math.PI],
  ];
  for (let index = 0; index < carSpots.length; index++) {
    const [x, z, yaw] = carSpots[index];
    const car = { mesh: makeCar(scene, colors[index % colors.length], x, z, yaw,
      index === 6 ? 'van' : 'city'), x, z, yaw, speed: 0,
      name: index === 6 ? '海风货车' : '城市小车', body: null,
      durability: 100, maxDurability: 100, burning: 0, dead: false };
    const body = new CANNON.Body({ mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(1.3, 0.9, 2.3)) });
    body.position.set(x, 0.9, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
    physics.addBody(body);
    car.body = body;
    cars.push(car);
  }
  const traffic = [];
  for (let i = 0; i < 17; i++) {
    const road = (Math.floor(rng() * 7) - 3) * ROAD_STEP;
    const alongX = i % 2 === 0;
    const direction = rng() > 0.5 ? 1 : -1;
    const x = alongX ? rng() * 550 - 275 : road + direction * 3.8;
    const z = alongX ? road - direction * 3.8 : rng() * 550 - 275;
    const yaw = alongX ? direction * Math.PI / 2 : (direction === 1 ? 0 : Math.PI);
    const model = makeCar(scene, colors[(i + 2) % colors.length], x, z, yaw,
      i === 3 ? 'police' : 'city');
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC,
      shape: new CANNON.Box(new CANNON.Vec3(1.3, 0.9, 2.3)) });
    body.position.set(x, 0.9, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
    physics.addBody(body);
    traffic.push({ mesh: model, body, x, z, yaw, alongX, direction,
      velocity: 8 + rng() * 5 });
  }
  const people = [];
  const clothes = ['#5f9a9c', '#e49480', '#a79abb', '#efa953', '#81a878'];
  const nearby = [[-11, 35], [11, 66], [-11, 88], [11, 107],
    [-11, -29], [11, -63], [-11, 147], [11, -126]];
  for (let i = 0; i < 35; i++) {
    const road = (Math.floor(rng() * 8) - 4) * ROAD_STEP;
    const alongX = i < nearby.length ? false : i % 2 === 0;
    const coordinate = rng() * 560 - 280;
    const x = i < nearby.length ? nearby[i][0] :
      alongX ? coordinate : road + (rng() > 0.5 ? 10.4 : -10.4);
    const z = i < nearby.length ? nearby[i][1] :
      alongX ? road + (rng() > 0.5 ? 10.4 : -10.4) : coordinate;
    const person = new THREE.Group();
    cube(person, mat(clothes[i % clothes.length]), 0, 1.38, 0, 0.64, 1.05, 0.4);
    mesh(new THREE.SphereGeometry(0.27, 10, 8), mat('#e4b18f'), person, 0, 2.16, 0);
    mesh(new THREE.SphereGeometry(0.28, 10, 8), mat('#3e4545'),
      person, 0, 2.34, -0.04).scale.y = 0.35;
    for (const side of [-1, 1]) cube(person, mat(clothes[i % clothes.length]),
      side * 0.43, 1.37, 0, 0.2, 0.87, 0.24);
    cube(person, materials.dark, -0.16, 0.48, 0, 0.19, 0.85, 0.23);
    cube(person, materials.dark, 0.16, 0.48, 0, 0.19, 0.85, 0.23);
    person.position.set(x, 0, z);
    scene.add(person);
    people.push({ mesh: person, x, z, alongX, direction: rng() > 0.5 ? 1 : -1,
      speed: 0.65 + rng() * 0.45, stunned: 0 });
  }
  const actor = dragon(scene);
  return { actor, cars, traffic, people, garage: GARAGE, lamps, windowMaterials,
    colliders };
}
