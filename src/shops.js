import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const signCache = new Map();

function signMaterial(label, background, foreground) {
  const key = `${label}|${background}|${foreground}`;
  if (signCache.has(key)) return signCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = background;
  context.fillRect(0, 0, 512, 128);
  context.fillStyle = foreground;
  context.fillRect(0, 116, 512, 12);
  context.font = 'bold 62px "Microsoft YaHei", "Segoe UI", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  signCache.set(key, material);
  return material;
}

function box(parent, material, x, y, z, width, height, depth) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export const SHOPS = [
  { id: 'gunshop', kind: 'weapons', name: 'BROTHER 军火', short: '军火',
    x: 82, z: -22, facing: -Math.PI / 2, color: '#d1544a', text: '#ffe8c4' },
  { id: 'hospital', kind: 'health', name: '圣心医院', short: '医院',
    x: -18, z: -82, facing: 0, color: '#e7f0ea', text: '#2f6f67' },
  { id: 'clothes', kind: 'clothes', name: '奶龙潮衣', short: '服装',
    x: -82, z: 22, facing: Math.PI / 2, color: '#c58ac1', text: '#fff3ff' },
  { id: 'dealer', kind: 'vehicles', name: '海风车行', short: '车行',
    x: 18, z: 82, facing: Math.PI, color: '#5b8fb0', text: '#eef8ff' },
  { id: 'store1', kind: 'store', name: '24/7 便利店', short: '便利店',
    x: 82, z: 110, facing: -Math.PI / 2, color: '#4f9a6c', text: '#f2ffe9' },
  { id: 'store2', kind: 'store', name: '24/7 便利店', short: '便利店',
    x: -82, z: -110, facing: Math.PI / 2, color: '#4f9a6c', text: '#f2ffe9' },
  { id: 'store3', kind: 'store', name: '24/7 便利店', short: '便利店',
    x: 110, z: -82, facing: 0, color: '#4f9a6c', text: '#f2ffe9' },
];

export const SHOP_ITEMS = {
  weapons: [
    { id: 'smg', label: '海风冲锋枪', kind: 'weapon', price: 1250, detail: '32 发弹匣 · 全自动' },
    { id: 'shotgun', label: '港口霰弹枪', kind: 'weapon', price: 950, detail: '8 弹丸 · 近距离狠' },
    { id: 'ammo-pistol', label: '手枪弹药 x36', kind: 'ammo', weapon: 'pistol',
      amount: 36, price: 60, detail: '别让弹匣空着' },
    { id: 'ammo-smg', label: '冲锋枪弹药 x72', kind: 'ammo', weapon: 'smg',
      amount: 72, price: 90, detail: '扫射要管够' },
    { id: 'ammo-shotgun', label: '霰弹 x24', kind: 'ammo', weapon: 'shotgun',
      amount: 24, price: 90, detail: '近距离的保险' },
    { id: 'armor', label: '防弹护甲', kind: 'armor', price: 320,
      detail: '吸收伤害的背心' },
  ],
  health: [
    { id: 'heal', label: '门诊治疗', kind: 'health', price: 140,
      detail: '回满活力并清除通缉' },
  ],
  clothes: [
    { id: 'outfit-sunny', label: '晴日黄', kind: 'outfit', value: 'sunny', price: 120,
      detail: '经典奶龙配色' },
    { id: 'outfit-ocean', label: '海风青', kind: 'outfit', value: 'ocean', price: 160,
      detail: '清爽的海边风格' },
    { id: 'outfit-night', label: '夜行黑', kind: 'outfit', value: 'night', price: 220,
      detail: '低调，适合晚上出门' },
    { id: 'outfit-coral', label: '珊瑚粉', kind: 'outfit', value: 'coral', price: 180,
      detail: '人群里很显眼' },
  ],
  vehicles: [
    { id: 'car-sport', label: '橘光跑车', kind: 'vehicle', value: 'sport', price: 2400,
      detail: '快，而且很响' },
    { id: 'car-offroad', label: '海风越野车', kind: 'vehicle', value: 'offroad', price: 1900,
      detail: '皮实，耐撞' },
  ],
  store: [
    { id: 'snack', label: '奶龙能量饮料', kind: 'snack', price: 30,
      detail: '恢复 25 点活力' },
    { id: 'rob', label: '抢劫收银台', kind: 'rob', price: 0,
      detail: '拿走现金，但会招来警察' },
  ],
};

function buildStall(scene, physics, shop, lampMaterials) {
  const group = new THREE.Group();
  group.position.set(shop.x, 0, shop.z);
  group.rotation.y = shop.facing;
  const counter = new THREE.MeshStandardMaterial({ color: shop.color, roughness: 0.72 });
  const shell = new THREE.MeshStandardMaterial({ color: '#f3ead8', roughness: 0.84 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2c3a3f', roughness: 0.6 });
  box(group, shell, 0, 0.09, 0, 3.6, 0.12, 2.4);
  box(group, counter, 0, 0.66, 0.62, 3.4, 1.1, 0.75);
  box(group, dark, 0, 1.48, 0.62, 3.5, 0.08, 0.86);
  box(group, shell, -1.62, 1.98, -0.5, 0.22, 3.6, 0.22);
  box(group, shell, 1.62, 1.98, -0.5, 0.22, 3.6, 0.22);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.16, 2.3), counter);
  awning.position.set(0, 3.62, 0.1);
  awning.castShadow = true;
  group.add(awning);
  for (let stripe = 0; stripe < 4; stripe++) {
    box(group, shell, -1.45 + stripe * 0.97, 3.53, 1.24, 0.48, 0.03, 0.04);
  }
  box(group, dark, 0, 2.8, -0.72, 3.3, 1.4, 0.16);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.78),
    signMaterial(shop.name, shop.color, shop.text));
  sign.position.set(0, 4.08, 0.35);
  sign.rotation.x = -0.12;
  group.add(sign);
  const glowMaterial = new THREE.MeshStandardMaterial({ color: '#fff1c2',
    emissive: '#ffd88a', emissiveIntensity: 0.1 });
  box(group, glowMaterial, 0, 3.44, 0.4, 2.6, 0.06, 0.3);
  lampMaterials.push(glowMaterial);
  if (shop.kind === 'store') {
    box(group, new THREE.MeshStandardMaterial({ color: '#7fd4a2', emissive: '#4faa78',
      emissiveIntensity: 0.25 }), 0, 2.78, -0.63, 2.6, 0.8, 0.04);
  }
  if (shop.kind === 'weapons') {
    for (let index = 0; index < 3; index++) {
      box(group, dark, -1 + index, 1.1, 0.2, 0.1, 0.62, 0.1);
    }
  }
  for (const offset of [-0.7, 0.7]) {
    const crate = box(group, new THREE.MeshStandardMaterial({ color: '#b78d63',
      roughness: 0.9 }), offset, 0.34, -0.9, 0.85, 0.68, 0.85);
    crate.rotation.y = offset;
  }
  scene.add(group);
  const collider = new CANNON.Body({ mass: 0, shape: new CANNON.Box(
    new CANNON.Vec3(1.75, 1.6, 1.2)) });
  collider.position.set(shop.x + Math.sin(shop.facing) * 0.4, 1.6,
    shop.z + Math.cos(shop.facing) * 0.4);
  collider.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), shop.facing);
  physics.addBody(collider);
  return group;
}

export function createShops(scene, physics) {
  const lampMaterials = [];
  const stalls = new Map();
  for (const shop of SHOPS) {
    stalls.set(shop.id, buildStall(scene, physics, shop, lampMaterials));
  }
  return { shops: SHOPS, items: SHOP_ITEMS, stalls, lampMaterials };
}
