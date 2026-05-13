import * as THREE from "../build/three.module.js";

function createRandom(seed = 0) {
  let state = Math.floor(seed) >>> 0;

  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createFoliageGeometry(segments = 10, random = Math.random) {
  const foliageGeometry = new THREE.SphereGeometry(1, segments, segments);
  const pos = foliageGeometry.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let nx = x * 0.9;
    let ny = y * 1.2;
    let nz = z * 0.8;
    const noise = 0.15;
    nx += (random() - 0.5) * noise;
    ny += (random() - 0.5) * noise;
    nz += (random() - 0.5) * noise;
    pos.setXYZ(i, nx, ny, nz);
  }

  foliageGeometry.computeVertexNormals();

  return foliageGeometry;
}

function createTreeAssets(lod, random) {
  const trunkSegments = lod === "high" ? 6 : 5;
  const foliageSegments = lod === "high" ? 10 : 6;
  const trunkGeometry = lod === "low"
    ? null
    : new THREE.CylinderGeometry(0.1, 0.16, 1.6, trunkSegments);
  const foliageGeometry = lod === "low"
    ? new THREE.ConeGeometry(0.95, 2.2, 6, 1)
    : createFoliageGeometry(foliageSegments, random);

  return {
    trunkGeometry,
    foliageGeometry,
    trunkMaterial: new THREE.MeshStandardMaterial({ color: 0x7d4d28 }),
    foliageMaterial: new THREE.MeshStandardMaterial({
      color: 0x2f6f2f,
      flatShading: true,
    }),
  };
}

function computeSlopeAtIndex(
  index,
  positionAttribute,
  segmentsX,
  segmentsY,
  width,
  depth,
) {
  const stride = segmentsX + 1;
  const row = Math.floor(index / stride);
  const col = index - row * stride;

  const leftCol = Math.max(col - 1, 0);
  const rightCol = Math.min(col + 1, segmentsX);
  const topRow = Math.max(row - 1, 0);
  const bottomRow = Math.min(row + 1, segmentsY);

  const leftIndex = row * stride + leftCol;
  const rightIndex = row * stride + rightCol;
  const topIndex = topRow * stride + col;
  const bottomIndex = bottomRow * stride + col;

  const heightL = positionAttribute.getY(leftIndex);
  const heightR = positionAttribute.getY(rightIndex);
  const heightT = positionAttribute.getY(topIndex);
  const heightB = positionAttribute.getY(bottomIndex);

  const dx = width / segmentsX;
  const dz = depth / segmentsY;
  const hx = (heightR - heightL) / Math.max(1, 2 * dx);
  const hz = (heightB - heightT) / Math.max(1, 2 * dz);
  return Math.sqrt(hx * hx + hz * hz);
}

function sampleTerrainHeightAt(x, z, positionAttribute, params) {
  const halfWidth = params.width * 0.5;
  const halfDepth = params.depth * 0.5;
  const gridX = THREE.MathUtils.clamp(
    ((x + halfWidth) / params.width) * params.segmentsX,
    0,
    params.segmentsX,
  );
  const gridZ = THREE.MathUtils.clamp(
    ((z + halfDepth) / params.depth) * params.segmentsY,
    0,
    params.segmentsY,
  );

  const col0 = Math.floor(gridX);
  const row0 = Math.floor(gridZ);
  const col1 = Math.min(col0 + 1, params.segmentsX);
  const row1 = Math.min(row0 + 1, params.segmentsY);
  const tx = gridX - col0;
  const tz = gridZ - row0;
  const stride = params.segmentsX + 1;

  const h00 = positionAttribute.getY(row0 * stride + col0);
  const h10 = positionAttribute.getY(row0 * stride + col1);
  const h01 = positionAttribute.getY(row1 * stride + col0);
  const h11 = positionAttribute.getY(row1 * stride + col1);
  const h0 = THREE.MathUtils.lerp(h00, h10, tx);
  const h1 = THREE.MathUtils.lerp(h01, h11, tx);

  return THREE.MathUtils.lerp(h0, h1, tz);
}

function shouldPlaceTree(normalizedHeight, slope, options) {
  if (normalizedHeight < options.minHeight) return false;
  if (normalizedHeight > options.maxHeight) return false;
  if (slope > options.maxSlope) return false;
  return true;
}

export function generateTrees(terrainMesh, options = {}) {
  const params = {
    width: 260,
    depth: 260,
    heightScale: 40,
    segmentsX: 240,
    segmentsY: 240,
    sampleStep: 6,
    minHeight: 0.22,
    maxHeight: 0.72,
    maxSlope: 0.28,
    scaleMin: 0.75,
    scaleMax: 0.80,
    density: 0.8,
    lod: "high",
    seed: 0,
    ...options,
  };

  const random = createRandom(params.seed);
  const positionAttribute = terrainMesh.geometry.getAttribute("position");
  const stride = params.segmentsX + 1;
  const placements = [];

  const treeGroup = new THREE.Group();
  treeGroup.name = `trees-${params.lod}`;

  for (let row = 0; row <= params.segmentsY; row += params.sampleStep) {
    for (let col = 0; col <= params.segmentsX; col += params.sampleStep) {
      if (random() > params.density) continue;

      const index = row * stride + col;
      const y = positionAttribute.getY(index);
      const normalizedHeight = Math.max(
        0,
        Math.min(1, (y / params.heightScale) * 0.5 + 0.5),
      );
      const slope = computeSlopeAtIndex(
        index,
        positionAttribute,
        params.segmentsX,
        params.segmentsY,
        params.width,
        params.depth,
      );

      if (!shouldPlaceTree(normalizedHeight, slope, params)) continue;
      const scale =
        params.scaleMin + random() * (params.scaleMax - params.scaleMin);
      const treeX = positionAttribute.getX(index) + 0.4 - random() * 0.8;
      const treeZ = positionAttribute.getZ(index) + 0.4 - random() * 0.8;
      const treeY = sampleTerrainHeightAt(treeX, treeZ, positionAttribute, params);
      placements.push({
        position: new THREE.Vector3(treeX, treeY, treeZ),
        rotationY: random() * Math.PI * 2,
        scale,
      });
    }
  }

  const assets = createTreeAssets(params.lod, random);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Euler();

  if (assets.trunkGeometry) {
    const trunkMesh = new THREE.InstancedMesh(
      assets.trunkGeometry,
      assets.trunkMaterial,
      placements.length,
    );
    trunkMesh.name = "tree-trunks";
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;

    placements.forEach((placement, index) => {
      position.copy(placement.position);
      position.y += 0.8 * placement.scale;
      rotation.set(0, placement.rotationY, 0);
      quaternion.setFromEuler(rotation);
      scale.set(placement.scale, placement.scale, placement.scale);
      matrix.compose(position, quaternion, scale);
      trunkMesh.setMatrixAt(index, matrix);
    });

    trunkMesh.instanceMatrix.needsUpdate = true;
    treeGroup.add(trunkMesh);
  }

  const foliageMesh = new THREE.InstancedMesh(
    assets.foliageGeometry,
    assets.foliageMaterial,
    placements.length,
  );
  foliageMesh.name = "tree-foliage";
  foliageMesh.castShadow = true;
  foliageMesh.receiveShadow = true;

  placements.forEach((placement, index) => {
    position.copy(placement.position);
    position.y += (params.lod === "low" ? 1.1 : 2.0) * placement.scale;
    rotation.set(0, placement.rotationY, 0);
    quaternion.setFromEuler(rotation);
    scale.set(placement.scale, placement.scale, placement.scale);
    matrix.compose(position, quaternion, scale);
    foliageMesh.setMatrixAt(index, matrix);
  });

  foliageMesh.instanceMatrix.needsUpdate = true;
  treeGroup.add(foliageMesh);
  treeGroup.userData.count = placements.length;
  treeGroup.userData.lod = params.lod;

  return treeGroup;
}
