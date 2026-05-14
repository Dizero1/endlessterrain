import * as THREE from "../build/three.module.js";
import { makeFractalNoise } from "./noise.js";

function getTerrainColor(height, slopeFactor, targetColor) {
  const C1 = new THREE.Color(0xffffff); // Snow
  const C2 = new THREE.Color(0x3b6f2f); // Grass
  const C3 = new THREE.Color(0x7d5a34); // Dirt
  const C4 = new THREE.Color(0x8d8f95); // Rock

  const h1 = 0.18;
  const h2 = 0.32;
  const h3 = 0.4;
  const h4 = 0.6;
  const h5 = 0.72;
  const h6 = 0.68;
  const h7 = 0.82;

  // height = Math.pow(height, 1.35);

  const steepness = THREE.MathUtils.smoothstep(slopeFactor, 0.35, 0.85);

  const terrainColor = C2.clone().lerp(C3, steepness * 0.65);

  const rockWeight =
    1.0 -
    THREE.MathUtils.smoothstep(height, h1, h2) *
    (1.0-THREE.MathUtils.smoothstep(height, h6, h5) * 0.5);

  const grassWeight =
    THREE.MathUtils.smoothstep(height, 0.22, h3) *
    (1.0 - THREE.MathUtils.smoothstep(height, h4, h5));

  const snowWeight =
    THREE.MathUtils.smoothstep(height, h6, h7) * (1.0 - steepness * 0.75);

  const total = Math.max(rockWeight + grassWeight + snowWeight, 0.0001);

  const rw = rockWeight / total;
  const gw = grassWeight / total;
  const sw = snowWeight / total;

  targetColor.setRGB(0, 0, 0);

  targetColor.add(C4.clone().multiplyScalar(rw));

  targetColor.add(terrainColor.clone().multiplyScalar(gw));

  targetColor.add(C1.clone().multiplyScalar(sw));

  const shade = 0.78 + (1.0 - steepness) * 0.18;

  targetColor.multiplyScalar(shade);
}

export function createTerrainGeometry(
  heightMap,
  {
    width = 128,
    depth = 128,
    segmentsX = 256,
    segmentsY = 256,
    heightScale = 45,
    noiseScale = 0.065,
    octaves = 5,
    persistence = 0.55,
    lacunarity = 2,
    seed = 0,
    worldOffsetX = 0,
    worldOffsetZ = 0,
  } = {},
) {
  const vertexCount = (segmentsX + 1) * (segmentsY + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(segmentsX * segmentsY * 6);
  const colors = new Float32Array(vertexCount * 3);

  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;

  let positionIndex = 0;
  let uvIndex = 0;

  for (let row = 0; row <= segmentsY; row++) {
    const v = row / segmentsY;
    const z = v * depth - halfDepth;

    for (let col = 0; col <= segmentsX; col++) {
      const u = col / segmentsX;
      const x = u * width - halfWidth;
      const worldX = x + worldOffsetX;
      const worldZ = z + worldOffsetZ;
      const elevation =
        makeFractalNoise(
          worldX * noiseScale,
          worldZ * noiseScale,
          octaves,
          persistence,
          lacunarity,
          seed,
        ) * heightScale;
      heightMap[row * (segmentsX + 1) + col] = elevation;

      positions[positionIndex++] = x;
      positions[positionIndex++] = elevation;
      positions[positionIndex++] = z;

      uvs[uvIndex++] = u;
      uvs[uvIndex++] = v;
    }
  }

  let indexOffset = 0;
  for (let row = 0; row < segmentsY; row++) {
    for (let col = 0; col < segmentsX; col++) {
      const a = row * (segmentsX + 1) + col;
      const b = a + 1;
      const c = a + segmentsX + 1;
      const d = c + 1;

      indices[indexOffset++] = a;
      indices[indexOffset++] = c;
      indices[indexOffset++] = b;
      indices[indexOffset++] = b;
      indices[indexOffset++] = c;
      indices[indexOffset++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const normalAttribute = geometry.getAttribute("normal");
  const positionAttribute = geometry.getAttribute("position");
  const tempColor = new THREE.Color();
  const stride = segmentsX + 1;
  const dx = width / segmentsX;
  const dz = depth / segmentsY;

  for (let i = 0; i < vertexCount; i++) {
    const row = Math.floor(i / stride);
    const col = i - row * stride;
    const height = positionAttribute.getY(i);
    const normalizedHeight = Math.max(
      0,
      Math.min(1, (height / heightScale) * 0.5 + 0.5),
    );

    const leftIndex = row * stride + Math.max(col - 1, 0);
    const rightIndex = row * stride + Math.min(col + 1, segmentsX);
    const topIndex = Math.max(row - 1, 0) * stride + col;
    const bottomIndex = Math.min(row + 1, segmentsY) * stride + col;

    const heightL = positionAttribute.getY(leftIndex);
    const heightR = positionAttribute.getY(rightIndex);
    const heightT = positionAttribute.getY(topIndex);
    const heightB = positionAttribute.getY(bottomIndex);

    const hx = (heightR - heightL) / (2 * dx);
    const hz = (heightB - heightT) / (2 * dz);
    const slope = Math.sqrt(hx * hx + hz * hz);
    const slopeFactor = Math.min(1, slope);

    getTerrainColor(normalizedHeight, slopeFactor, tempColor);
    colors[i * 3] = tempColor.r;
    colors[i * 3 + 1] = tempColor.g;
    colors[i * 3 + 2] = tempColor.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function createTerrainMesh(options = {}) {
  const heightMap = new Float32Array(
    (options.segmentsX + 1) * (options.segmentsY + 1),
  );
  const geometry = createTerrainGeometry(heightMap, options);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    flatShading: false,
    roughness: 0.85,
    metalness: 0.05,
  });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.heightMap = heightMap;
  return terrain;
}
