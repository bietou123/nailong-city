import * as THREE from 'three';

export function createAtmosphere(scene) {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(820, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDirection;
        void main() {
          vec3 direction = normalize(vDirection);
          float altitude = smoothstep(-0.12, 0.76, direction.y);
          vec3 horizon = vec3(0.43, 0.66, 0.74);
          vec3 zenith = vec3(0.12, 0.35, 0.56);
          vec3 color = mix(horizon, zenith, altitude);
          float facingSun = max(dot(direction, normalize(vec3(-0.55, 0.48, 0.76))), 0.0);
          color += vec3(0.23, 0.15, 0.09) * pow(facingSun, 16.0);
          color += vec3(0.8, 0.63, 0.42) * pow(facingSun, 550.0);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }));
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);
  const clouds = [];
  const softWhite = new THREE.MeshBasicMaterial({ color: '#f9f4e8', transparent: true,
    opacity: 0.58, depthWrite: false, fog: false });
  const cloudGeometry = new THREE.SphereGeometry(1, 12, 7);
  for (let i = 0; i < 14; i++) {
    const group = new THREE.Group();
    const angle = i * 2.4;
    const distance = 310 + (i % 3) * 55;
    group.position.set(Math.sin(angle) * distance, 95 + (i % 4) * 17,
      Math.cos(angle) * distance);
    for (const [x, y, z, width] of [[0, 0, 0, 19], [-13, -3, 0, 13],
      [15, -2, 0, 15], [4, 7, -2, 11]]) {
      const puff = new THREE.Mesh(cloudGeometry, softWhite);
      puff.position.set(x, y, z);
      puff.scale.set(width, width * 0.23, width * 0.47);
      group.add(puff);
    }
    scene.add(group);
    clouds.push(group);
  }
  return {
    update(cameraPosition, elapsed) {
      dome.position.copy(cameraPosition);
      clouds.forEach((cloud, index) => { cloud.position.x += Math.sin(index + elapsed * 0.02) * 0.003; });
    },
  };
}
