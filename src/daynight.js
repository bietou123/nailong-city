import * as THREE from 'three';

const DAY_LENGTH = 480;
const COLORS = {
  dayHorizon: new THREE.Color('#6ea8bd'),
  dayZenith: new THREE.Color('#1f5a8f'),
  nightHorizon: new THREE.Color('#101d30'),
  nightZenith: new THREE.Color('#050a16'),
  sunset: new THREE.Color('#e08a5f'),
  dayFog: new THREE.Color('#b3cdd3'),
  nightFog: new THREE.Color('#142135'),
  sunsetFog: new THREE.Color('#b98a72'),
  daySun: new THREE.Color('#f8e4c3'),
  sunsetSun: new THREE.Color('#ff9a5f'),
  nightSun: new THREE.Color('#6f86b8'),
};

export function createDayNight({ scene, sun, hemisphere, fog, atmosphere, lamps,
  windowMaterials, shopLamps = [], lightPools = [], startHour = 8.6 }) {
  let hours = startHour;
  const mixColor = new THREE.Color();
  const sunColor = new THREE.Color();

  function update(dt, playerPosition, cameraPosition = playerPosition) {
    hours = (hours + dt / DAY_LENGTH * 24) % 24;
    const angle = (hours - 6) / 24 * Math.PI * 2;
    const height = Math.sin(angle);
    const day = THREE.MathUtils.clamp((height + 0.16) / 0.5, 0, 1);
    const sunset = Math.max(0, 1 - Math.abs(height) * 4.2) * (1 - Math.max(0, -height) * 1.2);
    const night = 1 - day;

    sun.position.set(playerPosition.x + Math.cos(angle) * 140,
      Math.max(18, height * 150), playerPosition.z + Math.sin(angle) * 100);
    sun.target.position.set(playerPosition.x, 0, playerPosition.z);
    sun.target.updateMatrixWorld();
    sun.intensity = 0.34 + day * 2.32;
    sunColor.copy(COLORS.nightSun).lerp(COLORS.daySun, day);
    if (sunset > 0.05) sunColor.lerp(COLORS.sunsetSun, Math.min(1, sunset * 0.9));
    sun.color.copy(sunColor);

    hemisphere.intensity = 0.46 + day * 1.12;
    hemisphere.color.copy(COLORS.nightHorizon).lerp(COLORS.dayHorizon, day);
    hemisphere.groundColor.setRGB(0.085 + day * 0.47, 0.10 + day * 0.5,
      0.12 + day * 0.4);

    mixColor.copy(COLORS.nightFog).lerp(COLORS.dayFog, day);
    if (sunset > 0.04) mixColor.lerp(COLORS.sunsetFog, Math.min(1, sunset * 0.55));
    fog.color.copy(mixColor);
    scene.background.copy(mixColor);
    fog.near = 120 - night * 60;
    fog.far = 700 - night * 260;

    const lampGlow = night * 2.6;
    for (const lamp of lamps) lamp.material.emissiveIntensity = 0.08 + lampGlow;
    for (const material of lightPools) material.opacity = night * 0.3;
    for (const material of windowMaterials) {
      material.emissiveIntensity = 0.05 + night * 0.72;
    }
    for (const lamp of shopLamps) lamp.emissiveIntensity = 0.1 + night * 2.3;
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
