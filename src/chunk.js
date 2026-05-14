import * as THREE from "../build/three.module.js";
import { createTerrainMesh } from "./terrain.js";
import { generateTrees } from "./tree.js";
import { createWaterMesh } from "./water.js";

export function getChunkId(chunkX, chunkZ) {
  return `${chunkX},${chunkZ}`;
}

function disposeObject3D(object) {
  const geometries = new Set();
  const materials = new Set();

  object.traverse((child) => {
    if (child.geometry) {
      geometries.add(child.geometry);
    }

    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => materials.add(material));
      } else {
        materials.add(child.material);
      }
    }
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export function createTerrainChunk({
  chunkX = 0,
  chunkZ = 0,
  centerX = null,
  centerZ = null,
  yOffset = 0,
  terrain = {},
  trees = {},
  water = {},
} = {}) {
  const terrainOptions = {
    width: 128,
    depth: 128,
    heightScale: 40,
    noiseScale: 0.02,
    octaves: 5,
    seed: 42,
    segmentsX: 256,
    segmentsY: 256,
    ...terrain,
  };

  const worldOffsetX = centerX ?? chunkX * terrainOptions.width;
  const worldOffsetZ = centerZ ?? chunkZ * terrainOptions.depth;
  const chunk = new THREE.Group();
  const id = getChunkId(chunkX, chunkZ);

  chunk.name = `terrain-chunk-${id}`;
  chunk.userData.chunkX = chunkX;
  chunk.userData.chunkZ = chunkZ;
  chunk.userData.id = id;

  const terrainMesh = createTerrainMesh({
    ...terrainOptions,
    worldOffsetX,
    worldOffsetZ,
  });
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = false;
  terrainMesh.position.set(worldOffsetX, yOffset, worldOffsetZ);

  const treeGroup = generateTrees(terrainMesh, {
    width: terrainOptions.width,
    depth: terrainOptions.depth,
    heightScale: terrainOptions.heightScale,
    segmentsX: terrainOptions.segmentsX,
    segmentsY: terrainOptions.segmentsY,
    seed: terrainOptions.seed + chunkX * 73856093 + chunkZ * 19349663,
    ...trees,
  });
  treeGroup.position.set(worldOffsetX, yOffset, worldOffsetZ);

  let waterMesh = null;
  const waterOptions = {
    enabled: true,
    level: 0.38,
    opacity: 0.55,
    ...water,
  };

  if (waterOptions.enabled) {
    waterMesh = createWaterMesh({
      width: terrainOptions.width,
      depth: terrainOptions.depth,
      heightScale: terrainOptions.heightScale,
      level: waterOptions.level,
      opacity: waterOptions.opacity,
      Lod: waterOptions.refelctorLod
    });
    waterMesh.position.x = worldOffsetX;
    waterMesh.position.y += yOffset;
    waterMesh.position.z = worldOffsetZ;
    chunk.add(waterMesh);
  }

  chunk.add(terrainMesh, treeGroup);

  return {
    id,
    chunkX,
    chunkZ,
    object: chunk,
    terrainMesh,
    treeGroup,
    waterMesh,
    dispose() {
      disposeObject3D(chunk);
    },
  };
}
