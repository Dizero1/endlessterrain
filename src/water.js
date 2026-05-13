import * as THREE from "../build/three.module.js";

export function normalizedHeightToWorldHeight(normalizedHeight, heightScale) {
  return (THREE.MathUtils.clamp(normalizedHeight, 0, 1) - 0.5) * 2 * heightScale;
}

export function createWaterMesh({
  width = 128,
  depth = 128,
  heightScale = 40,
  level = 0.38,
  opacity = 0.55,
  color = 0x2d8fb8,
} = {}) {
  const geometry = new THREE.PlaneGeometry(width, depth, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.18,
    metalness: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const water = new THREE.Mesh(geometry, material);
  water.name = "water";
  water.rotation.x = -Math.PI * 0.5;
  water.position.y = normalizedHeightToWorldHeight(level, heightScale) + 0.03;
  water.receiveShadow = false;
  water.renderOrder = 1;

  return water;
}
