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
          float altitude = smoothstep(-0.12, 0.76, direction.y);
          vec3 horizon = mix(vec3(0.035, 0.07, 0.13), vec3(0.43, 0.66, 0.74), uDay);
          horizon = mix(horizon, vec3(0.86, 0.44, 0.28), uSunset * 0.68);
          vec3 zenith = mix(vec3(0.01, 0.02, 0.06), vec3(0.12, 0.35, 0.56), uDay);
          zenith = mix(zenith, vec3(0.40, 0.20, 0.22), uSunset * 0.4);
          vec3 color = mix(horizon, zenith, altitude);
          float facingSun = max(dot(direction, normalize(uSunDir)), 0.0);
          color += vec3(0.24, 0.15, 0.08) * pow(facingSun, 8.0) * uDay;
          color += vec3(0.9, 0.68, 0.42) * pow(facingSun, 420.0) * uDay;
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
  const cloudMaterial = new THREE.MeshBasicMaterial({ color: '#f9f4e8', transparent: true,
    opacity: 0.58, depthWrite: false, fog: false });
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
      const brightness = 0.16 + day * 0.84;
      cloudMaterial.color.setRGB(0.98 * brightness, 0.955 * brightness,
        0.91 * brightness);
      cloudMaterial.opacity = 0.2 + day * 0.38;
      clouds.forEach((cloud, index) => {
        cloud.position.x += Math.sin(index + hours * 0.4) * 0.004;
      });
    },
  };
}
