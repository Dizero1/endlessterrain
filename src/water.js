import * as THREE from "../build/three.module.js";

export function normalizedHeightToHeight(normalizedHeight, heightScale) {
  return (
    (THREE.MathUtils.clamp(normalizedHeight, 0, 1) - 0.5) * 2 * heightScale
  );
}

function createWaterOverlayMaterial(opacity, color) {
  return new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    depthWrite: false,
    opacity,
    roughness: 0.18,
    metalness: 0.05,
  });
}

export function createWaterMesh({
  width = 128,
  depth = 128,
  heightScale = 40,
  level = 0.38,
  opacity = 0.55,
  color = 0x2d8fb8,
  Lod = "high",
} = {}) {
  const water = new THREE.Group();
  const waterY = normalizedHeightToHeight(level, heightScale) + 0.03;
  const overlayGeometry = new THREE.PlaneGeometry(width, depth, 1, 1);
  const overlay = new THREE.Mesh(
    overlayGeometry,
    createWaterOverlayMaterial(opacity, color),
  );

  water.name = "water";
  water.position.y = waterY;
  water.renderOrder = 1;

  overlay.name = "water-overlay";
  overlay.rotation.x = -Math.PI * 0.5;
  overlay.position.y = 0.01;
  overlay.receiveShadow = false;

  water.add(overlay);
  water.userData.overlay = overlay;
  water.userData.Lod = Lod;
  water.userData.overlayNearOpacity = Math.max(0.18, opacity * 0.45);
  water.userData.overlayFarOpacity = opacity;

  return water;
}
