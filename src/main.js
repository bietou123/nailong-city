import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createIcons, ArrowUp, CarFront, Crosshair, Map, Pause, Play,
  RotateCcw, X } from 'lucide';
import { createAtmosphere } from './atmosphere.js';
import { CITY_LIMIT, GARAGE, ROAD_STEP, createWorld, makeCar } from './world.js';
import { SHOP_ITEMS, createShops } from './shops.js';
import { TOTAL_MISSIONS, advanceMission, currentMission, currentStep,
  newProgress, recoverProgress, stepTarget, targetDistance } from './mission.js';
import { createArsenal, weaponById } from './weapons.js';
import { createPolice } from './police.js';
import { createAudio } from './audio.js';
import { createDayNight } from './daynight.js';
import { createPostFX } from './postfx.js';
import './style.css';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#acdce4');
scene.fog = new THREE.Fog('#b3cdd3', 130, 560);

const camera = new THREE.PerspectiveCamera(58, 1, 0.12, 950);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true,
    powerPreference: 'high-performance' });
} catch (error) {
  $('loading').textContent = '无法启动 3D 画面，请更新显卡驱动并开启硬件加速。';
  throw error;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const postfx = createPostFX(renderer, scene, camera);
let qualityLevel = 'high';
let basePixelRatio = 1;
let renderScale = 1;
const frameGaps = new Float32Array(90);
let gapCount = 0;
let gapIndex = 0;
let pacingAt = 0;
let daylight = { hours: 10, day: 1, sunset: 0, night: 0 };
const sunScreen = new THREE.Vector3();
const sunProbe = new THREE.Vector3();
const viewDir = new THREE.Vector3();

function skyEnvironment() {
  const surface = document.createElement('canvas');
  surface.width = 512;
  surface.height = 256;
  const ctx = surface.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#4277ad');
  gradient.addColorStop(0.36, '#94b8d1');
  gradient.addColorStop(0.5, '#d6d4c8');
  gradient.addColorStop(0.6, '#8f8b7f');
  gradient.addColorStop(1, '#292c2d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 256);
  const glow = ctx.createRadialGradient(140, 74, 0, 140, 74, 86);
  glow.addColorStop(0, 'rgba(255, 243, 211, 1)');
  glow.addColorStop(1, 'rgba(255, 243, 211, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 512, 256);
  const texture = new THREE.CanvasTexture(surface);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(texture).texture;
  texture.dispose();
  pmrem.dispose();
  return env;
}
scene.environment = skyEnvironment();
scene.environmentIntensity = 0.5;

const sky = new THREE.HemisphereLight('#b9cede', '#6a6a5c', 0.95);
scene.add(sky);
const sun = new THREE.DirectionalLight('#fff0d6', 3.1);
sun.position.set(-110, 112, 75);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 360;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.03;
scene.add(sun);
const fill = new THREE.DirectionalLight('#8fb6ff', 0.45);
fill.position.set(120, 70, -160);
scene.add(fill);
const atmosphere = createAtmosphere(scene);

const physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -24, 0) });
physics.broadphase = new CANNON.SAPBroadphase(physics);
physics.allowSleep = true;
physics.defaultContactMaterial.friction = 0;
physics.defaultContactMaterial.restitution = 0.02;
const world = createWorld(scene, physics);
world.actor.scale.setScalar(0.62);
const lampPools = [];
const poolTexture = (() => {
  const surface = document.createElement('canvas');
  surface.width = surface.height = 128;
  const ctx = surface.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,206,150,0.95)');
  gradient.addColorStop(0.42, 'rgba(255,178,104,0.34)');
  gradient.addColorStop(1, 'rgba(255,150,70,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(surface);
})();
const poolGeometry = new THREE.PlaneGeometry(10, 10);
for (const lamp of world.lamps) {
  const material = new THREE.MeshBasicMaterial({ map: poolTexture, color: '#ffc98c',
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending });
  const pool = new THREE.Mesh(poolGeometry, material);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(lamp.x, 0.09, lamp.z);
  scene.add(pool);
  lampPools.push(material);
}
const glowTexture = (() => {
  const surface = document.createElement('canvas');
  surface.width = surface.height = 128;
  const ctx = surface.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,226,176,1)');
  gradient.addColorStop(0.32, 'rgba(255,196,120,0.55)');
  gradient.addColorStop(1, 'rgba(255,168,80,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(surface);
})();
const lampGlows = [];
for (const lamp of world.lamps) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture,
    color: '#ffd49a', transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending }));
  sprite.position.set(lamp.x, lamp.y + 0.9, lamp.z);
  sprite.scale.set(5.2, 5.2, 1);
  scene.add(sprite);
  lampGlows.push(sprite.material);
}
const shops = createShops(scene, physics);
const obstacles = [...world.colliders, ...shops.colliders];
const obstacleProbe = new CANNON.Vec3();
const audio = createAudio();
const police = createPolice(scene, physics, {
  makeCar,
  onDamage: (amount) => hurt(amount),
});
for (const person of world.cast) {
  const spot = freeSpot(person.x, person.z, 1.1);
  person.x = spot.x;
  person.z = spot.z;
  person.mesh.position.set(spot.x, 0, spot.z);
}
const dayNight = createDayNight({ scene, sun, hemisphere: sky, fog: scene.fog,
  atmosphere, lamps: world.lamps, windowMaterials: world.windowMaterials,
  shopLamps: shops.lampMaterials, lightPools: lampPools, glows: lampGlows,
  startHour: 15.3 });

const player = new CANNON.Body({ mass: 65, shape: new CANNON.Sphere(0.62),
  material: new CANNON.Material({ friction: 0.2 }), linearDamping: 0.55 });
player.position.set(0, 0.7, 7);
player.fixedRotation = true;
player.allowSleep = false;
player.updateMassProperties();
physics.addBody(player);

const keys = new Set();
const joystick = { x: 0, y: 0 };
const OUTFITS = {
  sunny: { body: '#fbd340', belly: '#ffefae', accent: '#eb9a54' },
  ocean: { body: '#5fd0c4', belly: '#d8fff7', accent: '#3fa9a5' },
  night: { body: '#5b6274', belly: '#dfe3ec', accent: '#8f97b4' },
  coral: { body: '#ff9d8c', belly: '#ffe6dd', accent: '#e0705e' },
};
const SHOP_META = {
  weapons: { title: '枪械与弹药', caption: '挑一件家伙。这座城市不会自己变安全。' },
  health: { title: '急诊', caption: '付钱，包扎，忘掉今晚发生的事。' },
  clothes: { title: '衣橱', caption: '换身行头，换个心情。' },
  vehicles: { title: '车库', caption: '买下的车会停在店门口，钥匙在车上。' },
  store: { title: '便利店', caption: '买瓶饮料，或者……拿点什么。' },
};
const state = {
  progress: newProgress(), health: 100, armor: 0, wanted: 0, wantedCooldown: 0,
  currentCar: null, paused: false, mapOpen: false, shopOpen: false,
  cameraYaw: Math.PI + 0.38, cameraPitch: 0.03, cameraDistance: 7.4,
  elapsed: 0, mouseMovedAt: 0, cameraKeyAt: 0, nextSave: 0, shotCooldown: 0,
  crashCooldown: 0, stuckTimer: 0, stuckAnchor: { x: 0, z: 7 },
  moveDir: { x: 0, z: 0 },
  hurtCooldown: 0, toastUntil: 0, cameraShake: 0, frames: 0,
  arsenal: createArsenal(), aiming: false, outfit: 'sunny',
  stats: { kills: 0, missions: 0, crimes: 0, distance: 0 },
  targetUnits: [], targetsDead: 0, targetSpawned: '',
  shop: null, bannerUntil: 0, statusFlashUntil: 0, damageFlashUntil: 0,
  dialogueUntil: 0,
  lastJob: -1, missionBannerShown: false, radioHint: false,
  footstepTimer: 0, distanceAccumulator: 0, lastPosition: null,
  safePosition: { x: 0, z: 7 },
};
const cameraPosition = new THREE.Vector3(-4, 6, -9);
const cameraLook = new THREE.Vector3(0, 2, 5);
const cameraAnchor = new THREE.Vector3(0, 0.7, 7);
let cameraBoom = 12;
const cameraRayEnd = new THREE.Vector3();
const cameraDesired = new THREE.Vector3();
const cameraViewTarget = new THREE.Vector3();
const cameraRayFrom = new CANNON.Vec3();
const cameraRayTo = new CANNON.Vec3();
const cameraRay = new CANNON.RaycastResult();
const route = new THREE.Group();
const routeRing = new THREE.Mesh(new THREE.TorusGeometry(3, 0.16, 10, 40),
  new THREE.MeshBasicMaterial({ color: '#ffd064' }));
routeRing.rotation.x = Math.PI / 2;
routeRing.position.y = 0.33;
route.add(routeRing);
const routeLight = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 2.1, 8, 24, 1, true),
  new THREE.MeshBasicMaterial({ color: '#ffce68', transparent: true, opacity: 0.13,
    depthWrite: false, side: THREE.DoubleSide }));
routeLight.position.y = 4;
route.add(routeLight);
const routeGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.75),
  new THREE.MeshBasicMaterial({ color: '#ffdc76' }));
routeGem.position.y = 8;
route.add(routeGem);
scene.add(route);

const effects = [];
const effectGeometry = new THREE.SphereGeometry(0.1, 7, 5);
const effectMaterials = ['#f9d65e', '#ee8c80', '#80d4ba', '#aad4ed', '#d8d8d8']
  .map((color) => new THREE.MeshBasicMaterial({ color }));
const hitMaterials = {
  blood: new THREE.MeshBasicMaterial({ color: '#b8403b' }),
  spark: new THREE.MeshBasicMaterial({ color: '#ffd489' }),
  smoke: new THREE.MeshBasicMaterial({ color: '#8d9494', transparent: true,
    opacity: 0.55 }),
};
const tracerGeometry = new THREE.CylinderGeometry(0.018, 0.018, 1, 4);
const tracerMaterial = new THREE.MeshBasicMaterial({ color: '#ffe7a8', transparent: true,
  opacity: 0.85 });
const tracers = [];
const saved = readSave();
if (saved) {
  state.progress = recoverProgress(saved.progress);
  state.health = Number.isFinite(saved.health) ?
    THREE.MathUtils.clamp(saved.health, 1, 100) : 100;
  state.armor = Number.isFinite(saved.armor) ?
    THREE.MathUtils.clamp(saved.armor, 0, 100) : 0;
  if (Number.isFinite(saved.x) && Number.isFinite(saved.z) &&
      Math.abs(saved.x) < CITY_LIMIT && Math.abs(saved.z) < CITY_LIMIT) {
    const spot = freeSpot(saved.x, saved.z);
    player.position.set(spot.x, 0.7, spot.z);
    state.safePosition = { x: spot.x, z: spot.z };
  }
  if (saved.outfit && OUTFITS[saved.outfit]) state.outfit = saved.outfit;
  if (saved.stats && typeof saved.stats === 'object') {
    for (const key of ['kills', 'missions', 'crimes', 'distance']) {
      if (Number.isFinite(saved.stats[key]) && saved.stats[key] >= 0) {
        state.stats[key] = Math.floor(saved.stats[key]);
      }
    }
  }
  state.arsenal.restore(saved.weapons);
  if (Number.isFinite(saved.time)) dayNight.hours = saved.time;
  state.lastJob = state.progress.job;
  state.missionBannerShown = true;
}
state.lastPosition = { x: player.position.x, z: player.position.z };
applyOutfit();
try {
  const settings = JSON.parse(localStorage.getItem('nailong-city-settings') || '{}');
  if (Number.isFinite(settings.volume)) audio.setVolume(settings.volume);
  if (['high', 'medium', 'low'].includes(settings.quality)) $('quality').value = settings.quality;
} catch { /* Ignore damaged settings. */ }
$('volume').value = Math.round(audio.audio.volume * 100);

function readSave() {
  try { return JSON.parse(localStorage.getItem('nailong-city-save') || 'null'); }
  catch { return null; }
}

function save() {
  const position = getPosition();
  try {
    localStorage.setItem('nailong-city-save', JSON.stringify({
      progress: state.progress, health: state.health, armor: state.armor,
      x: position.x, z: position.z, outfit: state.outfit, stats: state.stats,
      weapons: state.arsenal.snapshot(), time: dayNight.hours,
    }));
  } catch { /* Game stays playable when storage is unavailable. */ }
}

function saveSettings() {
  try {
    localStorage.setItem('nailong-city-settings', JSON.stringify({
      volume: audio.audio.volume, quality: $('quality').value }));
  } catch { /* Optional preference. */ }
}

function applyOutfit() {
  const palette = OUTFITS[state.outfit] ?? OUTFITS.sunny;
  const materials = world.actor.userData.materials;
  materials.body.color.set(palette.body);
  materials.belly.color.set(palette.belly);
  materials.accent.color.set(palette.accent);
}

function toast(message, seconds = 3) {
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  state.toastUntil = state.elapsed + seconds;
}

function showBanner(kicker, title, letter) {
  $('banner-kicker').textContent = kicker;
  $('banner-title').textContent = title;
  $('banner-letter').textContent = letter ?? 'N';
  $('banner').classList.remove('hidden');
  state.bannerUntil = state.elapsed + 3.2;
}

function showDialogue(speaker, line, seconds = 5.4) {
  if (!line) return;
  $('dialogue-speaker').textContent = speaker;
  $('dialogue-line').textContent = line;
  $('dialogue').classList.remove('hidden');
  state.dialogueUntil = state.elapsed + seconds;
}

function showStatusFlash(text) {
  $('status-flash-text').textContent = text;
  $('status-flash').classList.remove('hidden');
  state.statusFlashUntil = state.elapsed + 2.2;
}

function getPosition() {
  return state.currentCar ? state.currentCar.body.position : player.position;
}

function nearestCar() {
  if (state.currentCar) return null;
  let nearest = null;
  let distance = 5.2;
  for (const car of world.cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.body.position.x - player.position.x,
      car.body.position.z - player.position.z);
    if (d < distance) { nearest = car; distance = d; }
  }
  return nearest;
}

function atGarage() {
  const position = getPosition();
  return Math.hypot(position.x - GARAGE.x, position.z - GARAGE.z) < 12;
}

function nearestShop() {
  const position = getPosition();
  let best = null;
  for (const shop of shops.shops) {
    const distance = Math.hypot(position.x - shop.x, position.z - shop.z);
    if (distance < 7.5 && (!best || distance < best.distance)) {
      best = { shop, distance };
    }
  }
  return best;
}

function insideObstacle(x, z, margin = 0.1, y = 0.7) {
  for (const body of obstacles) {
    const shape = body.shapes[0];
    if (!(shape instanceof CANNON.Box)) continue;
    const half = shape.halfExtents;
    if (y < body.position.y - half.y || y > body.position.y + half.y) continue;
    obstacleProbe.set(x - body.position.x, 0, z - body.position.z);
    const local = body.quaternion.inverse().vmult(obstacleProbe);
    if (Math.abs(local.x) < half.x + margin && Math.abs(local.z) < half.z + margin) {
      return true;
    }
  }
  return false;
}

function freeSpot(x, z, margin = 0.85) {
  if (!insideObstacle(x, z, margin, 0.7)) return { x, z };
  for (let ring = 1; ring <= 12; ring++) {
    const radius = ring * 1.6;
    for (let step = 0; step < 16; step++) {
      const angle = (step / 16) * Math.PI * 2 + ring * 0.23;
      const nx = THREE.MathUtils.clamp(x + Math.cos(angle) * radius,
        -CITY_LIMIT, CITY_LIMIT);
      const nz = THREE.MathUtils.clamp(z + Math.sin(angle) * radius,
        -CITY_LIMIT, CITY_LIMIT);
      if (!insideObstacle(nx, nz, margin, 0.7)) return { x: nx, z: nz };
    }
  }
  return { x: 0, z: 7 };
}

function escapeStuck(nx, nz) {
  const ahead = { x: player.position.x + nx * 1.1,
    z: player.position.z + nz * 1.1 };
  const target = insideObstacle(ahead.x, ahead.z, 0.55, 0.7) ?
    freeSpot(player.position.x, player.position.z, 0.7) : ahead;
  player.position.set(target.x, Math.max(player.position.y, 0.78), target.z);
  player.velocity.set(0, 0, 0);
  state.safePosition = { x: target.x, z: target.z };
}

function hurt(amount, source = 'hit') {
  if (state.hurtCooldown > 0 && source !== 'police') return;
  if (amount <= 0) return;
  let remaining = amount;
  if (state.armor > 0) {
    const absorbed = Math.min(state.armor, remaining * 0.72);
    state.armor -= absorbed;
    remaining -= absorbed;
  }
  state.health -= remaining;
  state.hurtCooldown = 0.06;
  state.damageFlashUntil = state.elapsed + 0.18;
  $('damage-flash').classList.add('hit');
  if (state.health <= 0) downed();
}

function raiseWanted(amount = 1) {
  const previous = state.wanted;
  state.wanted = Math.min(5, state.wanted + amount);
  state.wantedCooldown = 35;
  state.stats.crimes++;
  if (!previous && state.wanted) {
    toast('通缉等级上升，警察正在赶来', 2.2);
    audio.ui('deny');
  }
}

function downed() {
  if (state.elapsed < state.statusFlashUntil) return;
  const position = getPosition();
  const busted = state.wanted > 0 && police.nearby(position.x, position.z, 24);
  if (state.currentCar) exitCar(true);
  state.health = 100;
  state.armor = 0;
  const fee = busted ? 260 : 120;
  state.progress.cash = Math.max(0, state.progress.cash - fee);
  state.wanted = 0;
  state.wantedCooldown = 0;
  police.clear();
  player.position.set(0, 0.7, 7);
  player.velocity.set(0, 0, 0);
  showStatusFlash(busted ? 'BUSTED' : 'WASTED');
  toast(busted ? `被捕 · 保释金 $${fee}` : `送医 · 医疗费 $${fee}`, 4);
  audio.ui('deny');
  save();
}

function attachCarCollision(car) {
  car.body.addEventListener('collide', (event) => {
    if (state.currentCar !== car || state.crashCooldown > 0) return;
    if (event.body.shapes.some((shape) => shape instanceof CANNON.Plane)) return;
    if (Math.abs(car.speed) < 6) return;
    state.crashCooldown = 0.7;
    const impact = Math.abs(car.speed);
    damageCar(car, Math.min(48, impact * 1.7));
    hurt(Math.min(18, Math.round(impact * 0.42)), 'crash');
    state.cameraShake = Math.min(0.6, impact * 0.02);
    car.speed *= 0.52;
    raiseWanted(1);
    audio.impact();
    toast('发生碰撞！车况下降');
  });
}
for (const car of world.cars) attachCarCollision(car);

function damageCar(car, amount) {
  if (car.dead || car.burning) return;
  car.durability -= amount;
  if (car.durability <= 0) {
    car.durability = 0;
    car.burning = 3.4;
    audio.impact();
    toast('车辆起火了，快离开！', 2.4);
  }
}

function explodeCar(car) {
  if (car.dead) return;
  car.dead = true;
  const position = car.mesh.position.clone();
  if (state.currentCar === car) {
    state.currentCar = null;
    player.type = CANNON.Body.DYNAMIC;
    player.mass = 65;
    player.collisionResponse = true;
    player.updateMassProperties();
    player.position.set(position.x + 3.4, 1.4, position.z + 3.4);
    player.velocity.set(0, 6, 0);
    world.actor.visible = true;
  }
  scene.remove(car.mesh);
  if (car.body) physics.removeBody(car.body);
  for (let index = 0; index < 3; index++) {
    burst(new THREE.Vector3(position.x + (Math.random() - 0.5) * 2, 1.4,
      position.z + (Math.random() - 0.5) * 2), 16, index ? 'spark' : 'smoke');
  }
  const flash = new THREE.PointLight('#ff9a4d', 26, 34);
  flash.position.copy(position).setY(2.4);
  scene.add(flash);
  effects.push({ mesh: flash, light: true, remaining: 0.32 });
  const distance = Math.hypot(position.x - player.position.x,
    position.z - player.position.z);
  if (distance < 9) hurt(Math.round(58 - distance * 4));
  state.cameraShake = Math.max(state.cameraShake, 0.9);
  audio.explosion();
  raiseWanted(2);
  toast('汽车爆炸了！', 2.4);
}

function spawnShopVehicle(type) {
  const shop = state.shop;
  const x = shop.x + Math.sin(shop.facing) * 6;
  const z = shop.z + Math.cos(shop.facing) * 6;
  const mesh = makeCar(scene, type === 'sport' ? '#ff8a5c' : '#6fae8c',
    x, z, shop.facing, 'city');
  const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(
    new CANNON.Vec3(1.3, 0.9, 2.3)) });
  body.position.set(x, 0.9, z);
  body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), shop.facing);
  physics.addBody(body);
  const car = { mesh, body, x, z, yaw: shop.facing, speed: 0,
    name: type === 'sport' ? '橘光跑车' : '海风越野车', durability: 100,
    maxDurability: 100, burning: 0, dead: false,
    topSpeed: type === 'sport' ? 38 : 31 };
  attachCarCollision(car);
  world.cars.push(car);
  toast('新车停在店门口了');
}

function enterCar(car) {
  if (car.dead || car.burning) { toast('这辆车已经报废了'); return; }
  state.currentCar = car;
  car.body.type = CANNON.Body.DYNAMIC;
  car.body.mass = 750;
  car.body.updateMassProperties();
  car.body.angularFactor.set(0, 0, 0);
  car.body.angularVelocity.set(0, 0, 0);
  car.body.wakeUp();
  player.type = CANNON.Body.KINEMATIC;
  player.collisionResponse = false;
  player.velocity.set(0, 0, 0);
  player.position.set(0, -80, 0);
  player.updateMassProperties();
  world.actor.visible = false;
  audio.beep(520);
  toast(`已进入${car.name}`);
  if (!state.radioHint) {
    state.radioHint = true;
    toast('按 T 打开车载电台', 2.6);
  }
}

function exitCar(force = false) {
  const car = state.currentCar;
  if (!car) return;
  state.currentCar = null;
  if (!force && !car.dead) {
    car.body.velocity.set(0, 0, 0);
    car.speed = 0;
    car.body.type = CANNON.Body.STATIC;
    car.body.mass = 0;
    car.body.updateMassProperties();
  }
  const roadX = Math.round(car.body.position.x / ROAD_STEP) * ROAD_STEP;
  const roadZ = Math.round(car.body.position.z / ROAD_STEP) * ROAD_STEP;
  const sideX = Math.abs(car.body.position.x - roadX) < 9;
  const offsetX = sideX ? (roadX - car.body.position.x >= 0 ? 3.8 : -3.8) : 0;
  const offsetZ = sideX ? 0 : (roadZ - car.body.position.z >= 0 ? 3.8 : -3.8);
  let spot = { x: car.body.position.x + offsetX, z: car.body.position.z + offsetZ };
  if (insideObstacle(spot.x, spot.z, 0.7)) {
    let found = false;
    for (let index = 0; index < 8 && !found; index++) {
      const angle = index * Math.PI / 4;
      const x = car.body.position.x + Math.sin(angle) * 3.6;
      const z = car.body.position.z + Math.cos(angle) * 3.6;
      if (Math.abs(x) < CITY_LIMIT && Math.abs(z) < CITY_LIMIT &&
          !insideObstacle(x, z, 0.7)) { spot = { x, z }; found = true; }
    }
  }
  player.position.set(spot.x, 0.7, spot.z);
  player.velocity.set(0, 0, 0);
  player.type = CANNON.Body.DYNAMIC;
  player.mass = 65;
  player.collisionResponse = true;
  player.updateMassProperties();
  world.actor.visible = true;
  audio.beep(330);
  if (!force) toast('自由漫步');
}

function repair() {
  if (!atGarage()) return;
  const price = state.progress.cash >= 30 ? 30 : 0;
  state.progress.cash -= price;
  state.health = 100;
  state.armor = Math.max(state.armor, 0);
  state.wanted = 0;
  state.wantedCooldown = 0;
  police.clear();
  if (state.currentCar) {
    state.currentCar.speed = 0;
    state.currentCar.durability = state.currentCar.maxDurability;
    state.currentCar.burning = 0;
  }
  audio.beep(740, 0.2);
  toast(price ? '修理完成，恢复活力 · -$30' : '免费修理完成，恢复活力');
  save();
}

function interact() {
  if (state.paused || state.mapOpen || state.shopOpen) return;
  if (state.currentCar) { exitCar(); return; }
  const car = nearestCar();
  if (car) { enterCar(car); return; }
  const shop = nearestShop();
  if (shop) { openShop(shop.shop); return; }
  if (atGarage()) repair();
}

function openShop(shop) {
  state.shop = shop;
  state.shopOpen = true;
  $('shop-kicker').textContent = shop.name;
  $('shop-screen').classList.remove('hidden');
  renderShopItems();
  if (document.pointerLockElement) document.exitPointerLock();
  keys.clear();
  audio.ui('move');
}

function closeShop() {
  state.shopOpen = false;
  state.shop = null;
  $('shop-screen').classList.add('hidden');
}

function renderShopItems() {
  if (!state.shop) return;
  const meta = SHOP_META[state.shop.kind] ?? { title: '货架', caption: '' };
  $('shop-title').textContent = meta.title;
  $('shop-caption').textContent = meta.caption;
  $('shop-wallet').textContent = `$ ${state.progress.cash}`;
  const list = $('shop-items');
  list.replaceChildren();
  for (const item of SHOP_ITEMS[state.shop.kind] ?? []) {
    const button = document.createElement('button');
    button.className = `shop-item${item.kind === 'rob' ? ' danger' : ''}`;
    const main = document.createElement('span');
    main.className = 'item-main';
    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = item.label;
    const detail = document.createElement('span');
    detail.className = 'item-detail';
    detail.textContent = item.detail;
    main.append(name, detail);
    const price = document.createElement('span');
    price.className = 'item-price';
    price.textContent = item.price ? `$${item.price}` : '动手';
    button.append(main, price);
    const solvable = item.price <= state.progress.cash;
    button.disabled = !solvable || (item.kind === 'weapon' &&
      state.arsenal.owned(item.id));
    button.addEventListener('click', () => buyItem(item));
    list.append(button);
  }
}

function buyItem(item) {
  if (item.price > state.progress.cash) {
    audio.ui('deny');
    toast('现金不够');
    return;
  }
  switch (item.kind) {
    case 'weapon':
      if (state.arsenal.owned(item.id)) { toast('你已经有一把了'); return; }
      state.arsenal.unlock(item.id);
      toast(`已购买 ${item.label}`);
      break;
    case 'ammo':
      if (!state.arsenal.owned(item.weapon)) {
        audio.ui('deny');
        toast('先买下这把枪');
        return;
      }
      state.arsenal.addAmmo(item.weapon, item.amount);
      toast(`${item.label} 已装进货箱`);
      break;
    case 'armor':
      state.armor = 100;
      toast('防弹护甲已穿上');
      break;
    case 'health':
      state.health = 100;
      state.wanted = 0;
      state.wantedCooldown = 0;
      police.clear();
      toast('治疗完成，通缉记录已清除');
      break;
    case 'outfit':
      state.outfit = item.value;
      applyOutfit();
      toast(`换上了${item.label}`);
      break;
    case 'vehicle':
      spawnShopVehicle(item.value);
      break;
    case 'snack':
      state.health = Math.min(100, state.health + 25);
      toast('活力 +25');
      break;
    case 'rob': {
      closeShop();
      const loot = 180 + Math.floor(Math.random() * 160);
      state.progress.cash += loot;
      raiseWanted(3);
      audio.ui('cash');
      toast(`抢走 $${loot}！警察马上就到`, 3.4);
      save();
      return;
    }
    default:
      return;
  }
  state.progress.cash -= item.price;
  audio.ui(item.price ? 'cash' : 'success');
  save();
  renderShopItems();
}

function aimVector(spread = { yaw: 0, pitch: 0 }) {
  const yaw = state.cameraYaw + spread.yaw;
  const pitch = state.cameraPitch + spread.pitch;
  return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)).normalize();
}

function targetPosition(unit) {
  if (unit.kind === 'foot') return unit.mesh.position.clone().setY(unit.mesh.position.y + 1.25);
  if (unit.kind === 'car') return unit.mesh.position.clone().setY(unit.mesh.position.y + 1.2);
  return unit.mesh.position.clone().setY(unit.mesh.position.y + 1.2);
}

function collectHitTargets() {
  const targets = [];
  for (const unit of police.units()) {
    targets.push({ kind: 'police', ref: unit, position: targetPosition(unit),
      radius: unit.kind === 'foot' ? 0.8 : 2.2 });
  }
  for (const person of world.people) {
    if (person.dead || person.stunned > 0) continue;
    targets.push({ kind: 'pedestrian', ref: person,
      position: new THREE.Vector3(person.mesh.position.x, 1.15, person.mesh.position.z),
      radius: 0.72 });
  }
  for (const unit of state.targetUnits) {
    if (unit.dead) continue;
    targets.push({ kind: 'target', ref: unit,
      position: unit.mesh.position.clone().setY(unit.mesh.position.y + 1.2),
      radius: unit.boss ? 0.9 : 0.78 });
  }
  for (const car of world.cars) {
    if (car.dead || car === state.currentCar) continue;
    targets.push({ kind: 'car', ref: car,
      position: car.mesh.position.clone().setY(car.mesh.position.y + 1.1),
      radius: 2.3 });
  }
  return targets;
}

function raycastTargets(origin, direction, range) {
  let best = null;
  for (const target of collectHitTargets()) {
    const offset = target.position.clone().sub(origin);
    const along = offset.dot(direction);
    if (along <= 0 || along > range) continue;
    const closest = origin.clone().addScaledVector(direction, along);
    if (closest.distanceTo(target.position) > target.radius) continue;
    if (!best || along < best.along) best = { target, along, point: closest };
  }
  return best;
}

function fireProjectile(spread, weapon) {
  const position = getPosition();
  const origin = new THREE.Vector3(position.x, (state.currentCar ? 2.1 : 1.65),
    position.z);
  const direction = aimVector(spread);
  const hit = raycastTargets(origin, direction, weapon.range);
  const end = hit ? hit.point : origin.clone().addScaledVector(direction, weapon.range);
  drawTracer(origin, end);
  if (hit) applyHit(hit.target, weapon, hit.point);
}

function drawTracer(from, to) {
  const distance = from.distanceTo(to);
  if (distance < 0.2) return;
  const mesh = new THREE.Mesh(tracerGeometry, tracerMaterial);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.lookAt(to);
  mesh.rotateX(Math.PI / 2);
  mesh.scale.y = distance;
  scene.add(mesh);
  tracers.push({ mesh, remaining: 0.055 });
}

function applyHit(target, weapon, point) {
  if (target.kind === 'police') {
    burst(point, 7, 'blood');
    const killed = police.damage(target.ref, weapon.damage);
    if (killed) {
      state.stats.kills++;
      toast('警察倒下了', 1.6);
    }
    raiseWanted(1);
  } else if (target.kind === 'pedestrian') {
    const person = target.ref;
    person.stunned = 14;
    person.dead = true;
    person.deadTimer = 18;
    person.mesh.visible = false;
    state.stats.kills++;
    burst(point, 9, 'blood');
    raiseWanted(1);
    toast('路人倒下了', 1.6);
  } else if (target.kind === 'target') {
    const unit = target.ref;
    unit.health -= weapon.damage;
    burst(point, 6, 'blood');
    if (unit.health <= 0) killMissionTarget(unit);
  } else if (target.kind === 'car') {
    burst(point, 6, 'spark');
    damageCar(target.ref, weapon.damage * 0.85);
  }
}

function shoot() {
  if (state.paused || state.mapOpen || state.shopOpen) return;
  startAudio();
  const result = state.arsenal.fire(state.elapsed);
  if (!result) return;
  if (result.blocked === 'empty') {
    audio.ui('deny');
    toast('弹匣空了 · 按 R 换弹', 1.8);
    return;
  }
  if (result.blocked === 'reload') { toast('正在换弹…', 1.2); return; }
  if (result.blocked) return;
  const weapon = result.weapon;
  if (weapon.id === 'melee') { meleeAttack(); return; }
  audio.gunshot(weapon.id === 'shotgun' ? 1.35 : weapon.id === 'smg' ? 0.72 : 1);
  state.cameraShake = Math.max(state.cameraShake, weapon.kick * 5.5);
  for (const spread of result.spreads) fireProjectile(spread, weapon);
  if (state.wanted === 0) toast('枪声惊动了街区', 1.8);
  raiseWanted(1);
  $('crosshair').classList.add('aim');
  setTimeout(() => $('crosshair').classList.remove('aim'), 90);
}

function meleeAttack() {
  const position = getPosition();
  const origin = new THREE.Vector3(position.x, 1.5, position.z);
  const hit = raycastTargets(origin, aimVector(), 2.8);
  audio.impact();
  if (!hit) return;
  applyHit(hit.target, weaponById('melee'), hit.point);
}

function switchWeapon(slot) {
  const weapon = ['melee', 'pistol', 'smg', 'shotgun']
    .map((id) => weaponById(id)).find((gun) => gun.slot === slot);
  if (!weapon) return;
  if (!state.arsenal.owned(weapon.id)) {
    audio.ui('deny');
    toast(`还没有${weapon.name} · 去 BROTHER 军火看看`, 2.4);
    return;
  }
  state.arsenal.switchTo(weapon.id);
  audio.ui('move');
  toast(weapon.name, 1.2);
}

function cycleWeapon() {
  const owned = ['melee', 'pistol', 'smg', 'shotgun']
    .filter((id) => state.arsenal.owned(id));
  if (owned.length < 2) return;
  const index = owned.indexOf(state.arsenal.currentId);
  state.arsenal.switchTo(owned[(index + 1) % owned.length]);
  audio.ui('move');
}

function reload() {
  if (!state.arsenal.reload(state.elapsed)) return;
  audio.ui('move');
  toast('换弹中…', 1.1);
}

function startAudio() {
  audio.start();
}

function burst(position, amount = 9, kind = 'spark') {
  if (effects.length > 120) return;
  const material = kind === 'blood' ? hitMaterials.blood :
    kind === 'smoke' ? hitMaterials.smoke : hitMaterials.spark;
  for (let index = 0; index < amount; index++) {
    const particle = new THREE.Mesh(effectGeometry, material);
    particle.position.set(position.x + (Math.random() - 0.5) * 0.7,
      position.y + (Math.random() - 0.5) * 0.4,
      position.z + (Math.random() - 0.5) * 0.7);
    if (kind === 'smoke') particle.scale.setScalar(2 + Math.random() * 2);
    scene.add(particle);
    effects.push({ mesh: particle, velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 5, 1.6 + Math.random() * 3.4,
      (Math.random() - 0.5) * 5), remaining: 0.42 + Math.random() * 0.35,
    fade: true });
  }
}

function buildMissionNpc(color, scale) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1c2529', roughness: 0.8 });
  const face = new THREE.MeshStandardMaterial({ color: '#dcaa87', roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.16, 0.5), suit);
  torso.position.y = 1.34;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9), face);
  head.position.y = 2.2;
  group.add(head);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.31, 0.16, 12), dark);
  hat.position.y = 2.48;
  group.add(hat);
  const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.05), dark);
  glasses.position.set(0, 2.24, 0.28);
  group.add(glasses);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.84, 0.24), suit);
    arm.position.set(side * 0.54, 1.32, 0);
    group.add(arm);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.9, 0.28), dark);
    leg.position.set(side * 0.2, 0.47, 0);
    group.add(leg);
  }
  const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), dark);
  weapon.position.set(0.5, 1.15, 0.28);
  group.add(weapon);
  group.scale.setScalar(scale);
  return group;
}

function spawnMissionTarget(target, count) {
  clearMissionTargets();
  state.targetsDead = 0;
  for (let index = 0; index < Math.max(1, count); index++) {
    const boss = index === 0;
    const mesh = buildMissionNpc(boss ? '#a8463f' : '#373f46', boss ? 1.12 : 1);
    const x = target.x + (boss ? 0 : Math.sin(index * 2.2) * 2.6);
    const z = target.z + (boss ? 0 : Math.cos(index * 2.2) * 2.6);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    state.targetUnits.push({ mesh, health: boss ? 170 : 80, maxHealth: boss ? 170 : 80,
      boss, dead: false, attackAt: 0, name: boss ? target.name : '保镖' });
  }
}

function clearMissionTargets() {
  for (const unit of state.targetUnits) scene.remove(unit.mesh);
  state.targetUnits.length = 0;
}

function killMissionTarget(unit) {
  if (unit.dead) return;
  unit.dead = true;
  unit.mesh.visible = false;
  state.targetsDead++;
  state.stats.kills++;
  burst(unit.mesh.position.clone().setY(1.3), 14, 'blood');
  audio.impact();
  toast(unit.boss ? `${unit.name}倒了` : '保镖倒下了');
  raiseWanted(1);
}

function ensureMissionTargets() {
  const step = currentStep(state.progress);
  if (step?.type === 'kill' && step.target) {
    const key = `${state.progress.job}:${state.progress.step}`;
    if (state.targetSpawned !== key) {
      spawnMissionTarget(step.target, step.count ?? 1);
      state.targetSpawned = key;
    }
  } else if (state.targetSpawned) {
    clearMissionTargets();
    state.targetSpawned = '';
  }
}

function updateMissionTargets(dt) {
  const position = getPosition();
  for (const unit of state.targetUnits) {
    if (unit.dead) continue;
    const dx = position.x - unit.mesh.position.x;
    const dz = position.z - unit.mesh.position.z;
    const distance = Math.hypot(dx, dz) || 1;
    unit.mesh.rotation.y = Math.atan2(dx, dz);
    if (!unit.boss && distance < 45 && distance > 1.7) {
      unit.mesh.position.x += dx / distance * 3.3 * dt;
      unit.mesh.position.z += dz / distance * 3.3 * dt;
      unit.mesh.position.y = Math.abs(Math.sin(state.elapsed * 8)) * 0.08;
    } else if (!unit.boss && distance <= 1.7 && state.elapsed > unit.attackAt) {
      unit.attackAt = state.elapsed + 1.2;
      hurt(9, 'police');
    }
  }
}

function moveTraffic(dt) {
  for (const vehicle of world.traffic) {
    if (vehicle.alongX) {
      vehicle.x += vehicle.direction * vehicle.velocity * dt;
      if (Math.abs(vehicle.x) > CITY_LIMIT) {
        vehicle.x = -Math.sign(vehicle.x) * (CITY_LIMIT - 3);
      }
    } else {
      vehicle.z += vehicle.direction * vehicle.velocity * dt;
      if (Math.abs(vehicle.z) > CITY_LIMIT) {
        vehicle.z = -Math.sign(vehicle.z) * (CITY_LIMIT - 3);
      }
    }
    vehicle.mesh.position.set(vehicle.x, 0, vehicle.z);
    for (const wheel of vehicle.mesh.userData.wheels) {
      wheel.rotation.x += vehicle.velocity * vehicle.direction * dt / 0.48;
    }
    vehicle.body.position.set(vehicle.x, 0.9, vehicle.z);
    vehicle.body.velocity.set(0, 0, 0);
  }
  for (const person of world.people) {
    if (person.dead) {
      person.deadTimer -= dt;
      if (person.deadTimer <= 0) {
        person.dead = false;
        person.stunned = 0;
        person.mesh.visible = true;
        person.mesh.rotation.z = 0;
        const axis = person.alongX ? 'x' : 'z';
        person[axis] = -Math.sign(person[axis] || 1) * 250;
        person.mesh.position[axis] = person[axis];
      }
      continue;
    }
    if (person.stunned > 0) {
      person.stunned -= dt;
      person.mesh.rotation.z = 0.65;
      continue;
    }
    person.mesh.rotation.z = 0;
    const axis = person.alongX ? 'x' : 'z';
    person[axis] += person.speed * person.direction * dt;
    if (Math.abs(person[axis]) > 278) person.direction *= -1;
    person.mesh.position[axis] = person[axis];
    person.mesh.rotation.y = person.alongX ? person.direction * Math.PI / 2 :
      (person.direction < 0 ? Math.PI : 0);
  }
}

function vehicleHitsPedestrians() {
  const car = state.currentCar;
  if (!car || Math.abs(car.speed) < 5) return;
  for (const person of world.people) {
    if (person.dead || person.stunned > 0) continue;
    const distance = Math.hypot(car.body.position.x - person.mesh.position.x,
      car.body.position.z - person.mesh.position.z);
    if (distance < 2.7) {
      person.stunned = 6;
      person.mesh.rotation.z = 0.8;
      burst(new THREE.Vector3(person.mesh.position.x, 1.1,
        person.mesh.position.z), 8, 'blood');
      raiseWanted(1);
      audio.impact();
      toast('撞倒了一个路人！', 1.8);
      car.speed *= 0.92;
    }
  }
}

function movePlayer(dt) {
  const arrowTurn = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  const horizontal = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) +
    (state.currentCar ? arrowTurn : 0) + joystick.x;
  const vertical = Number(keys.has('KeyW')) - Number(keys.has('KeyS')) +
    Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown')) - joystick.y;
  if (state.currentCar) {
    const car = state.currentCar;
    const throttle = THREE.MathUtils.clamp(vertical, -1, 1);
    const turn = THREE.MathUtils.clamp(horizontal, -1, 1);
    const handbrake = keys.has('Space');
    if (car.burning > 0) {
      car.burning -= dt;
      if (Math.random() < dt * 8) {
        burst(new THREE.Vector3(car.mesh.position.x + (Math.random() - 0.5) * 2,
          1.6, car.mesh.position.z + (Math.random() - 0.5) * 2), 2, 'smoke');
      }
      if (car.burning <= 0) explodeCar(car);
    }
    car.steer = turn;
    const topSpeed = car.topSpeed ?? 28;
    car.speed += throttle * (throttle > 0 ? 18 : 11) * dt;
    car.speed *= Math.exp(-(handbrake ? 4.6 : 0.55) * dt);
    car.speed = THREE.MathUtils.clamp(car.speed, -9.5, topSpeed);
    const turnRate = 1.55 * (handbrake ? 1.45 : 1);
    car.yaw -= turn * Math.min(Math.abs(car.speed) / 7, 1) *
      Math.sign(car.speed) * dt * turnRate;
    car.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), car.yaw);
    const grip = handbrake ? 0.62 : 1;
    car.body.velocity.x = Math.sin(car.yaw) * car.speed * grip;
    car.body.velocity.z = Math.cos(car.yaw) * car.speed * grip;
    car.body.angularVelocity.set(0, 0, 0);
    car.body.wakeUp();
    if (Math.abs(car.body.position.x) > CITY_LIMIT + 9 ||
        Math.abs(car.body.position.z) > CITY_LIMIT + 9) {
      car.body.position.x = THREE.MathUtils.clamp(car.body.position.x,
        -CITY_LIMIT, CITY_LIMIT);
      car.body.position.z = THREE.MathUtils.clamp(car.body.position.z,
        -CITY_LIMIT, CITY_LIMIT);
      car.speed = 0;
    }
    return;
  }
  const walk = new THREE.Vector2(horizontal, vertical);
  walk.clampLength(0, 1);
  const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const pace = (running ? 11 : 6.4) * (state.aiming ? 0.55 : 1);
  const dx = Math.cos(state.cameraYaw) * walk.x - Math.sin(state.cameraYaw) * walk.y;
  const dz = -Math.sin(state.cameraYaw) * walk.x - Math.cos(state.cameraYaw) * walk.y;
  player.velocity.x = dx * pace;
  player.velocity.z = dz * pace;
  state.moveDir.x = dx;
  state.moveDir.z = dz;
  if (walk.lengthSq() > 0.01) {
    const facing = Math.atan2(dx, dz);
    const diff = Math.atan2(Math.sin(facing - world.actor.rotation.y),
      Math.cos(facing - world.actor.rotation.y));
    world.actor.rotation.y += diff * Math.min(1, dt * 11);
    state.footstepTimer -= dt;
    if (state.footstepTimer <= 0) {
      audio.footstep();
      state.footstepTimer = running ? 0.26 : 0.38;
    }
  }
  player.position.x = THREE.MathUtils.clamp(player.position.x, -CITY_LIMIT, CITY_LIMIT);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -CITY_LIMIT, CITY_LIMIT);
}

function moveEffects(dt) {
  for (let index = effects.length - 1; index >= 0; index--) {
    const effect = effects[index];
    effect.remaining -= dt;
    if (effect.light) {
      effect.mesh.intensity = Math.max(0, effect.remaining * 80);
    } else {
      effect.velocity.y -= 10 * dt;
      effect.mesh.position.addScaledVector(effect.velocity, dt);
      if (effect.fade) effect.mesh.scale.setScalar(Math.max(0.05,
        Math.min(1, effect.remaining * 2)));
      if (effect.mesh.material === hitMaterials.smoke) {
        effect.mesh.scale.multiplyScalar(1 + dt * 2);
      }
    }
    if (effect.remaining <= 0) {
      scene.remove(effect.mesh);
      effects.splice(index, 1);
    }
  }
  for (let index = tracers.length - 1; index >= 0; index--) {
    const tracer = tracers[index];
    tracer.remaining -= dt;
    if (tracer.remaining <= 0) { scene.remove(tracer.mesh); tracers.splice(index, 1); }
  }
}

function syncModels(dt) {
  const playerRender = player.interpolatedPosition;
  if (!state.currentCar) {
    world.actor.position.set(playerRender.x, playerRender.y - 0.62,
      playerRender.z);
    const { head, arms, legs, tail } = world.actor.userData.rig;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const movement = Math.min(1, speed / 6);
    const phase = state.elapsed * (speed > 8 ? 13 : 10);
    const stride = Math.sin(phase) * movement;
    for (let index = 0; index < 2; index++) {
      const direction = index === 0 ? -1 : 1;
      legs[index].rotation.x = THREE.MathUtils.damp(legs[index].rotation.x,
        stride * direction * 0.55, 11, dt);
      arms[index].rotation.x = THREE.MathUtils.damp(arms[index].rotation.x,
        -stride * direction * 0.48, 11, dt);
    }
    if (state.arsenal.currentId !== 'melee') {
      arms[1].rotation.x = THREE.MathUtils.damp(arms[1].rotation.x,
        state.aiming ? -1.25 : -0.35, 8, dt);
    }
    head.rotation.z = Math.sin(state.elapsed * 1.7) * 0.035;
    head.rotation.x = movement * 0.055;
    tail.rotation.y = Math.sin(state.elapsed * 3.6) * (0.14 + movement * 0.11);
    world.actor.position.y += movement * Math.abs(Math.sin(phase)) * 0.075;
    if (player.position.y < -9) downed();
  }
  for (const person of world.cast) {
    const dx = player.position.x - person.x;
    const dz = player.position.z - person.z;
    if (dx * dx + dz * dz < 625) {
      const face = Math.atan2(dx, dz);
      const turn = Math.atan2(Math.sin(face - person.mesh.rotation.y),
        Math.cos(face - person.mesh.rotation.y));
      person.mesh.rotation.y += turn * Math.min(1, dt * 3.4);
    }
    const { head, arms, tail } = person.mesh.userData.rig;
    const breathe = Math.sin(state.elapsed * 1.4 + person.x) * 0.03;
    head.rotation.z = breathe;
    arms[0].rotation.x = Math.sin(state.elapsed * 1.1 + person.z) * 0.06;
    tail.rotation.y = Math.sin(state.elapsed * 1.6 + person.x * 0.5) * 0.12;
  }
  const night = dayNight.isNight;
  for (const car of world.cars) {
    if (car.dead) continue;
    const carRender = car.body.interpolatedPosition;
    car.mesh.position.set(carRender.x, carRender.y - 0.89, carRender.z);
    car.mesh.rotation.y = car.yaw;
    car.mesh.rotation.z = THREE.MathUtils.damp(car.mesh.rotation.z,
      state.currentCar === car ? -car.steer * Math.min(Math.abs(car.speed), 20) * 0.0025 : 0,
      6, dt);
    for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += car.speed * dt / 0.48;
    car.mesh.userData.brakeLights.emissiveIntensity = state.currentCar === car &&
      keys.has('Space') ? 1.6 : 0.34;
    if (car.mesh.userData.headlights) {
      car.mesh.userData.headlights.emissiveIntensity = night ? 1.7 : 0.45;
    }
  }
  if (state.currentCar) {
    const car = state.currentCar;
    if (Math.abs(car.body.velocity.x) + Math.abs(car.body.velocity.z) < 0.1 &&
        car.speed > 8) car.speed *= Math.exp(-dt * 3);
  }
}

function moveCamera(dt) {
  const source = state.currentCar ? state.currentCar.body.interpolatedPosition
    : player.interpolatedPosition;
  cameraAnchor.x = THREE.MathUtils.damp(cameraAnchor.x, source.x, 18, dt);
  cameraAnchor.z = THREE.MathUtils.damp(cameraAnchor.z, source.z, 18, dt);
  cameraAnchor.y = THREE.MathUtils.damp(cameraAnchor.y, source.y, 12, dt);
  const position = cameraAnchor;
  const driving = Boolean(state.currentCar);
  const moving = driving ? Math.abs(state.currentCar.speed) > 1.2
    : Math.hypot(player.velocity.x, player.velocity.z) > 0.6;
  const idleLook = state.elapsed - state.mouseMovedAt > 1.1 &&
    state.elapsed - state.cameraKeyAt > 1.1;
  if (moving && !state.aiming && idleLook) {
    const heading = driving ? state.currentCar.yaw : world.actor.rotation.y;
    const desired = heading + Math.PI;
    const diff = Math.atan2(Math.sin(desired - state.cameraYaw),
      Math.cos(desired - state.cameraYaw));
    const pull = driving ? dt * 2.5 : dt * 1.5;
    state.cameraYaw += diff * Math.min(1, pull);
  }
  const aiming = state.aiming && !state.currentCar;
  const distance = state.cameraDistance * (state.currentCar ? 1.18 : aiming ? 0.55 : 1);
  const height = (state.currentCar ? 4.5 : 3.05) + state.cameraPitch * 2.4;
  const targetY = (state.currentCar ? 1.5 : 1.25) + state.cameraPitch * 3.4;
  const desiredCamera = cameraDesired.set(position.x + Math.sin(state.cameraYaw) *
    distance, position.y + height, position.z + Math.cos(state.cameraYaw) * distance);
  const shoulder = driving ? 0.3 : aiming ? 0.9 : 0.6;
  desiredCamera.x += Math.cos(state.cameraYaw) * shoulder;
  desiredCamera.z -= Math.sin(state.cameraYaw) * shoulder;
  desiredCamera.x = THREE.MathUtils.clamp(desiredCamera.x, -CITY_LIMIT - 40,
    CITY_LIMIT + 40);
  desiredCamera.z = THREE.MathUtils.clamp(desiredCamera.z, -CITY_LIMIT - 55,
    CITY_LIMIT + 40);
  const viewTarget = cameraViewTarget.set(position.x,
    targetY + (position.y - 0.62), position.z);
  const ray = cameraRay;
  cameraRayFrom.set(viewTarget.x, viewTarget.y, viewTarget.z);
  cameraRayTo.set(desiredCamera.x, desiredCamera.y, desiredCamera.z);
  physics.raycastClosest(cameraRayFrom, cameraRayTo, { skipBackfaces: true }, ray);
  const boomTarget = desiredCamera.distanceTo(viewTarget);
  let clearBoom = boomTarget;
  if (ray.hasHit && ray.body.type === CANNON.Body.STATIC &&
      ray.body.shapes[0] instanceof CANNON.Box) {
    cameraRayEnd.set(ray.hitPointWorld.x, ray.hitPointWorld.y, ray.hitPointWorld.z);
    clearBoom = Math.max(1.6, viewTarget.distanceTo(cameraRayEnd) - 0.65);
    state.cameraHit = true;
  } else {
    state.cameraHit = false;
  }
  // snap in front of walls instantly, ease back out so grazing corners don't flicker
  cameraBoom = clearBoom < cameraBoom ? clearBoom
    : THREE.MathUtils.damp(cameraBoom, clearBoom, 5, dt);
  desiredCamera.sub(viewTarget).setLength(Math.min(cameraBoom, boomTarget))
    .add(viewTarget);
  state.cameraShake *= Math.exp(-dt * 9);
  desiredCamera.x += Math.sin(state.elapsed * 83) * state.cameraShake;
  desiredCamera.y += Math.sin(state.elapsed * 61) * state.cameraShake * 0.58;
  cameraPosition.lerp(desiredCamera, 1 - Math.exp(-9 * dt));
  cameraLook.lerp(viewTarget, 1 - Math.exp(-10 * dt));
  camera.position.copy(cameraPosition);
  camera.lookAt(cameraLook);
  const wantedFov = aiming ? 48 : state.currentCar ?
    65 + Math.min(Math.abs(state.currentCar.speed), 30) * 0.28 : 65;
  camera.fov = THREE.MathUtils.damp(camera.fov, wantedFov, 4, dt);
  camera.updateProjectionMatrix();
}

// Screen-space shafts work from the sun's NDC position, so the pass only earns its
// cost when the sun is actually in frame instead of burning a full-res blur every frame.
function updateSunrays() {
  const direction = atmosphere.sunDirection;
  camera.getWorldDirection(viewDir);
  const facing = viewDir.dot(direction);
  if (facing < 0.2) {
    postfx.setSunrays(null, 0);
    return;
  }
  sunProbe.copy(camera.position).addScaledVector(direction, 600).project(camera);
  if (sunProbe.z > 1 || Math.abs(sunProbe.x) > 1.35 || Math.abs(sunProbe.y) > 1.35) {
    postfx.setSunrays(null, 0);
    return;
  }
  sunScreen.set(sunProbe.x * 0.5 + 0.5, sunProbe.y * 0.5 + 0.5);
  const strength = (0.35 + daylight.sunset * 0.75) *
    THREE.MathUtils.smoothstep(facing, 0.2, 0.75) *
    THREE.MathUtils.clamp(daylight.day * 1.4, 0, 1);
  postfx.setSunrays(sunScreen, strength);
}

function handleMissionEvent(event) {
  if (!event) return;
  toast(event.text, 4);
  audio.ui(event.type === 'failed' ? 'deny' : 'success');
  if (event.type === 'checkpoint') audio.beep(720, 0.1);
  if (event.type === 'mission-complete') {
    state.stats.missions++;
    audio.missionStart();
    showBanner('委托完成', event.mission.title, event.mission.letter);
    showDialogue(event.mission.giver, event.mission.outro);
  }
  if (event.type === 'all-complete') {
    state.stats.missions++;
    audio.missionStart();
    showBanner('全部完成', '城市属于你了', '★');
    showDialogue(event.mission.giver, event.mission.outro, 7);
  }
  if (event.type === 'failed') showBanner('委托失败', event.mission.title, '!');
  if (event.type === 'mission-start' || event.type === 'objective') {
    if (event.mission.intro && state.missionIntroJob !== state.progress.job) {
      state.missionIntroJob = state.progress.job;
      showDialogue(event.mission.giver, event.mission.intro, 6.2);
    }
  }
  if (event.wanted) raiseWanted(event.wanted);
  if (event.spawnTarget) {
    spawnMissionTarget(event.spawnTarget, event.spawnTarget.count ?? 1);
    state.targetSpawned = `${state.progress.job}:${state.progress.step}`;
  }
  save();
}

function updateWorld(dt) {
  state.elapsed += dt;
  state.shotCooldown = Math.max(0, state.shotCooldown - dt);
  state.crashCooldown = Math.max(0, state.crashCooldown - dt);
  state.hurtCooldown = Math.max(0, state.hurtCooldown - dt);
  state.arsenal.update(state.elapsed);
  if (state.elapsed > state.bannerUntil) $('banner').classList.add('hidden');
  if (state.elapsed > state.dialogueUntil) $('dialogue').classList.add('hidden');
  if (state.elapsed > state.statusFlashUntil) $('status-flash').classList.add('hidden');
  if (state.elapsed > state.damageFlashUntil) $('damage-flash').classList.remove('hit');
  moveTraffic(dt);
  movePlayer(dt);
  vehicleHitsPedestrians();
  physics.step(1 / 60, dt, 6);
  if (!state.currentCar) {
    if (insideObstacle(player.position.x, player.position.z, 0.15,
        player.position.y)) {
      const spot = freeSpot(player.position.x, player.position.z);
      player.position.set(spot.x, 0.7, spot.z);
      player.velocity.set(0, 0, 0);
      state.safePosition = { x: spot.x, z: spot.z };
    } else {
      state.safePosition.x = player.position.x;
      state.safePosition.z = player.position.z;
    }
    const dirLength = Math.hypot(state.moveDir.x, state.moveDir.z);
    if (dirLength > 0.1) {
      state.stuckTimer += dt;
      const progress = Math.hypot(player.position.x - state.stuckAnchor.x,
        player.position.z - state.stuckAnchor.z);
      if (state.stuckTimer >= 0.8) {
        if (progress < 0.22) escapeStuck(state.moveDir.x / dirLength,
          state.moveDir.z / dirLength);
        state.stuckTimer = 0;
        state.stuckAnchor = { x: player.position.x, z: player.position.z };
      }
    } else {
      state.stuckTimer = 0;
      state.stuckAnchor.x = player.position.x;
      state.stuckAnchor.z = player.position.z;
    }
  }
  syncModels(dt);
  moveEffects(dt);
  updateMissionTargets(dt);
  police.update(dt, { px: getPosition().x, pz: getPosition().z,
    inVehicle: Boolean(state.currentCar), wanted: state.wanted, now: state.elapsed });

  const position = getPosition();
  const mission = currentMission(state.progress);
  if (mission && state.lastJob !== state.progress.job) {
    state.lastJob = state.progress.job;
    state.missionIntroJob = state.progress.job;
    showBanner('新委托', mission.title, mission.letter);
    showDialogue(mission.giver, mission.intro, 6.4);
    audio.missionStart();
  }
  ensureMissionTargets();
  const event = advanceMission(state.progress, position.x, position.z, dt,
    { wanted: state.wanted, targetsDead: state.targetsDead });
  if (event) handleMissionEvent(event);

  if (state.wanted) {
    state.wantedCooldown -= dt;
    if (state.wantedCooldown <= 0) {
      state.wanted--;
      state.wantedCooldown = state.wanted ? 26 : 0;
      if (!state.wanted) {
        police.clear();
        audio.ui('success');
        toast('通缉解除');
      }
    }
  }

  const last = state.lastPosition;
  if (last && !state.currentCar) {
    state.distanceAccumulator += Math.hypot(position.x - last.x, position.z - last.z);
    while (state.distanceAccumulator > 1000) {
      state.distanceAccumulator -= 1000;
      state.stats.distance++;
    }
  }
  state.lastPosition = { x: position.x, z: position.z };

  let nearestPolice = Infinity;
  for (const unit of police.units()) {
    const distance = Math.hypot(unit.body.position.x - position.x,
      unit.body.position.z - position.z);
    if (distance < nearestPolice) nearestPolice = distance;
  }
  audio.setSiren(state.wanted > 0 && nearestPolice < 95, state.wanted);
  audio.setEngine(state.currentCar ? Math.abs(state.currentCar.speed) : 0,
    Boolean(state.currentCar));
  if (!state.currentCar) audio.setRadio(false);

  const target = stepTarget(state.progress);
  route.visible = Boolean(target);
  if (target) {
    route.position.set(target.x, 0, target.z);
    routeGem.rotation.y += dt;
    routeGem.position.y = 7.6 + Math.sin(state.elapsed * 2.8) * 0.48;
    routeRing.scale.setScalar(1 + Math.sin(state.elapsed * 3.6) * 0.08);
  }
  daylight = dayNight.update(dt, { x: position.x, y: 0, z: position.z }, camera.position);
  const turnKey = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  if (turnKey && !state.currentCar) state.cameraYaw -= turnKey * dt * 2.2;
  const pitchKey = Number(keys.has('PageDown')) - Number(keys.has('PageUp'));
  if (pitchKey) state.cameraPitch = THREE.MathUtils.clamp(
    state.cameraPitch - pitchKey * dt * 0.6, -0.35, 0.55);
  if ((turnKey && !state.currentCar) || pitchKey) state.cameraKeyAt = state.elapsed;
  moveCamera(dt);
  updateSunrays();
  if (state.elapsed >= state.nextSave) {
    state.nextSave = state.elapsed + 4;
    save();
  }
}

function drawMap(mapCanvas, expanded = false) {
  const context = mapCanvas.getContext('2d');
  const size = mapCanvas.width;
  const position = getPosition();
  const scale = expanded ? size / 650 : size / 235;
  context.clearRect(0, 0, size, size);
  context.fillStyle = '#9fbda7';
  context.fillRect(0, 0, size, size);
  context.save();
  context.translate(size / 2 - position.x * scale * (expanded ? 0 : 1),
    size / 2 - position.z * scale * (expanded ? 0 : 1));
  context.scale(scale, scale);
  // Markers keep a constant on-screen size regardless of the map zoom level.
  const dot = (pixels) => pixels / scale;
  context.fillStyle = '#c7d4c7';
  context.fillRect(-300, -300, 600, 600);
  context.fillStyle = '#78bdc4';
  context.fillRect(-300, -480, 600, 174);
  context.fillStyle = '#e7d99e';
  context.fillRect(-300, -325, 600, 19);
  const parks = new Set(['-2,1', '2,-2', '1,1', '-3,-3', '-1,0']);
  for (let i = -4; i < 4; i++) {
    for (let j = -4; j < 4; j++) {
      const x = (i + 0.5) * ROAD_STEP;
      const z = (j + 0.5) * ROAD_STEP;
      context.fillStyle = parks.has(`${i},${j}`) ? '#77a988' :
        ((i + j) % 2 ? '#9eb0a9' : '#b2b9a6');
      context.fillRect(x - 27, z - 27, 54, 54);
    }
  }
  context.fillStyle = '#52646a';
  for (let i = -4; i <= 4; i++) {
    context.fillRect(i * ROAD_STEP - 7.5, -300, 15, 600);
    context.fillRect(-300, i * ROAD_STEP - 7.5, 600, 15);
  }
  for (const shop of shops.shops) {
    context.beginPath();
    context.arc(shop.x, shop.z, dot(4), 0, Math.PI * 2);
    context.fillStyle = '#8fd9b4';
    context.fill();
    context.lineWidth = dot(1.2);
    context.strokeStyle = '#f4fff8';
    context.stroke();
  }
  for (const unit of police.units()) {
    context.beginPath();
    context.arc(unit.body.position.x, unit.body.position.z, dot(3.4), 0, Math.PI * 2);
    context.fillStyle = '#5aa8ff';
    context.fill();
  }
  for (const person of world.cast) {
    context.beginPath();
    context.arc(person.x, person.z, dot(4.4), 0, Math.PI * 2);
    context.fillStyle = '#f0a03c';
    context.fill();
    context.lineWidth = dot(1.3);
    context.strokeStyle = '#293e43';
    context.stroke();
    if (expanded) {
      context.font = `700 ${11 / scale}px "Microsoft YaHei", system-ui, sans-serif`;
      context.textAlign = 'center';
      context.fillStyle = '#20383c';
      context.fillText(person.name, person.x, person.z - dot(8));
    }
  }
  const target = stepTarget(state.progress);
  if (target) {
    context.beginPath();
    context.setLineDash([dot(6), dot(5)]);
    context.strokeStyle = '#ffe2a2';
    context.lineWidth = dot(2);
    context.moveTo(position.x, position.z);
    context.lineTo(target.x, target.z);
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(target.x, target.z, dot(7), 0, Math.PI * 2);
    context.fillStyle = '#e78873';
    context.fill();
    context.lineWidth = dot(1.6);
    context.strokeStyle = '#fff7e4';
    context.stroke();
  }
  context.beginPath();
  context.arc(GARAGE.x, GARAGE.z, dot(4.4), 0, Math.PI * 2);
  context.fillStyle = '#91d7c1';
  context.fill();
  context.lineWidth = dot(1.2);
  context.strokeStyle = '#f4fff8';
  context.stroke();
  context.translate(position.x, position.z);
  context.rotate(state.currentCar?.yaw ?? world.actor.rotation.y);
  context.beginPath();
  context.moveTo(0, dot(10));
  context.lineTo(-dot(7), -dot(7.6));
  context.lineTo(dot(7), -dot(7.6));
  context.closePath();
  context.fillStyle = '#ffdf6c';
  context.fill();
  context.lineWidth = dot(1.8);
  context.strokeStyle = '#293e43';
  context.stroke();
  context.restore();
}

function missionLabel(step) {
  if (!step) return '所有委托已完成';
  if (step.type === 'escape') return `通缉 ${state.wanted} 星 · 甩掉警察`;
  return step.text;
}

function updatePerfNote() {
  if (gapCount < 10 || $('pause-screen').classList.contains('hidden')) return;
  let sum = 0;
  const take = Math.min(gapCount, 30);
  for (let index = 0; index < take; index++) {
    sum += frameGaps[(gapIndex - 1 - index + frameGaps.length) % frameGaps.length];
  }
  const fps = sum > 0 ? 1000 * take / sum : 0;
  $('perf-note').textContent =
    `帧率 ${fps.toFixed(0)} · 渲染倍率 ${Math.round(renderScale * 100)}%`;
}

function updateUI() {
  const position = getPosition();
  const mission = currentMission(state.progress);
  const step = currentStep(state.progress);
  const target = stepTarget(state.progress);
  $('mission-index').textContent = mission ?
    `0${state.progress.job + 1} / 0${TOTAL_MISSIONS}` : '完成';
  $('mission-giver').textContent = mission ? `${mission.giver} · 委托` : '自由活动';
  $('mission-title').textContent = mission?.title ?? '自由漫游';
  $('mission-description').textContent = mission ?
    missionLabel(step) : '城市属于你了，随便逛逛吧';
  $('mission-distance').textContent = target ?
    `目的地 ${Math.round(targetDistance(state.progress, position.x, position.z))} m` : '';
  $('mission-timer').textContent = step?.type === 'race' ?
    `检查点 ${state.progress.checkpoint}/${step.points.length}` :
    step?.duration ? `${Math.ceil(state.progress.remaining)} s` : '';
  const money = `$ ${String(Math.max(0, Math.round(state.progress.cash))).padStart(4, '0')}`;
  if ($('money').textContent !== money) {
    $('money').textContent = money;
    $('money').classList.add('bump');
    setTimeout(() => $('money').classList.remove('bump'), 160);
  }
  $('wanted').textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
  $('wanted').classList.toggle('busy', state.wanted >= 3);
  $('health-fill').style.width = `${Math.max(0, state.health)}%`;
  $('health-value').textContent = String(Math.max(0, Math.round(state.health)));
  $('armor-fill').style.width = `${Math.max(0, state.armor)}%`;
  $('armor-value').textContent = String(Math.max(0, Math.round(state.armor)));
  $('clock').textContent = dayNight.clockText();
  const night = dayNight.isNight;
  $('district').textContent = `${position.z < -205 ? '海滨区' :
    Math.abs(position.x) > 185 ? '外环区' : '中心区'} · ${night ? '夜间' : '日间'}`;
  $('street-name').textContent = position.z < -205 ? '海风海岸' :
    Math.abs(position.x) > 185 ? '橘光路' :
      position.z > 120 ? '绿荫街' : '晴日大道';
  const gun = state.arsenal.weapon();
  $('weapon-slot').textContent = gun.slot;
  $('weapon-name').textContent = gun.name;
  if (gun.id === 'melee') $('weapon-ammo').textContent = '近战';
  else {
    const ammo = state.arsenal.ammo(gun.id);
    $('weapon-ammo').textContent = `${ammo.loaded} / ${ammo.reserve}`;
  }
  $('touch-switch-label').textContent = gun.slot;
  const shop = nearestShop();
  const label = state.currentCar ? '离开车辆' : nearestCar() ? '进入车辆' :
    shop ? `进入${shop.shop.short}` : atGarage() ? '修理与恢复' : '';
  $('interaction').classList.toggle('hidden', !label);
  $('interaction-label').textContent = label;
  $('vehicle-info').classList.toggle('hidden', !state.currentCar);
  if (state.currentCar) {
    $('speed').textContent = String(Math.round(Math.abs(state.currentCar.speed) * 3.6))
      .padStart(2, '0');
    $('vehicle-name').textContent = state.currentCar.name;
    $('vehicle-durability').textContent =
      `车况 ${Math.max(0, Math.round(state.currentCar.durability))}`;
  }
  $('crosshair').classList.toggle('hidden', state.currentCar || state.mapOpen ||
    state.paused || state.shopOpen);
  $('crosshair').classList.toggle('aim', state.aiming);
  $('radio-toggle').classList.toggle('playing', audio.radioOn);
  $('radio-glyph').textContent = audio.radioOn ? '♫' : '♪';
  drawMap($('minimap'));
  if (state.mapOpen) drawMap($('large-map'), true);
  updatePerfNote();
}

function closePanels() {
  state.paused = false;
  state.mapOpen = false;
  $('pause-screen').classList.add('hidden');
  $('full-map').classList.add('hidden');
}

function togglePause() {
  const opening = !state.paused;
  closePanels();
  closeShop();
  state.paused = opening;
  $('pause-screen').classList.toggle('hidden', !opening);
  $('pause-progress').textContent = currentMission(state.progress) ?
    `正在处理「${currentMission(state.progress).title}」，已完成 ${state.stats.missions} 个委托。` :
    '全部城市委托已经完成，随便逛逛吧。';
  $('stat-kills').textContent = String(state.stats.kills);
  $('stat-missions').textContent = String(state.stats.missions);
  $('stat-crimes').textContent = String(state.stats.crimes);
  $('stat-distance').textContent = String(state.stats.distance);
  if (opening && document.pointerLockElement) document.exitPointerLock();
  keys.clear();
  if (opening) audio.setSiren(false);
}

function toggleMap() {
  const opening = !state.mapOpen;
  closePanels();
  closeShop();
  state.mapOpen = opening;
  $('full-map').classList.toggle('hidden', !opening);
  if (opening) drawMap($('large-map'), true);
  // The pointer lock stays on while the map is open: releasing it here means the
  // browser refuses to re-lock on the same key press, so closing the map would
  // leave the mouse dead until you clicked the scene again.
  keys.clear();
}

function resetGame() {
  if (state.currentCar) exitCar(true);
  clearMissionTargets();
  police.clear();
  state.progress = newProgress();
  state.health = 100;
  state.armor = 0;
  state.wanted = 0;
  state.wantedCooldown = 0;
  state.stats = { kills: 0, missions: 0, crimes: 0, distance: 0 };
  state.lastJob = 0;
  state.targetSpawned = '';
  state.targetsDead = 0;
  player.position.set(0, 1.15, 7);
  player.velocity.set(0, 0, 0);
  state.cameraYaw = Math.PI + 0.38;
  state.cameraPitch = 0.03;
  closePanels();
  closeShop();
  save();
  showBanner('新的开始', '奶龙之城：犯罪都市', 'N');
  toast('崭新的城市故事，出发！');
}

function updateQuality() {
  const option = $('quality').value;
  qualityLevel = option;
  basePixelRatio = Math.min(window.devicePixelRatio || 1,
    option === 'high' ? 1.25 : option === 'medium' ? 1.0 : 0.65);
  renderScale = 1;
  renderer.setPixelRatio(basePixelRatio);
  renderer.shadowMap.enabled = option !== 'low';
  if (option === 'high') sun.shadow.mapSize.set(2048, 2048);
  else sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
  postfx.setQuality(option);
  resize();
  saveSettings();
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  postfx.setSize(width, height, renderer.getPixelRatio());
}

function renderFrame(dt) {
  renderer.info.autoReset = false;
  renderer.info.reset();
  renderer.shadowMap.needsUpdate = true;
  if (qualityLevel === 'low') renderer.render(scene, camera);
  else postfx.render(dt, state.elapsed);
}

function toggleRadio() {
  startAudio();
  if (!audio.radioOn) {
    audio.setRadio(true);
    toast(`电台开 · ${audio.station().name}`, 1.8);
  } else {
    const station = audio.cycleRadio();
    toast(`换台 · ${station.name}`, 1.8);
  }
  $('radio-toggle').classList.toggle('playing', audio.radioOn);
}

function horn() {
  if (!state.currentCar) return;
  startAudio();
  audio.beep(392, 0.22, 'square');
  setTimeout(() => audio.beep(392, 0.22, 'square'), 240);
}

function setupControls() {
  createIcons({ icons: { ArrowUp, CarFront, Crosshair, Map, Pause, Play,
    RotateCcw, X } });
  $('pause-toggle').addEventListener('click', togglePause);
  $('resume').addEventListener('click', togglePause);
  $('restart').addEventListener('click', resetGame);
  $('map-toggle').addEventListener('click', toggleMap);
  $('map-close').addEventListener('click', toggleMap);
  $('full-map').addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.map-dialog')) toggleMap();
  });
  $('shop-close').addEventListener('click', closeShop);
  $('radio-toggle').addEventListener('click', toggleRadio);
  $('volume').addEventListener('input', (event) => {
    audio.setVolume(Number(event.target.value) / 100);
    saveSettings();
  });
  $('quality').addEventListener('change', updateQuality);
  window.addEventListener('resize', resize);
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('beforeunload', save);
  window.addEventListener('keydown', (event) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
      .includes(event.code)) event.preventDefault();
    if (event.code === 'Escape' && !event.repeat) {
      if (state.shopOpen) { closeShop(); return; }
      if (state.mapOpen) toggleMap();
      else togglePause();
      return;
    }
    if (event.code === 'KeyM' && !event.repeat) { toggleMap(); return; }
    if (state.paused || state.mapOpen || state.shopOpen) return;
    startAudio();
    if (event.code === 'KeyE' && !event.repeat) interact();
    if (event.code === 'KeyG' && !event.repeat) repair();
    if (event.code === 'KeyR' && !event.repeat) reload();
    if (event.code === 'KeyT' && !event.repeat) {
      if (state.currentCar) { audio.setRadio(!audio.radioOn); }
      else toast('车载电台需要坐进车里', 1.6);
    }
    if (event.code === 'KeyH' && !event.repeat) horn();
    if (event.code === 'KeyQ' && !event.repeat) cycleWeapon();
    if (/^Digit[1-4]$/.test(event.code) && !event.repeat) {
      switchWeapon(Number(event.code.slice(5)));
    }
    if (event.code === 'Space' && !event.repeat && !state.currentCar &&
        player.position.y < 0.72) { player.velocity.y = 9; player.wakeUp(); }
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || state.paused || state.mapOpen ||
        state.shopOpen) return;
    startAudio();
    if (!document.pointerLockElement) {
      event.preventDefault();
      canvas.requestPointerLock?.();
      if (event.button === 2) state.aiming = true;
      return;
    }
    if (event.button === 2) {
      state.aiming = true;
      event.preventDefault();
      return;
    }
    if (event.button === 0) shoot();
  });
  canvas.addEventListener('pointerup', (event) => {
    if (event.button === 2) state.aiming = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement) state.aiming = false;
    else if (audio.context) audio.ui('success');
  });
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === canvas && !state.paused &&
        !state.mapOpen && !state.shopOpen) {
      state.cameraYaw -= event.movementX * (state.aiming ? 0.0019 : 0.0028);
      state.cameraPitch = THREE.MathUtils.clamp(
        state.cameraPitch - event.movementY * 0.0016, -0.35, 0.55);
      state.mouseMovedAt = state.elapsed;
    }
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    state.cameraDistance = THREE.MathUtils.clamp(state.cameraDistance +
      Math.sign(event.deltaY) * 1.2, 6.5, 18);
  }, { passive: false });
  $('touch-enter').addEventListener('pointerdown', (event) => {
    event.preventDefault(); startAudio(); interact();
  });
  $('touch-fire').addEventListener('pointerdown', (event) => {
    event.preventDefault(); startAudio(); shoot();
  });
  $('touch-switch').addEventListener('pointerdown', (event) => {
    event.preventDefault(); startAudio(); cycleWeapon();
  });
  $('touch-jump').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startAudio();
    if (state.currentCar) {
      keys.add('Space');
      setTimeout(() => keys.delete('Space'), 350);
    } else if (player.position.y < 0.72) { player.velocity.y = 9; player.wakeUp(); }
  });
  const stick = $('joystick');
  const knob = $('joystick-knob');
  function moveStick(event) {
    const rect = stick.getBoundingClientRect();
    const dx = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const dy = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    const length = Math.max(1, Math.hypot(dx, dy));
    joystick.x = dx / length;
    joystick.y = dy / length;
    knob.style.left = `${50 + joystick.x * 28}%`;
    knob.style.top = `${50 + joystick.y * 28}%`;
  }
  stick.addEventListener('pointerdown', (event) => {
    event.preventDefault(); startAudio();
    stick.setPointerCapture(event.pointerId);
    moveStick(event);
  });
  stick.addEventListener('pointermove', (event) => {
    if (stick.hasPointerCapture(event.pointerId)) moveStick(event);
  });
  function releaseStick() {
    joystick.x = 0; joystick.y = 0;
    knob.style.left = '50%'; knob.style.top = '50%';
  }
  stick.addEventListener('pointerup', releaseStick);
  stick.addEventListener('pointercancel', releaseStick);
}

if (matchMedia('(pointer: coarse)').matches &&
    !localStorage.getItem('nailong-city-settings')) $('quality').value = 'medium';
setupControls();
updateQuality();
updateUI();
moveCamera(1);
renderFrame(0);
$('loading').classList.add('hidden');
$('interface').classList.remove('hidden');
document.documentElement.dataset.gameReady = 'true';
if (!saved) setTimeout(() => showBanner('欢迎来到', '奶龙之城：犯罪都市', 'N'), 600);
setTimeout(() => toast('点击画面锁定鼠标，移动鼠标转动镜头', 5), 1400);

let lastFrame = performance.now();
let uiAt = 0;

// Drop internal resolution when frame pacing slips so motion stays smooth on weaker
// GPUs, then claw it back slowly once there is headroom again. A high median alone is
// not judder: what reads as shaking is the *mixed* 16.7/33.3 ms pattern, so the long
// frame ratio is what actually drives the downscale.
function tuneRenderScale(now, gapMs) {
  frameGaps[gapIndex] = gapMs;
  gapIndex = (gapIndex + 1) % frameGaps.length;
  gapCount = Math.min(gapCount + 1, frameGaps.length);
  if (gapCount < 60 || document.hidden || now - pacingAt < 1200) return;
  pacingAt = now;
  const sorted = Array.from(frameGaps.subarray(0, gapCount)).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  if (median > 200) return;
  let long = 0;
  for (const gap of sorted) if (gap > median * 1.5) long++;
  const longRatio = long / sorted.length;
  let next = renderScale;
  if (longRatio > 0.12 || median > 22) next -= 0.1;
  else if (longRatio < 0.04 && median < 15) next += 0.05;
  next = THREE.MathUtils.clamp(next, 0.6, 1);
  if (Math.abs(next - renderScale) < 0.02) return;
  renderScale = next;
  renderer.setPixelRatio(basePixelRatio * renderScale);
  resize();
}

function frame(now) {
  requestAnimationFrame(frame);
  state.frames++;
  const gap = Math.max(0, now - lastFrame);
  const dt = Math.min(0.1, gap / 1000);
  lastFrame = now;
  if (!state.paused && !state.mapOpen && !state.shopOpen) updateWorld(dt);
  renderFrame(dt);
  tuneRenderScale(now, gap);
  if (now - uiAt > 130) { updateUI(); uiAt = now; }
}
requestAnimationFrame(frame);

if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  window.__NAILONG_DEBUG__ = {
    snapshot: () => ({ x: getPosition().x, z: getPosition().z,
      job: state.progress.job, step: state.progress.step,
      cash: state.progress.cash, wanted: state.wanted, health: state.health,
      armor: state.armor, car: Boolean(state.currentCar),
      pedestrians: world.people.length, weapon: state.arsenal.currentId,
      loaded: state.arsenal.loadedOf(state.arsenal.currentId),
      stride: Math.abs(world.actor.userData.rig.legs[0].rotation.x) +
        Math.abs(world.actor.userData.rig.legs[1].rotation.x),
      actorYaw: world.actor.rotation.y,
      moveDir: { ...state.moveDir },
      velocity: { x: player.velocity.x, z: player.velocity.z },
      aiming: state.aiming, idleFor: state.elapsed - state.mouseMovedAt,
      wheelAngle: state.currentCar?.mesh.userData.wheels[0].rotation.x ?? null,
      carYaw: state.currentCar?.yaw ?? null,
      carRender: state.currentCar ? {
        x: state.currentCar.body.interpolatedPosition.x,
        y: state.currentCar.body.interpolatedPosition.y,
        z: state.currentCar.body.interpolatedPosition.z,
        vx: state.currentCar.body.velocity.x,
        vz: state.currentCar.body.velocity.z } : null,
      camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z,
        yaw: state.cameraYaw, rx: camera.rotation.x, ry: camera.rotation.y,
        rz: camera.rotation.z },
      police: police.count(), pressed: [...keys] }),
    render: () => ({ quality: qualityLevel, pixelRatio: renderer.getPixelRatio(),
      renderScale, samples: postfx.composer.renderTarget1.samples }),
    teleport: (x, z) => {
      if (state.currentCar) exitCar(true);
      player.position.set(x, 0.7, z);
      player.velocity.set(0, 0, 0);
    },
    solo: () => {
      for (const vehicle of world.traffic) {
        physics.removeBody(vehicle.body);
        scene.remove(vehicle.mesh);
      }
      world.traffic.length = 0;
      for (const car of world.cars) {
        if (car === state.currentCar || car.dead) continue;
        car.body.position.set(0, -300, 0);
        car.mesh.position.set(0, -300, 0);
      }
    },
    placeCar: (x, z, yaw) => {
      const car = state.currentCar;
      if (!car) return false;
      car.body.position.set(x, 0.9, z);
      car.body.previousPosition.set(x, 0.9, z);
      car.body.interpolatedPosition.set(x, 0.9, z);
      car.body.velocity.set(0, 0, 0);
      car.body.angularVelocity.set(0, 0, 0);
      car.yaw = yaw;
      car.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
      car.body.previousQuaternion.copy(car.body.quaternion);
      car.mesh.position.set(x, 0.01, z);
      car.mesh.rotation.y = yaw;
      car.speed = 0;
      return true;
    },
    setWanted: (level) => { state.wanted = level; state.wantedCooldown = 35; },
    cast: () => world.cast.map((person) => ({ name: person.name, x: person.x,
      z: person.z })),
    look: (yaw) => { state.cameraYaw = yaw; state.cameraKeyAt = state.elapsed; },
    inspect: (index) => {
      const person = world.cast[index];
      if (!person) return false;
      const facing = person.mesh.rotation.y;
      state.paused = true;
      camera.position.set(person.x + Math.sin(facing) * 4.2, 2.5,
        person.z + Math.cos(facing) * 4.2);
      camera.lookAt(person.x, 1.9, person.z);
      camera.updateMatrixWorld();
      return true;
    },
    resume: () => { state.paused = false; },
    info: () => ({ ...renderer.info.render, elapsed: state.elapsed,
      lights: { sun: +sun.intensity.toFixed(2),
        hemi: +sky.intensity.toFixed(2),
        hemiColor: sky.color.getHexString(),
        exposure: renderer.toneMappingExposure,
        env: +scene.environmentIntensity.toFixed(2) } }),
    probe: () => {
      const p = player.position;
      const near = [];
      for (const body of obstacles) {
        const shape = body.shapes[0];
        if (!(shape instanceof CANNON.Box)) continue;
        const local = body.quaternion.inverse().vmult(
          new CANNON.Vec3(p.x - body.position.x, 0, p.z - body.position.z));
        if (Math.abs(local.x) > shape.halfExtents.x + 3 ||
            Math.abs(local.z) > shape.halfExtents.z + 3) continue;
        near.push({ x: +body.position.x.toFixed(1), y: +body.position.y.toFixed(1),
          z: +body.position.z.toFixed(1), hx: +shape.halfExtents.x.toFixed(1),
          hy: +shape.halfExtents.y.toFixed(1), hz: +shape.halfExtents.z.toFixed(1),
          lx: +local.x.toFixed(2), lz: +local.z.toFixed(2) });
      }
      return { pos: [p.x, p.y, p.z].map((v) => +v.toFixed(2)),
        vel: [player.velocity.x, player.velocity.y, player.velocity.z]
          .map((v) => +v.toFixed(2)),
        inside: insideObstacle(p.x, p.z, 0.15, p.y), near };
    },    setHour: (hours) => { dayNight.hours = hours; },
    setCash: (value) => { state.progress.cash = value; },
    giveWeapon: (id) => { state.arsenal.unlock(id); },
    shopNearby: () => Boolean(nearestShop()),
    shoot,
    openShopById: (id) => {
      const shop = shops.shops.find((entry) => entry.id === id);
      if (shop) { player.position.set(shop.x, 0.7, shop.z + 2); openShop(shop); }
    },
  };
}
