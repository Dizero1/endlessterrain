/**
 * chunk.js — 地形区块工厂
 * chunk.js — Terrain chunk factory
 *
 * 将地形、水面、树木三个模块组合成一个 THREE.Group 区块对象。
 * Combines terrain, water, and tree modules into a single THREE.Group chunk.
 *
 * 单个区块包含 / A single chunk contains:
 *   - terrainMesh  — 带顶点着色的地形 Mesh（来自 terrain.js）
 *                    Vertex-coloured terrain mesh (from terrain.js)
 *   - waterMesh    — 水面组，含 Reflector + 叠加面（来自 water.js）
 *                    Water group with Reflector + overlay (from water.js)
 *   - treeGroup    — 程序化树木实例网格（来自 tree.js）
 *                    Procedural instanced tree group (from tree.js)
 *
 * 导出 / Exports:
 *   getChunkId(cx, cz)         — 返回区块唯一字符串键 / unique string key
 *   createTerrainChunk(options)— 创建并返回区块对象 / create and return chunk object
 */

import * as THREE           from "../build/three.module.js";
import { createTerrainMesh } from "./terrain.js";
import { generateTrees }     from "./tree.js";
import { createWaterMesh }   from "./water.js";

// ============================================================
// 辅助函数 / Helpers
// ============================================================

/**
 * 根据区块坐标生成唯一键（用于 Map/对象查找）。
 * Generate a unique string key from chunk coordinates (for Map / object lookup).
 */
export function getChunkId(chunkX, chunkZ) {
  return `${chunkX},${chunkZ}`;
}

/**
 * 递归释放 Object3D 树中的所有 Geometry 和 Material。
 * Recursively dispose all geometries and materials in an Object3D tree.
 */
function disposeObject3D(object) {
  const geometries = new Set();
  const materials  = new Set();

  object.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (child.material) {
      Array.isArray(child.material)
        ? child.material.forEach((m) => materials.add(m))
        : materials.add(child.material);
    }
  });

  geometries.forEach((g) => g.dispose());
  materials.forEach((m)  => m.dispose());
}

// ============================================================
// 公开 API / Public API
// ============================================================

/**
 * 创建一个完整的地形区块（地形 + 水 + 树）。
 * Create a complete terrain chunk (terrain + water + trees).
 *
 * 区块几何体以 (worldOffsetX, yOffset, worldOffsetZ) 为中心，
 * 即区块中心对应世界坐标 chunkX * width（± 半宽度偏移）。
 * Chunk geometry is centred at (worldOffsetX, yOffset, worldOffsetZ),
 * meaning chunk centre maps to world position chunkX * width (± half-width offset).
 *
 * @param {object}  options
 *
 * 基础 / Basics:
 * @param {number}  options.chunkX, options.chunkZ — 区块网格坐标 / chunk grid coordinates
 * @param {number}  [options.centerX]  — 覆盖世界中心 X（不提供时自动计算）
 *                                       Override world centre X (auto-computed if omitted)
 * @param {number}  [options.centerZ]
 * @param {number}  options.yOffset    — 区块 Y 轴偏移（用于浮入动画）/ Y offset for float animation
 *
 * 地形 / Terrain:
 * @param {object}  options.terrain    — 传给 createTerrainMesh 的参数覆盖
 *                                       Option overrides forwarded to createTerrainMesh
 *   @param {number}  .width / .depth     — 区块尺寸 / chunk size
 *   @param {number}  .segmentsX/Y        — 网格分辨率（LOD）/ grid resolution (LOD)
 *   @param {number}  .heightScale        — 高度缩放 / height scale
 *   @param {number}  .noiseScale         — 噪声频率 / noise frequency
 *   @param {number}  .octaves            — fBm 层数 / fBm octave count
 *   @param {number}  .seed               — 随机种子 / random seed
 *   @param {number}  .climateFreq        — 气候噪声频率 / climate noise frequency
 *   @param {number}  .waterLevelWorld    — 水位（世界单位，用于沙漠抬升）
 *                                          Water level (world units, for desert lift)
 *
 * 树木 / Trees:
 * @param {object}  options.trees     — 传给 generateTrees 的参数覆盖
 *                                      Option overrides forwarded to generateTrees
 *   @param {string}  .style              — 树形风格 / tree style
 *   @param {number}  .tundraSuppress     — 苔原压制强度 / tundra suppression
 *   @param {number}  .desertSuppress     — 沙漠压制强度 / desert suppression
 *   @param {number}  .climateFreq        — 气候噪声频率 / climate noise frequency
 *
 * 水面 / Water:
 * @param {object}  options.water     — 传给 createWaterMesh 的参数覆盖
 *   @param {boolean} .enabled            — 是否生成水面 / whether to generate water
 *   @param {number}  .level              — 归一化水位 [0,1] / normalised water level
 *   @param {number}  .opacity            — 水面透明度 / water opacity
 *
 * @returns {{ id, chunkX, chunkZ, object, terrainMesh, treeGroup, waterMesh, dispose() }}
 */
export function createTerrainChunk({
  chunkX  = 0,
  chunkZ  = 0,
  centerX = null,
  centerZ = null,
  yOffset = 0,
  terrain = {},
  trees   = {},
  water   = {},
} = {}) {

  // ── 地形参数默认值 / Terrain option defaults ───────────────
  const terrainOpts = {
    width:          128,
    depth:          128,
    heightScale:    200,
    noiseScale:     0.008,
    octaves:        6,
    persistence:    0.55,
    lacunarity:     2.1,
    seed:           42,
    segmentsX:      64,
    segmentsY:      64,
    climateFreq:    0.020,  // 气候噪声频率 / climate noise frequency
    waterLevelWorld: null,  // 传 null 时不做沙漠抬升 / null = no desert lift
    ...terrain,
  };

  // 区块中心世界坐标（用于噪声采样和网格定位）
  // Chunk centre world position (for noise sampling and mesh placement)
  const worldX = centerX ?? (chunkX * terrainOpts.width  + terrainOpts.width  * 0.5);
  const worldZ = centerZ ?? (chunkZ * terrainOpts.depth  + terrainOpts.depth  * 0.5);

  // ── 地形网格 / Terrain mesh ────────────────────────────────
  const terrainMesh = createTerrainMesh({
    ...terrainOpts,
    worldOffsetX: worldX,
    worldOffsetZ: worldZ,
  });
  terrainMesh.position.set(worldX, yOffset, worldZ);

  // ── 树木群组 / Tree group ──────────────────────────────────
  const treeGroup = generateTrees(terrainMesh, {
    width:          terrainOpts.width,
    depth:          terrainOpts.depth,
    heightScale:    terrainOpts.heightScale,
    segmentsX:      terrainOpts.segmentsX,
    segmentsY:      terrainOpts.segmentsY,
    // 每个区块用不同的种子，避免相邻区块树木分布雷同
    // Per-chunk seed variation to avoid identical adjacent distributions
    seed:           terrainOpts.seed + chunkX * 73856093 + chunkZ * 19349663,
    worldOffsetX:   worldX,
    worldOffsetZ:   worldZ,
    climateFreq:    terrainOpts.climateFreq,
    tundraSuppress: 0.85,
    desertSuppress: 0.95,
    ...trees,
  });
  treeGroup.position.set(worldX, yOffset, worldZ);

  // ── 水面（可选）/ Water mesh (optional) ────────────────────
  const waterOpts = {
    enabled: true,
    level:   0.496,   // 对应 waterLevelWorld ≈ -1.5（heightScale=200 时）
                      // maps to waterLevelWorld ≈ -1.5 when heightScale=200
    opacity: 0.55,
    ...water,
  };

  let waterMesh = null;
  if (waterOpts.enabled) {
    waterMesh = createWaterMesh({
      width:       terrainOpts.width,
      depth:       terrainOpts.depth,
      heightScale: terrainOpts.heightScale,
      level:       waterOpts.level,
      opacity:     waterOpts.opacity,
    });
    // 保留 createWaterMesh 内部计算的水位 Y，叠加 yOffset（浮入动画偏移）
    // Keep the water-level Y computed by createWaterMesh, add yOffset for float animation
    const waterLevelY = waterMesh.position.y;
    waterMesh.position.set(worldX, waterLevelY + yOffset, worldZ);
  }

  // ── 组装区块 Group / Assemble chunk Group ──────────────────
  const chunk = new THREE.Group();
  chunk.name                 = `terrain-chunk-${getChunkId(chunkX, chunkZ)}`;
  chunk.userData.chunkX      = chunkX;
  chunk.userData.chunkZ      = chunkZ;
  chunk.userData.id          = getChunkId(chunkX, chunkZ);

  chunk.add(terrainMesh, treeGroup);
  if (waterMesh) chunk.add(waterMesh);

  return {
    id:          getChunkId(chunkX, chunkZ),
    chunkX,
    chunkZ,
    worldX,      // 区块中心世界 X（便于距离计算）/ chunk centre world X (for distance calcs)
    worldZ,
    object:      chunk,
    terrainMesh,
    treeGroup,
    waterMesh,
    /** 释放全部 GPU 资源 / Dispose all GPU resources */
    dispose() { disposeObject3D(chunk); },
  };
}

// ============================================================
// LOD 辅助工具
// LOD helper utilities
// ============================================================

/**
 * 根据区块坐标与摄像机所在区块坐标，计算该区块的 LOD 等级。
 * Compute the LOD level for a chunk given its position and the camera's chunk position.
 *
 * 使用 Chebyshev（棋盘）距离进行分级，确保斜向区块与轴向区块受到相同对待：
 * Uses Chebyshev (chessboard) distance for classification so diagonal chunks
 * are treated the same as axis-aligned ones:
 *
 *   distance ≤ radii.high   → 'high'   最高细节 / maximum detail
 *   distance ≤ radii.medium → 'medium' 中等细节 / medium detail
 *   otherwise               → 'low'    最低细节 / minimum detail
 *
 * @param {number} chunkX           — 目标区块 X 坐标 / target chunk X coord
 * @param {number} chunkZ           — 目标区块 Z 坐标 / target chunk Z coord
 * @param {number} centerX          — 摄像机所在区块 X / camera chunk X
 * @param {number} centerZ          — 摄像机所在区块 Z / camera chunk Z
 * @param {object} [radii]          — Chebyshev 半径阈值 / Chebyshev radius thresholds
 * @param {number} [radii.high=2]   — 高细节半径（含）/ high-detail radius (inclusive)
 * @param {number} [radii.medium=5] — 中细节半径（含）/ medium-detail radius (inclusive)
 * @returns {'high'|'medium'|'low'}
 */
export function getChunkLodLevel(chunkX, chunkZ, centerX, centerZ,
                                  radii = { high: 2, medium: 5 }) {
  const d = Math.max(Math.abs(chunkX - centerX), Math.abs(chunkZ - centerZ));
  if (d <= radii.high)   return 'high';
  if (d <= radii.medium) return 'medium';
  return 'low';
}

/**
 * LOD 等级 → 地形网格单方向分段数。
 * LOD level → terrain mesh segment count per axis.
 *
 * 分段数越多，网格越精细，顶点着色与坡度估算也越准确，但 GPU 开销更高。
 * Higher segment counts produce finer meshes with more accurate vertex colours
 * and slope estimates, at higher GPU cost.
 *
 *   'high'   → 64 分段（高精度，近处区块）/ 64 segments (high detail, near chunks)
 *   'medium' → 32 分段（中精度，中距区块）/ 32 segments (medium detail, mid-range)
 *   'low'    → 16 分段（低精度，远处区块）/ 16 segments (low detail, distant chunks)
 *
 * @param {'high'|'medium'|'low'} lodLevel
 * @returns {number} segments — 传入 segmentsX / segmentsY / pass to segmentsX / segmentsY
 */
export function getLodSegments(lodLevel) {
  if (lodLevel === 'high')   return 64;
  if (lodLevel === 'medium') return 32;
  return 16;
}

/**
 * LOD 等级 → 树木参数覆盖对象（低细节时大幅减少树木数量）。
 * LOD level → tree option overrides (significantly fewer trees at lower detail).
 *
 * 返回对象通过展开运算符合并到 createTerrainChunk 的 trees 参数中，
 * 会覆盖 treesPerChunk 和 forestDensity；未列出的参数保持调用方设置。
 * The returned object should be spread into the `trees` option of createTerrainChunk.
 * It overrides treesPerChunk and forestDensity; all other tree params stay as-is.
 *
 * 示例用法 / Example usage:
 *   trees: {
 *     treesPerChunk: 500,
 *     forestDensity: 0.85,
 *     ...getLodTreeOptions(lodLevel),   // 覆盖低细节值 / overrides for lower LOD
 *   }
 *
 * @param {'high'|'medium'|'low'} lodLevel
 * @returns {object} 空对象（high）或含 treesPerChunk/forestDensity 的覆盖对象
 *                   Empty object for 'high'; override object for 'medium'/'low'
 */
export function getLodTreeOptions(lodLevel) {
  if (lodLevel === 'high')   return {};
  // 中等 LOD：每区块尝试次数减半，森林密度降至 60%
  // Medium LOD: halve placement attempts, reduce forest density to 60%
  if (lodLevel === 'medium') return { treesPerChunk: 250, forestDensity: 0.55 };
  // 低 LOD：最稀疏，仅保留少量树木占位
  // Low LOD: most sparse, only a handful of placeholder trees
  return { treesPerChunk: 80, forestDensity: 0.25 };
}
