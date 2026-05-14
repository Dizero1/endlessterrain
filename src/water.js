import * as THREE from "../build/three.module.js";
import { Reflector } from "../build/objects/Reflector.js";

export function normalizedHeightToHeight(normalizedHeight, heightScale) {
  return (THREE.MathUtils.clamp(normalizedHeight, 0, 1) - 0.5) * 2 * heightScale;
}

function createWaterOverlayMaterial(opacity, color) {
  return new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    side: THREE.DoubleSide,
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
  Lod = "high"
} = {}) {
  const water = new THREE.Group();
  const waterY = normalizedHeightToHeight(level, heightScale) + 0.03;
  const reflectionGeometry = new THREE.PlaneGeometry(width, depth, 1, 1);
  const overlayGeometry = new THREE.PlaneGeometry(width, depth, 1, 1);
  const size = Lod==="high" ? 512 : 128;
  const reflector = new Reflector(reflectionGeometry, {
    color: 0x8eb7c5,
    textureWidth: size,
    textureHeight: size,
    clipBias: 0.003,
  });
  const overlay = new THREE.Mesh(
    overlayGeometry,
    createWaterOverlayMaterial(opacity, color),
  );

  water.name = "water";
  water.position.y = waterY;
  water.renderOrder = 1;

  reflector.name = "water-reflector";
  reflector.rotation.x = -Math.PI * 0.5;
  reflector.material.transparent = true;
  reflector.material.opacity = 0.8;
  reflector.material.depthWrite = false;

  overlay.name = "water-overlay";
  overlay.rotation.x = -Math.PI * 0.5;
  overlay.position.y = 0.02;
  overlay.receiveShadow = false;

  water.add(reflector, overlay);

  water.userData.reflector = reflector;
  water.userData.overlay = overlay;
  water.userData.Lod = Lod
  water.userData.overlayNearOpacity = Math.max(0.18, opacity * 0.45);
  water.userData.overlayFarOpacity = opacity;
  water.userData.setReflectionEnabled = (enabled) => {
    if (water.userData.Lod==="low"){return}
    const size = Lod === "high" ? 512 : 128;
    water.userData.reflector.getRenderTarget().setSize(size, size);
    reflector.visible = enabled;
    overlay.material.opacity = enabled
      ? water.userData.overlayNearOpacity
      : water.userData.overlayFarOpacity;
  };
  if (Lod==="low"){water.userData.setReflectionEnabled(false);}
  else{water.userData.setReflectionEnabled(true);}

  return water;
}
