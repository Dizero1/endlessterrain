// 全局错误捕获：将未处理异常显示在屏幕中央
// Global error handler: display unhandled exceptions on screen
window.addEventListener('error', function(e) {
  const el = document.getElementById('error');
  el.style.display = 'block';
  el.textContent = 'Error: ' + (e.message || e) + '\n\n' + (e.error && e.error.stack || '');
});

// 用 IIFE 包裹全部代码，避免污染全局命名空间
// Wrap everything in an IIFE to avoid polluting the global namespace
(function() {
'use strict';

// ============================================================
// 极简数学库 / MINIMAL MATH LIBRARY
// 替代 three.js 的 Vector3 / Matrix4，避免引入外部依赖
// Replaces three.js Vector3 / Matrix4 to avoid external dependencies
// 所有矩阵均为列主序 Float32Array(16)，与 WebGL 一致
// All matrices are column-major Float32Array(16), matching WebGL convention
// ============================================================
const M4 = {
  identity: function() {
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  },
  perspective: function(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f/aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far+near)*nf, -1,
      0, 0, 2*far*near*nf, 0
    ]);
  },
  lookAt: function(ex, ey, ez, cx, cy, cz, ux, uy, uz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz;
    let l = 1 / Math.hypot(zx, zy, zz);
    zx *= l; zy *= l; zz *= l;
    let xx = uy * zz - uz * zy;
    let xy = uz * zx - ux * zz;
    let xz = ux * zy - uy * zx;
    l = 1 / Math.hypot(xx, xy, xz);
    xx *= l; xy *= l; xz *= l;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx*ex + xy*ey + xz*ez),
      -(yx*ex + yy*ey + yz*ez),
      -(zx*ex + zy*ey + zz*ez),
      1
    ]);
  },
  multiply: function(a, b) {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k*4+j] * b[i*4+k];
        o[i*4+j] = s;
      }
    }
    return o;
  },
  translate: function(m, x, y, z) {
    const o = new Float32Array(m);
    o[12] = m[0]*x + m[4]*y + m[8]*z  + m[12];
    o[13] = m[1]*x + m[5]*y + m[9]*z  + m[13];
    o[14] = m[2]*x + m[6]*y + m[10]*z + m[14];
    o[15] = m[3]*x + m[7]*y + m[11]*z + m[15];
    return o;
  }
};

// ============================================================
// 改进版 Perlin 噪声 / IMPROVED PERLIN NOISE (Ken Perlin, 2002)
// 内联实现，无需外部库；z 轴用于传入 SEED 偏移以区分不同噪声层
// Inlined implementation; z-axis carries SEED offset to distinguish noise layers
// ============================================================
function makeNoise() {
  const p = new Array(512);
  const perm = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
  for (let i = 0; i < 256; i++) p[i] = p[i + 256] = perm[i];

  function fade(t) { return t*t*t*(t*(t*6-15)+10); }
  function lerp(a, b, t) { return a + t*(b-a); }
  function grad(h, x, y, z) {
    const g = h & 15;
    const u = g < 8 ? x : y;
    const v = g < 4 ? y : (g === 12 || g === 14 ? x : z);
    return ((g & 1) === 0 ? u : -u) + ((g & 2) === 0 ? v : -v);
  }

  return function(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X]+Y, AA = p[A]+Z, AB = p[A+1]+Z;
    const B = p[X+1]+Y, BA = p[B]+Z, BB = p[B+1]+Z;
    return lerp(
      lerp(
        lerp(grad(p[AA],   x,  y,  z), grad(p[BA],   x-1,y,  z), u),
        lerp(grad(p[AB],   x,  y-1,z), grad(p[BB],   x-1,y-1,z), u), v),
      lerp(
        lerp(grad(p[AA+1], x,  y,  z-1), grad(p[BA+1], x-1,y,  z-1), u),
        lerp(grad(p[AB+1], x,  y-1,z-1), grad(p[BB+1], x-1,y-1,z-1), u), v),
      w);
  };
}

// ============================================================
// 全局配置 / GLOBAL CONFIG
// 所有可调参数集中在此处，修改后重新生成区块即可看到效果
// All tuneable parameters in one place; regenerate chunks to see changes
// ============================================================
const CONFIG = {
  // ---- 区块系统 / Chunk system ----
  CHUNK_SIZE: 128,       // 每个区块的世界单位边长 / World-unit side length per chunk
  CHUNK_RES:  48,        // 每个区块的顶点格数（48×48 格 = 2304 顶点）/ Vertex grid per chunk
  VIEW_DISTANCE:   8,    // 加载半径（区块数），圆形范围 / Load radius in chunks, circular
  UNLOAD_DISTANCE: 10,   // 卸载半径，须大于加载半径以防边界抖动 / Unload radius, must exceed VIEW_DISTANCE

  // ---- 生物群落分布 / Biome distribution ----
  // 低频噪声场将世界划分为平原/丘陵/山地三类区域
  // A low-frequency noise field partitions the world into plains/hills/mountains
  BIOME_FREQ:       0.0018, // 生物群落噪声频率（越小 → 群落越大）/ Biome noise frequency (smaller = larger biomes)
  BIOME_BLEND:      0.10,   // 群落边界过渡宽度 / Biome transition blend width
  PLAINS_THRESHOLD: 0.50,   // 噪声低于此值 → 平原 / Noise below this = plains
  HILLS_THRESHOLD:  0.65,   // 噪声在两阈值之间 → 丘陵 / Between thresholds = hills

  // ---- 各群落高度参数 / Per-biome height profiles ----
  // MODE:'sym'  — 对称模式，地形可上可下（适合平原/丘陵）
  //               Symmetric: terrain rises and falls (plains, hills)
  // MODE:'mono' — 单调模式，噪声映射到 [0,1] 后取幂，地形只升不降（适合山地）
  //               Monotonic: noise remapped to [0,1] then exponentiated, terrain only rises (mountains)
  PLAINS:    { AMP: 0.4,  BASE: 0,   FREQ_MUL: 1.6,  EXPONENT: 1.0,  MODE: 'sym'  },
  HILLS:     { AMP: 18,   BASE: 2,   FREQ_MUL: 1.0,  EXPONENT: 1.15, MODE: 'sym'  },
  MOUNTAINS: { AMP: 200,  BASE: 0,   FREQ_MUL: 0.85, EXPONENT: 2.0,  MODE: 'mono' },

  // ---- 分形布朗运动噪声 / Fractal Brownian Motion noise ----
  NOISE_FREQ:   0.008, // 基础采样频率 / Base sampling frequency
  OCTAVES:      6,     // 叠加层数（越多细节越丰富，性能越低）/ Octave count (more = richer detail, slower)
  PERSISTENCE:  0.55,  // 每层振幅衰减系数 / Amplitude decay per octave
  LACUNARITY:   2.1,   // 每层频率增长系数 / Frequency growth per octave

  // ---- 水体 / Water ----
  WATER_LEVEL:      -1.5, // 水面高度，低于此值的地形被视为水下 / Water surface height
  RIVER_FREQ:       0.005, // 山脊噪声频率，控制河流弯曲程度 / Ridge noise frequency for rivers
  RIVER_THRESHOLD:  0.90,  // 超过此值的山脊噪声形成河床 / Ridge noise above this creates riverbeds
  RIVER_DEPTH:      8,     // 河床最大下切深度 / Maximum riverbed carving depth

  // ---- 地表材质阈值 / Surface material thresholds ----
  ROCK_START:       50,   // 此高度以上开始出现岩石 / Rock starts appearing above this height
  ROCK_FULL:        90,   // 此高度以上完全为岩石 / Fully rock above this height
  SNOW_START:       40,   // 积雪开始出现的高度 / Snow starts appearing above this height
  SNOW_FULL:        90,   // 完全积雪的高度 / Fully snow-covered above this height
  GRASS_SLOPE_MAX:  0.65, // 草地允许的最大坡度（超过则被岩石替代）/ Max slope for grass (rock above this)
  GRASS_HEIGHT_MAX: 30,   // 草地允许的最大高度 / Max height for grass
  SAND_BAND:        1.2,  // 水面上方的沙滩带宽度 / Sand band width above water level
  SAND_UNDERWATER:  2.5,  // 水下此深度内为沙底，再深变为深水色 / Sand-to-deep-water transition depth

  // ---- 平原裸露岩石 / Plains exposed rock outcrops ----
  // 两层噪声叠加：n1 决定整体轮廓，n2 打碎边缘
  // Two noise layers: n1 shapes patches, n2 breaks edges for a natural look
  PLAINS_ROCK_FREQ:       0.045, // 噪声频率（越大岩石块越碎小）/ Noise frequency (higher = smaller patches)
  PLAINS_ROCK_THRESHOLD:  0.68,  // 超过此值才显示岩石（≈10% 覆盖率）/ Threshold for rock display (≈10% coverage)
  PLAINS_ROCK_HEIGHT_MAX: 6,     // 只在此海拔以下生成 / Only generated below this elevation
  PLAINS_ROCK_SLOPE_MAX:  0.25,  // 只在平缓坡面生成 / Only on gentle slopes

  // ---- 树木 / Trees ----
  // 用 ANGLE_instanced_arrays 实例化绘制，两种原型：针叶树与阔叶树
  // Rendered via ANGLE_instanced_arrays instancing; two prototypes: conifer and broadleaf
  TREES_ENABLED:       true,  // 总开关 / Master switch
  TREES_PER_CHUNK:     500,   // 每区块尝试放置的树木候选数 / Placement candidates per chunk
  FOREST_FREQ:         0.0035, // 森林遮罩噪声频率 / Forest mask noise frequency
  FOREST_THRESHOLD:    0.65,  // 超过此值为森林区（密集）/ Above this = forest zone (dense)
  FOREST_DENSITY:      0.85,  // 森林区接受率 / Acceptance rate in forest zones
  SPARSE_DENSITY:      0.04,  // 非森林区接受率（稀疏散树）/ Acceptance rate outside forest (sparse)
  TREE_MIN_HEIGHT:     0.5,   // 树木最低生长海拔（水面以上）/ Min tree height above water
  TREE_MAX_HEIGHT:     38,    // 树木最高生长海拔 / Max tree height
  TREE_MAX_SLOPE:      0.7,   // 树木可生长的最大坡度 / Max slope for trees
  TREE_BASE_SCALE:     16,    // 树木基础缩放比例 / Base scale factor
  TREE_SCALE_VAR:      6,     // 缩放随机浮动范围 / Scale variation range
  TREE_BROADLEAF_PROB: 0.45,  // 阔叶树出现概率（其余为针叶树）/ Broadleaf probability (rest are conifers)
  TREE_MIN_DIST:       18,    // 任意两棵树的最小中心距离（世界单位）/ Min center-to-center distance between trees

  // ---- 气候 / 雪原 / Climate / Snowfield (tundra) ----
  // 独立低频遮罩，与生物群落系统无关，控制地表大面积积雪
  // Independent low-frequency mask, separate from biomes, controls large-scale ground snow
  SNOWFIELD_FREQ:       0.0030, // 雪原遮罩频率 / Tundra mask frequency
  SNOWFIELD_THRESHOLD:  0.62,   // 超过此值为冻土带 / Above this = tundra
  SNOWFIELD_BLEND:      0.06,   // 冻土边界过渡宽度 / Tundra edge blend width
  TREE_TUNDRA_SUPPRESS: 0.85,   // 冻土带树木密度抑制系数 / Tree density suppression in tundra
};

// 材质调色板：每种材质对应一个 [R, G, B] 线性颜色值（范围 0~1）
// Material palette: each entry is a linear [R, G, B] color (range 0–1)
const COL = {
  DIRT:       [0.43, 0.32, 0.22], // 裸土 / Bare earth
  ROCK:       [0.46, 0.43, 0.40], // 浅灰褐岩石 / Light grey-brown rock
  ROCK_D:     [0.30, 0.28, 0.27], // 深色岩石（裂缝/阴影面）/ Dark rock (crevices/shadowed faces)
  GRASS_L:    [0.42, 0.62, 0.30], // 亮草地 / Bright grass
  GRASS_D:    [0.22, 0.40, 0.20], // 暗草地（高海拔）/ Dark grass (higher elevation)
  SAND:       [0.86, 0.78, 0.58], // 沙滩 / Sand / beach
  WATER_DEEP: [0.10, 0.22, 0.36], // 深水区湖底 / Deep water lakebed
  SNOW:       [0.94, 0.96, 0.97], // 积雪 / Snow
  SKY:        [0.78, 0.85, 0.91], // 天空色（同时用作雾色）/ Sky color (also used as fog color)
  WATER:      [0.29, 0.56, 0.72], // 水面 / Water surface
  TRUNK:      [0.32, 0.21, 0.13], // 树干深棕 / Tree trunk dark brown
  FOLIAGE_L:  [0.20, 0.42, 0.18], // 树冠亮色（顶部受光）/ Bright foliage (lit top)
  FOLIAGE_D:  [0.10, 0.26, 0.12], // 树冠暗色（底部背光）/ Dark foliage (shadowed underside)
};

function lerpC(a, b, t) {
  return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
}
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ============================================================
// 噪声驱动的地形函数 / NOISE-DRIVEN TERRAIN FUNCTIONS
// ============================================================
// 创建全局噪声采样器（单例，整个程序共用同一张置换表）
// Create global noise sampler (singleton, shared permutation table)
const noise3 = makeNoise();

// ============================================================
// 种子系统 / SEED SYSTEM
// 支持纯整数（直接使用）或任意字符串（FNV-1a 哈希转数字）
// Supports plain integers (used directly) or any string (hashed via FNV-1a)
// 示例 / Examples:
//   "42"      → SEED = 42   （与硬编码默认值一致 / matches hard-coded default）
//   "hello"   → SEED = FNV1a("hello") % 1000000
// ============================================================
function parseSeed(str) {
  str = String(str).trim();
  if (/^-?\d+$/.test(str)) {
    // 纯整数：直接转换，取绝对值保证为正
    return Math.abs(parseInt(str, 10)) % 1000000;
  }
  // 字符串：FNV-1a 32-bit 哈希
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 1000000;
}

let SEED = parseSeed('42'); // 默认种子，数值与原来的 42 一致

function fbm(x, z, freqMul) {
  freqMul = freqMul || 1;
  let amp = 1, freq = CONFIG.NOISE_FREQ * freqMul, sum = 0, norm = 0;
  for (let i = 0; i < CONFIG.OCTAVES; i++) {
    sum += amp * noise3(x * freq, z * freq, SEED + i * 17);
    norm += amp;
    amp *= CONFIG.PERSISTENCE;
    freq *= CONFIG.LACUNARITY;
  }
  return sum / norm;
}

function ridgedNoise(x, z) {
  return 1.0 - Math.abs(noise3(x * CONFIG.RIVER_FREQ, z * CONFIG.RIVER_FREQ, SEED + 9999));
}

// ============================================================
// 生物群落系统 / BIOME SYSTEM
// 低频噪声场对每个 (x,z) 采样，通过两个阈值量化为三类群落
// A low-frequency noise field is sampled at each (x,z) and quantised
// into three biome types via two thresholds.
// 输出为三权重元组 (wPlains, wHills, wMountains)，之和为 1
// Output is a triple of weights (wPlains, wHills, wMountains) summing to 1
// ============================================================
function biomeWeights(x, z) {
  const v = 0.5 + 0.5 * noise3(x * CONFIG.BIOME_FREQ, z * CONFIG.BIOME_FREQ, SEED + 333);

  const t1 = CONFIG.PLAINS_THRESHOLD;
  const t2 = CONFIG.HILLS_THRESHOLD;
  const b  = CONFIG.BIOME_BLEND;

  const inHillsOrAbove = smoothstep(t1 - b, t1 + b, v);
  const inMountains    = smoothstep(t2 - b, t2 + b, v);
  const wPlains    = 1 - inHillsOrAbove;
  const wMountains = inMountains;
  const wHills     = inHillsOrAbove - inMountains;
  return [wPlains, wHills, wMountains];
}

function biomeHeight(x, z, profile) {
  const n = fbm(x, z, profile.FREQ_MUL);
  let shaped;
  if (profile.MODE === 'mono') {
    const u = (n + 1) * 0.5;
    shaped = Math.pow(u, profile.EXPONENT);
  } else {
    const sign = n < 0 ? -1 : 1;
    shaped = sign * Math.pow(Math.abs(n), profile.EXPONENT);
  }
  return shaped * profile.AMP + profile.BASE;
}

function baseHeight(x, z) {
  const w = biomeWeights(x, z);
  return (
    w[0] * biomeHeight(x, z, CONFIG.PLAINS) +
    w[1] * biomeHeight(x, z, CONFIG.HILLS) +
    w[2] * biomeHeight(x, z, CONFIG.MOUNTAINS)
  );
}

function riverMask(x, z) {
  const r = ridgedNoise(x, z);
  if (r < CONFIG.RIVER_THRESHOLD) return 0;
  return (r - CONFIG.RIVER_THRESHOLD) / (1 - CONFIG.RIVER_THRESHOLD);
}

function terrainHeight(x, z) {
  let h = baseHeight(x, z);
  const r = riverMask(x, z);
  if (r > 0) h -= r * CONFIG.RIVER_DEPTH;
  return h;
}

// ============================================================
// 气候系统 / CLIMATE SYSTEM
// 独立低频噪声遮罩，将部分区域标记为"冻土带"（积雪覆盖）
// Independent low-frequency mask that classifies regions as tundra (snow-covered)
// 与生物群落系统完全独立，因此冻土可与任意群落叠加
// Completely independent from the biome system, so tundra can overlap any biome
// 返回值 0 = 正常地带，1 = 完全冻土 / Returns 0 = normal, 1 = full tundra
// ============================================================
function climateMask(x, z) {
  const v = 0.5 + 0.5 * noise3(x * CONFIG.SNOWFIELD_FREQ, z * CONFIG.SNOWFIELD_FREQ, SEED + 5151);
  const t = CONFIG.SNOWFIELD_THRESHOLD;
  const b = CONFIG.SNOWFIELD_BLEND;
  return smoothstep(t - b, t + b, v);
}

// ============================================================
// 分层材质涂层 / LAYERED MATERIAL PAINTER
// 按顺序逐层叠加，后一层覆盖前一层（与 Photoshop 图层类似）
// Layers are applied in order; each layer paints over the previous one
// 涂层顺序 / Layer order:
//   1. 泥土（基底）        Dirt (base)
//   2. 岩石（高海拔或陡坡）Rock (high elevation or steep slope)
//   3. 草地（低海拔平缓坡）Grass (low elevation, gentle slope)
//   3.5 平原裸岩（≈10%）   Plains rock outcrops (≈10% of flat plains)
//   4. 水下（湖底/河床）   Underwater (lakebed / riverbed)
//   5. 沙滩（水线附近）    Sand (near waterline)
//   6. 雪帽（高峰积雪）    Snow cap (high peaks)
//   7. 冻土（气候驱动积雪）Tundra (climate-driven snowfield)
// ============================================================
function colorForMaterial(h, slope, wx, wz) {
  let col = COL.DIRT.slice();

  const rockFromHeight = smoothstep(CONFIG.ROCK_START, CONFIG.ROCK_FULL, h);
  const rockFromSlope  = smoothstep(0.45, 0.85, slope);
  const rockMix = Math.max(rockFromHeight, rockFromSlope);
  if (rockMix > 0) {
    const rockShade = lerpC(COL.ROCK, COL.ROCK_D, Math.min(slope * 0.7, 1));
    col = lerpC(col, rockShade, rockMix);
  }

  if (h > CONFIG.WATER_LEVEL && h < CONFIG.GRASS_HEIGHT_MAX) {
    const heightFalloff = 1 - smoothstep(CONFIG.GRASS_HEIGHT_MAX - 6, CONFIG.GRASS_HEIGHT_MAX, h);
    const slopeFalloff  = 1 - smoothstep(CONFIG.GRASS_SLOPE_MAX - 0.1, CONFIG.GRASS_SLOPE_MAX, slope);
    const grassMix = heightFalloff * slopeFalloff;
    if (grassMix > 0) {
      const tShade = smoothstep(0, CONFIG.GRASS_HEIGHT_MAX, h);
      const grassShade = lerpC(COL.GRASS_L, COL.GRASS_D, tShade);
      col = lerpC(col, grassShade, grassMix);
    }
  }

  // -- step 3.5: 平原裸露岩石（约 10% 概率出现在平坦低海拔地面）
  // 条件：高于沙滩带、低于平原最大海拔、坡度平缓
  if (h > CONFIG.WATER_LEVEL + CONFIG.SAND_BAND &&
      h < CONFIG.PLAINS_ROCK_HEIGHT_MAX &&
      slope < CONFIG.PLAINS_ROCK_SLOPE_MAX) {
    // n1：低频，决定岩石块的整体轮廓
    const n1 = 0.5 + 0.5 * noise3(wx * CONFIG.PLAINS_ROCK_FREQ,
                                   wz * CONFIG.PLAINS_ROCK_FREQ, SEED + 7070);
    // n2：高频（约 2.8 倍），打碎边缘使块状岩石看起来不规则
    const n2 = 0.5 + 0.5 * noise3(wx * CONFIG.PLAINS_ROCK_FREQ * 2.8,
                                   wz * CONFIG.PLAINS_ROCK_FREQ * 2.8, SEED + 8080);
    // 加权混合：大轮廓为主，细节为辅
    const rockPatch = n1 * 0.65 + n2 * 0.35;
    // smoothstep 过渡，避免岩石边缘硬切
    const t = smoothstep(CONFIG.PLAINS_ROCK_THRESHOLD,
                         CONFIG.PLAINS_ROCK_THRESHOLD + 0.08, rockPatch);
    if (t > 0) {
      // 用 n2 给每块岩石添加微妙的明暗变化，避免千篇一律
      const rockShade = lerpC(COL.ROCK, COL.ROCK_D, n2 * 0.5);
      col = lerpC(col, rockShade, t * 0.9);
    }
  }

  if (h < CONFIG.WATER_LEVEL) {
    const depth = CONFIG.WATER_LEVEL - h;
    const t = smoothstep(0, CONFIG.SAND_UNDERWATER, depth);
    col = lerpC(COL.SAND, COL.WATER_DEEP, t);
  }

  if (h >= CONFIG.WATER_LEVEL && h < CONFIG.WATER_LEVEL + CONFIG.SAND_BAND) {
    const bandT = 1 - (h - CONFIG.WATER_LEVEL) / CONFIG.SAND_BAND;
    const slopeOk = 1 - smoothstep(0.3, 0.6, slope);
    const sandMix = bandT * slopeOk;
    col = lerpC(col, COL.SAND, sandMix);
  }

  const snowMix = smoothstep(CONFIG.SNOW_START, CONFIG.SNOW_FULL, h);
  if (snowMix > 0) {
    const stick = 1 - smoothstep(1.2, 2.0, slope);
    col = lerpC(col, COL.SNOW, snowMix * stick);
  }

  if (h > CONFIG.WATER_LEVEL) {
    const tundra = climateMask(wx, wz);
    if (tundra > 0) {
      const cliffShed = 1 - smoothstep(1.3, 2.0, slope);
      const tundraCol = lerpC(COL.SNOW, [0.86, 0.91, 0.95], 0.3);
      col = lerpC(col, tundraCol, tundra * cliffShed);
    }
  }

  return col;
}

// ============================================================
// WebGL 初始化 / WEBGL SETUP
// 获取 canvas 上下文，配置基础渲染状态
// Acquire canvas context and configure base render state
// ============================================================
const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl', { antialias: true, depth: true });
if (!gl) {
  document.getElementById('error').style.display = 'block';
  document.getElementById('error').textContent = 'WebGL not available in this browser.';
  return;
}

function resize() {
  canvas.width  = innerWidth  * Math.min(devicePixelRatio, 2);
  canvas.height = innerHeight * Math.min(devicePixelRatio, 2);
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  gl.viewport(0, 0, canvas.width, canvas.height);
}
resize();
window.addEventListener('resize', resize);

gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);
gl.cullFace(gl.BACK);
gl.clearColor(COL.SKY[0], COL.SKY[1], COL.SKY[2], 1);

const instExt = gl.getExtension('ANGLE_instanced_arrays');
if (!instExt) {
  console.warn('ANGLE_instanced_arrays not available; trees will be disabled');
  CONFIG.TREES_ENABLED = false;
}

const depthExt = gl.getExtension('WEBGL_depth_texture');
const SHADOW_SUPPORTED = !!depthExt;
let SHADOWS_ENABLED = SHADOW_SUPPORTED;
if (!SHADOW_SUPPORTED) {
  console.warn('WEBGL_depth_texture not available; shadows will be disabled');
}

M4.ortho = function(l, r, b, t, n, f) {
  const w = r - l, h = t - b, d = f - n;
  return new Float32Array([
    2/w, 0,   0,   0,
    0,   2/h, 0,   0,
    0,   0,  -2/d, 0,
    -(r+l)/w, -(t+b)/h, -(f+n)/d, 1
  ]);
};

// ============================================================
// 着色器程序 / SHADER PROGRAMS
// 地形：顶点色 + Lambert 漫反射 + 半球环境光 + 阴影贴图 + 雾效
// Terrain: vertex color + Lambert diffuse + hemisphere ambient + shadow map + fog
// 水面：半透明，带正弦/余弦波纹动画
// Water: translucent, with sine/cosine ripple animation
// ============================================================
function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile error: ' + gl.getShaderInfoLog(s) + '\n' + src);
  }
  return s;
}
function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

const TERRAIN_VS = `
  attribute vec3 aPos;
  attribute vec3 aNormal;
  attribute vec3 aColor;
  uniform mat4 uVP;
  uniform mat4 uSunVP;
  uniform vec3 uOffset;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vFogDist;
  varying vec4 vSunSpace;
  void main() {
    vec3 world = aPos + uOffset;
    gl_Position = uVP * vec4(world, 1.0);
    vNormal = aNormal;
    vColor = aColor;
    vFogDist = gl_Position.w;
    vSunSpace = uSunVP * vec4(world, 1.0);
  }
`;

const TERRAIN_FS = `
  precision mediump float;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vFogDist;
  varying vec4 vSunSpace;
  uniform vec3 uSunDir;
  uniform vec3 uSkyCol;
  uniform vec3 uGroundCol;
  uniform vec3 uFogCol;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform sampler2D uShadowMap;
  uniform float uShadowMapSize;
  uniform float uShadowsEnabled;

  float sampleShadow() {
    if (uShadowsEnabled < 0.5) return 1.0;
    vec3 sc = vSunSpace.xyz / vSunSpace.w;
    sc = sc * 0.5 + 0.5;
    if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
    float bias = 0.0015;
    float currentDepth = sc.z - bias;
    float texel = 1.0 / uShadowMapSize;
    float shadow = 0.0;
    for (int x = 0; x < 2; x++) {
      for (int y = 0; y < 2; y++) {
        vec2 offs = vec2(float(x) - 0.5, float(y) - 0.5) * texel;
        float closest = texture2D(uShadowMap, sc.xy + offs).r;
        shadow += currentDepth < closest ? 1.0 : 0.0;
      }
    }
    return shadow * 0.25;
  }

  void main() {
    vec3 n = normalize(vNormal);
    float hemi = 0.5 + 0.5 * n.y;
    vec3 ambient = mix(uGroundCol, uSkyCol, hemi) * 0.55;
    float diff = max(dot(n, uSunDir), 0.0);
    float shadow = sampleShadow();
    vec3 lit = vColor * (ambient + vec3(1.0, 0.96, 0.86) * diff * 0.9 * shadow);
    float fog = clamp((vFogDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    gl_FragColor = vec4(mix(lit, uFogCol, fog), 1.0);
  }
`;

const WATER_VS = `
  attribute vec3 aPos;
  uniform mat4 uVP;
  uniform vec3 uOffset;
  varying float vFogDist;
  varying vec2 vWorldXZ;
  void main() {
    vec3 world = aPos + uOffset;
    gl_Position = uVP * vec4(world, 1.0);
    vFogDist = gl_Position.w;
    vWorldXZ = world.xz;
  }
`;

const WATER_FS = `
  precision mediump float;
  varying float vFogDist;
  varying vec2 vWorldXZ;
  uniform vec3 uWaterCol;
  uniform vec3 uFogCol;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uTime;
  void main() {
    float ripple = 0.5 + 0.5 * sin(vWorldXZ.x * 0.08 + uTime * 0.6)
                       * cos(vWorldXZ.y * 0.08 + uTime * 0.4);
    vec3 col = uWaterCol * (0.85 + 0.15 * ripple);
    float fog = clamp((vFogDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    gl_FragColor = vec4(mix(col, uFogCol, fog), 0.78);
  }
`;

const terrainProg = program(TERRAIN_VS, TERRAIN_FS);
const waterProg   = program(WATER_VS,   WATER_FS);

// ============================================================
// 树木着色器与共享几何体 / TREE SHADER & SHARED GEOMETRY
// 使用 ANGLE_instanced_arrays 实例化渲染，一次 draw call 绘制同类型所有树木
// Uses ANGLE_instanced_arrays instancing; one draw call per prototype renders all trees
// 每棵树的逐实例属性：aIPos（位置）| aIScale（三轴缩放）| aIColor（颜色色调）
// Per-instance attributes: aIPos (position) | aIScale (per-axis scale) | aIColor (color tint)
// ============================================================
const TREE_VS = `
  attribute vec3 aPos;
  attribute vec3 aNormal;
  attribute vec3 aColor;
  attribute vec3 aIPos;
  attribute vec3 aIScale;
  attribute vec3 aIColor;
  uniform mat4 uVP;
  uniform mat4 uSunVP;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vFogDist;
  varying vec4 vSunSpace;
  void main() {
    vec3 world = vec3(aPos.x * aIScale.x, aPos.y * aIScale.y, aPos.z * aIScale.z) + aIPos;
    gl_Position = uVP * vec4(world, 1.0);
    vNormal = vec3(aNormal.x / aIScale.x, aNormal.y / aIScale.y, aNormal.z / aIScale.z);
    vColor = aColor * aIColor;
    vFogDist = gl_Position.w;
    vSunSpace = uSunVP * vec4(world, 1.0);
  }
`;
const TREE_FS = `
  precision mediump float;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vFogDist;
  varying vec4 vSunSpace;
  uniform vec3 uSunDir;
  uniform vec3 uSkyCol;
  uniform vec3 uGroundCol;
  uniform vec3 uFogCol;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform sampler2D uShadowMap;
  uniform float uShadowMapSize;
  uniform float uShadowsEnabled;
  float sampleShadow() {
    if (uShadowsEnabled < 0.5) return 1.0;
    vec3 sc = vSunSpace.xyz / vSunSpace.w;
    sc = sc * 0.5 + 0.5;
    if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
    float bias = 0.002;
    float currentDepth = sc.z - bias;
    float texel = 1.0 / uShadowMapSize;
    float shadow = 0.0;
    for (int x = 0; x < 2; x++) {
      for (int y = 0; y < 2; y++) {
        vec2 offs = vec2(float(x) - 0.5, float(y) - 0.5) * texel;
        float closest = texture2D(uShadowMap, sc.xy + offs).r;
        shadow += currentDepth < closest ? 1.0 : 0.0;
      }
    }
    return shadow * 0.25;
  }
  void main() {
    vec3 n = normalize(vNormal);
    float hemi = 0.5 + 0.5 * n.y;
    vec3 ambient = mix(uGroundCol, uSkyCol, hemi) * 0.6;
    float diff = max(dot(n, uSunDir), 0.0);
    float shadow = sampleShadow();
    vec3 lit = vColor * (ambient + vec3(1.0, 0.96, 0.86) * diff * 0.85 * shadow);
    float fog = clamp((vFogDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    gl_FragColor = vec4(mix(lit, uFogCol, fog), 1.0);
  }
`;

// ============================================================
// 阴影深度着色器 / SHADOW DEPTH SHADERS
// 极简着色器，仅向阴影贴图写入深度值，不做任何光照计算
// Minimal shaders that only write depth to the shadow map; no lighting
// 两个变体：地形（带 uOffset 偏移）/ 树木（带实例化属性）
// Two variants: terrain (with uOffset) / trees (with instance attributes)
// ============================================================
const SHADOW_TERRAIN_VS = `
  attribute vec3 aPos;
  uniform mat4 uSunVP;
  uniform vec3 uOffset;
  void main() {
    gl_Position = uSunVP * vec4(aPos + uOffset, 1.0);
  }
`;
const SHADOW_TREE_VS = `
  attribute vec3 aPos;
  attribute vec3 aIPos;
  attribute vec3 aIScale;
  uniform mat4 uSunVP;
  void main() {
    vec3 world = vec3(aPos.x * aIScale.x, aPos.y * aIScale.y, aPos.z * aIScale.z) + aIPos;
    gl_Position = uSunVP * vec4(world, 1.0);
  }
`;
const SHADOW_FS = `
  precision mediump float;
  void main() {
    gl_FragColor = vec4(1.0);
  }
`;
const treeProg = program(TREE_VS, TREE_FS);
const trLoc = {
  aPos:      gl.getAttribLocation(treeProg, 'aPos'),
  aNormal:   gl.getAttribLocation(treeProg, 'aNormal'),
  aColor:    gl.getAttribLocation(treeProg, 'aColor'),
  aIPos:     gl.getAttribLocation(treeProg, 'aIPos'),
  aIScale:   gl.getAttribLocation(treeProg, 'aIScale'),
  aIColor:   gl.getAttribLocation(treeProg, 'aIColor'),
  uVP:       gl.getUniformLocation(treeProg, 'uVP'),
  uSunVP:    gl.getUniformLocation(treeProg, 'uSunVP'),
  uSunDir:   gl.getUniformLocation(treeProg, 'uSunDir'),
  uSkyCol:   gl.getUniformLocation(treeProg, 'uSkyCol'),
  uGroundCol:gl.getUniformLocation(treeProg, 'uGroundCol'),
  uFogCol:   gl.getUniformLocation(treeProg, 'uFogCol'),
  uFogNear:  gl.getUniformLocation(treeProg, 'uFogNear'),
  uFogFar:   gl.getUniformLocation(treeProg, 'uFogFar'),
  uShadowMap:        gl.getUniformLocation(treeProg, 'uShadowMap'),
  uShadowMapSize:    gl.getUniformLocation(treeProg, 'uShadowMapSize'),
  uShadowsEnabled:   gl.getUniformLocation(treeProg, 'uShadowsEnabled'),
};

// ============================================================
// 阴影帧缓冲 / SHADOW FRAMEBUFFER
// 创建一张深度纹理作为阴影贴图，绑定到离屏帧缓冲
// Create a depth texture as the shadow map, attached to an off-screen framebuffer
// 若硬件不支持 WEBGL_depth_texture，阴影功能自动关闭
// If WEBGL_depth_texture is unsupported, shadows are automatically disabled
// ============================================================
let shadowProgTerrain = null, shadowProgTree = null;
let shadowFB = null, shadowTex = null;
let shTerrLoc = null, shTreeLoc = null;
const SHADOW_MAP_SIZE = 1024;

if (SHADOW_SUPPORTED) {
  shadowProgTerrain = program(SHADOW_TERRAIN_VS, SHADOW_FS);
  shadowProgTree    = program(SHADOW_TREE_VS,    SHADOW_FS);
  shTerrLoc = {
    aPos:    gl.getAttribLocation(shadowProgTerrain, 'aPos'),
    uSunVP:  gl.getUniformLocation(shadowProgTerrain, 'uSunVP'),
    uOffset: gl.getUniformLocation(shadowProgTerrain, 'uOffset'),
  };
  shTreeLoc = {
    aPos:    gl.getAttribLocation(shadowProgTree, 'aPos'),
    aIPos:   gl.getAttribLocation(shadowProgTree, 'aIPos'),
    aIScale: gl.getAttribLocation(shadowProgTree, 'aIScale'),
    uSunVP:  gl.getUniformLocation(shadowProgTree, 'uSunVP'),
  };

  shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT,
    SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, 0,
    gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const dummyColor = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, dummyColor);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, 0,
                gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

  shadowFB = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex,   0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dummyColor, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.warn('Shadow framebuffer incomplete:', status, '— shadows disabled');
    SHADOWS_ENABLED = false;
    shadowFB = null;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// ============================================================
// 树木原型网格构建器 / TREE PROTOTYPE MESH BUILDERS
// 两种原型：针叶树（圆锥轮廓）和阔叶树（多层扁锥叠加）
// Two prototypes: conifer (sharp cone silhouette) and broadleaf (layered rounded canopy)
// 每个原型只构建一次并上传到 GPU，所有实例共用同一份几何数据
// Each prototype is built once and uploaded to GPU; all instances share the same geometry
// ============================================================
function pushVert(arrs, p, n, c) {
  arrs.positions.push(p[0], p[1], p[2]);
  arrs.normals.push(n[0], n[1], n[2]);
  arrs.colors.push(c[0], c[1], c[2]);
  return arrs.positions.length / 3 - 1;
}
function addTrunk(arrs, radius, height, color) {
  const sides = 6;
  const ringBot = [], ringTop = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const cx = Math.cos(a), cz = Math.sin(a);
    ringBot.push(pushVert(arrs, [cx*radius, 0,      cz*radius], [cx, 0, cz], color));
    ringTop.push(pushVert(arrs, [cx*radius, height, cz*radius], [cx, 0, cz], color));
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    arrs.indices.push(ringBot[i], ringTop[i], ringBot[j]);
    arrs.indices.push(ringTop[i], ringTop[j], ringBot[j]);
  }
}
function addCone(arrs, yBase, height, radius, color, sides) {
  sides = sides || 8;
  const apexI = pushVert(arrs, [0, yBase + height, 0], [0, 1, 0], color);
  const ring = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const cx = Math.cos(a), cz = Math.sin(a);
    const slantY = radius / Math.hypot(radius, height);
    const slantH = height / Math.hypot(radius, height);
    ring.push(pushVert(arrs,
      [cx * radius, yBase, cz * radius],
      [cx * slantH, slantY, cz * slantH], color));
  }
  const ringDown = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    ringDown.push(pushVert(arrs,
      [Math.cos(a) * radius, yBase, Math.sin(a) * radius],
      [0, -1, 0], [color[0]*0.6, color[1]*0.6, color[2]*0.6]));
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    arrs.indices.push(ring[i], apexI, ring[j]);
  }
  for (let i = 1; i < sides - 1; i++) {
    arrs.indices.push(ringDown[0], ringDown[i + 1], ringDown[i]);
  }
}
function makeStaticBuf(target, data) {
  const b = gl.createBuffer();
  gl.bindBuffer(target, b);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return b;
}
function finalizeProto(arrs) {
  return {
    posBuf:   makeStaticBuf(gl.ARRAY_BUFFER, new Float32Array(arrs.positions)),
    normBuf:  makeStaticBuf(gl.ARRAY_BUFFER, new Float32Array(arrs.normals)),
    colorBuf: makeStaticBuf(gl.ARRAY_BUFFER, new Float32Array(arrs.colors)),
    indexBuf: makeStaticBuf(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(arrs.indices)),
    indexCount: arrs.indices.length,
  };
}

function buildConiferPrototype() {
  const arrs = { positions: [], normals: [], colors: [], indices: [] };
  addTrunk(arrs, 0.12, 1.0, COL.TRUNK);
  addCone(arrs, 0.7, 1.4, 0.85, COL.FOLIAGE_D);
  addCone(arrs, 1.6, 1.6, 0.55, COL.FOLIAGE_L);
  return finalizeProto(arrs);
}

function buildBroadleafPrototype() {
  const arrs = { positions: [], normals: [], colors: [], indices: [] };
  addTrunk(arrs, 0.18, 0.9, COL.TRUNK);
  addCone(arrs, 0.7, 0.9, 1.05, COL.FOLIAGE_D);
  addCone(arrs, 1.2, 0.8, 0.95, COL.FOLIAGE_L);
  addCone(arrs, 1.7, 0.6, 0.7,  COL.FOLIAGE_L);
  return finalizeProto(arrs);
}

const treeProtoConifer   = buildConiferPrototype();
const treeProtoBroadleaf = buildBroadleafPrototype();

const tLoc = {
  aPos:    gl.getAttribLocation(terrainProg, 'aPos'),
  aNormal: gl.getAttribLocation(terrainProg, 'aNormal'),
  aColor:  gl.getAttribLocation(terrainProg, 'aColor'),
  uVP:     gl.getUniformLocation(terrainProg, 'uVP'),
  uSunVP:  gl.getUniformLocation(terrainProg, 'uSunVP'),
  uOffset: gl.getUniformLocation(terrainProg, 'uOffset'),
  uSunDir: gl.getUniformLocation(terrainProg, 'uSunDir'),
  uSkyCol: gl.getUniformLocation(terrainProg, 'uSkyCol'),
  uGroundCol: gl.getUniformLocation(terrainProg, 'uGroundCol'),
  uFogCol: gl.getUniformLocation(terrainProg, 'uFogCol'),
  uFogNear: gl.getUniformLocation(terrainProg, 'uFogNear'),
  uFogFar:  gl.getUniformLocation(terrainProg, 'uFogFar'),
  uShadowMap:      gl.getUniformLocation(terrainProg, 'uShadowMap'),
  uShadowMapSize:  gl.getUniformLocation(terrainProg, 'uShadowMapSize'),
  uShadowsEnabled: gl.getUniformLocation(terrainProg, 'uShadowsEnabled'),
};

const wLoc = {
  aPos:     gl.getAttribLocation(waterProg, 'aPos'),
  uVP:      gl.getUniformLocation(waterProg, 'uVP'),
  uOffset:  gl.getUniformLocation(waterProg, 'uOffset'),
  uWaterCol: gl.getUniformLocation(waterProg, 'uWaterCol'),
  uFogCol:   gl.getUniformLocation(waterProg, 'uFogCol'),
  uFogNear:  gl.getUniformLocation(waterProg, 'uFogNear'),
  uFogFar:   gl.getUniformLocation(waterProg, 'uFogFar'),
  uTime:     gl.getUniformLocation(waterProg, 'uTime'),
};

// ============================================================
// 区块构建 / CHUNK BUILDER
// 每个区块生成：地形网格 + 水面网格 + 树木实例数据，全部上传为 VBO
// Each chunk generates: terrain mesh + water mesh + tree instance data, all uploaded as VBOs
// 使用世界坐标采样噪声，确保相邻区块共享边缘顶点值（无缝接合）
// World-space noise sampling ensures adjacent chunks share identical edge vertex values (no seams)
// 三遍生成流程 / Three-pass generation:
//   Pass 1: 高度场     / Heights
//   Pass 2: 法线 + 坡度 / Normals + slopes
//   Pass 3: 顶点颜色   / Vertex colors
// ============================================================
function buildChunk(cx, cz) {
  const size = CONFIG.CHUNK_SIZE;
  const res  = CONFIG.CHUNK_RES;
  const verts = res + 1;
  const originX = cx * size;
  const originZ = cz * size;

  const positions = new Float32Array(verts * verts * 3);
  const normals   = new Float32Array(verts * verts * 3);
  const colors    = new Float32Array(verts * verts * 3);
  const heights   = new Float32Array(verts * verts);

  for (let z = 0; z <= res; z++) {
    for (let x = 0; x <= res; x++) {
      const wx = originX + (x / res) * size;
      const wz = originZ + (z / res) * size;
      const h = terrainHeight(wx, wz);
      const i = z * verts + x;
      heights[i] = h;
      positions[i*3]   = wx - originX;
      positions[i*3+1] = h;
      positions[i*3+2] = wz - originZ;
    }
  }

  const step = size / res;
  const slopes = new Float32Array(verts * verts);
  for (let z = 0; z <= res; z++) {
    for (let x = 0; x <= res; x++) {
      const wx = originX + (x / res) * size;
      const wz = originZ + (z / res) * size;
      const hL = terrainHeight(wx - step, wz);
      const hR = terrainHeight(wx + step, wz);
      const hD = terrainHeight(wx, wz - step);
      const hU = terrainHeight(wx, wz + step);
      const dhdx = (hR - hL) / (2 * step);
      const dhdz = (hU - hD) / (2 * step);
      const nx = -dhdx, nz = -dhdz, ny = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = z * verts + x;
      normals[i*3]   = nx / len;
      normals[i*3+1] = ny / len;
      normals[i*3+2] = nz / len;
      slopes[i] = Math.hypot(dhdx, dhdz);
    }
  }

  for (let i = 0; i < verts * verts; i++) {
    const x = i % verts;
    const z = (i - x) / verts;
    const wx = originX + (x / res) * size;
    const wz = originZ + (z / res) * size;
    const c = colorForMaterial(heights[i], slopes[i], wx, wz);
    colors[i*3]   = c[0];
    colors[i*3+1] = c[1];
    colors[i*3+2] = c[2];
  }

  const indices = new Uint16Array(res * res * 6);
  let ii = 0;
  for (let z = 0; z < res; z++) {
    for (let x = 0; x < res; x++) {
      const a = z * verts + x;
      const b = a + 1;
      const c = a + verts;
      const d = c + 1;
      indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
      indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
    }
  }

  function makeBuffer(target, data) {
    const buf = gl.createBuffer();
    gl.bindBuffer(target, buf);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return buf;
  }

  const chunk = {
    cx: cx, cz: cz,
    originX: originX, originZ: originZ,
    posBuf:    makeBuffer(gl.ARRAY_BUFFER, positions),
    normBuf:   makeBuffer(gl.ARRAY_BUFFER, normals),
    colorBuf:  makeBuffer(gl.ARRAY_BUFFER, colors),
    indexBuf:  makeBuffer(gl.ELEMENT_ARRAY_BUFFER, indices),
    indexCount: indices.length,
    waterPosBuf: null,
    waterIdxBuf: null,
  };

  const wp = new Float32Array([
    0,    CONFIG.WATER_LEVEL, 0,
    size, CONFIG.WATER_LEVEL, 0,
    size, CONFIG.WATER_LEVEL, size,
    0,    CONFIG.WATER_LEVEL, size,
  ]);
  const wi = new Uint16Array([0, 2, 1, 0, 3, 2]);
  chunk.waterPosBuf = makeBuffer(gl.ARRAY_BUFFER, wp);
  chunk.waterIdxBuf = makeBuffer(gl.ELEMENT_ARRAY_BUFFER, wi);

  // ============================================================
  // TREES
  // ============================================================
  let seed = ((cx * 73856093) ^ (cz * 19349663)) >>> 0;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const conData = [];
  const broadData = [];

  const MIN_DIST  = CONFIG.TREE_MIN_DIST;
  const MIN_DIST2 = MIN_DIST * MIN_DIST;
  const EDGE_MARGIN = MIN_DIST * 0.5;

  const gridCellSize = MIN_DIST;
  const gridDim = Math.ceil(size / gridCellSize) + 1;
  const grid = new Array(gridDim * gridDim);
  function gridKey(lx, lz) {
    const gx = Math.floor(lx / gridCellSize);
    const gz = Math.floor(lz / gridCellSize);
    return gz * gridDim + gx;
  }
  function tooClose(lx, lz) {
    const gx = Math.floor(lx / gridCellSize);
    const gz = Math.floor(lz / gridCellSize);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ngx = gx + dx, ngz = gz + dz;
        if (ngx < 0 || ngz < 0 || ngx >= gridDim || ngz >= gridDim) continue;
        const cell = grid[ngz * gridDim + ngx];
        if (!cell) continue;
        for (let i = 0; i < cell.length; i += 2) {
          const ddx = cell[i] - lx, ddz = cell[i+1] - lz;
          if (ddx*ddx + ddz*ddz < MIN_DIST2) return true;
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

  function isForest(wx, wz) {
    const v = 0.5 + 0.5 * noise3(wx * CONFIG.FOREST_FREQ, wz * CONFIG.FOREST_FREQ, SEED + 4242);
    const t = CONFIG.FOREST_THRESHOLD;
    const blend = 0.05;
    const m = Math.max(0, Math.min(1, (v - (t - blend)) / (2 * blend)));
    return m * m * (3 - 2 * m);
  }

  const N = CONFIG.TREES_PER_CHUNK;
  for (let i = 0; i < N; i++) {
    const lx = EDGE_MARGIN + rand() * (size - 2 * EDGE_MARGIN);
    const lz = EDGE_MARGIN + rand() * (size - 2 * EDGE_MARGIN);
    const wx = originX + lx;
    const wz = originZ + lz;
    const h  = terrainHeight(wx, wz);

    if (h < CONFIG.WATER_LEVEL + CONFIG.TREE_MIN_HEIGHT) continue;
    if (h > CONFIG.TREE_MAX_HEIGHT) continue;

    const stp = size / res;
    const dhdx = (terrainHeight(wx + stp, wz) - terrainHeight(wx - stp, wz)) / (2 * stp);
    const dhdz = (terrainHeight(wx, wz + stp) - terrainHeight(wx, wz - stp)) / (2 * stp);
    const sl = Math.hypot(dhdx, dhdz);
    if (sl > CONFIG.TREE_MAX_SLOPE) continue;

    const fm = isForest(wx, wz);
    let acceptRate = CONFIG.SPARSE_DENSITY +
      (CONFIG.FOREST_DENSITY - CONFIG.SPARSE_DENSITY) * fm;
    const tundra = climateMask(wx, wz);
    acceptRate *= 1 - tundra * CONFIG.TREE_TUNDRA_SUPPRESS;
    if (rand() > acceptRate) continue;

    if (tooClose(lx, lz)) continue;
    recordTree(lx, lz);

    const baseScale = CONFIG.TREE_BASE_SCALE + (rand() * 2 - 1) * CONFIG.TREE_SCALE_VAR;
    const widthMul  = 0.75 + rand() * 0.55;
    const heightMul = 0.70 + rand() * 0.70;
    const sx = baseScale * widthMul;
    const sy = baseScale * heightMul;
    const sz = baseScale * widthMul;

    const tr = 0.85 + rand() * 0.30;
    const tg = 0.80 + rand() * 0.40;
    const tb = 0.85 + rand() * 0.30;

    const broadProb = CONFIG.TREE_BROADLEAF_PROB * (1 - tundra * 0.9);
    const isBroadleaf = rand() < broadProb;
    const out = isBroadleaf ? broadData : conData;
    out.push(wx, h - 0.2, wz, sx, sy, sz, tr, tg, tb);
  }

  function packInstances(flat) {
    if (flat.length === 0) return null;
    return makeBuffer(gl.ARRAY_BUFFER, new Float32Array(flat));
  }
  chunk.coniferBuf   = packInstances(conData);
  chunk.coniferCount = conData.length / 9;
  chunk.broadBuf     = packInstances(broadData);
  chunk.broadCount   = broadData.length / 9;

  return chunk;
}

function disposeChunk(chunk) {
  gl.deleteBuffer(chunk.posBuf);
  gl.deleteBuffer(chunk.normBuf);
  gl.deleteBuffer(chunk.colorBuf);
  gl.deleteBuffer(chunk.indexBuf);
  gl.deleteBuffer(chunk.waterPosBuf);
  gl.deleteBuffer(chunk.waterIdxBuf);
  if (chunk.coniferBuf) gl.deleteBuffer(chunk.coniferBuf);
  if (chunk.broadBuf)   gl.deleteBuffer(chunk.broadBuf);
}

// ============================================================
// 区块管理器 / CHUNK MANAGER
// 每帧根据摄像机位置决定加载哪些区块、卸载哪些区块
// Each frame, decides which chunks to load and unload based on camera position
// 加载：圆形范围内不存在的区块加入待建队列，最近的优先
// Load:  missing chunks within circular load radius are queued, nearest first
// 卸载：超过卸载半径的区块释放所有 GPU 缓冲区并删除
// Unload: chunks beyond unload radius have all GPU buffers freed and are deleted
// ============================================================
const chunks = {};     // key = "cx,cz" → chunk 对象 / chunk object
let chunkCount = 0;    // 当前已加载区块数 / currently loaded chunk count
const CHUNK_BUDGET_PER_FRAME = 4; // 每帧最多新建区块数，防止卡帧 / Max new chunks per frame to avoid frame stalls

function updateChunks(camX, camZ) {
  const ccx = Math.floor(camX / CONFIG.CHUNK_SIZE);
  const ccz = Math.floor(camZ / CONFIG.CHUNK_SIZE);
  const loadR   = CONFIG.VIEW_DISTANCE;
  const unloadR = CONFIG.UNLOAD_DISTANCE;
  const loadR2   = loadR  * loadR;
  const unloadR2 = unloadR * unloadR;
  const toBuild = [];

  // ---- 加载阶段：圆形范围内尚未生成的区块加入待建队列 ----
  // 使用圆形判断（dx²+dz² ≤ r²）而非正方形，
  // 避免加载视距角落处摄像机实际看不到的区块。
  for (let dz = -loadR; dz <= loadR; dz++) {
    for (let dx = -loadR; dx <= loadR; dx++) {
      if (dx * dx + dz * dz > loadR2) continue; // 圆形裁剪
      const cx = ccx + dx, cz = ccz + dz;
      const key = cx + ',' + cz;
      if (!chunks[key]) {
        toBuild.push({ cx: cx, cz: cz, key: key, d2: dx * dx + dz * dz });
      }
    }
  }

  // 距离近的区块优先生成，每帧最多建 CHUNK_BUDGET_PER_FRAME 个
  toBuild.sort(function(a, b) { return a.d2 - b.d2; });
  const limit = Math.min(toBuild.length, CHUNK_BUDGET_PER_FRAME);
  for (let i = 0; i < limit; i++) {
    const t = toBuild[i];
    chunks[t.key] = buildChunk(t.cx, t.cz);
    chunkCount++;
  }

  // ---- 卸载阶段：超过卸载距离的区块释放 GPU 资源并删除 ----
  // 卸载半径（UNLOAD_DISTANCE）大于加载半径（VIEW_DISTANCE），
  // 形成一个"缓冲带"：摄像机在边界附近移动时不会反复加载/卸载同一区块。
  for (const key in chunks) {
    const c = chunks[key];
    const dx = c.cx - ccx;
    const dz = c.cz - ccz;
    if (dx * dx + dz * dz > unloadR2) {
      disposeChunk(c);
      delete chunks[key];
      chunkCount--;
    }
  }
}

// ============================================================
// 摄像机系统 / CAMERA SYSTEM
// 轨道摄像机：绕目标点旋转，支持鼠标拖拽 + WASD 平移 + 空格/Shift 升降
// Orbit camera: rotates around a target point
// Controls: mouse drag to rotate, WASD to pan, Space/Shift to lift
// 摄像机状态：target（目标点）/ yaw（偏航角）/ pitch（俯仰角）/ dist（距离）
// Camera state: target (pivot point) / yaw / pitch / dist (zoom)
// ============================================================
const target = { x: 0, y: 0, z: 0 };
let yaw   = 0;
let pitch = -0.45;
let dist  = 380;

const PITCH_MIN = -Math.PI / 2 + 0.05;
const PITCH_MAX = -0.05;
const DIST_MIN = 60, DIST_MAX = 1200;

const keys = {};
window.addEventListener('keydown', function(e) {
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ') e.preventDefault();
  if (e.key.toLowerCase() === 't' && !e.repeat) toggleTrees();
});
window.addEventListener('keyup', function(e) { keys[e.key.toLowerCase()] = false; });

const btnTrees = document.getElementById('btn-trees');
function toggleTrees() {
  if (!instExt) return;
  CONFIG.TREES_ENABLED = !CONFIG.TREES_ENABLED;
  btnTrees.textContent = 'trees: ' + (CONFIG.TREES_ENABLED ? 'ON' : 'OFF');
  btnTrees.classList.toggle('off', !CONFIG.TREES_ENABLED);
}
btnTrees.addEventListener('click', toggleTrees);
if (!instExt) {
  btnTrees.textContent = 'trees: N/A';
  btnTrees.classList.add('off');
  btnTrees.disabled = true;
} else if (!CONFIG.TREES_ENABLED) {
  btnTrees.textContent = 'trees: OFF';
  btnTrees.classList.add('off');
}

const btnShadows = document.getElementById('btn-shadows');
function toggleShadows() {
  if (!SHADOW_SUPPORTED) return;
  SHADOWS_ENABLED = !SHADOWS_ENABLED;
  btnShadows.textContent = 'shadows: ' + (SHADOWS_ENABLED ? 'ON' : 'OFF');
  btnShadows.classList.toggle('off', !SHADOWS_ENABLED);
}
btnShadows.addEventListener('click', toggleShadows);
if (!SHADOW_SUPPORTED) {
  btnShadows.textContent = 'shadows: N/A';
  btnShadows.classList.add('off');
  btnShadows.disabled = true;
}

const sliderElev = document.getElementById('sun-elev');
const sliderAzim = document.getElementById('sun-azim');
const labelElev  = document.getElementById('sun-elev-val');
const labelAzim  = document.getElementById('sun-azim-val');
sliderElev.addEventListener('input', function() {
  SUN.elevation = parseFloat(sliderElev.value) * Math.PI / 180;
  labelElev.textContent = sliderElev.value + '°';
  updateSunDir();
});
sliderAzim.addEventListener('input', function() {
  SUN.azimuth = parseFloat(sliderAzim.value) * Math.PI / 180;
  labelAzim.textContent = sliderAzim.value + '°';
  updateSunDir();
});

// ---- 种子系统 UI / Seed system UI ----
const seedInput    = document.getElementById('seed-input');
const btnSeedApply = document.getElementById('btn-seed-apply');

// 应用新种子：更新 SEED 全局变量，清空所有区块，重置摄像机
// Apply new seed: update global SEED, dispose all chunks, reset camera
function applySeed() {
  const raw = seedInput.value.trim() || '42';
  seedInput.value = raw;                  // 去掉多余空白后回填
  SEED = parseSeed(raw);

  // 清空所有区块，释放 GPU 资源
  for (const key in chunks) {
    disposeChunk(chunks[key]);
    delete chunks[key];
  }
  chunkCount = 0;

  // 重置摄像机到原点
  target.x = 0; target.y = 0; target.z = 0;
  yaw = 0; pitch = -0.45; dist = 380;

  console.log('种子已应用：', raw, '→ SEED =', SEED);
}

btnSeedApply.addEventListener('click', applySeed);
// 在输入框内按 Enter 也可以触发
seedInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') applySeed();
});
// 防止在输入框中按 WASD 时移动摄像机
seedInput.addEventListener('keyup',   function(e) { e.stopPropagation(); });
seedInput.addEventListener('keydown', function(e) { e.stopPropagation(); });

let dragging = false;
canvas.addEventListener('mousedown', function(e) {
  dragging = true;
  canvas.style.cursor = 'grabbing';
});
window.addEventListener('mouseup', function() {
  dragging = false;
  canvas.style.cursor = 'grab';
});
canvas.style.cursor = 'grab';

window.addEventListener('mousemove', function(e) {
  if (!dragging) return;
  const sens = 0.0035;
  yaw   -= e.movementX * sens;
  pitch -= e.movementY * sens;
  if (pitch < PITCH_MIN) pitch = PITCH_MIN;
  if (pitch > PITCH_MAX) pitch = PITCH_MAX;
});

canvas.addEventListener('wheel', function(e) {
  e.preventDefault();
  dist *= (1 + e.deltaY * 0.001);
  if (dist < DIST_MIN) dist = DIST_MIN;
  if (dist > DIST_MAX) dist = DIST_MAX;
}, { passive: false });

function updateCamera(dt) {
  const speed = 0.55 * dist;
  const fwdX = -Math.sin(yaw),  fwdZ = -Math.cos(yaw);
  const rgtX =  Math.cos(yaw),  rgtZ = -Math.sin(yaw);

  if (keys['w']) { target.x += fwdX * speed * dt; target.z += fwdZ * speed * dt; }
  if (keys['s']) { target.x -= fwdX * speed * dt; target.z -= fwdZ * speed * dt; }
  if (keys['d']) { target.x += rgtX * speed * dt; target.z += rgtZ * speed * dt; }
  if (keys['a']) { target.x -= rgtX * speed * dt; target.z -= rgtZ * speed * dt; }

  const liftSpeed = 40;
  if (keys[' '])     target.y += liftSpeed * dt;
  if (keys['shift']) target.y -= liftSpeed * dt;

  if (keys['q']) dist = Math.min(dist + 80 * dt, DIST_MAX);
  if (keys['e']) dist = Math.max(dist - 80 * dt, DIST_MIN);

  if (keys['r']) {
    target.x = 0; target.y = 0; target.z = 0;
    yaw = 0; pitch = -0.45; dist = 380;
  }
}

function getCameraEye() {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return {
    x: target.x + Math.sin(yaw) * cp * dist,
    y: target.y - sp * dist,
    z: target.z + Math.cos(yaw) * cp * dist,
  };
}

// ============================================================
// 主渲染循环 / MAIN RENDER LOOP
// 每帧执行顺序 / Per-frame execution order:
//   1. 更新摄像机输入                Update camera from input
//   2. 更新区块（加载/卸载）         Update chunks (load / unload)
//   3. 计算主摄像机 VP 矩阵          Compute main camera VP matrix
//   4. 计算太阳 VP 矩阵（阴影相机） Compute sun VP matrix (shadow camera)
//   Pass 0: 阴影贴图渲染             Shadow map pass
//   Pass 1: 地形不透明渲染           Terrain opaque pass
//   Pass 1.5: 树木实例化渲染         Tree instanced pass
//   Pass 2: 水面半透明渲染           Water translucent pass
//   5. 更新 HUD 统计数字             Update HUD stats
// ============================================================
updateChunks(0, 0);

const statChunks = document.getElementById('stat-chunks');
const statPos    = document.getElementById('stat-pos');
const statFps    = document.getElementById('stat-fps');

let lastTime = performance.now();
let fpsAccum = 0, fpsCount = 0, fpsTimer = 0;
const startTime = performance.now();

const FOG_NEAR = 400;
const FOG_FAR  = CONFIG.CHUNK_SIZE * CONFIG.VIEW_DISTANCE * 1.4;

// 太阳方向由方位角（azimuth）和仰角（elevation）推导
// Sun direction is derived from azimuth (compass) and elevation (angle above horizon)
// dir 是指向太阳的单位向量，光照从此方向射来
// dir is a unit vector pointing TO the sun; light comes FROM this direction
const SUN = {
  azimuth:   135 * Math.PI / 180, // 方位角（弧度），0 = 正南，90 = 正东 / Azimuth in radians, 0=south, 90=east
  elevation: 45  * Math.PI / 180, // 仰角（弧度），0 = 地平线，π/2 = 正头顶 / Elevation in radians, 0=horizon, π/2=overhead
  dir: [0, 1, 0],                 // 运行时由 updateSunDir() 填充 / Populated at runtime by updateSunDir()
};

function updateSunDir() {
  const ce = Math.cos(SUN.elevation), se = Math.sin(SUN.elevation);
  const ca = Math.cos(SUN.azimuth),   sa = Math.sin(SUN.azimuth);
  SUN.dir[0] = ce * sa;
  SUN.dir[1] = se;
  SUN.dir[2] = ce * ca;
}
updateSunDir();

const sunDir = SUN.dir;

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  updateCamera(dt);
  const eyePreview = getCameraEye();
  updateChunks(eyePreview.x, eyePreview.z);

  const eye = getCameraEye();
  const proj = M4.perspective(50 * Math.PI / 180, canvas.width / canvas.height, 0.5, 2000);
  const view = M4.lookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, 0, 1, 0);
  const vp = M4.multiply(proj, view);

  const SHADOW_RADIUS = 520;
  const SHADOW_HEIGHT = 700;
  const sunCenterX = target.x;
  const sunCenterY = 0;
  const sunCenterZ = target.z;
  // sunEye 放在 sunCenter 后方整个 SHADOW_HEIGHT 处，
  // 使 sunCenter 落在视锥深度范围的中央，两侧地形都能接收阴影。
  const sunBackoff = SHADOW_HEIGHT;
  const sunEyeX = sunCenterX + sunDir[0] * sunBackoff;
  const sunEyeY = sunCenterY + sunDir[1] * sunBackoff;
  const sunEyeZ = sunCenterZ + sunDir[2] * sunBackoff;
  const upY = (Math.abs(sunDir[1]) > 0.999) ? 0 : 1;
  const upZ = (Math.abs(sunDir[1]) > 0.999) ? 1 : 0;
  const sunView = M4.lookAt(sunEyeX, sunEyeY, sunEyeZ,
                             sunCenterX, sunCenterY, sunCenterZ, 0, upY, upZ);
  // near = 0.1（贴近 sunEye），far = 2 * SHADOW_HEIGHT（越过 sunCenter 另一侧同等距离）
  // sunCenter 在深度方向上处于 [near, far] 的正中间 → 四个方向均有阴影覆盖
  const sunProj = M4.ortho(-SHADOW_RADIUS, SHADOW_RADIUS,
                           -SHADOW_RADIUS, SHADOW_RADIUS,
                           0.1, SHADOW_HEIGHT * 2);
  const sunVP = M4.multiply(sunProj, sunView);

  // PASS 0 — SHADOW MAP
  const shadowsActive = SHADOWS_ENABLED && shadowFB;
  if (shadowsActive) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB);
    gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);

    gl.useProgram(shadowProgTerrain);
    gl.uniformMatrix4fv(shTerrLoc.uSunVP, false, sunVP);
    for (const key in chunks) {
      const c = chunks[key];
      gl.uniform3f(shTerrLoc.uOffset, c.originX, 0, c.originZ);
      gl.bindBuffer(gl.ARRAY_BUFFER, c.posBuf);
      gl.enableVertexAttribArray(shTerrLoc.aPos);
      gl.vertexAttribPointer(shTerrLoc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.indexBuf);
      gl.drawElements(gl.TRIANGLES, c.indexCount, gl.UNSIGNED_SHORT, 0);
    }
    gl.disableVertexAttribArray(shTerrLoc.aPos);

    if (CONFIG.TREES_ENABLED && instExt) {
      gl.disable(gl.CULL_FACE);
      gl.useProgram(shadowProgTree);
      gl.uniformMatrix4fv(shTreeLoc.uSunVP, false, sunVP);
      gl.enableVertexAttribArray(shTreeLoc.aIPos);
      gl.enableVertexAttribArray(shTreeLoc.aIScale);
      instExt.vertexAttribDivisorANGLE(shTreeLoc.aIPos, 1);
      instExt.vertexAttribDivisorANGLE(shTreeLoc.aIScale, 1);

      function shadowDrawTrees(proto, bufKey, countKey) {
        gl.bindBuffer(gl.ARRAY_BUFFER, proto.posBuf);
        gl.enableVertexAttribArray(shTreeLoc.aPos);
        gl.vertexAttribPointer(shTreeLoc.aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, proto.indexBuf);
        for (const key in chunks) {
          const c = chunks[key];
          if (!c[countKey]) continue;
          gl.bindBuffer(gl.ARRAY_BUFFER, c[bufKey]);
          gl.vertexAttribPointer(shTreeLoc.aIPos,   3, gl.FLOAT, false, 36, 0);
          gl.vertexAttribPointer(shTreeLoc.aIScale, 3, gl.FLOAT, false, 36, 12);
          instExt.drawElementsInstancedANGLE(
            gl.TRIANGLES, proto.indexCount, gl.UNSIGNED_SHORT, 0, c[countKey]);
        }
      }
      shadowDrawTrees(treeProtoConifer,   'coniferBuf', 'coniferCount');
      shadowDrawTrees(treeProtoBroadleaf, 'broadBuf',   'broadCount');

      instExt.vertexAttribDivisorANGLE(shTreeLoc.aIPos, 0);
      instExt.vertexAttribDivisorANGLE(shTreeLoc.aIScale, 0);
      gl.disableVertexAttribArray(shTreeLoc.aIPos);
      gl.disableVertexAttribArray(shTreeLoc.aIScale);
      gl.disableVertexAttribArray(shTreeLoc.aPos);
    }

    gl.cullFace(gl.BACK);
    gl.enable(gl.CULL_FACE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // MAIN PASSES
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  if (shadowTex) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  }

  // pass 1: terrain
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.useProgram(terrainProg);
  gl.uniformMatrix4fv(tLoc.uVP, false, vp);
  gl.uniformMatrix4fv(tLoc.uSunVP, false, sunVP);
  gl.uniform3fv(tLoc.uSunDir, sunDir);
  gl.uniform3fv(tLoc.uSkyCol, [0.72, 0.83, 0.91]);
  gl.uniform3fv(tLoc.uGroundCol, [0.29, 0.33, 0.25]);
  gl.uniform3fv(tLoc.uFogCol, COL.SKY);
  gl.uniform1f(tLoc.uFogNear, FOG_NEAR);
  gl.uniform1f(tLoc.uFogFar,  FOG_FAR);
  gl.uniform1i(tLoc.uShadowMap, 0);
  gl.uniform1f(tLoc.uShadowMapSize, SHADOW_MAP_SIZE);
  gl.uniform1f(tLoc.uShadowsEnabled, shadowsActive ? 1.0 : 0.0);

  for (const key in chunks) {
    const c = chunks[key];
    gl.uniform3f(tLoc.uOffset, c.originX, 0, c.originZ);

    gl.bindBuffer(gl.ARRAY_BUFFER, c.posBuf);
    gl.enableVertexAttribArray(tLoc.aPos);
    gl.vertexAttribPointer(tLoc.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, c.normBuf);
    gl.enableVertexAttribArray(tLoc.aNormal);
    gl.vertexAttribPointer(tLoc.aNormal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, c.colorBuf);
    gl.enableVertexAttribArray(tLoc.aColor);
    gl.vertexAttribPointer(tLoc.aColor, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.indexBuf);
    gl.drawElements(gl.TRIANGLES, c.indexCount, gl.UNSIGNED_SHORT, 0);
  }

  // pass 1.5: trees
  if (CONFIG.TREES_ENABLED && instExt) {
    gl.disable(gl.CULL_FACE);
    gl.useProgram(treeProg);
    gl.uniformMatrix4fv(trLoc.uVP, false, vp);
    gl.uniformMatrix4fv(trLoc.uSunVP, false, sunVP);
    gl.uniform3fv(trLoc.uSunDir, sunDir);
    gl.uniform3fv(trLoc.uSkyCol, [0.72, 0.83, 0.91]);
    gl.uniform3fv(trLoc.uGroundCol, [0.18, 0.22, 0.14]);
    gl.uniform3fv(trLoc.uFogCol, COL.SKY);
    gl.uniform1f(trLoc.uFogNear, FOG_NEAR);
    gl.uniform1f(trLoc.uFogFar,  FOG_FAR);
    gl.uniform1i(trLoc.uShadowMap, 0);
    gl.uniform1f(trLoc.uShadowMapSize, SHADOW_MAP_SIZE);
    gl.uniform1f(trLoc.uShadowsEnabled, shadowsActive ? 1.0 : 0.0);

    gl.enableVertexAttribArray(trLoc.aIPos);
    gl.enableVertexAttribArray(trLoc.aIScale);
    gl.enableVertexAttribArray(trLoc.aIColor);
    instExt.vertexAttribDivisorANGLE(trLoc.aIPos,   1);
    instExt.vertexAttribDivisorANGLE(trLoc.aIScale, 1);
    instExt.vertexAttribDivisorANGLE(trLoc.aIColor, 1);

    function bindProto(proto) {
      gl.bindBuffer(gl.ARRAY_BUFFER, proto.posBuf);
      gl.enableVertexAttribArray(trLoc.aPos);
      gl.vertexAttribPointer(trLoc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, proto.normBuf);
      gl.enableVertexAttribArray(trLoc.aNormal);
      gl.vertexAttribPointer(trLoc.aNormal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, proto.colorBuf);
      gl.enableVertexAttribArray(trLoc.aColor);
      gl.vertexAttribPointer(trLoc.aColor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, proto.indexBuf);
    }

    function bindInstances(buf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.vertexAttribPointer(trLoc.aIPos,   3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(trLoc.aIScale, 3, gl.FLOAT, false, 36, 12);
      gl.vertexAttribPointer(trLoc.aIColor, 3, gl.FLOAT, false, 36, 24);
    }

    bindProto(treeProtoConifer);
    for (const key in chunks) {
      const c = chunks[key];
      if (!c.coniferCount) continue;
      bindInstances(c.coniferBuf);
      instExt.drawElementsInstancedANGLE(
        gl.TRIANGLES, treeProtoConifer.indexCount, gl.UNSIGNED_SHORT, 0, c.coniferCount);
    }

    bindProto(treeProtoBroadleaf);
    for (const key in chunks) {
      const c = chunks[key];
      if (!c.broadCount) continue;
      bindInstances(c.broadBuf);
      instExt.drawElementsInstancedANGLE(
        gl.TRIANGLES, treeProtoBroadleaf.indexCount, gl.UNSIGNED_SHORT, 0, c.broadCount);
    }

    instExt.vertexAttribDivisorANGLE(trLoc.aIPos,   0);
    instExt.vertexAttribDivisorANGLE(trLoc.aIScale, 0);
    instExt.vertexAttribDivisorANGLE(trLoc.aIColor, 0);
    gl.disableVertexAttribArray(trLoc.aIPos);
    gl.disableVertexAttribArray(trLoc.aIScale);
    gl.disableVertexAttribArray(trLoc.aIColor);
    gl.enable(gl.CULL_FACE);
  }

  // pass 2: water
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.useProgram(waterProg);
  gl.uniformMatrix4fv(wLoc.uVP, false, vp);
  gl.uniform3fv(wLoc.uWaterCol, COL.WATER);
  gl.uniform3fv(wLoc.uFogCol, COL.SKY);
  gl.uniform1f(wLoc.uFogNear, FOG_NEAR);
  gl.uniform1f(wLoc.uFogFar,  FOG_FAR);
  gl.uniform1f(wLoc.uTime, (now - startTime) / 1000);

  for (const key in chunks) {
    const c = chunks[key];
    gl.uniform3f(wLoc.uOffset, c.originX, 0, c.originZ);
    gl.bindBuffer(gl.ARRAY_BUFFER, c.waterPosBuf);
    gl.enableVertexAttribArray(wLoc.aPos);
    gl.vertexAttribPointer(wLoc.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.waterIdxBuf);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }
  gl.depthMask(true);

  fpsAccum += 1 / Math.max(dt, 0.001); fpsCount++; fpsTimer += dt;
  if (fpsTimer > 0.3) {
    statFps.textContent = (fpsAccum / fpsCount).toFixed(0);
    statChunks.textContent = chunkCount;
    statPos.textContent = target.x.toFixed(0) + ', ' + target.z.toFixed(0);
    fpsAccum = 0; fpsCount = 0; fpsTimer = 0;
  }

  requestAnimationFrame(frame);
}

frame();
})();
