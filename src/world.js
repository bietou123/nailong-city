import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export const CITY_LIMIT = 298;
export const ROAD_STEP = 72;
export const GARAGE = { x: 216, z: 0 };

const mat = (color, roughness = 0.86, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
const materials = {
  asphalt: mat('#37494d'), sidewalk: mat('#c9d4cb'), curb: mat('#ecede1'),
  stripe: mat('#f1e7bb'), grass: mat('#80b885'), trunk: mat('#977b61'),
  foliage: mat('#408d72'), dark: mat('#293e46'), glass: mat('#75b8bc', 0.29, 0.3),
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
}

function building(scene, physics, rng, x, z, width, depth, height, district, windows) {
  const palettes = [
    ['#e4ba96', '#d39e7e'], ['#e6dbbc', '#c7b897'], ['#adc7bc', '#85a9a1'],
    ['#d5abb0', '#b98490'], ['#95bbc4', '#6c9ca9'], ['#bbb7b0', '#96938f'],
  ];
  const palette = palettes[Math.floor(rng() * palettes.length)];
  const facade = mat(palette[0]);
  const border = mat(palette[1]);
  cube(scene, facade, x, height / 2, z, width, height, depth);
  cube(scene, border, x, height + 0.35, z, width + 0.65, 0.7, depth + 0.65);
  cube(scene, border, x, 1.4, z + depth / 2 + 0.06, width, 2.8, 0.14);
  const rows = Math.min(11, Math.floor((height - 3) / 3.3));
  const cols = Math.max(2, Math.floor(width / 3.1));
  const sideCols = Math.max(2, Math.floor(depth / 3.1));
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
  if (rng() > 0.58 && height < 32) {
    const labels = ['甜 甜 圈', '漫游咖啡', '街角小店', '海风唱片', '新鲜果汁', '晚风书屋'];
    addSign(scene, labels[Math.floor(rng() * labels.length)], x, 2.3,
      z + depth / 2 + 0.21, Math.min(width - 2, 12));
  }
  if (height < 35) {
    cube(scene, mat('#db805f'), x, 3.05, z - depth / 2 - 0.85,
      Math.min(width - 1, 12), 0.17, 1.75);
    cube(scene, materials.glass, x, 1.25, z - depth / 2 - 0.11,
      Math.min(width - 2, 11), 2.2, 0.12);
  }
  staticCollider(physics, x, z, width, depth, height);
}

function tree(scene, x, z, palm = false) {
  const trunk = mesh(new THREE.CylinderGeometry(palm ? 0.25 : 0.32, 0.43, palm ? 6 : 3.5, 7),
    materials.trunk, scene, x, palm ? 3 : 1.75, z);
  trunk.castShadow = true;
  const crown = mesh(new THREE.IcosahedronGeometry(palm ? 2.25 : 1.65, 1),
    materials.foliage, scene, x, palm ? 6.5 : 4.1, z);
  crown.scale.set(palm ? 1.25 : 1, palm ? 0.38 : 1.16, palm ? 1.25 : 1);
  crown.castShadow = true;
}

function park(scene, rng, x, z) {
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
}

function streetLamp(scene, x, z) {
  const lamp = mat('#697d78', 0.55, 0.5);
  cube(scene, lamp, x, 3.25, z, 0.14, 6.5, 0.14);
  cube(scene, lamp, x + 0.7, 6.5, z, 1.5, 0.15, 0.14);
  cube(scene, materials.white, x + 1.3, 6.42, z, 0.47, 0.08, 0.5);
}

function makeCar(scene, color, x, z, yaw = 0, type = 'city') {
  const group = new THREE.Group();
  const paint = mat(color, 0.31, 0.2);
  const tires = mat('#202b32');
  const windshield = mat('#a5d6d1', 0.13, 0.36);
  const wheel = new THREE.CylinderGeometry(0.48, 0.48, 0.28, 12);
  const length = type === 'van' ? 5.4 : 4.5;
  cube(group, paint, 0, 0.88, 0, 2.5, 0.8, length);
  cube(group, paint, 0, 1.55, -0.25, 2.06, type === 'van' ? 1.25 : 0.9, 2.45);
  cube(group, windshield, 0, 1.55, 1.01, 1.82, 0.69, 0.08);
  cube(group, windshield, 0, 1.55, -1.47, 1.82, 0.66, 0.08);
  for (const side of [-1, 1]) {
    cube(group, windshield, side * 1.08, 1.55, -0.26, 0.08, 0.63, 1.55);
    for (const front of [-1, 1]) {
      const tire = mesh(wheel, tires, group, side * 1.32, 0.48, front * 1.43);
      tire.rotation.z = Math.PI / 2;
    }
    cube(group, frontColors(frontLight()), side * 0.84, 0.91, length / 2 + 0.025, 0.55, 0.28, 0.06);
    cube(group, mat('#cc7269'), side * 0.84, 0.91, -length / 2 - 0.025, 0.5, 0.24, 0.05);
  }
  if (type === 'police') {
    cube(group, materials.white, 0, 1.96, 0, 0.88, 0.16, 0.3);
    cube(group, mat('#e05c59'), -0.22, 2.04, 0, 0.4, 0.15, 0.32);
    cube(group, mat('#4bacc6'), 0.22, 2.04, 0, 0.4, 0.15, 0.32);
  }
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  scene.add(group);
  return group;
}

function frontLight() { return '#fff0c1'; }
function frontColors(color) { return mat(color, 0.33); }

function dragon(scene) {
  const group = new THREE.Group();
  const yellow = mat('#ffd94a', 0.65);
  const pale = mat('#fff2b5');
  const orange = mat('#ef9f52');
  const blush = mat('#ed9290');
  const black = mat('#1c343b', 0.3);
  function sphere(parent, material, x, y, z, sx, sy, sz) {
    const part = mesh(new THREE.SphereGeometry(1, 18, 12), material, parent, x, y, z);
    part.scale.set(sx, sy, sz);
    part.castShadow = true;
    return part;
  }
  sphere(group, yellow, 0, 1.23, 0, 0.77, 0.98, 0.71);
  sphere(group, pale, 0, 1.18, 0.575, 0.52, 0.68, 0.21);
  sphere(group, yellow, 0, 2.28, 0.18, 0.84, 0.72, 0.75);
  sphere(group, pale, 0, 2.03, 0.73, 0.55, 0.3, 0.34);
  sphere(group, orange, 0, 1.99, 1.035, 0.13, 0.075, 0.07);
  for (const side of [-1, 1]) {
    sphere(group, yellow, side * 0.82, 1.46, 0.25, 0.29, 0.43, 0.3);
    sphere(group, yellow, side * 0.4, 0.35, 0.08, 0.33, 0.31, 0.47);
    sphere(group, pale, side * 0.42, 0.19, 0.38, 0.29, 0.13, 0.33);
    sphere(group, pale, side * 0.32, 2.31, 0.794, 0.23, 0.28, 0.14);
    sphere(group, black, side * 0.32, 2.28, 0.922, 0.115, 0.18, 0.07);
    sphere(group, pale, side * 0.36 - 0.035, 2.37, 0.986, 0.04, 0.06, 0.02);
    sphere(group, blush, side * 0.67, 1.99, 0.744, 0.16, 0.09, 0.05);
    const horn = mesh(new THREE.ConeGeometry(0.23, 0.75, 9), pale,
      group, side * 0.54, 3.03, -0.09);
    horn.rotation.z = side * 0.23;
  }
  const tail = sphere(group, yellow, 0, 0.9, -0.92, 0.42, 0.37, 1);
  tail.rotation.x = -0.38;
  for (let i = 0; i < 4; i++) {
    const spike = mesh(new THREE.ConeGeometry(0.26 - i * 0.025, 0.64, 7),
      orange, group, 0, 2.85 - i * 0.42, -0.52 - i * 0.13);
    spike.rotation.x = -0.62;
  }
  scene.add(group);
  return group;
}

export function createWorld(scene, physics) {
  const rng = randomGenerator(20261029);
  const windows = [];
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physics.addBody(ground);
  const base = mesh(new THREE.PlaneGeometry(1400, 1400), mat('#9bb898'), scene, 0, -0.065, 0);
  base.rotation.x = -Math.PI / 2;
  const sea = mesh(new THREE.PlaneGeometry(1400, 800), mat('#68c6c9', 0.5), scene, 0, -0.025, -705);
  sea.rotation.x = -Math.PI / 2;
  const beach = mesh(new THREE.PlaneGeometry(620, 39), mat('#e5d59f'), scene, 0, 0.015, -319);
  beach.rotation.x = -Math.PI / 2;
  for (let line = -4; line <= 4; line++) {
    const coordinate = line * ROAD_STEP;
    cube(scene, materials.asphalt, coordinate, 0.04, 0, 15, 0.08, 614);
    cube(scene, materials.asphalt, 0, 0.05, coordinate, 614, 0.08, 15);
    for (let mark = -295; mark <= 295; mark += 14) {
      cube(scene, materials.stripe, coordinate, 0.103, mark, 0.18, 0.015, 5);
      cube(scene, materials.stripe, mark, 0.112, coordinate, 5, 0.015, 0.18);
    }
  }
  const parkBlocks = new Set(['-2,1', '2,-2', '1,1', '-3,-3']);
  for (let i = -4; i < 4; i++) {
    for (let j = -4; j < 4; j++) {
      const x = (i + 0.5) * ROAD_STEP;
      const z = (j + 0.5) * ROAD_STEP;
      cube(scene, materials.curb, x, 0.13, z, 58.5, 0.19, 58.5);
      cube(scene, materials.sidewalk, x, 0.22, z, 56, 0.05, 56);
      if (parkBlocks.has(`${i},${j}`)) {
        park(scene, rng, x, z);
      } else {
        const district = z < -140 ? 'harbor' : 'center';
        const split = rng() > 0.4;
        for (const half of [-1, 1]) {
          const bx = x + (split ? half * 12.1 : 0);
          const bz = z + (split ? 0 : half * 12.1);
          const width = split ? 20 + rng() * 2.3 : 35 + rng() * 4;
          const depth = split ? 35 + rng() * 4 : 20 + rng() * 2.3;
          const height = 12 + rng() * (Math.abs(i) < 2 && Math.abs(j) < 2 ? 43 : 23);
          building(scene, physics, rng, bx, bz, width, depth, height, district, windows);
        }
      }
      if ((i + j) % 3 === 0) streetLamp(scene, x - 27, z - 27);
      if (rng() > 0.56) tree(scene, x - 25, z + 25, z < -140);
    }
  }
  const dummy = new THREE.Object3D();
  for (const lit of [false, true]) {
    for (const side of [false, true]) {
      const instances = windows.filter((window) => window[6] === lit &&
        (window[3] < window[5]) === side);
      const glass = new THREE.MeshStandardMaterial({ color: lit ? '#f1d996' : '#82adb0',
        roughness: 0.3, metalness: 0.18, side: THREE.DoubleSide });
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
      name: index === 6 ? '海风货车' : '城市小车', body: null };
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
  for (let i = 0; i < 35; i++) {
    const road = (Math.floor(rng() * 8) - 4) * ROAD_STEP;
    const alongX = i % 2 === 0;
    const coordinate = rng() * 560 - 280;
    const x = alongX ? coordinate : road + (rng() > 0.5 ? 10.4 : -10.4);
    const z = alongX ? road + (rng() > 0.5 ? 10.4 : -10.4) : coordinate;
    const person = new THREE.Group();
    cube(person, mat(clothes[i % clothes.length]), 0, 1.38, 0, 0.64, 1.05, 0.4);
    mesh(new THREE.SphereGeometry(0.27, 8, 7), mat('#e4b18f'), person, 0, 2.16, 0);
    cube(person, materials.dark, -0.16, 0.48, 0, 0.19, 0.85, 0.23);
    cube(person, materials.dark, 0.16, 0.48, 0, 0.19, 0.85, 0.23);
    person.position.set(x, 0, z);
    scene.add(person);
    people.push({ mesh: person, x, z, alongX, direction: rng() > 0.5 ? 1 : -1,
      speed: 0.65 + rng() * 0.45, stunned: 0 });
  }
  const actor = dragon(scene);
  return { actor, cars, traffic, people, garage: GARAGE };
}
