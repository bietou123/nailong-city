import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CITY_LIMIT, ROAD_STEP } from './world.js';

const uniform = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.78 });
const skin = uniform('#e0ae8c');
const navy = uniform('#38566f');
const navyDark = uniform('#1f2f3d');
const badge = new THREE.MeshStandardMaterial({ color: '#f3d06a', roughness: 0.35,
  metalness: 0.6 });
const gunMetal = uniform('#2b363c');
const coneOrange = uniform('#ef8f4e');

function part(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildOfficer() {
  const group = new THREE.Group();
  const torso = part(group, new THREE.BoxGeometry(0.78, 1.08, 0.46), navy, 0, 1.32, 0);
  part(group, new THREE.SphereGeometry(0.27, 12, 9), skin, 0, 2.1, 0);
  const cap = part(group, new THREE.CylinderGeometry(0.31, 0.29, 0.18, 12), navyDark,
    0, 2.34, 0);
  cap.scale.z = 1.1;
  part(group, new THREE.BoxGeometry(0.16, 0.1, 0.04), badge, 0.17, 1.62, 0.24);
  part(group, new THREE.BoxGeometry(0.55, 0.22, 0.4), navyDark, 0, 0.9, 0);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = part(group, new THREE.BoxGeometry(0.2, 0.78, 0.24), navy,
      side * 0.5, 1.32, 0);
    arm.geometry.translate(0, -0.28, 0);
    arms.push(arm);
  }
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = part(group, new THREE.BoxGeometry(0.24, 0.86, 0.26), navyDark,
      side * 0.18, 0.46, 0);
    leg.geometry.translate(0, -0.15, 0);
    legs.push(leg);
  }
  const pistol = part(group, new THREE.BoxGeometry(0.09, 0.26, 0.09), gunMetal,
    0.52, 1.12, 0.26);
  pistol.rotation.x = -0.35;
  group.userData.rig = { arms, legs, torso };
  return group;
}

function buildBarricadeMeshes() {
  const group = new THREE.Group();
  for (let index = 0; index < 4; index++) {
    const cone = part(group, new THREE.ConeGeometry(0.28, 0.72, 9), coneOrange,
      (index % 2 ? 1 : -1) * (1.8 + index * 0.55), 0.36, (index % 2 ? 1 : -1) * 0.4);
    cone.castShadow = true;
  }
  const sign = part(group, new THREE.BoxGeometry(0.3, 1.0, 0.18), navyDark, 0, 0.5, 0);
  part(group, new THREE.BoxGeometry(1.9, 0.14, 0.2), badge, 0, 1.05, 0);
  const lampMaterial = new THREE.MeshStandardMaterial({ color: '#ff6a58',
    emissive: '#ff5b48', emissiveIntensity: 1.6 });
  part(group, new THREE.SphereGeometry(0.16, 8, 6), lampMaterial, 0.85, 1.16, 0);
  return group;
}

export function createPolice(scene, physics, { makeCar, onDamage }) {
  const foot = [];
  const cruisers = [];
  const barricades = [];
  const tracers = [];
  const tracerMaterial = new THREE.MeshBasicMaterial({ color: '#ffe9a6' });
  const tracerGeometry = new THREE.CylinderGeometry(0.035, 0.035, 1, 5);
  let spawnTimer = 0;
  let barricadeTimer = 6;
  let wantedSeen = 0;
  let noiseTimer = 0;

  function farPoint(px, pz, distance, angleSeed) {
    const angle = angleSeed;
    let x = px + Math.sin(angle) * distance;
    let z = pz + Math.cos(angle) * distance;
    const roadX = Math.round(x / ROAD_STEP) * ROAD_STEP;
    const roadZ = Math.round(z / ROAD_STEP) * ROAD_STEP;
    if (Math.abs(x - roadX) < 18) x = roadX + 4.2;
    else if (Math.abs(z - roadZ) < 18) z = roadZ + 4.2;
    return {
      x: THREE.MathUtils.clamp(x, -CITY_LIMIT + 4, CITY_LIMIT - 4),
      z: THREE.MathUtils.clamp(z, -CITY_LIMIT + 4, CITY_LIMIT - 4),
    };
  }

  function spawnOfficer(x, z) {
    const body = new CANNON.Body({ mass: 62, shape: new CANNON.Sphere(0.72),
      linearDamping: 0.8 });
    body.fixedRotation = true;
    body.position.set(x, 0.9, z);
    physics.addBody(body);
    const mesh = buildOfficer();
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const unit = { kind: 'foot', body, mesh, health: 100, maxHealth: 100,
      attackAt: 0, stun: 0, phase: Math.random() * 6, walk: 0 };
    foot.push(unit);
    return unit;
  }

  function spawnCruiser(px, pz, angle) {
    const point = farPoint(px, pz, 42 + Math.random() * 22, angle);
    const yaw = Math.atan2(px - point.x, pz - point.z);
    const mesh = makeCar(scene, '#f2f0e6', point.x, point.z, yaw, 'police');
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC,
      shape: new CANNON.Box(new CANNON.Vec3(1.3, 1.0, 2.4)) });
    body.position.set(point.x, 0.9, point.z);
    physics.addBody(body);
    const lights = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: '#ff5d5a', emissive: '#ff4d4a',
      emissiveIntensity: 1.4 });
    const blue = new THREE.MeshStandardMaterial({ color: '#5aa8ff', emissive: '#4c9bff',
      emissiveIntensity: 0.4 });
    const lightGeometry = new THREE.BoxGeometry(0.46, 0.16, 0.3);
    const redMesh = new THREE.Mesh(lightGeometry, red);
    redMesh.position.x = -0.26;
    const blueMesh = new THREE.Mesh(lightGeometry, blue);
    blueMesh.position.x = 0.26;
    lights.add(redMesh, blueMesh);
    lights.position.y = 2.12;
    mesh.add(lights);
    const unit = { kind: 'car', mesh, body, yaw, speed: 0, health: 240, maxHealth: 240,
      fireAt: 0, stun: 0, lights: { red, blue }, phase: Math.random() * 6 };
    cruisers.push(unit);
    return unit;
  }

  function spawnBarricade(px, pz, angle) {
    const point = farPoint(px, pz, 46 + Math.random() * 16, angle);
    const yaw = Math.atan2(px - point.x, pz - point.z);
    const group = buildBarricadeMeshes();
    group.position.set(point.x, 0, point.z);
    group.rotation.y = yaw;
    scene.add(group);
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(
      new CANNON.Vec3(3.1, 0.8, 0.6)) });
    body.position.set(point.x, 0.8, point.z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
    physics.addBody(body);
    barricades.push({ mesh: group, body });
  }

  function clear() {
    for (const unit of foot) { physics.removeBody(unit.body); scene.remove(unit.mesh); }
    for (const unit of cruisers) { physics.removeBody(unit.body); scene.remove(unit.mesh); }
    for (const block of barricades) { physics.removeBody(block.body); scene.remove(block.mesh); }
    for (const tracer of tracers) scene.remove(tracer.mesh);
    foot.length = 0;
    cruisers.length = 0;
    barricades.length = 0;
    tracers.length = 0;
    spawnTimer = 0;
    barricadeTimer = 6;
  }

  function damage(unit, amount) {
    unit.health -= amount;
    if (unit.health <= 0) {
      if (unit.kind === 'foot') {
        physics.removeBody(unit.body);
        const index = foot.indexOf(unit);
        if (index >= 0) foot.splice(index, 1);
        scene.remove(unit.mesh);
      } else {
        unit.burning = true;
        unit.burnTimer = 2.6;
      }
      return true;
    }
    unit.stun = unit.kind === 'foot' ? 0.35 : 0;
    return false;
  }

  function units() {
    return [...foot, ...cruisers.filter((cruiser) => !cruiser.burning)];
  }

  function nearby(px, pz, radius = 8) {
    for (const unit of units()) {
      const p = unit.body.position;
      if (Math.hypot(p.x - px, p.z - pz) < radius) return true;
    }
    return false;
  }

  function fireTracer(from, to, level, dt) {
    const tracer = new THREE.Mesh(tracerGeometry, tracerMaterial);
    tracer.position.copy(from);
    tracer.lookAt(to);
    tracer.rotateX(Math.PI / 2);
    tracer.scale.y = from.distanceTo(to);
    scene.add(tracer);
    tracers.push({ mesh: tracer, ttl: 0.09 });
    const distance = from.distanceTo(to);
    const chance = THREE.MathUtils.clamp(0.62 - distance / 130, 0.16, 0.6);
    if (Math.random() < chance) {
      onDamage(4 + level * 1.6, 'police');
    }
    noiseTimer = 0.12;
  }

  function update(dt, ctx) {
    const { px, pz, inVehicle, wanted, now } = ctx;
    if (wanted <= 0) {
      if (wantedSeen > 0) clear();
      wantedSeen = 0;
      return;
    }
    wantedSeen = wanted;
    spawnTimer -= dt;
    barricadeTimer -= dt;
    const wantedFoot = Math.min(6, wanted * 2);
    const wantedCruisers = wanted >= 2 ? Math.min(4, wanted - 1) : 0;
    if (spawnTimer <= 0) {
      spawnTimer = Math.max(1.6, 5.2 - wanted * 0.7);
      if (foot.length < wantedFoot) {
        const angle = now * 1.7 + foot.length * 2.1;
        const point = farPoint(px, pz, 34 + Math.random() * 14, angle);
        spawnOfficer(point.x, point.z);
      }
      if (cruisers.filter((cruiser) => !cruiser.burning).length < wantedCruisers) {
        spawnCruiser(px, pz, now * 1.3 + cruisers.length * 2.4);
      }
    }
    if (wanted >= 4 && barricadeTimer <= 0 && barricades.length < 2) {
      barricadeTimer = 22;
      spawnBarricade(px, pz, now * 0.7 + 1.2);
    }

    for (const unit of foot) {
      const position = unit.body.position;
      const dx = px - position.x;
      const dz = pz - position.z;
      const distance = Math.hypot(dx, dz) || 1;
      if (distance > 150) {
        position.set(px - Math.sin(unit.phase) * 30, 0.9, pz - Math.cos(unit.phase) * 30);
        continue;
      }
      if (unit.stun > 0) {
        unit.stun -= dt;
        unit.body.velocity.x = 0;
        unit.body.velocity.z = 0;
        unit.mesh.rotation.z = 0.55;
        continue;
      }
      unit.mesh.rotation.z = 0;
      const speed = 4.1 + wanted * 0.42;
      unit.body.velocity.x = dx / distance * speed;
      unit.body.velocity.z = dz / distance * speed;
      unit.mesh.rotation.y = Math.atan2(dx, dz);
      const moving = distance > 2.2;
      unit.walk += dt * (moving ? speed * 2.3 : 0);
      const swing = Math.sin(unit.walk) * 0.6;
      const rig = unit.mesh.userData.rig;
      rig.arms[0].rotation.x = -swing * 0.6;
      rig.arms[1].rotation.x = swing * 0.6;
      unit.mesh.position.set(position.x, position.y - 0.9 +
        Math.abs(Math.sin(unit.walk)) * 0.05, position.z);
      if (distance < (inVehicle ? 3.4 : 2.3) && now > unit.attackAt) {
        unit.attackAt = now + 1.05;
        onDamage(inVehicle ? 4 : 10, 'police');
      }
      if (wanted >= 3 && distance > 12 && distance < 62 && now > unit.fireAt) {
        unit.fireAt = now + 1.35 + Math.random() * 0.7;
        const from = new THREE.Vector3(position.x, 1.7, position.z);
        const to = new THREE.Vector3(px + (Math.random() - 0.5) * 1.4,
          1.2 + Math.random(), pz + (Math.random() - 0.5) * 1.4);
        fireTracer(from, to, wanted, dt);
      }
    }

    for (const unit of cruisers) {
      const position = unit.body.position;
      if (unit.burning) {
        unit.burnTimer -= dt;
        if (unit.burnTimer <= 0) {
          scene.remove(unit.mesh);
          physics.removeBody(unit.body);
          const index = cruisers.indexOf(unit);
          if (index >= 0) cruisers.splice(index, 1);
        }
        continue;
      }
      const dx = px - position.x;
      const dz = pz - position.z;
      const distance = Math.hypot(dx, dz) || 1;
      const targetYaw = Math.atan2(dx, dz);
      const desiredSpeed = distance > 26 ? 21 + wanted * 1.4 :
        distance > 11 ? 11 : Math.max(0, (distance - 7) * 2.2);
      unit.speed += (desiredSpeed - unit.speed) * Math.min(1, dt * 1.6);
      const diff = Math.atan2(Math.sin(targetYaw - unit.yaw), Math.cos(targetYaw - unit.yaw));
      unit.yaw += THREE.MathUtils.clamp(diff, -1, 1) * Math.min(1, dt * 1.9);
      position.x += Math.sin(unit.yaw) * unit.speed * dt;
      position.z += Math.cos(unit.yaw) * unit.speed * dt;
      position.x = THREE.MathUtils.clamp(position.x, -CITY_LIMIT, CITY_LIMIT);
      position.z = THREE.MathUtils.clamp(position.z, -CITY_LIMIT, CITY_LIMIT);
      unit.body.velocity.set(0, 0, 0);
      unit.mesh.position.set(position.x, position.y - 0.89, position.z);
      unit.mesh.rotation.y = unit.yaw;
      const forWheel = unit.mesh.userData.wheels;
      for (const wheel of forWheel) wheel.rotation.x += unit.speed * dt / 0.48;
      unit.mesh.rotation.z = THREE.MathUtils.damp(unit.mesh.rotation.z,
        -THREE.MathUtils.clamp(diff, -1, 1) * 0.06, 5, dt);
      const blink = Math.sin(now * 9 + unit.phase) > 0;
      unit.lights.red.emissiveIntensity = blink ? 2.6 : 0.2;
      unit.lights.blue.emissiveIntensity = blink ? 0.2 : 2.6;
      if (distance < 4.2 && inVehicle && now > unit.fireAt) {
        unit.fireAt = now + 1.2;
        onDamage(7, 'car');
      }
      if (wanted >= 2 && distance < 17 && distance > 4 && now > unit.fireAt) {
        unit.fireAt = now + 1.5 + Math.random() * 0.8;
        const from = new THREE.Vector3(position.x, 1.6, position.z);
        const to = new THREE.Vector3(px + (Math.random() - 0.5) * 1.2, 1.25, pz);
        fireTracer(from, to, wanted, dt);
      }
    }

    for (let index = tracers.length - 1; index >= 0; index--) {
      const tracer = tracers[index];
      tracer.ttl -= dt;
      if (tracer.ttl <= 0) { scene.remove(tracer.mesh); tracers.splice(index, 1); }
      else tracer.mesh.material.opacity = 1;
    }
    noiseTimer = Math.max(0, noiseTimer - dt);
  }

  function count() {
    return { foot: foot.length,
      cruisers: cruisers.filter((cruiser) => !cruiser.burning).length,
      barricades: barricades.length };
  }

  return { update, clear, damage, units, nearby, count, spawnOfficer };
}
