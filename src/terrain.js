/**
 * terrain.js — 噪声驱动的地形网格生成库
 * terrain.js — Noise-driven terrain mesh generation library
 *
 * 主要功能 / Main features:
 *   - 平原 / 丘陵 / 山脉 三生物群系混合
 *     Plains / Hills / Mountains three-biome blending
 *   - 河流侵蚀（脊线噪声）
 *     River carving via ridged noise
 *   - 气候遮罩：苔原（冷端）/ 沙漠（热端）
 *     Climate masks: tundra (cold pole) / desert (hot pole)
 *   - 沙漠地形抬升以覆盖水系
 *     Desert terrain elevation to suppress water bodies
 *   - 三层噪声顶点着色，模拟真实地表材质
 *     Three-layer noise vertex coloring for realistic surface materials
 *
 * 导出 / Exports:
 *   createTerrainGeometry(options) — 仅几何体 / geometry only
 *   createTerrainMesh(options)     — 含材质的 Mesh / Mesh with material
 *   tempNoise(wx, wz, seed, freq)  — 温度噪声场 / temperature noise field
 *   climateMask(...)               — 寒带遮罩 / cold-zone mask
 *   desertMask(...)                — 热带遮罩 / hot-zone mask
 */

import * as THREE from "../build/three.module.js";
import { makeNoise } from "./noise.js";

// ============================================================
// 工具函数 / Utility functions
// ============================================================

/** 平滑过渡 / Smooth clamped remap from [e0,e1] to [0,1] */
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** 线性插值颜色数组 [r,g,b] / Linear-interpolate two [r,g,b] arrays */
function lerpC(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** 饱和裁切 / Saturating clamp */
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ============================================================
// 颜色调色板（线性 sRGB）
// Color palette (linear sRGB)
// ============================================================
const COL = {
  DIRT:       [0.40, 0.29, 0.18], // 暖色腐殖土 / warm loam
  ROCK:       [0.48, 0.44, 0.40], // 中灰色岩石 / mid-grey rock
  ROCK_D:     [0.27, 0.24, 0.21], // 深色风化岩 / dark weathered rock
  ROCK_W:     [0.58, 0.54, 0.50], // 浅色裸露岩面 / pale exposed face
  GRASS_L:    [0.38, 0.60, 0.22], // 嫩绿春草 / vivid spring green
  GRASS_D:    [0.18, 0.36, 0.13], // 深绿森林草 / deep forest green
  GRASS_DRY:  [0.54, 0.52, 0.24], // 枯黄夏草 / dry summer grass
  SAND:       [0.88, 0.80, 0.60], // 海滩沙 / beach sand
  WATER_DEEP: [0.07, 0.17, 0.30], // 深水 / deep water
  SNOW:       [0.90, 0.93, 0.97], // 略带蓝调的雪 / slightly-blue snow
  DESERT_L:   [0.90, 0.80, 0.55], // 浅色沙漠沙 / light desert sand
  DESERT_D:   [0.72, 0.55, 0.35], // 烘烤沙漠土 / baked desert soil
  DESERT_R:   [0.78, 0.46, 0.28], // 铁氧化物红岩 / iron-oxide red rock
};

// ============================================================
// 生物群系参数
// Biome profiles
// ============================================================

/**
 * 平原：极平坦，振幅极小
 * Plains: very flat, near-zero amplitude
 */
const BIOME_PLAINS    = { AMP: 0.4,  BASE: 0, FREQ_MUL: 1.6,  EXP: 1.0,  MONO: false };

/**
 * 丘陵：中等起伏
 * Hills: moderate relief
 */
const BIOME_HILLS     = { AMP: 18,   BASE: 2, FREQ_MUL: 1.0,  EXP: 1.15, MONO: false };

/**
 * 山脉：高耸，使用单极（MONO）指数以形成陡峭山峰
 * Mountains: tall, uses mono-pole exponent for sharp peaks
 */
const BIOME_MOUNTAINS = { AMP: 200,  BASE: 0, FREQ_MUL: 0.85, EXP: 2.0,  MONO: true  };

/**
 * 标准化常数：生物群系空间输出的最大幅度
 * Normalization constant: maximum biome-space amplitude
 */
const MAX_BIOME_H = 200;

// ============================================================
// 噪声辅助 / Noise helpers
// ============================================================

/**
 * 分形布朗运动（fBm）
 * Fractional Brownian Motion — sums octaves of gradient noise
 *
 * @param {number} wx, wz  — 世界坐标 / world position
 * @param {number} noiseScale — 基础频率 / base frequency
 * @param {number} seed
 * @param {number} octaves
 * @param {number} persistence — 振幅衰减 / amplitude decay
 * @param {number} lacunarity  — 频率增长 / frequency growth
 * @param {number} freqMul     — 额外频率乘数 / extra frequency multiplier
 */
function fbm(wx, wz, noiseScale, seed, octaves, persistence, lacunarity, freqMul) {
  let amp = 1, freq = noiseScale * (freqMul || 1), sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum  += amp * makeNoise(wx * freq, wz * freq, seed + i * 17);
    norm += amp;
    amp  *= persistence;
    freq *= lacunarity;
  }
  return sum / norm;
}

/**
 * 脊线噪声，用于生成河流网络
 * Ridged noise for river network generation
 */
function ridgedNoise(wx, wz, seed) {
  const RIVER_FREQ = 0.005;
  return 1.0 - Math.abs(makeNoise(wx * RIVER_FREQ, wz * RIVER_FREQ, seed + 9999));
}

/**
 * 计算各生物群系的混合权重 [平原, 丘陵, 山脉]
 * Compute blending weights [plains, hills, mountains]
 * 使用噪声驱动的软分类，避免硬边界
 * Uses noise-driven soft classification to avoid hard borders
 */
function biomeWeights(wx, wz, seed) {
  const v = 0.5 + 0.5 * makeNoise(wx * 0.0018, wz * 0.0018, seed + 333);
  // 从平原平滑过渡到丘陵，再到山脉
  // Smooth transition: plains → hills → mountains
  const inHills     = smoothstep(0.45, 0.55, v);
  const inMountains = smoothstep(0.62, 0.75, v);
  return [1 - inHills, inHills - inMountains, inMountains];
}

/**
 * 单生物群系高度采样
 * Sample height for a single biome profile
 */
function biomeHeight(wx, wz, noiseScale, seed, octaves, persistence, lacunarity, profile) {
  const n = fbm(wx, wz, noiseScale, seed, octaves, persistence, lacunarity, profile.FREQ_MUL);
  let shaped;
  if (profile.MONO) {
    // 单极：将 [-1,1] 映射到 [0,1] 再做幂次，产生山峰形状
    // Mono-pole: remap [-1,1] → [0,1] then apply exponent for peaked shapes
    shaped = Math.pow((n + 1) * 0.5, profile.EXP);
  } else {
    // 双极：保留符号，绝对值做幂次，保持平坦度
    // Bi-pole: preserve sign, apply exponent on absolute value for flatness
    const sign = n < 0 ? -1 : 1;
    shaped = sign * Math.pow(Math.abs(n), profile.EXP);
  }
  return shaped * profile.AMP + profile.BASE;
}

// ============================================================
// 气候遮罩（导出供外部使用）
// Climate masks (exported for external use, e.g. tree placement)
// ============================================================

/**
 * 温度噪声场，值域 [0, 1]。
 * 0 = 极寒（苔原），1 = 极热（沙漠）。
 *
 * Temperature noise field, range [0, 1].
 * 0 = arctic (tundra), 1 = equatorial (desert).
 *
 * @param {number} freq — 空间频率；较小值 → 更大的气候区块
 *                        Spatial frequency; smaller = larger climate patches
 */
export function tempNoise(wx, wz, seed, freq = 0.020) {
  return 0.5 + 0.5 * makeNoise(wx * freq, wz * freq, seed + 5151);
}

/**
 * 寒带遮罩：温度越低，返回值越接近 1
 * Cold-zone mask: returns 1 in coldest areas, 0 in warm areas
 */
export function climateMask(wx, wz, seed, freq = 0.020) {
  return smoothstep(0.30, 0.18, tempNoise(wx, wz, seed, freq));
}

/**
 * 热带遮罩：温度越高，返回值越接近 1
 * Hot-zone mask: returns 1 in hottest areas, 0 in cool areas
 */
export function desertMask(wx, wz, seed, freq = 0.020) {
  return smoothstep(0.70, 0.82, tempNoise(wx, wz, seed, freq));
}

// ============================================================
// 世界空间高度采样
// World-space height sampling
// ============================================================

/**
 * 计算世界坐标 (wx, wz) 处的地形高度（世界单位）。
 * Compute terrain elevation at world position (wx, wz) in world units.
 *
 * 包含：生物群系混合 → 河流侵蚀 → 沙漠沙丘 → 沙漠水位抬升
 * Includes: biome blend → river carving → desert dunes → desert water lift
 *
 * @param {number} waterLevelWorld — 水位（世界单位），沙漠区域强制高于此值
 *                                   Water level (world units); desert is forced above this
 * @param {number} climateFreq     — 气候噪声频率 / climate noise frequency
 */
function terrainHeight(wx, wz, noiseScale, seed, octaves, persistence, lacunarity, heightScale,
                        waterLevelWorld, climateFreq) {
  const RIVER_THRESHOLD = 0.90;
  const RIVER_DEPTH     = 8;

  // 生物群系混合高度（生物群系空间，需乘缩放因子）
  // Biome-blended height in biome-space (must multiply by scale factor)
  const w = biomeWeights(wx, wz, seed);
  let h = w[0] * biomeHeight(wx, wz, noiseScale, seed, octaves, persistence, lacunarity, BIOME_PLAINS)
        + w[1] * biomeHeight(wx, wz, noiseScale, seed, octaves, persistence, lacunarity, BIOME_HILLS)
        + w[2] * biomeHeight(wx, wz, noiseScale, seed, octaves, persistence, lacunarity, BIOME_MOUNTAINS);

  // 河流侵蚀：在脊线两侧切出低谷
  // River carving: cut valleys along ridgeline flanks
  const r = ridgedNoise(wx, wz, seed);
  if (r >= RIVER_THRESHOLD) {
    h -= ((r - RIVER_THRESHOLD) / (1 - RIVER_THRESHOLD)) * RIVER_DEPTH;
  }

  // 将生物群系空间高度转换为世界单位
  // Convert biome-space height to world units
  const S    = heightScale / MAX_BIOME_H;
  let   hWorld = h * S;

  // 沙漠沙丘：叉形脊线图案，仅在热区添加
  // Desert dunes: cross-hatch ridge pattern, applied only in hot zones
  const freq = climateFreq != null ? climateFreq : 0.020;
  const tN   = 0.5 + 0.5 * makeNoise(wx * freq, wz * freq, seed + 5151);
  const dw   = smoothstep(0.70, 0.82, tN);
  if (dw > 0) {
    // 两组方向不同的脊线相叠，模拟风成沙丘
    // Two angled ridge sets overlay to simulate aeolian dunes
    const d1 = makeNoise( wx * 0.055 + wz * 0.015, wz * 0.055, seed + 2468);
    const d2 = makeNoise(-wx * 0.015 + wz * 0.055, wx * 0.055, seed + 3579);
    hWorld += dw * (d1 * 0.6 + d2 * 0.4) * 6;

    // 沙漠地形强制高于水位，消除沙漠内的水系
    // Force desert terrain above water level — eliminates water bodies in deserts
    if (waterLevelWorld != null) {
      const desertFloor = waterLevelWorld + 1.0 + dw * 3.0;
      if (hWorld < desertFloor) hWorld += (desertFloor - hWorld) * dw;
    }
  }

  return hWorld;
}

// ============================================================
// 顶点着色
// Per-vertex coloring
// ============================================================

/**
 * 根据高度、坡度、世界坐标及气候遮罩计算顶点颜色。
 * Compute vertex color from height, slope, world position and climate masks.
 *
 * 使用三层噪声叠加形成更丰富的地表变化：
 *   colN  — 中频：草地斑块、岩石条纹
 *   colN2 — 低频：区域整体色调（郁郁葱葱 vs 干旱）
 *   micro — 高频：微纹理 / 模拟 AO
 * Three noise layers for richer surface variation:
 *   colN  — medium freq: grass patches, rock streaks
 *   colN2 — low freq: regional mood (lush vs dry)
 *   micro — high freq: micro-texture / fake AO
 *
 * @param {number} S — heightScale / MAX_BIOME_H 的归一化因子
 *                     Normalisation factor: heightScale / MAX_BIOME_H
 * @param {number} climateFreq — 气候噪声频率 / climate noise frequency
 */
function colorForMaterial(h, slope, wx, wz, seed, S, climateFreq) {
  // 颜色阈值随 heightScale 缩放，保持比例一致
  // Color thresholds scale with heightScale to remain proportional
  const WATER_LEVEL      = -1.5 * S;
  const ROCK_START       =  50  * S;
  const ROCK_FULL        =  90  * S;
  const SNOW_START       =  40  * S;
  const SNOW_FULL        =  90  * S;
  const GRASS_HEIGHT_MAX =  30  * S;
  const SAND_BAND        =   3.0 * S;
  const SAND_UNDERWATER  =   4.0 * S;

  const freq = climateFreq != null ? climateFreq : 0.020;

  // 三层颜色噪声 / Three-layer color noise
  const colN  = 0.5 + 0.5 * makeNoise(wx * 0.038, wz * 0.038, seed + 2233); // 中频 / medium
  const colN2 = 0.5 + 0.5 * makeNoise(wx * 0.010, wz * 0.010, seed + 5566); // 低频 / low
  const micro = 0.5 + 0.5 * makeNoise(wx * 0.090, wz * 0.090, seed + 7788); // 高频 / high

  // 底层：带噪声变化的泥土色
  // Base layer: dirt with noise-driven colour variation
  let col = lerpC(COL.DIRT, [0.34, 0.23, 0.13], colN * 0.35);

  // 岩石层：由高度和坡度共同驱动，三向噪声变化
  // Rock layer: driven by altitude and slope, three-way noise variation
  const rockMix = Math.max(smoothstep(ROCK_START, ROCK_FULL, h),
                            smoothstep(0.45, 0.85, slope));
  if (rockMix > 0) {
    const faceRock = lerpC(COL.ROCK, COL.ROCK_D, clamp(slope * 0.7, 0, 1));
    const rockVar  = lerpC(faceRock, lerpC(COL.ROCK_W, COL.ROCK_D, colN), colN2 * 0.5);
    col = lerpC(col, rockVar, rockMix);
  }

  // 草地层：高度和坡度双重限制，冷暖变化
  // Grass layer: limited by altitude and slope, warm/cool variation
  if (h > WATER_LEVEL && h < GRASS_HEIGHT_MAX) {
    const grassMix = (1 - smoothstep(GRASS_HEIGHT_MAX - 6 * S, GRASS_HEIGHT_MAX, h))
                   * (1 - smoothstep(0.55, 0.65, slope));
    if (grassMix > 0) {
      const baseGrass = lerpC(COL.GRASS_L, COL.GRASS_D, smoothstep(0, GRASS_HEIGHT_MAX, h));
      const varGrass  = lerpC(baseGrass, COL.GRASS_DRY, colN2 * 0.38);
      col = lerpC(col, varGrass, grassMix);
    }
  }

  // 水下色：沙子到深水渐变
  // Underwater: sand to deep-water gradient
  if (h < WATER_LEVEL) {
    col = lerpC(COL.SAND, COL.WATER_DEEP,
                smoothstep(0, SAND_UNDERWATER, WATER_LEVEL - h));
  }

  // 沙滩：水线到陆地的过渡带，坡度越大越不显现
  // Beach: water/land interface band, attenuated on steep slopes
  if (h >= WATER_LEVEL && h < WATER_LEVEL + SAND_BAND) {
    const bandT   = 1 - (h - WATER_LEVEL) / SAND_BAND;
    const slopeOk = 1 - smoothstep(0.3, 0.6, slope);
    col = lerpC(col, COL.SAND, bandT * slopeOk);
  }

  // 沙漠（热区）：铁氧化物条纹叠加
  // Desert (hot zone): iron-oxide streaks overlaid
  if (h > WATER_LEVEL && h < ROCK_START) {
    const desert = desertMask(wx, wz, seed, freq);
    if (desert > 0) {
      const fade = desert
        * (1 - smoothstep(GRASS_HEIGHT_MAX * 0.8, ROCK_START, h))
        * (1 - smoothstep(0.40, 0.70, slope));
      if (fade > 0) {
        const dBase   = lerpC(COL.DESERT_L, COL.DESERT_D, smoothstep(0, GRASS_HEIGHT_MAX * 1.5, h));
        const dVaried = lerpC(dBase, COL.DESERT_R, colN * 0.45);
        col = lerpC(col, dVaried, fade);
      }
    }
  }

  // 高海拔积雪
  // High-altitude snow cover
  const snowMix = smoothstep(SNOW_START, SNOW_FULL, h);
  if (snowMix > 0) {
    const snowShaded = lerpC(COL.SNOW, [0.78, 0.84, 0.92], slope * 0.35 + colN * 0.08);
    col = lerpC(col, snowShaded, snowMix * (1 - smoothstep(1.2, 2.0, slope)));
  }

  // 苔原 / 雪原（寒区）
  // Tundra / snowfield (cold climate zones)
  if (h > WATER_LEVEL) {
    const tundra = climateMask(wx, wz, seed, freq);
    if (tundra > 0) {
      const tundraCol = lerpC(COL.SNOW, [0.82, 0.88, 0.94], 0.30 + colN2 * 0.18);
      col = lerpC(col, tundraCol, tundra * (1 - smoothstep(1.3, 2.0, slope)));
    }
  }

  // 微亮度变化：模拟环境遮蔽与表面粗糙度
  // Micro-brightness: simulates ambient occlusion and surface irregularity
  const bv = 0.87 + micro * 0.26; // [0.87 … 1.13]
  col[0] = clamp(col[0] * bv, 0, 1);
  col[1] = clamp(col[1] * bv, 0, 1);
  col[2] = clamp(col[2] * bv, 0, 1);

  return col;
}

// ============================================================
// 公开 API / Public API
// ============================================================

/**
 * 创建地形 BufferGeometry（不含材质）。
 * Create terrain BufferGeometry (without material).
 *
 * @param {object} options
 * @param {number} options.width, options.depth — 区块尺寸（世界单位）/ chunk size (world units)
 * @param {number} options.segmentsX, options.segmentsY — 网格分辨率 / grid resolution
 * @param {number} options.heightScale — 高度缩放（世界单位）/ height scale in world units
 * @param {number} options.noiseScale  — 基础噪声频率 / base noise frequency
 * @param {number} options.octaves     — fBm 倍频层数 / fBm octave count
 * @param {number} options.persistence — fBm 振幅衰减 / fBm amplitude decay
 * @param {number} options.lacunarity  — fBm 频率增长 / fBm frequency growth
 * @param {number} options.seed        — 随机种子 / random seed
 * @param {number} options.worldOffsetX, options.worldOffsetZ — 区块中心世界坐标
 *                                                               Chunk center in world space
 * @param {number} [options.waterLevelWorld] — 水位（世界单位），沙漠抬升依据
 *                                              Water level for desert suppression
 * @param {number} [options.climateFreq]     — 气候噪声频率 / climate noise frequency
 */
export function createTerrainGeometry({
  width        = 128,
  depth        = 128,
  segmentsX    = 64,
  segmentsY    = 64,
  heightScale  = 200,
  noiseScale   = 0.008,
  octaves      = 6,
  persistence  = 0.55,
  lacunarity   = 2.1,
  seed         = 0,
  worldOffsetX = 0,
  worldOffsetZ = 0,
  waterLevelWorld = null,
  climateFreq  = 0.020,
} = {}) {
  const vertexCount = (segmentsX + 1) * (segmentsY + 1);
  const positions   = new Float32Array(vertexCount * 3);
  const uvs         = new Float32Array(vertexCount * 2);
  const indices     = new Uint32Array(segmentsX * segmentsY * 6);
  const colors      = new Float32Array(vertexCount * 3);

  const halfWidth = width  * 0.5;
  const halfDepth = depth  * 0.5;
  const S         = heightScale / MAX_BIOME_H; // 高度归一化因子 / height normalisation factor

  // 通用参数对象（避免重复传参）
  // Common parameter bundle to avoid repetitive argument passing
  const np = { noiseScale, seed, octaves, persistence, lacunarity, heightScale, waterLevelWorld, climateFreq };

  // ── 第一遍：位置与 UV / Pass 1: positions and UVs ──────────
  let pi = 0, ui = 0;
  for (let row = 0; row <= segmentsY; row++) {
    const v  = row / segmentsY;
    const lz = v * depth - halfDepth;   // 局部 Z [-depth/2, +depth/2] / local Z
    const wz = lz + worldOffsetZ;       // 世界 Z / world Z

    for (let col = 0; col <= segmentsX; col++) {
      const u  = col / segmentsX;
      const lx = u * width - halfWidth;
      const wx = lx + worldOffsetX;
      const elevation = terrainHeight(wx, wz,
        np.noiseScale, np.seed, np.octaves, np.persistence, np.lacunarity,
        np.heightScale, np.waterLevelWorld, np.climateFreq);

      positions[pi++] = lx;
      positions[pi++] = elevation;
      positions[pi++] = lz;
      uvs[ui++] = u;
      uvs[ui++] = v;
    }
  }

  // ── 索引 / Indices ──────────────────────────────────────────
  let ii = 0;
  for (let row = 0; row < segmentsY; row++) {
    for (let col = 0; col < segmentsX; col++) {
      const a = row * (segmentsX + 1) + col;
      const b = a + 1;
      const c = a + segmentsX + 1;
      const d = c + 1;
      indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
      indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
    }
  }

  // ── 构建几何体，计算法线 / Build geometry, compute normals ──
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv",       new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  // ── 第二遍：逐顶点着色 / Pass 2: per-vertex coloring ────────
  const posAttr = geometry.getAttribute("position");
  const stride  = segmentsX + 1;
  const dx      = width  / segmentsX;
  const dz      = depth  / segmentsY;

  for (let i = 0; i < vertexCount; i++) {
    const row = Math.floor(i / stride);
    const col = i - row * stride;

    // 用相邻顶点高度估算坡度 / Estimate slope from neighbor heights
    const hL = posAttr.getY(row * stride + Math.max(col - 1, 0));
    const hR = posAttr.getY(row * stride + Math.min(col + 1, segmentsX));
    const hT = posAttr.getY(Math.max(row - 1, 0) * stride + col);
    const hB = posAttr.getY(Math.min(row + 1, segmentsY) * stride + col);
    const sx  = (hR - hL) / (2 * dx);
    const sz  = (hB - hT) / (2 * dz);
    const slope = Math.sqrt(sx * sx + sz * sz);

    const h   = posAttr.getY(i);
    const lx  = posAttr.getX(i);
    const lz2 = posAttr.getZ(i);
    const c   = colorForMaterial(h, slope, lx + worldOffsetX, lz2 + worldOffsetZ, seed, S, climateFreq);

    colors[i * 3]     = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * 创建含 MeshStandardMaterial 的地形 Mesh。
 * Create a terrain Mesh with MeshStandardMaterial.
 *
 * 接受与 createTerrainGeometry 相同的选项，额外支持：
 * Accepts the same options as createTerrainGeometry, plus:
 * @param {THREE.Material} [options.material] — 自定义材质（可选）/ custom material (optional)
 */
export function createTerrainMesh(options = {}) {
  const geometry = createTerrainGeometry(options);
  const material = options.material || new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading:  false,
    roughness:    0.88,
    metalness:    0.03,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  return mesh;
}
