import * as THREE from 'three';

export function createAtmosphere(scene) {
  const uniforms = {
    uDay: { value: 1 },
    uSunset: { value: 0 },
    uSunDir: { value: new THREE.Vector3(-0.55, 0.48, 0.76).normalize() },
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(820, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uDay;
        uniform float uSunset;
        uniform vec3 uSunDir;
        varying vec3 vDirection;
        void main() {
          vec3 direction = normalize(vDirection);
          float altitude = pow(clamp((direction.y + 0.08) / 0.7, 0.0, 1.0), 0.75);
          vec3 horizon = mix(vec3(0.028, 0.045, 0.075), vec3(0.44, 0.56, 0.64), uDay);
          horizon = mix(horizon, vec3(0.95, 0.44, 0.22), uSunset * 0.85);
          vec3 zenith = mix(vec3(0.008, 0.014, 0.035), vec3(0.045, 0.19, 0.43), uDay);
          zenith = mix(zenith, vec3(0.36, 0.19, 0.22), uSunset * 0.35);
          vec3 color = mix(horizon, zenith, altitude);
          float facingSun = max(dot(direction, normalize(uSunDir)), 0.0);
          float haze = exp(-max(direction.y, 0.0) * 7.0);
          color += vec3(0.13, 0.115, 0.095) * haze * uDay;
          color += vec3(0.42, 0.28, 0.16) * pow(facingSun, 5.0) * uDay * 0.7;
          color += vec3(1.0, 0.76, 0.48) * pow(facingSun, 380.0) * uDay * 1.4;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }));
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);

  const starPositions = [];
  for (let index = 0; index < 900; index++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.85 + 0.12);
    const radius = 780;
    starPositions.push(
      Math.sin(phi) * Math.cos(theta) * radius,
      Math.cos(phi) * radius,
      Math.sin(phi) * Math.sin(theta) * radius);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position',
    new THREE.Float32BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: '#dce7ff', size: 2.1,
    sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false,
    fog: false });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  scene.add(stars);

  const clouds = [];
  const cloudMaterial = new THREE.MeshBasicMaterial({ color: '#e8e7e1', transparent: true,
    opacity: 0.5, depthWrite: false, fog: false });
  const cloudTint = new THREE.Color('#ffb27a');
  const cloudGeometry = new THREE.SphereGeometry(1, 12, 7);
  for (let index = 0; index < 14; index++) {
    const group = new THREE.Group();
    const angle = index * 2.4;
    const distance = 310 + (index % 3) * 55;
    group.position.set(Math.sin(angle) * distance, 95 + (index % 4) * 17,
      Math.cos(angle) * distance);
    for (const [x, y, z, width] of [[0, 0, 0, 19], [-13, -3, 0, 13],
      [15, -2, 0, 15], [4, 7, -2, 11]]) {
      const puff = new THREE.Mesh(cloudGeometry, cloudMaterial);
      puff.position.set(x, y, z);
      puff.scale.set(width, width * 0.23, width * 0.47);
      group.add(puff);
    }
    scene.add(group);
    clouds.push(group);
  }

  return {
    update(cameraPosition, hours = 10, day = 1, sunset = 0) {
      dome.position.copy(cameraPosition);
      stars.position.copy(cameraPosition);
      const angle = (hours - 6) / 24 * Math.PI * 2;
      uniforms.uDay.value = day;
      uniforms.uSunset.value = sunset;
      uniforms.uSunDir.value.set(Math.cos(angle), Math.sin(angle), 0.55).normalize();
      starMaterial.opacity = (1 - day) * 0.9;
      const brightness = 0.13 + day * 0.87;
      cloudMaterial.color.setRGB(0.96 * brightness, 0.945 * brightness,
        0.925 * brightness);
      if (sunset > 0.05) cloudMaterial.color.lerp(cloudTint, sunset * 0.55);
      cloudMaterial.opacity = 0.12 + day * 0.4;
      clouds.forEach((cloud, index) => {
        cloud.position.x += Math.sin(index + hours * 0.4) * 0.004;
      });
    },
  };
}
