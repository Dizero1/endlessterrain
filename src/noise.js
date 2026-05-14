/**
 * noise.js — Ken Perlin 风格的二维梯度噪声
 * noise.js — 2-D gradient noise in the style of Ken Perlin (2002)
 *
 * 提供两个函数：
 *   makeNoise(x, y, seed)          — 单层噪声，返回 [-1, 1]
 *   makeFractalNoise(x, y, ...)    — 多倍频叠加（fBm），返回近似 [-1, 1]
 *
 * Exports:
 *   makeNoise(x, y, seed)          — single-layer noise, returns [-1, 1]
 *   makeFractalNoise(x, y, ...)    — multi-octave fBm, returns approx [-1, 1]
 */

// 标准 Perlin 置换表（256 个随机整数）
// Standard Perlin permutation table (256 random integers)
const perm = [
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140,
  36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234,
  75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237,
  149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48,
  27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105,
  92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73,
  209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86,
  164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38,
  147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189,
  28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101,
  155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232,
  178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12,
  191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31,
  181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254,
  138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215,
  61, 156, 180,
];

// 平滑曲线 6t^5 - 15t^4 + 10t^3（Perlin 2002 改进版，消除二阶导数跳变）
// Smoothstep curve: 6t^5 - 15t^4 + 10t^3 (Perlin 2002 improved, eliminates second-derivative discontinuity)
function _blend(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// 双线性插值辅助 / Bilinear interpolation helper
function _p(n00, n10, n01, n11, u, v) {
  const ix0 = n00 + u * (n10 - n00);
  const ix1 = n01 + u * (n11 - n01);
  return ix0 + v * (ix1 - ix0);
}

// 2-D 梯度函数：根据哈希值选择 8 个方向之一
// 2-D gradient: selects one of 8 directions based on hash
function _grad(hash, x, y) {
  const h  = hash & 7;
  const gx = (h & 1) === 0 ?  x : -x;
  const gy = (h & 2) === 0 ?  y : -y;
  return gx + gy;
}

/**
 * 单层 2-D Perlin 噪声，返回 [-1, 1]。
 * seed 为整数偏移量，用于生成不同的噪声场。
 *
 * Single-layer 2-D Perlin noise, returns [-1, 1].
 * seed is an integer offset to generate distinct noise fields.
 */
export function makeNoise(x, y, seed = 0) {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u  = _blend(xf);
  const v  = _blend(yf);
  const si = Math.floor(seed) & 255;

  // 四角置换索引 / Corner permutation indices
  const aa = perm[(perm[ xi          ] + yi       + si) & 255];
  const ab = perm[(perm[ xi          ] + (yi + 1) + si) & 255];
  const ba = perm[(perm[(xi + 1) & 255] + yi       + si) & 255];
  const bb = perm[(perm[(xi + 1) & 255] + (yi + 1) + si) & 255];

  return _p(
    _grad(aa, xf,     yf    ),
    _grad(ba, xf - 1, yf    ),
    _grad(ab, xf,     yf - 1),
    _grad(bb, xf - 1, yf - 1),
    u, v
  );
}

/**
 * 分形布朗运动（fBm）：将多个频率的噪声叠加，模拟自然细节。
 * 层数越多细节越丰富，但计算量也越大。
 *
 * Fractional Brownian Motion (fBm): sums multiple noise octaves
 * to simulate natural detail at multiple scales.
 * More octaves = richer detail but higher cost.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} octaves     — 倍频层数 / number of octave layers
 * @param {number} persistence — 每层振幅衰减 / amplitude decay per octave
 * @param {number} lacunarity  — 每层频率倍增 / frequency multiplier per octave
 * @param {number} seed
 * @returns {number} 近似 [-1, 1] / approximately [-1, 1]
 */
export function makeFractalNoise(
  x,
  y,
  octaves     = 4,
  persistence = 0.5,
  lacunarity  = 2,
  seed        = 0,
) {
  let total        = 0;
  let amplitude    = 1;
  let frequency    = 1;
  let maxAmplitude = 0;

  for (let octave = 0; octave < octaves; octave++) {
    total        += makeNoise(x * frequency, y * frequency, seed + octave * 31) * amplitude;
    maxAmplitude += amplitude;
    amplitude    *= persistence;
    frequency    *= lacunarity;
  }

  return total / maxAmplitude;
}
