import * as THREE from 'three';

const DAY_LENGTH = 720;
const COLORS = {
  dayHorizon: new THREE.Color('#c3d3dc'),
  dayZenith: new THREE.Color('#2c6aa2'),
  nightHorizon: new THREE.Color('#4a6280'),
  nightZenith: new THREE.Color('#04070e'),
  sunset: new THREE.Color('#ff8348'),
  dayFog: new THREE.Color('#c6d5db'),
  nightFog: new THREE.Color('#1a2433'),
  sunsetFog: new THREE.Color('#cf9268'),
  daySun: new THREE.Color('#ffeac6'),
  sunsetSun: new THREE.Color('#ff8f4e'),
  nightSun: new THREE.Color('#7b8fbd'),
};

export function createDayNight({ scene, sun, hemisphere, fog, atmosphere, lamps,
  windowMaterials, shopLamps = [], lightPools = [], glows = [], startHour = 8.6 }) {
  let hours = startHour;
  const mixColor = new THREE.Color();
  const sunColor = new THREE.Color();

  function update(dt, playerPosition, cameraPosition = playerPosition) {
    hours = (hours + dt / DAY_LENGTH * 24) % 24;
    const angle = (hours - 6) / 24 * Math.PI * 2;
    const height = Math.sin(angle);
    const day = THREE.MathUtils.clamp((height + 0.26) / 0.56, 0, 1);
    const sunset = Math.max(0, 1 - Math.abs(height) * 2.8) * (1 - Math.max(0, -height) * 1.2);
    const night = 1 - day;

    sun.position.set(playerPosition.x + Math.cos(angle) * 140,
      Math.max(18 + night * 70, height * 150), playerPosition.z + Math.sin(angle) * 100);
    sun.target.position.set(playerPosition.x, 0, playerPosition.z);
    sun.target.updateMatrixWorld();
    sun.intensity = 1.6 + day * 1.8;
    sunColor.copy(COLORS.nightSun).lerp(COLORS.daySun, day);
    if (sunset > 0.05) sunColor.lerp(COLORS.sunsetSun, Math.min(1, sunset * 0.9));
    sun.color.copy(sunColor);

    hemisphere.intensity = 3.4 - day * 2.38;
    hemisphere.color.copy(COLORS.nightHorizon).lerp(COLORS.dayHorizon, day);
    hemisphere.groundColor.setRGB(0.05 + day * 0.24, 0.055 + day * 0.23,
      0.06 + day * 0.19);

    mixColor.copy(COLORS.nightFog).lerp(COLORS.dayFog, day);
    if (sunset > 0.04) mixColor.lerp(COLORS.sunsetFog, Math.min(1, sunset * 0.55));
    fog.color.copy(mixColor);
    scene.background.copy(mixColor);
    fog.near = 120 - night * 40;
    fog.far = 620 - night * 230;
    scene.environmentIntensity = 0.2 + day * 0.36;

    const lampGlow = night * 3.0;
    for (const lamp of lamps) lamp.material.emissiveIntensity = 0.08 + lampGlow;
    for (const material of lightPools) material.opacity = night * 0.42;
    for (const material of glows) material.opacity = night * 0.72;
    for (const material of windowMaterials) {
      material.emissiveIntensity = 0.05 + night * 1.0;
    }
    for (const lamp of shopLamps) lamp.emissiveIntensity = 0.1 + night * 2.6;
    atmosphere.update(cameraPosition, hours, day, sunset);
    return { hours, day, sunset, night };
  }

  return {
    update,
    get hours() { return hours; },
    set hours(value) { hours = ((value % 24) + 24) % 24; },
    get isNight() { return hours < 6 || hours > 19.4; },
    clockText() {
      const minute = Math.floor((hours % 1) * 60);
      return `${String(Math.floor(hours)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    },
  };
}

export { DAY_LENGTH };
