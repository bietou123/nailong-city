import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.6 },
    grain: { value: 0.012 },
    saturation: { value: 1.06 },
    contrast: { value: 1.12 },
    shadowTint: { value: new THREE.Color('#7d94ad') },
    highlightTint: { value: new THREE.Color('#ffd8ae') },
    shadowAmount: { value: 0.07 },
    highlightAmount: { value: 0.06 },
    aberration: { value: 0.0016 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignette;
    uniform float grain;
    uniform float saturation;
    uniform float contrast;
    uniform vec3 shadowTint;
    uniform vec3 highlightTint;
    uniform float shadowAmount;
    uniform float highlightAmount;
    uniform float aberration;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 offset = (vUv - 0.5) * aberration * dot(vUv - 0.5, vUv - 0.5) * 4.0;
      vec3 color;
      color.r = texture2D(tDiffuse, vUv + offset * 1.6).r;
      color.g = texture2D(tDiffuse, vUv).g;
      color.b = texture2D(tDiffuse, vUv - offset * 1.6).b;

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, saturation);
      color = (color - 0.5) * contrast + 0.5;
      color = max(color, 0.0);

      float shadowMask = 1.0 - smoothstep(0.04, 0.5, luma);
      float highlightMask = smoothstep(0.55, 1.0, luma);
      color = mix(color, color * shadowTint * 1.4, shadowMask * shadowAmount);
      color = mix(color, color * highlightTint, highlightMask * highlightAmount);
      color = color * 0.988 + 0.004;

      float dist = distance(vUv, vec2(0.5));
      float edge = smoothstep(0.36, 0.88, dist);
      color *= 1.0 - edge * vignette * 0.42;

      float seed = floor(time * 12.0);
      color += (rand(vUv * 1024.0 + seed) - 0.5) * grain;
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};

export function createPostFX(renderer, scene, camera) {
  // antialias:true on the renderer only covers direct-to-canvas rendering. Every
  // post-processed frame lands in the composer's render targets, so they must be
  // multisampled themselves or all geometry edges crawl while the camera moves.
  let samples = 0;
  const makeTarget = (width, height) => new THREE.WebGLRenderTarget(
    Math.max(1, Math.round(width)), Math.max(1, Math.round(height)), {
      type: THREE.HalfFloatType,
      samples,
      depthBuffer: true,
      stencilBuffer: false,
    });

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.55, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  function rebuildTargets() {
    const width = composer._width * composer._pixelRatio;
    const height = composer._height * composer._pixelRatio;
    composer.reset(makeTarget(width, height));
  }

  let quality = 'high';
  function applyQuality() {
    const wanted = quality === 'high' ? 4 : quality === 'medium' ? 2 : 0;
    if (wanted !== samples) {
      samples = wanted;
      rebuildTargets();
    }
    bloom.enabled = quality === 'high';
    grade.uniforms.grain.value = quality === 'high' ? 0.008 : 0.005;
    grade.uniforms.aberration.value = quality === 'high' ? 0.0016 : 0;
  }
  applyQuality();

  return {
    composer,
    setQuality(option) {
      quality = option === 'low' ? 'low' : option === 'medium' ? 'medium' : 'high';
      applyQuality();
    },
    setSize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
    },
    render(dt, elapsed) {
      grade.uniforms.time.value = elapsed;
      composer.render(dt);
    },
  };
}
