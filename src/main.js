import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ArrowUp, CarFront, createIcons, Crosshair, Map, Pause, Play,
  RotateCcw, X } from 'lucide';
import { createAtmosphere } from './atmosphere.js';
import { CITY_LIMIT, GARAGE, ROAD_STEP, createWorld } from './world.js';
import { STAGES, advanceMission, currentStage, newProgress, recoverProgress,
  targetDistance } from './mission.js';
import './style.css';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#acdce4');
scene.fog = new THREE.Fog('#b3cdd3', 155, 660);

const camera = new THREE.PerspectiveCamera(65, 1, 0.12, 950);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  $('loading').textContent = '无法启动 3D 画面，请更新显卡驱动并开启硬件加速。';
  throw error;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const sky = new THREE.HemisphereLight('#d9ecf2', '#8d9985', 1.55);
scene.add(sky);
const sun = new THREE.DirectionalLight('#f8e4c3', 2.5);
sun.position.set(-110, 112, 75);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -44;
sun.shadow.camera.right = 44;
sun.shadow.camera.top = 44;
sun.shadow.camera.bottom = -44;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 350;
sun.shadow.bias = -0.001;
scene.add(sun);
const atmosphere = createAtmosphere(scene);

const physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -24, 0) });
physics.broadphase = new CANNON.SAPBroadphase(physics);
physics.allowSleep = true;
physics.defaultContactMaterial.friction = 0;
physics.defaultContactMaterial.restitution = 0.02;
const world = createWorld(scene, physics);
const player = new CANNON.Body({ mass: 65, shape: new CANNON.Sphere(0.94),
  material: new CANNON.Material({ friction: 0.2 }), linearDamping: 0.55 });
player.position.set(0, 1.03, 7);
player.fixedRotation = true;
player.updateMassProperties();
physics.addBody(player);

const keys = new Set();
const joystick = { x: 0, y: 0 };
const state = {
  progress: newProgress(), health: 100, wanted: 0, wantedCooldown: 0,
  currentCar: null, paused: false, mapOpen: false, cameraYaw: Math.PI + 0.38,
  cameraDistance: 9.2, elapsed: 0, mouseMovedAt: 0, nextSave: 0,
  shotCooldown: 0, crashCooldown: 0, hurtCooldown: 0, toastUntil: 0,
  cameraShake: 0, frames: 0,
};
const cameraPosition = new THREE.Vector3(-4, 6, -9);
const cameraLook = new THREE.Vector3(0, 2, 5);
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

const projectiles = [];
const officers = [];
const effects = [];
const effectGeometry = new THREE.SphereGeometry(0.1, 7, 5);
const effectMaterials = ['#f9d65e', '#ee8c80', '#80d4ba', '#aad4ed'].map(
  (color) => new THREE.MeshBasicMaterial({ color }));
const audio = { context: null, engine: null, engineGain: null, volume: 0.35 };
const particleColors = ['#f9d65e', '#ee8c80', '#80d4ba', '#aad4ed'];
const saved = readSave();
if (saved) {
  state.progress = recoverProgress(saved.progress);
  state.health = Number.isFinite(saved.health) ? THREE.MathUtils.clamp(saved.health, 1, 100) : 100;
  if (Number.isFinite(saved.x) && Number.isFinite(saved.z) &&
    Math.abs(saved.x) < CITY_LIMIT && Math.abs(saved.z) < CITY_LIMIT) {
    player.position.set(saved.x, 1.1, saved.z);
  }
}
try {
  const settings = JSON.parse(localStorage.getItem('nailong-city-settings') || '{}');
  if (Number.isFinite(settings.volume)) audio.volume = THREE.MathUtils.clamp(settings.volume, 0, 1);
  if (['high', 'medium', 'low'].includes(settings.quality)) $('quality').value = settings.quality;
} catch { /* Ignore damaged settings. */ }
$('volume').value = Math.round(audio.volume * 100);

function readSave() {
  try { return JSON.parse(localStorage.getItem('nailong-city-save') || 'null'); }
  catch { return null; }
}

function save() {
  const pos = getPosition();
  try {
    localStorage.setItem('nailong-city-save', JSON.stringify({ progress: state.progress,
      health: state.health, x: pos.x, z: pos.z }));
  } catch { /* Game stays playable when storage is unavailable. */ }
}

function saveSettings() {
  try { localStorage.setItem('nailong-city-settings', JSON.stringify({
    volume: audio.volume, quality: $('quality').value })); }
  catch { /* Optional preference. */ }
}

function startAudio() {
  if (audio.context) { audio.context.resume(); return; }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  audio.context = new AudioContext();
  audio.engineGain = audio.context.createGain();
  audio.engineGain.gain.value = 0;
  audio.engineGain.connect(audio.context.destination);
  audio.engine = audio.context.createOscillator();
  audio.engine.type = 'sawtooth';
  audio.engine.frequency.value = 64;
  audio.engine.connect(audio.engineGain);
  audio.engine.start();
}

function beep(frequency = 420, duration = 0.12, type = 'sine') {
  if (!audio.context || !audio.volume) return;
  const oscillator = audio.context.createOscillator();
  const gain = audio.context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audio.context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.35,
    audio.context.currentTime + duration);
  gain.gain.setValueAtTime(0.06 * audio.volume, audio.context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.context.currentTime + duration);
  oscillator.connect(gain).connect(audio.context.destination);
  oscillator.start();
  oscillator.stop(audio.context.currentTime + duration);
}

function toast(message, seconds = 3) {
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  state.toastUntil = state.elapsed + seconds;
}

function getPosition() {
  return state.currentCar ? state.currentCar.body.position : player.position;
}

function nearestCar() {
  if (state.currentCar) return null;
  let nearest = null;
  let distance = 4.8;
  for (const car of world.cars) {
    const d = Math.hypot(car.body.position.x - player.position.x,
      car.body.position.z - player.position.z);
    if (d < distance) { nearest = car; distance = d; }
  }
  return nearest;
}

function atGarage() {
  const pos = getPosition();
  return Math.hypot(pos.x - GARAGE.x, pos.z - GARAGE.z) < 12;
}

function interact() {
  if (state.paused || state.mapOpen) return;
  if (state.currentCar) {
    const car = state.currentCar;
    state.currentCar = null;
    car.body.velocity.set(0, 0, 0);
    car.speed = 0;
    car.body.type = CANNON.Body.STATIC;
    car.body.mass = 0;
    car.body.updateMassProperties();
    const roadX = Math.round(car.body.position.x / ROAD_STEP) * ROAD_STEP;
    const roadZ = Math.round(car.body.position.z / ROAD_STEP) * ROAD_STEP;
    const sideX = Math.abs(car.body.position.x - roadX) < 9;
    const offsetX = sideX ? (roadX - car.body.position.x >= 0 ? 3.8 : -3.8) : 0;
    const offsetZ = sideX ? 0 : (roadZ - car.body.position.z >= 0 ? 3.8 : -3.8);
    player.position.set(car.body.position.x + offsetX, 1.18, car.body.position.z + offsetZ);
    player.velocity.set(0, 0, 0);
    player.type = CANNON.Body.DYNAMIC;
    player.mass = 65;
    player.collisionResponse = true;
    player.updateMassProperties();
    world.actor.visible = true;
    beep(330);
    toast('自由漫步');
    return;
  }
  const car = nearestCar();
  if (car) {
    state.currentCar = car;
    car.body.type = CANNON.Body.DYNAMIC;
    car.body.mass = 750;
    car.body.updateMassProperties();
    car.body.wakeUp();
    player.type = CANNON.Body.KINEMATIC;
    player.collisionResponse = false;
    player.velocity.set(0, 0, 0);
    player.position.set(0, -80, 0);
    player.updateMassProperties();
    world.actor.visible = false;
    beep(520);
    toast(`已进入${car.name}`);
  } else if (atGarage()) repair();
}

function repair() {
  if (!atGarage()) return;
  const price = state.progress.cash >= 30 ? 30 : 0;
  state.progress.cash -= price;
  state.health = 100;
  state.wanted = 0;
  state.wantedCooldown = 0;
  clearOfficers();
  if (state.currentCar) state.currentCar.speed = 0;
  beep(740, 0.2);
  toast(price ? '修理完成，恢复活力 · -$30' : '免费修理完成，恢复活力');
  save();
}

function raiseWanted(amount = 1) {
  state.wanted = Math.min(5, state.wanted + amount);
  state.wantedCooldown = 35;
}

function createOfficer(index) {
  const pos = getPosition();
  const angle = index * 2.4 + 0.6;
  const roadX = Math.round((pos.x + Math.sin(angle) * 26) / ROAD_STEP) * ROAD_STEP;
  const roadZ = Math.round((pos.z + Math.cos(angle) * 26) / ROAD_STEP) * ROAD_STEP;
  const spawnX = THREE.MathUtils.clamp(roadX + 3, -CITY_LIMIT + 9, CITY_LIMIT - 9);
  const spawnZ = THREE.MathUtils.clamp(roadZ + 3, -CITY_LIMIT + 9, CITY_LIMIT - 9);
  const body = new CANNON.Body({ mass: 55, shape: new CANNON.Sphere(0.78),
    linearDamping: 0.82 });
  body.fixedRotation = true;
  body.position.set(spawnX, 0.9, spawnZ);
  body.updateMassProperties();
  physics.addBody(body);
  const person = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: '#436c86' });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#dfad8a' }));
  head.position.y = 2.03;
  person.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.15, 0.45), blue);
  torso.position.y = 1.17;
  person.add(torso);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.29, 0.2, 10), blue);
  cap.position.y = 2.37;
  person.add(cap);
  person.position.set(spawnX, 0, spawnZ);
  scene.add(person);
  officers.push({ body, mesh: person, stunned: 0 });
}

function clearOfficers() {
  for (const officer of officers) {
    physics.removeBody(officer.body);
    scene.remove(officer.mesh);
  }
  officers.length = 0;
}

function shoot() {
  if (state.paused || state.mapOpen || state.shotCooldown > 0) return;
  state.shotCooldown = 0.23;
  startAudio();
  const pos = getPosition();
  const direction = new THREE.Vector3(-Math.sin(state.cameraYaw), 0.025,
    -Math.cos(state.cameraYaw));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8),
    new THREE.MeshBasicMaterial({ color: particleColors[Math.floor(Math.random() * 4)] }));
  ball.position.set(pos.x, (state.currentCar ? 2.1 : 1.85) +
    Math.max(0, pos.y - (state.currentCar ? 0.9 : 1)), pos.z);
  ball.position.addScaledVector(direction, 1.35);
  scene.add(ball);
  projectiles.push({ mesh: ball, direction, ttl: 1.55 });
  if (state.wanted === 0) toast('彩弹引起了巡逻队的注意', 2);
  if (state.wantedCooldown < 31) raiseWanted();
  else state.wantedCooldown = 31;
  beep(580, 0.065, 'triangle');
}

function burst(position, amount = 9) {
  if (effects.length > 90) return;
  for (let i = 0; i < amount; i++) {
    const particle = new THREE.Mesh(effectGeometry, effectMaterials[i % effectMaterials.length]);
    particle.position.set(position.x + (Math.random() - 0.5) * 0.8,
      position.y + 0.8, position.z + (Math.random() - 0.5) * 0.8);
    scene.add(particle);
    effects.push({ mesh: particle, velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 5, 2 + Math.random() * 3,
      (Math.random() - 0.5) * 5), remaining: 0.45 + Math.random() * 0.28 });
  }
}

function resetGame() {
  if (state.currentCar) interact();
  state.progress = newProgress();
  state.health = 100;
  state.wanted = 0;
  state.wantedCooldown = 0;
  clearOfficers();
  player.position.set(0, 1.15, 7);
  player.velocity.set(0, 0, 0);
  state.cameraYaw = Math.PI + 0.38;
  closePanels();
  save();
  toast('崭新的城市故事，出发！');
}

function respawn() {
  if (state.currentCar) interact();
  player.position.set(0, 1.2, 7);
  player.velocity.set(0, 0, 0);
  state.health = 100;
  state.progress.cash = Math.max(0, state.progress.cash - 50);
  state.wanted = 0;
  state.wantedCooldown = 0;
  clearOfficers();
  toast('回到了城市广场 · 医疗费 $50', 4);
  save();
}

function moveTraffic(dt) {
  for (const vehicle of world.traffic) {
    if (vehicle.alongX) {
      vehicle.x += vehicle.direction * vehicle.velocity * dt;
      if (Math.abs(vehicle.x) > CITY_LIMIT) vehicle.x = -Math.sign(vehicle.x) * (CITY_LIMIT - 3);
    } else {
      vehicle.z += vehicle.direction * vehicle.velocity * dt;
      if (Math.abs(vehicle.z) > CITY_LIMIT) vehicle.z = -Math.sign(vehicle.z) * (CITY_LIMIT - 3);
    }
    vehicle.mesh.position.set(vehicle.x, 0, vehicle.z);
    for (const wheel of vehicle.mesh.userData.wheels) wheel.rotation.x +=
      vehicle.velocity * vehicle.direction * dt / 0.48;
    vehicle.body.position.set(vehicle.x, 0.9, vehicle.z);
    vehicle.body.velocity.set(0, 0, 0);
  }
  for (const person of world.people) {
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

function movePlayer(dt) {
  const horizontal = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + joystick.x;
  const vertical = Number(keys.has('KeyW')) - Number(keys.has('KeyS')) - joystick.y;
  if (state.currentCar) {
    const car = state.currentCar;
    const throttle = THREE.MathUtils.clamp(vertical, -1, 1);
    const turn = THREE.MathUtils.clamp(horizontal, -1, 1);
    car.steer = turn;
    car.speed += throttle * (throttle > 0 ? 17 : 11) * dt;
    car.speed *= Math.exp(-(keys.has('Space') ? 4.2 : 0.57) * dt);
    car.speed = THREE.MathUtils.clamp(car.speed, -9, 28);
    car.yaw += turn * Math.min(Math.abs(car.speed) / 7, 1) *
      Math.sign(car.speed) * dt * 1.55;
    car.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), car.yaw);
    car.body.velocity.x = Math.sin(car.yaw) * car.speed;
    car.body.velocity.z = Math.cos(car.yaw) * car.speed;
    if (Math.abs(car.body.position.x) > CITY_LIMIT + 9 ||
      Math.abs(car.body.position.z) > CITY_LIMIT + 9) {
      car.body.position.x = THREE.MathUtils.clamp(car.body.position.x, -CITY_LIMIT, CITY_LIMIT);
      car.body.position.z = THREE.MathUtils.clamp(car.body.position.z, -CITY_LIMIT, CITY_LIMIT);
      car.speed = 0;
    }
    return;
  }
  const walk = new THREE.Vector2(horizontal, vertical);
  walk.clampLength(0, 1);
  const pace = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 11 : 6.4;
  const dx = Math.cos(state.cameraYaw) * walk.x - Math.sin(state.cameraYaw) * walk.y;
  const dz = -Math.sin(state.cameraYaw) * walk.x - Math.cos(state.cameraYaw) * walk.y;
  player.velocity.x = dx * pace;
  player.velocity.z = dz * pace;
  if (walk.lengthSq() > 0.01) {
    const facing = Math.atan2(dx, dz);
    const diff = Math.atan2(Math.sin(facing - world.actor.rotation.y),
      Math.cos(facing - world.actor.rotation.y));
    world.actor.rotation.y += diff * Math.min(1, dt * 11);
  }
  player.position.x = THREE.MathUtils.clamp(player.position.x, -CITY_LIMIT, CITY_LIMIT);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -CITY_LIMIT, CITY_LIMIT);
}

function moveOfficers(dt) {
  if (state.wanted > 0) {
    while (officers.length < Math.min(state.wanted, 3)) createOfficer(officers.length);
  } else if (officers.length) clearOfficers();
  const pos = getPosition();
  for (const officer of officers) {
    if (officer.stunned > 0) {
      officer.stunned -= dt;
      officer.body.velocity.x = 0;
      officer.body.velocity.z = 0;
      officer.mesh.rotation.z = 0.6;
      continue;
    }
    officer.mesh.rotation.z = 0;
    const dx = pos.x - officer.body.position.x;
    const dz = pos.z - officer.body.position.z;
    const distance = Math.hypot(dx, dz) || 1;
    officer.body.velocity.x = dx / distance * (4.2 + state.wanted * 0.28);
    officer.body.velocity.z = dz / distance * (4.2 + state.wanted * 0.28);
    officer.mesh.rotation.y = Math.atan2(dx, dz);
    if (distance < (state.currentCar ? 3.2 : 2.1) && state.hurtCooldown <= 0) {
      state.hurtCooldown = 1;
      state.health -= state.currentCar ? 5 : 12;
      beep(190, 0.16, 'sawtooth');
      toast('巡逻队追上来了！', 1.3);
    }
  }
}

function moveProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const shot = projectiles[i];
    shot.ttl -= dt;
    shot.mesh.position.addScaledVector(shot.direction, dt * 43);
    let hit = false;
    for (const officer of officers) {
      if (shot.mesh.position.distanceTo(officer.mesh.position) < 2) {
        officer.stunned = 4;
        burst(shot.mesh.position);
        hit = true;
        break;
      }
    }
    if (!hit) for (const person of world.people) {
      const separation = Math.hypot(shot.mesh.position.x - person.mesh.position.x,
        shot.mesh.position.z - person.mesh.position.z);
      if (separation < 0.9 && shot.mesh.position.y < 2.4) {
        person.stunned = 3;
        raiseWanted();
        burst(shot.mesh.position);
        hit = true;
        break;
      }
    }
    if (shot.ttl <= 0 || hit) {
      scene.remove(shot.mesh);
      shot.mesh.geometry.dispose();
      shot.mesh.material.dispose();
      projectiles.splice(i, 1);
    }
  }
}

function moveEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    effect.remaining -= dt;
    effect.velocity.y -= 10 * dt;
    effect.mesh.position.addScaledVector(effect.velocity, dt);
    effect.mesh.scale.setScalar(Math.max(0.05, Math.min(1, effect.remaining * 2)));
    if (effect.remaining <= 0) {
      scene.remove(effect.mesh);
      effects.splice(i, 1);
    }
  }
}

function syncModels(dt) {
  if (!state.currentCar) {
    world.actor.position.set(player.position.x, player.position.y - 0.94,
      player.position.z);
    const { head, arms, legs, tail } = world.actor.userData.rig;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const movement = Math.min(1, speed / 6);
    const phase = state.elapsed * (speed > 8 ? 13 : 10);
    const stride = Math.sin(phase) * movement;
    for (let i = 0; i < 2; i++) {
      const direction = i === 0 ? -1 : 1;
      legs[i].rotation.x = THREE.MathUtils.damp(legs[i].rotation.x,
        stride * direction * 0.55, 11, dt);
      arms[i].rotation.x = THREE.MathUtils.damp(arms[i].rotation.x,
        -stride * direction * 0.48, 11, dt);
    }
    head.rotation.z = Math.sin(state.elapsed * 1.7) * 0.035;
    head.rotation.x = movement * 0.055;
    tail.rotation.y = Math.sin(state.elapsed * 3.6) * (0.14 + movement * 0.11);
    world.actor.position.y += movement * Math.abs(Math.sin(phase)) * 0.075;
    if (player.position.y < -9) respawn();
  }
  for (const car of world.cars) {
    car.mesh.position.set(car.body.position.x, car.body.position.y - 0.89,
      car.body.position.z);
    car.mesh.rotation.y = car.yaw;
    car.mesh.rotation.z = THREE.MathUtils.damp(car.mesh.rotation.z,
      state.currentCar === car ? -car.steer * Math.min(Math.abs(car.speed), 20) * 0.0025 : 0,
      6, dt);
    for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += car.speed * dt / 0.48;
    car.mesh.userData.brakeLights.emissiveIntensity = state.currentCar === car &&
      keys.has('Space') ? 1.6 : 0.34;
  }
  for (const officer of officers) officer.mesh.position.set(officer.body.position.x,
    officer.body.position.y - 0.78, officer.body.position.z);
  if (state.currentCar) {
    const car = state.currentCar;
    if (Math.abs(car.body.velocity.x) + Math.abs(car.body.velocity.z) < 0.1 &&
      car.speed > 8) car.speed *= Math.exp(-dt * 3);
  }
}

function moveCamera(dt) {
  const pos = getPosition();
  if (state.currentCar && state.elapsed - state.mouseMovedAt > 1.5) {
    const desired = state.currentCar.yaw + Math.PI;
    const diff = Math.atan2(Math.sin(desired - state.cameraYaw),
      Math.cos(desired - state.cameraYaw));
    state.cameraYaw += diff * Math.min(1, dt * 2.5);
  }
  const distance = state.cameraDistance * (state.currentCar ? 1.4 : 1);
  const height = state.currentCar ? 5.1 : 3.85;
  const targetY = state.currentCar ? 1.5 : 1.95;
  const desiredCamera = new THREE.Vector3(pos.x + Math.sin(state.cameraYaw) * distance,
    pos.y + height, pos.z + Math.cos(state.cameraYaw) * distance);
  desiredCamera.x = THREE.MathUtils.clamp(desiredCamera.x, -CITY_LIMIT - 40, CITY_LIMIT + 40);
  desiredCamera.z = THREE.MathUtils.clamp(desiredCamera.z, -CITY_LIMIT - 55, CITY_LIMIT + 40);
  const viewTarget = new THREE.Vector3(pos.x, targetY + (pos.y - 0.9), pos.z);
  const ray = new CANNON.RaycastResult();
  physics.raycastClosest(new CANNON.Vec3(viewTarget.x, viewTarget.y, viewTarget.z),
    new CANNON.Vec3(desiredCamera.x, desiredCamera.y, desiredCamera.z),
    { skipBackfaces: true }, ray);
  if (ray.hasHit && ray.body.type === CANNON.Body.STATIC &&
      ray.body.shapes[0] instanceof CANNON.Box) {
    const direction = desiredCamera.clone().sub(viewTarget).normalize();
    desiredCamera.set(ray.hitPointWorld.x, ray.hitPointWorld.y, ray.hitPointWorld.z)
      .addScaledVector(direction, -0.65);
  }
  state.cameraShake *= Math.exp(-dt * 9);
  desiredCamera.x += Math.sin(state.elapsed * 83) * state.cameraShake;
  desiredCamera.y += Math.sin(state.elapsed * 61) * state.cameraShake * 0.58;
  cameraPosition.lerp(desiredCamera, Math.min(1, dt * 9));
  cameraLook.lerp(viewTarget, Math.min(1, dt * 10));
  camera.position.copy(cameraPosition);
  camera.lookAt(cameraLook);
  const wantedFov = state.currentCar ? 65 + Math.min(Math.abs(state.currentCar.speed), 27) * 0.28 : 65;
  camera.fov = THREE.MathUtils.damp(camera.fov, wantedFov, 3, dt);
  camera.updateProjectionMatrix();
  sun.position.set(pos.x - 110, 112, pos.z + 75);
  sun.target.position.set(pos.x, 0, pos.z);
  sun.target.updateMatrixWorld();
  atmosphere.update(camera.position, state.elapsed);
}

function updateWorld(dt) {
  state.elapsed += dt;
  state.shotCooldown = Math.max(0, state.shotCooldown - dt);
  state.crashCooldown = Math.max(0, state.crashCooldown - dt);
  state.hurtCooldown = Math.max(0, state.hurtCooldown - dt);
  moveTraffic(dt);
  movePlayer(dt);
  moveOfficers(dt);
  physics.step(1 / 60, dt, 6);
  syncModels(dt);
  moveProjectiles(dt);
  moveEffects(dt);
  const pos = getPosition();
  const event = advanceMission(state.progress, pos.x, pos.z, dt);
  if (event) {
    toast(event.text, 4);
    beep(event.type === 'late' ? 200 : 690, 0.26);
    save();
  }
  if (state.wanted) {
    state.wantedCooldown -= dt;
    if (state.wantedCooldown <= 0) {
      state.wanted--;
      state.wantedCooldown = state.wanted ? 22 : 0;
      if (!state.wanted) toast('巡逻队已经离开');
    }
  }
  if (state.health <= 0) respawn();
  if (state.elapsed > state.toastUntil) $('toast').classList.add('hidden');
  const target = currentStage(state.progress);
  route.visible = Boolean(target);
  if (target) {
    route.position.set(target.x, 0, target.z);
    routeGem.rotation.y += dt;
    routeGem.position.y = 7.6 + Math.sin(state.elapsed * 2.8) * 0.48;
    routeRing.scale.setScalar(1 + Math.sin(state.elapsed * 3.6) * 0.08);
  }
  moveCamera(dt);
  if (audio.context) {
    audio.engine.frequency.setTargetAtTime(63 + Math.abs(state.currentCar?.speed || 0) * 8,
      audio.context.currentTime, 0.12);
    audio.engineGain.gain.setTargetAtTime(state.currentCar ? audio.volume * 0.012 : 0,
      audio.context.currentTime, 0.1);
  }
  if (state.elapsed >= state.nextSave) {
    state.nextSave = state.elapsed + 4;
    save();
  }
}

for (const car of world.cars) {
  car.body.addEventListener('collide', (event) => {
    if (state.currentCar !== car || state.crashCooldown > 0 || car.speed < 9 ||
      event.body.shapes.some((shape) => shape instanceof CANNON.Plane)) return;
    state.crashCooldown = 0.9;
    state.health = Math.max(0, state.health - Math.min(18, Math.round(car.speed * 0.48)));
    car.speed *= 0.48;
    raiseWanted();
    beep(130, 0.24, 'sawtooth');
    toast('发生碰撞，巡逻队正在赶来');
  });
}

function drawMap(canvas, expanded = false) {
  const context = canvas.getContext('2d');
  const size = canvas.width;
  const pos = getPosition();
  const scale = expanded ? size / 650 : size / 235;
  context.clearRect(0, 0, size, size);
  context.fillStyle = '#9fbda7';
  context.fillRect(0, 0, size, size);
  context.save();
  context.translate(size / 2 - pos.x * scale * (expanded ? 0 : 1),
    size / 2 - pos.z * scale * (expanded ? 0 : 1));
  context.scale(scale, scale);
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
  const target = currentStage(state.progress);
  if (target) {
    context.beginPath();
    context.setLineDash([4, 4]);
    context.strokeStyle = '#ffe2a2';
    context.lineWidth = 1.9;
    context.moveTo(pos.x, pos.z);
    context.lineTo(target.x, target.z);
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(target.x, target.z, 5, 0, Math.PI * 2);
    context.fillStyle = '#e78873';
    context.fill();
    context.lineWidth = 1.3;
    context.strokeStyle = '#fff7e4';
    context.stroke();
  }
  context.beginPath();
  context.arc(GARAGE.x, GARAGE.z, 4.8, 0, Math.PI * 2);
  context.fillStyle = '#91d7c1';
  context.fill();
  context.translate(pos.x, pos.z);
  context.rotate(state.currentCar?.yaw ?? world.actor.rotation.y);
  context.beginPath();
  context.moveTo(0, 7.5);
  context.lineTo(-5.2, -5.8);
  context.lineTo(5.2, -5.8);
  context.closePath();
  context.fillStyle = '#ffdf6c';
  context.fill();
  context.lineWidth = 1.8;
  context.strokeStyle = '#293e43';
  context.stroke();
  context.restore();
}

function updateUI() {
  const pos = getPosition();
  const target = currentStage(state.progress);
  $('mission-index').textContent = target ?
    `0${target.job + 1} / 0${STAGES.length / 2}` : '完成';
  $('mission-title').textContent = target?.title ?? '自由漫游';
  $('mission-description').textContent = target?.description ?? '探索街区，驾驶车辆，感受城市生活';
  $('mission-distance').textContent = target ?
    `目的地 ${Math.round(targetDistance(state.progress, pos.x, pos.z))} m` : '全部委托已完成';
  $('mission-timer').textContent = target?.type === 'delivery' ?
    `${Math.ceil(state.progress.remaining)} s` : '';
  $('money').textContent = `$ ${String(state.progress.cash).padStart(4, '0')}`;
  $('wanted').textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
  $('health-fill').style.width = `${Math.max(0, state.health)}%`;
  $('health-value').textContent = String(Math.round(state.health));
  $('district').textContent = `${pos.z < -205 ? '海滨区' :
    Math.abs(pos.x) > 185 ? '外环区' : '中心区'} · 日间`;
  $('street-name').textContent = pos.z < -205 ? '海风海岸' :
    Math.abs(pos.x) > 185 ? '橘光路' :
      pos.z > 120 ? '绿荫街' : '晴日大道';
  const nearest = nearestCar();
  const label = state.currentCar ? '离开车辆' : nearest ? '进入车辆' :
    atGarage() ? '修理与恢复' : '';
  $('interaction').classList.toggle('hidden', !label);
  $('interaction-label').textContent = label;
  $('vehicle-info').classList.toggle('hidden', !state.currentCar);
  if (state.currentCar) {
    $('speed').textContent = String(Math.round(Math.abs(state.currentCar.speed) * 3.6)).padStart(2, '0');
    $('vehicle-name').textContent = state.currentCar.name;
  }
  drawMap($('minimap'));
  if (state.mapOpen) drawMap($('large-map'), true);
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
  state.paused = opening;
  $('pause-screen').classList.toggle('hidden', !opening);
  $('pause-progress').textContent = state.progress.stage >= STAGES.length ?
    '全部城市委托已经完成。' : `已完成 ${Math.floor(state.progress.stage / 2)} / 2 个城市委托。`;
  if (opening && document.pointerLockElement) document.exitPointerLock();
  keys.clear();
}

function toggleMap() {
  const opening = !state.mapOpen;
  closePanels();
  state.mapOpen = opening;
  $('full-map').classList.toggle('hidden', !opening);
  if (opening) drawMap($('large-map'), true);
  if (opening && document.pointerLockElement) document.exitPointerLock();
  keys.clear();
}

function updateQuality() {
  const option = $('quality').value;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,
    option === 'high' ? 1.5 : option === 'medium' ? 1.0 : 0.65));
  renderer.shadowMap.enabled = option !== 'low';
  resize();
  saveSettings();
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function setupControls() {
  createIcons({ icons: { ArrowUp, CarFront, Crosshair, Map, Pause, Play, RotateCcw, X } });
  $('pause-toggle').addEventListener('click', togglePause);
  $('resume').addEventListener('click', togglePause);
  $('restart').addEventListener('click', resetGame);
  $('map-toggle').addEventListener('click', toggleMap);
  $('map-close').addEventListener('click', toggleMap);
  $('volume').addEventListener('input', (event) => {
    audio.volume = Number(event.target.value) / 100;
    saveSettings();
  });
  $('quality').addEventListener('change', updateQuality);
  window.addEventListener('resize', resize);
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('beforeunload', save);
  window.addEventListener('keydown', (event) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code))
      event.preventDefault();
    if (event.code === 'Escape') {
      if (state.mapOpen) toggleMap();
      else togglePause();
      return;
    }
    if (event.code === 'KeyM') { toggleMap(); return; }
    if (state.paused || state.mapOpen) return;
    startAudio();
    if (event.code === 'KeyE' && !event.repeat) interact();
    if (event.code === 'KeyG' && !event.repeat) repair();
    if (event.code === 'Space' && !event.repeat && !state.currentCar &&
        player.position.y < 1.13) player.velocity.y = 9;
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || state.paused || state.mapOpen) return;
    if (event.button === 0) shoot();
    if (!document.pointerLockElement) canvas.requestPointerLock?.();
  });
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === canvas && !state.paused && !state.mapOpen) {
      state.cameraYaw -= event.movementX * 0.0028;
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
    event.preventDefault(); shoot();
  });
  $('touch-jump').addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startAudio();
    if (state.currentCar) {
      keys.add('Space');
      setTimeout(() => keys.delete('Space'), 350);
    } else if (player.position.y < 1.13) player.velocity.y = 9;
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
renderer.render(scene, camera);
$('loading').classList.add('hidden');
$('interface').classList.remove('hidden');
document.documentElement.dataset.gameReady = 'true';

let lastFrame = performance.now();
let uiAt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  state.frames++;
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!state.paused && !state.mapOpen) updateWorld(dt);
  renderer.render(scene, camera);
  if (now - uiAt > 130) { updateUI(); uiAt = now; }
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  window.__NAILONG_DEBUG__ = {
    snapshot: () => ({ x: getPosition().x, z: getPosition().z,
      stage: state.progress.stage, cash: state.progress.cash, wanted: state.wanted,
      health: state.health, car: Boolean(state.currentCar), pedestrians: world.people.length,
      stride: Math.abs(world.actor.userData.rig.legs[0].rotation.x) +
        Math.abs(world.actor.userData.rig.legs[1].rotation.x),
      wheelAngle: state.currentCar?.mesh.userData.wheels[0].rotation.x ?? null,
      pressed: [...keys] }),
    teleport: (x, z) => {
      if (state.currentCar) interact();
      player.position.set(x, 1.2, z);
      player.velocity.set(0, 0, 0);
    },
    setWanted: (level) => { state.wanted = level; state.wantedCooldown = 35; },
  };
}
