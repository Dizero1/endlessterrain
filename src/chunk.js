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

export class TerrainChunk {
  constructor({
    chunkX = 0,
    chunkZ = 0,
    centerX = null,
    centerZ = null,
    yOffset = 0,
    terrain = {},
    trees = {},
    water = {},
  } = {}) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.centerX = centerX;
    this.centerZ = centerZ;
    this.yOffset = yOffset;

    this.terrainOptions = {
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

    this.treeOptions = {
      sampleStep: 6,
      minHeight: 0.22,
      maxHeight: 0.72,
      maxSlope: 0.28,
      scaleMin: 0.75,
      scaleMax: 0.8,
      density: 0.8,
      lod: "high",
      seed: this.terrainOptions.seed + chunkX * 73856093 + chunkZ * 19349663,
      ...trees,
    };

    this.waterOptions = {
      enabled: true,
      level: 0.38,
      opacity: 0.55,
      Lod: water.Lod ?? water.reflectorLod ?? "high",
      ...water,
    };

    this.worldOffsetX = this.centerX ?? this.chunkX * this.terrainOptions.width;
    this.worldOffsetZ = this.centerZ ?? this.chunkZ * this.terrainOptions.depth;

    this.chunk = new THREE.Group();
    this.id = getChunkId(this.chunkX, this.chunkZ);

    this.chunk.name = `terrain-chunk-${this.id}`;
    this.chunk.userData.chunkX = this.chunkX;
    this.chunk.userData.chunkZ = this.chunkZ;
    this.chunk.userData.id = this.id;

    this.buildTerrain();
    this.buildTrees();
    this.buildWater();
  }

  buildTerrain() {
    const terrainMesh = createTerrainMesh({
      ...this.terrainOptions,
      worldOffsetX: this.worldOffsetX,
      worldOffsetZ: this.worldOffsetZ,
    });

    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = false;
    terrainMesh.position.set(
      this.worldOffsetX,
      this.yOffset,
      this.worldOffsetZ,
    );

    if (this.terrainMesh) {
      this.chunk.remove(this.terrainMesh);
      disposeObject3D(this.terrainMesh);
    }

    this.terrainMesh = terrainMesh;
    this.chunk.add(terrainMesh);
  }

  buildTrees() {
    if (this.treeGroup) {
      this.chunk.remove(this.treeGroup);
      disposeObject3D(this.treeGroup);
    }

    const treeGroup = generateTrees(this.terrainMesh, {
      width: this.terrainOptions.width,
      depth: this.terrainOptions.depth,
      heightScale: this.terrainOptions.heightScale,
      segmentsX: this.terrainOptions.segmentsX,
      segmentsY: this.terrainOptions.segmentsY,
      seed: this.treeOptions.seed,
      ...this.treeOptions,
    });

    treeGroup.position.set(this.worldOffsetX, this.yOffset, this.worldOffsetZ);
    this.treeGroup = treeGroup;
    this.chunk.add(treeGroup);
  }

  buildWater() {
    if (this.waterMesh) {
      this.chunk.remove(this.waterMesh);
      disposeObject3D(this.waterMesh);
      this.waterMesh = null;
    }

    const waterOptions = {
      enabled: true,
      level: 0.38,
      opacity: 0.55,
      Lod: this.waterOptions.Lod ?? this.waterOptions.reflectorLod ?? "high",
      ...this.waterOptions,
    };

    if (!waterOptions.enabled) {
      return;
    }

    const waterMesh = createWaterMesh({
      width: this.terrainOptions.width,
      depth: this.terrainOptions.depth,
      heightScale: this.terrainOptions.heightScale,
      level: waterOptions.level,
      opacity: waterOptions.opacity,
      Lod: waterOptions.Lod,
    });

    waterMesh.position.x = this.worldOffsetX;
    waterMesh.position.y += this.yOffset;
    waterMesh.position.z = this.worldOffsetZ;

    this.waterMesh = waterMesh;
    this.chunk.add(waterMesh);
  }

  setLod(lod, { sampleStep, density, reflectorLod } = {}) {
    this.treeOptions = {
      ...this.treeOptions,
      sampleStep: sampleStep ?? this.treeOptions.sampleStep,
      density: density ?? this.treeOptions.density,
      lod,
    };

    this.waterOptions = {
      ...this.waterOptions,
      Lod:
        reflectorLod ?? this.waterOptions.Lod ?? this.waterOptions.reflectorLod,
    };

    this.buildTrees();
    this.buildWater();
  }

  dispose() {
    disposeObject3D(this.chunk);
  }

  get object() {
    return this.chunk;
  }
}

export function createTerrainChunk(options = {}) {
  return new TerrainChunk(options);
}
