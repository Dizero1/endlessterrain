/**
 * tree.js — 程序化树木生成库
 * tree.js — Procedural tree generation library
 *
 * 支持两套树形风格：
 *   'sphere'  — 球形树冠 + 圆柱树干（index.html 原风格）
 *   'conifer' — 针叶锥形层叠树（terrain.html 风格）
 *   'broadleaf'— 阔叶宽冠层叠树（terrain.html 风格）
 *   'mixed'   — 自动混合针叶 / 阔叶（forest density 驱动）
 *
 * Supports two tree styles:
 *   'sphere'   — sphere canopy + cylinder trunk (original index.html style)
 *   'conifer'  — stacked-cone conifer (terrain.html style)
 *   'broadleaf'— stacked-cone broadleaf (terrain.html style)
 *   'mixed'    — auto-mix conifer / broadleaf driven by forest density noise
 *
 * 特性 / Features:
 *   - 基于森林密度噪声的接受率（forest density noise-driven acceptance rate）
 *   - 最小间距网格（min-distance grid for natural spacing）
 *   - 苔原 / 沙漠气候压制（tundra / desert climate suppression）
 *   - InstancedMesh 实例渲染，每棵树随机色调
 *     InstancedMesh rendering with per-instance random tint
 */

import * as THREE       from "../build/three.module.js";
import { climateMask, desertMask } from "./terrain.js";

// ============================================================
// 伪随机数生成器（基于 xorshift）
// Pseudo-random number generator (xorshift-based)
// ============================================================

/**
 * 创建一个可重现的 PRNG，输入种子，返回 [0,1) 的函数。
 * Create a reproducible PRNG: takes seed, returns function → [0,1).
 */
function createRandom(seed = 0) {
  let state = Math.floor(seed) >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t  = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// 几何体构建辅助（锥形风格）
// Geometry builder helpers (cone style)
// ============================================================

/**
 * 向几何缓冲区追加一个顶点，返回其索引。
 * Append one vertex to geometry buffers, return its index.
 */
function pushVert(arrs, p, n, c) {
  arrs.positions.push(p[0], p[1], p[2]);
  arrs.normals.push(n[0], n[1], n[2]);
  arrs.colors.push(c[0], c[1], c[2]);
  return arrs.positions.length / 3 - 1;
}

/**
 * 向缓冲区添加一个六棱柱树干。
 * Append a hexagonal-prism trunk to buffers.
 * @param {number} radius — 底面半径 / base radius
 * @param {number} height — 高度 / height
 * @param {number[]} color — [r,g,b] 树干颜色 / trunk colour
 */
function addTrunk(arrs, radius, height, color) {
  const sides = 6;
  const ringBot = [], ringTop = [];
  for (let i = 0; i < sides; i++) {
    const a  = (i / sides) * Math.PI * 2;
    const cx = Math.cos(a), cz = Math.sin(a);
    ringBot.push(pushVert(arrs, [cx * radius, 0,      cz * radius], [cx, 0, cz], color));
    ringTop.push(pushVert(arrs, [cx * radius, height, cz * radius], [cx, 0, cz], color));
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    arrs.indices.push(ringBot[i], ringTop[i], ringBot[j]);
    arrs.indices.push(ringTop[i], ringTop[j], ringBot[j]);
  }
}

/**
 * 向缓冲区添加一层树冠锥体（侧面 + 底面）。
 * Append one canopy cone layer (side + bottom cap) to buffers.
 * @param {number} yBase  — 锥体底部 Y / cone base Y
 * @param {number} height — 锥高 / cone height
 * @param {number} radius — 底面半径 / base radius
 * @param {number[]} color
 * @param {number} [sides=8] — 截面边数 / polygon sides
 */
function addCone(arrs, yBase, height, radius, color, sides = 8) {
  const apexI = pushVert(arrs, [0, yBase + height, 0], [0, 1, 0], color);
  const ring  = [];
  const ringD = [];
  for (let i = 0; i < sides; i++) {
    const a   = (i / sides) * Math.PI * 2;
    const cx  = Math.cos(a), cz = Math.sin(a);
    const sH  = height / Math.hypot(radius, height); // 斜面法线 Y / slant normal Y
    const sR  = radius / Math.hypot(radius, height); // 斜面法线 XZ / slant normal XZ
    ring.push( pushVert(arrs, [cx * radius, yBase, cz * radius], [cx * sH, sR, cz * sH], color));
    ringD.push(pushVert(arrs, [cx * radius, yBase, cz * radius], [0, -1, 0],
                                [color[0] * 0.6, color[1] * 0.6, color[2] * 0.6]));
  }
  // 侧面三角形 / Side triangles
  for (let i = 0; i < sides; i++) {
    arrs.indices.push(ring[i], apexI, ring[(i + 1) % sides]);
  }
  // 底盖（扇形三角形）/ Bottom cap (fan triangles)
  for (let i = 1; i < sides - 1; i++) {
    arrs.indices.push(ringD[0], ringD[i + 1], ringD[i]);
  }
}

/**
 * 将缓冲区数据组装为 BufferGeometry。
 * Assemble buffer arrays into a BufferGeometry.
 */
function buildBufferGeom(arrs) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(arrs.positions, 3));
  geom.setAttribute('normal',   new THREE.Float32BufferAttribute(arrs.normals,   3));
  geom.setAttribute('color',    new THREE.Float32BufferAttribute(arrs.colors,    3));
  geom.setIndex(arrs.indices);
  return geom;
}

/**
 * 构建单位尺寸的针叶树原型几何体。
 * Build unit-scale conifer prototype geometry.
 */
function buildConiferGeometry() {
  const arrs = { positions: [], normals: [], colors: [], indices: [] };
  const trunk = [0.32, 0.21, 0.13]; // 树干棕色 / trunk brown
  const fDark = [0.10, 0.26, 0.12]; // 深绿底层 / dark green base layer
  const fLite = [0.20, 0.42, 0.18]; // 亮绿上层 / light green upper layer
  addTrunk(arrs, 0.12, 1.0, trunk);
  addCone(arrs, 0.7,  1.4, 0.85, fDark);
  addCone(arrs, 1.6,  1.6, 0.55, fLite);
  return buildBufferGeom(arrs);
}

/**
 * 构建单位尺寸的阔叶树原型几何体。
 * Build unit-scale broadleaf prototype geometry.
 */
function buildBroadleafGeometry() {
  const arrs = { positions: [], normals: [], colors: [], indices: [] };
  const trunk = [0.32, 0.21, 0.13];
  const fDark = [0.10, 0.26, 0.12];
  const fLite = [0.20, 0.42, 0.18];
  addTrunk(arrs, 0.18, 0.9, trunk);
  addCone(arrs, 0.7,  0.9, 1.05, fDark, 10);
  addCone(arrs, 1.2,  0.8, 0.95, fLite, 10);
  addCone(arrs, 1.7,  0.6, 0.7,  fLite, 8);
  return buildBufferGeom(arrs);
}

// 全局复用的原型几何体（懒初始化）
// Globally reused prototype geometries (lazy-initialized)
let _coniferGeom   = null;
let _broadleafGeom = null;
function getConiferGeom()   { return _coniferGeom   || (_coniferGeom   = buildConiferGeometry());   }
function getBroadleafGeom() { return _broadleafGeom || (_broadleafGeom = buildBroadleafGeometry()); }

// ============================================================
// 球形风格树木（兼容 index.html 原始风格）
// Sphere-style trees (backward-compatible with index.html)
// ============================================================

/** 带随机扰动的球形树冠几何体 / Sphere foliage geometry with jitter */
function createFoliageGeometry(segments = 10, random = Math.random) {
  const geom = new THREE.SphereGeometry(1, segments, segments);
  const pos  = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const noise = 0.15;
    pos.setXYZ(i,
      pos.getX(i) * 0.9 + (random() - 0.5) * noise,
      pos.getY(i) * 1.2 + (random() - 0.5) * noise,
      pos.getZ(i) * 0.8 + (random() - 0.5) * noise,
    );
  }
  geom.computeVertexNormals();
  return geom;
}

/** 按 LOD 级别创建球形树木资产 / Create sphere-tree assets by LOD level */
function createSphereTreeAssets(lod, random) {
  const trunkSegs   = lod === 'high' ? 6 : 5;
  const foliageSegs = lod === 'high' ? 10 : 6;
  return {
    trunkGeometry:   lod === 'low' ? null : new THREE.CylinderGeometry(0.1, 0.16, 1.6, trunkSegs),
    foliageGeometry: lod === 'low' ? new THREE.ConeGeometry(0.95, 2.2, 6, 1)
                                   : createFoliageGeometry(foliageSegs, random),
    trunkMaterial:   new THREE.MeshStandardMaterial({ color: 0x7d4d28 }),
    foliageMaterial: new THREE.MeshStandardMaterial({ color: 0x2f6f2f, flatShading: true }),
  };
}

// ============================================================
// 高度与坡度采样
// Height and slope sampling from terrain geometry
// ============================================================

/** 从地形几何体位置属性中，用双线性插值采样高度。
 *  Sample height at local position (x,z) by bilinear interpolation. */
function sampleTerrainHeight(x, z, posAttr, params) {
  const halfW  = params.width  * 0.5;
  const halfD  = params.depth  * 0.5;
  const gx = THREE.MathUtils.clamp(((x + halfW) / params.width)  * params.segmentsX, 0, params.segmentsX);
  const gz = THREE.MathUtils.clamp(((z + halfD) / params.depth)  * params.segmentsY, 0, params.segmentsY);
  const c0 = Math.floor(gx), r0 = Math.floor(gz);
  const c1 = Math.min(c0 + 1, params.segmentsX);
  const r1 = Math.min(r0 + 1, params.segmentsY);
  const tx = gx - c0, tz = gz - r0;
  const stride = params.segmentsX + 1;
  const h0 = THREE.MathUtils.lerp(posAttr.getY(r0 * stride + c0), posAttr.getY(r0 * stride + c1), tx);
  const h1 = THREE.MathUtils.lerp(posAttr.getY(r1 * stride + c0), posAttr.getY(r1 * stride + c1), tx);
  return THREE.MathUtils.lerp(h0, h1, tz);
}

/** 计算顶点坡度 / Compute slope magnitude at a vertex index */
function computeSlope(index, posAttr, segmentsX, segmentsY, width, depth) {
  const stride = segmentsX + 1;
  const row    = Math.floor(index / stride);
  const col    = index - row * stride;
  const hL = posAttr.getY(row * stride + Math.max(col - 1, 0));
  const hR = posAttr.getY(row * stride + Math.min(col + 1, segmentsX));
  const hT = posAttr.getY(Math.max(row - 1, 0) * stride + col);
  const hB = posAttr.getY(Math.min(row + 1, segmentsY) * stride + col);
  const dx  = width  / segmentsX;
  const dz  = depth  / segmentsY;
  return Math.sqrt(((hR - hL) / (2 * dx)) ** 2 + ((hB - hT) / (2 * dz)) ** 2);
}

// ============================================================
// 公开 API
// Public API
// ============================================================

/**
 * 在地形网格上生成程序化树木群组。
 * Generate a procedural tree group on a terrain mesh.
 *
 * @param {THREE.Mesh} terrainMesh — 地形网格（需有 position 属性）
 *                                   Terrain mesh (must have position attribute)
 * @param {object} options
 *
 * 通用参数 / Common options:
 * @param {number}  options.width, options.depth — 区块尺寸 / chunk size
 * @param {number}  options.heightScale   — 世界高度缩放 / world height scale
 * @param {number}  options.segmentsX/Y   — 地形网格分辨率 / terrain resolution
 * @param {number}  options.seed          — 随机种子 / random seed
 * @param {string}  options.style         — 'sphere'|'conifer'|'broadleaf'|'mixed'
 * @param {string}  options.lod           — 'high'|'medium'|'low'（仅 sphere 风格）/ sphere only
 * @param {number}  options.sampleStep    — 网格采样步长（仅 sphere 风格）/ sphere only
 *
 * 锥形风格特有 / Cone-style specific:
 * @param {number}  options.treesPerChunk — 每区块最大尝试次数 / max placement attempts
 * @param {number}  options.baseScale     — 树木基础缩放 / base scale factor
 * @param {number}  options.scaleVar      — 缩放随机变化量 / scale randomness
 * @param {number}  options.minDist       — 树间最小距离 / minimum tree spacing
 * @param {number}  options.broadleafProb — 阔叶树比例（mixed 模式）/ broadleaf ratio for mixed
 *
 * 放置条件 / Placement conditions:
 * @param {number}  options.minHeight  — 最低归一化高度 [0,1] / min normalised height
 * @param {number}  options.maxHeight  — 最高归一化高度 [0,1] / max normalised height
 * @param {number}  options.maxSlope   — 最大坡度 / maximum slope
 * @param {number}  options.density    — 总体密度 [0,1] / overall density
 *
 * 森林密度噪声 / Forest density noise:
 * @param {number}  options.forestFreq       — 森林噪声频率 / forest noise frequency
 * @param {number}  options.forestThreshold  — 森林判定阈值 / forest threshold
 * @param {number}  options.forestDensity    — 森林内密度 / in-forest density
 * @param {number}  options.sparseDensity    — 林外散布密度 / out-of-forest density
 *
 * 气候压制 / Climate suppression:
 * @param {number}  options.worldOffsetX/Z   — 区块中心世界坐标，用于气候采样
 *                                              Chunk centre in world space for climate sampling
 * @param {number}  options.climateFreq      — 气候噪声频率 / climate noise frequency
 * @param {number}  options.tundraSuppress   — 苔原区树木压制强度 [0,1] / tundra suppression [0,1]
 * @param {number}  options.desertSuppress   — 沙漠区树木压制强度 [0,1] / desert suppression [0,1]
 */
export function generateTrees(terrainMesh, options = {}) {
  const p = {
    // 通用 / Common
    width: 128, depth: 128, heightScale: 200,
    segmentsX: 64, segmentsY: 64,
    seed: 0,
    style: 'mixed',   // 'sphere' | 'conifer' | 'broadleaf' | 'mixed'
    lod:   'high',    // sphere 风格 LOD / sphere-style LOD

    // 放置条件 / Placement conditions (normalised [0,1])
    minHeight:  0.50,
    maxHeight:  0.60,
    maxSlope:   0.70,
    density:    0.80,

    // 森林密度噪声 / Forest density noise
    forestFreq:      0.0035,
    forestThreshold: 0.65,
    forestDensity:   0.85,
    sparseDensity:   0.04,

    // 锥形树参数 / Cone-style tree params
    treesPerChunk: 500,
    baseScale:     16,
    scaleVar:       6,
    broadleafProb:  0.45,
    minDist:       18,

    // sphere 风格 / Sphere-style params
    scaleMin: 0.30, scaleMax: 0.80,
    sampleStep: 4,

    // 气候压制 / Climate suppression
    worldOffsetX:  0,
    worldOffsetZ:  0,
    climateFreq:   0.020,
    tundraSuppress: 0.85,
    desertSuppress: 0.95,

    ...options,
  };

  const random = createRandom(p.seed);

  return p.style === 'sphere'
    ? _buildSphereTrees(terrainMesh, p, random)
    : _buildConeTrees(terrainMesh, p, random);
}

// ────────────────────────────────────────────────────────────
// 内部：球形树木生成
// Internal: sphere-style tree generation
// ────────────────────────────────────────────────────────────
function _buildSphereTrees(terrainMesh, p, random) {
  const posAttr  = terrainMesh.geometry.getAttribute('position');
  const stride   = p.segmentsX + 1;
  const placements = [];
  const treeGroup  = new THREE.Group();
  treeGroup.name   = `trees-sphere-${p.lod}`;

  for (let row = 0; row < p.segmentsY; row += p.sampleStep) {
    for (let col = 0; col < p.segmentsX; col += p.sampleStep) {
      if (random() > p.density) continue;

      const index = row * stride + col;
      const y     = posAttr.getY(index);
      const normH = Math.max(0, Math.min(1, (y / p.heightScale) * 0.5 + 0.5));
      const slope = computeSlope(index, posAttr, p.segmentsX, p.segmentsY, p.width, p.depth);

      if (normH < p.minHeight || normH > p.maxHeight || slope > p.maxSlope) continue;

      // 气候压制 / Climate suppression
      const localX  = posAttr.getX(index);
      const localZ  = posAttr.getZ(index);
      const worldX  = localX + p.worldOffsetX;
      const worldZ  = localZ + p.worldOffsetZ;
      let   accept  = 1.0;
      accept *= (1 - climateMask(worldX, worldZ, p.seed, p.climateFreq) * p.tundraSuppress);
      accept *= (1 - desertMask(worldX, worldZ, p.seed, p.climateFreq)  * p.desertSuppress);
      if (random() > accept) continue;

      const scale = p.scaleMin + random() * (p.scaleMax - p.scaleMin);
      const treeX = localX + 0.4 - random() * 0.8;
      const treeZ = localZ + 0.4 - random() * 0.8;
      const treeY = sampleTerrainHeight(treeX, treeZ, posAttr, p);
      placements.push({ position: new THREE.Vector3(treeX, treeY, treeZ),
                        rotationY: random() * Math.PI * 2, scale });
    }
  }

  const assets = createSphereTreeAssets(p.lod, random);
  const matrix = new THREE.Matrix4();
  const pos3   = new THREE.Vector3();
  const quat   = new THREE.Quaternion();
  const scl    = new THREE.Vector3();

  if (assets.trunkGeometry) {
    const trunkMesh = new THREE.InstancedMesh(assets.trunkGeometry, assets.trunkMaterial, placements.length);
    trunkMesh.castShadow = trunkMesh.receiveShadow = true;
    placements.forEach((pl, i) => {
      pos3.copy(pl.position); pos3.y += 0.8 * pl.scale;
      quat.setFromEuler(new THREE.Euler(0, pl.rotationY, 0));
      scl.setScalar(pl.scale);
      trunkMesh.setMatrixAt(i, matrix.compose(pos3, quat, scl));
    });
    trunkMesh.instanceMatrix.needsUpdate = true;
    treeGroup.add(trunkMesh);
  }

  const foliageMesh = new THREE.InstancedMesh(assets.foliageGeometry, assets.foliageMaterial, placements.length);
  foliageMesh.castShadow = foliageMesh.receiveShadow = true;
  placements.forEach((pl, i) => {
    pos3.copy(pl.position); pos3.y += (p.lod === 'low' ? 1.1 : 2.0) * pl.scale;
    quat.setFromEuler(new THREE.Euler(0, pl.rotationY, 0));
    scl.setScalar(pl.scale);
    foliageMesh.setMatrixAt(i, matrix.compose(pos3, quat, scl));
  });
  foliageMesh.instanceMatrix.needsUpdate = true;
  treeGroup.add(foliageMesh);
  treeGroup.userData.count = placements.length;
  treeGroup.userData.lod   = p.lod;
  return treeGroup;
}

// ────────────────────────────────────────────────────────────
// 内部：锥形树木生成（conifer / broadleaf / mixed）
// Internal: cone-style tree generation
// ────────────────────────────────────────────────────────────
function _buildConeTrees(terrainMesh, p, random) {
  const posAttr  = terrainMesh.geometry.getAttribute('position');
  const size     = p.width;   // 假设 width == depth / assume square chunk
  const EDGE     = p.minDist * 0.5;
  const MD2      = p.minDist * p.minDist;

  // 最小间距网格（加速碰撞检测）
  // Min-distance grid for O(1) neighbour lookup
  const cellSize = p.minDist;
  const gridDim  = Math.ceil(size / cellSize) + 1;
  const grid     = new Array(gridDim * gridDim);

  function gridKey(lx, lz) {
    const gx = Math.floor((lx + size * 0.5) / cellSize);
    const gz = Math.floor((lz + size * 0.5) / cellSize);
    return gz * gridDim + gx;
  }
  function tooClose(lx, lz) {
    const gx = Math.floor((lx + size * 0.5) / cellSize);
    const gz = Math.floor((lz + size * 0.5) / cellSize);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cell = grid[(gz + dz) * gridDim + (gx + dx)];
        if (!cell) continue;
        for (let i = 0; i < cell.length; i += 2) {
          const ex = cell[i] - lx, ez = cell[i + 1] - lz;
          if (ex * ex + ez * ez < MD2) return true;
        }
      }
    }
    return false;
  }
  function recordTree(lx, lz) {
    const k = gridKey(lx, lz);
    if (!grid[k]) grid[k] = [];
    grid[k].push(lx, lz);
  }

  // 森林密度噪声接受率
  // Forest density noise acceptance rate
  function forestAcceptRate(wx, wz) {
    const v   = 0.5 + 0.5 * Math.sin(wx * p.forestFreq * 314.159) *
                           Math.cos(wz * p.forestFreq * 271.828);
    // 用噪声代替 makeNoise（避免额外导入），改用 sin/cos 组合近似
    // Use sin/cos approximation since we want to avoid extra imports
    const raw = 0.5 + 0.5 * (Math.sin(wx * p.forestFreq * 397 + p.seed * 0.017)
                            * Math.cos(wz * p.forestFreq * 419 + p.seed * 0.031));
    const fm  = smoothstep01(p.forestThreshold - 0.05, p.forestThreshold + 0.05, raw);
    return p.sparseDensity + (p.forestDensity - p.sparseDensity) * fm;
  }
  function smoothstep01(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  const conData  = []; // [wx,wy,wz, sx,sy,sz, r,g,b, ...]
  const wideData = [];

  const N      = p.treesPerChunk;
  const halfSz = size * 0.5;

  for (let i = 0; i < N; i++) {
    // 在区块局部空间内随机取点（-halfSz ~ +halfSz）
    // Random point in chunk local space (-halfSz ~ +halfSz)
    const lx = -halfSz + EDGE + random() * (size - 2 * EDGE);
    const lz = -halfSz + EDGE + random() * (size - 2 * EDGE);
    const wx = lx + p.worldOffsetX;
    const wz = lz + p.worldOffsetZ;

    // 从地形几何体采样高度
    // Sample height from terrain geometry
    const h  = sampleTerrainHeight(lx, lz, posAttr, p);

    // 归一化高度检查 / Normalised-height check
    const normH = Math.max(0, Math.min(1, (h / p.heightScale) * 0.5 + 0.5));
    if (normH < p.minHeight || normH > p.maxHeight) continue;

    // 坡度检查（从相邻高度估算）
    // Slope check (estimated from adjacent heights)
    const step = size / Math.max(p.segmentsX, 1);
    const dhdx = (sampleTerrainHeight(lx + step, lz, posAttr, p) -
                  sampleTerrainHeight(lx - step, lz, posAttr, p)) / (2 * step);
    const dhdz = (sampleTerrainHeight(lx, lz + step, posAttr, p) -
                  sampleTerrainHeight(lx, lz - step, posAttr, p)) / (2 * step);
    if (Math.hypot(dhdx, dhdz) > p.maxSlope) continue;

    // 森林密度接受率 / Forest density acceptance
    let acceptRate = forestAcceptRate(wx, wz);

    // 气候压制 / Climate suppression
    acceptRate *= (1 - climateMask(wx, wz, p.seed, p.climateFreq) * p.tundraSuppress);
    acceptRate *= (1 - desertMask(wx, wz,  p.seed, p.climateFreq) * p.desertSuppress);
    if (random() > acceptRate) continue;

    // 最小间距检查 / Min-distance check
    if (tooClose(lx, lz)) continue;
    recordTree(lx, lz);

    // 树木缩放（随机化宽高比）
    // Tree scale with random aspect ratio variation
    const baseS  = p.baseScale + (random() * 2 - 1) * p.scaleVar;
    const sx     = baseS * (0.75 + random() * 0.55);
    const sy     = baseS * (0.70 + random() * 0.70);
    const sz     = sx;

    // 随机色调（模拟季节、光照差异）
    // Random tint (simulates seasonal and lighting variation)
    const tr = 0.85 + random() * 0.30;
    const tg = 0.80 + random() * 0.40;
    const tb = 0.85 + random() * 0.30;

    // 锥形苔原树以针叶为主 / Conifer preferred in cold zones
    const tundra  = climateMask(wx, wz, p.seed, p.climateFreq);
    const isBroad = p.style === 'broadleaf'
      ? true
      : p.style === 'conifer'
      ? false
      : random() < p.broadleafProb * (1 - tundra * 0.9); // mixed: tundra reduces broadleaf

    const out = isBroad ? wideData : conData;
    out.push(lx, h - 0.2, lz, sx, sy, sz, tr, tg, tb);
  }

  const treeGroup = new THREE.Group();
  treeGroup.name  = `trees-cone-${p.style}`;
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
  });

  // 将一个平铺数组构建为 InstancedMesh
  // Build InstancedMesh from a flat data array [x,y,z,sx,sy,sz,r,g,b, ...]
  function buildInstanced(protoGeom, flatData) {
    if (!flatData.length) return null;
    const count = flatData.length / 9;
    const mesh  = new THREE.InstancedMesh(protoGeom, mat, count);
    mesh.castShadow = mesh.receiveShadow = true;
    const M = new THREE.Matrix4();
    const C = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const b = i * 9;
      M.makeScale(flatData[b+3], flatData[b+4], flatData[b+5]);
      M.setPosition(flatData[b], flatData[b+1], flatData[b+2]);
      mesh.setMatrixAt(i, M);
      mesh.setColorAt(i, C.setRGB(flatData[b+6], flatData[b+7], flatData[b+8]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  const conMesh  = buildInstanced(getConiferGeom(),   conData);
  const wideMesh = buildInstanced(getBroadleafGeom(), wideData);
  if (conMesh)  treeGroup.add(conMesh);
  if (wideMesh) treeGroup.add(wideMesh);
  treeGroup.userData.count = (conData.length + wideData.length) / 9;
  treeGroup.userData.style = p.style;
  return treeGroup;
}
