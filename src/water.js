/**
 * water.js — 水面网格生成库
 * water.js — Water surface mesh generation library
 *
 * 创建包含两个平面的水面组：
 * Creates a water group containing two stacked planes:
 *   1. Reflector — 平面镜面反射（Three.js Reflector）
 *                  Planar mirror reflection (Three.js Reflector)
 *   2. Overlay  — 半透明水色叠加面（远距离时替代反射）
 *                  Translucent water-colour overlay (replaces reflection at distance)
 *
 * userData 接口 / userData interface:
 *   setReflectionEnabled(enabled: boolean) — 按摄像机距离开关反射
 *                                             Toggle reflection by camera distance
 *   setOpacity(opacity: number)            — 实时更新水面透明度（无需重建）
 *                                             Update water opacity live (no rebuild needed)
 */

import * as THREE    from "../build/three.module.js";
import { Reflector } from "../build/objects/Reflector.js";

// ============================================================
// 辅助函数 / Helpers
// ============================================================

/**
 * 将归一化水位 [0,1] 转换为世界空间高度。
 * Convert normalised water level [0,1] to world-space Y.
 *
 * 公式：waterY = (level - 0.5) * 2 * heightScale
 * Formula: waterY = (level - 0.5) * 2 * heightScale
 */
export function normalizedHeightToWorldHeight(normalizedHeight, heightScale) {
  return (THREE.MathUtils.clamp(normalizedHeight, 0, 1) - 0.5) * 2 * heightScale;
}

/**
 * 创建水面叠加材质（半透明彩色平面）。
 * Create water overlay material (translucent coloured plane).
 */
function createWaterOverlayMaterial(opacity, color) {
  return new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    side:        THREE.DoubleSide,
    depthWrite:  false,
    opacity,
    roughness:   0.18,
    metalness:   0.05,
  });
}

// ============================================================
// 公开 API / Public API
// ============================================================

/**
 * 创建水面 Group，包含 Reflector 和叠加面。
 * Create a water Group containing a Reflector and an overlay mesh.
 *
 * 返回的 Group 中心位于 (0, waterY, 0)（local space）。
 * 调用方需设置 group.position.x/z 到区块中心。
 * The returned Group is centred at (0, waterY, 0) in local space.
 * Caller must set group.position.x/z to the chunk centre.
 *
 * @param {object} options
 * @param {number} options.width, options.depth — 水面尺寸（与区块一致）/ surface size (match chunk)
 * @param {number} options.heightScale — 世界高度缩放 / world height scale
 * @param {number} options.level       — 归一化水位 [0,1] / normalised water level
 * @param {number} options.opacity     — 叠加面初始透明度 / overlay initial opacity
 * @param {number} options.color       — 水面颜色（十六进制）/ water colour (hex)
 * @param {number} options.reflectRes  — 反射贴图分辨率 / reflection texture resolution
 */
export function createWaterMesh({
  width      = 128,
  depth      = 128,
  heightScale = 200,
  level      = 0.496,
  opacity    = 0.55,
  color      = 0x2d8fb8,
  reflectRes = 256,
} = {}) {
  const water  = new THREE.Group();
  // 水面 Y 坐标（略高于地形以避免 z-fighting）
  // Water Y slightly above terrain surface to avoid z-fighting
  const waterY = normalizedHeightToWorldHeight(level, heightScale) + 0.03;

  // ── Reflector（平面镜）/ Planar mirror ─────────────────────
  const reflector = new Reflector(new THREE.PlaneGeometry(width, depth), {
    color:         0x8eb7c5,
    textureWidth:  reflectRes,
    textureHeight: reflectRes,
    clipBias:      0.003,
  });
  reflector.name                      = 'water-reflector';
  reflector.rotation.x                = -Math.PI * 0.5;
  reflector.material.transparent      = true;
  reflector.material.opacity          = 0.8;
  reflector.material.depthWrite       = false;

  // ── 叠加面（覆盖颜色）/ Overlay mesh ──────────────────────
  const overlay = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    createWaterOverlayMaterial(opacity, color),
  );
  overlay.name         = 'water-overlay';
  overlay.rotation.x   = -Math.PI * 0.5;
  overlay.position.y   =  0.02;   // 叠加面略高于 Reflector / overlay slightly above reflector
  overlay.receiveShadow = false;

  // ── 组装 / Assembly ────────────────────────────────────────
  water.name        = 'water';
  water.position.y  = waterY;
  water.renderOrder = 1;
  water.add(reflector, overlay);

  // ── userData 接口 / userData interface ────────────────────

  // 记录近 / 远两种叠加透明度
  // Store near/far overlay opacities for reflection toggle
  water.userData.reflector          = reflector;
  water.userData.overlay            = overlay;
  water.userData.overlayNearOpacity = Math.max(0.18, opacity * 0.45);
  water.userData.overlayFarOpacity  = opacity;

  /**
   * 根据摄像机距离开关反射。
   * Toggle reflection based on camera distance.
   * 近处：开反射，叠加面变透明（让反射可见）
   * Far:  关反射，叠加面变不透明（隐藏缺失的反射）
   * Near: enable reflection + transparent overlay (reflection visible)
   * Far:  disable reflection + opaque overlay (hides absent reflection)
   */
  water.userData.setReflectionEnabled = (enabled) => {
    reflector.visible              = enabled;
    overlay.material.opacity       = enabled
      ? water.userData.overlayNearOpacity
      : water.userData.overlayFarOpacity;
  };

  /**
   * 实时更新水面透明度，无需重建整个区块。
   * Update water opacity live without rebuilding the chunk.
   *
   * @param {number} op — 新透明度 [0,1] / new opacity [0,1]
   */
  water.userData.setOpacity = (op) => {
    water.userData.overlayNearOpacity = Math.max(0.10, op * 0.45);
    water.userData.overlayFarOpacity  = op;
    // 根据当前反射状态应用合适的透明度
    // Apply correct opacity based on current reflection state
    overlay.material.opacity = reflector.visible
      ? water.userData.overlayNearOpacity
      : water.userData.overlayFarOpacity;
  };

  // 初始化：关闭反射（由调用方按距离开启）
  // Initialise with reflection off (caller enables by distance)
  water.userData.setReflectionEnabled(false);

  return water;
}
