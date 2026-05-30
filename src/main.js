import * as THREE from "../build/three.module.js";
import { PointerLockControls } from "../build/controls/PointerLockControls.js";
import { createTerrainChunk } from "./chunk.js";
import { getTerrainHeight } from "./tree.js";
import { GUI } from "../build/gui/lil-gui.module.min.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1725);
scene.fog = new THREE.FogExp2(0x0d1725, 0.005);

function createSkySphere() {
  const geometry = new THREE.SphereGeometry(600, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x6ea6d8) },
      horizonColor: { value: new THREE.Color(0xdde8ef) },
      bottomColor: { value: new THREE.Color(0x1d2f3a) },
    },
    vertexShader: `
      varying vec3 vLocalPosition;

      void main() {
        vLocalPosition = position;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vLocalPosition;

      void main() {
        float h = normalize(vLocalPosition).y * 0.5 + 0.5;
        vec3 lower = mix(bottomColor, horizonColor, smoothstep(0.0, 0.55, h));
        vec3 upper = mix(horizonColor, topColor, smoothstep(0.45, 1.0, h));
        vec3 color = mix(lower, upper, smoothstep(0.45, 0.7, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const skySphere = new THREE.Mesh(geometry, material);
  skySphere.name = "sky-sphere";
  skySphere.renderOrder = -1;
  skySphere.frustumCulled = false;

  return skySphere;
}

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1200,
);
camera.position.set(20, -10, 40);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const timer = new THREE.Timer();
const skySphere = createSkySphere();
scene.add(skySphere);

const controls = new PointerLockControls(camera, renderer.domElement);
controls.pointerSpeed = 1.5;
controls.minPolarAngle = Math.PI * 0.01;
controls.maxPolarAngle = Math.PI * 0.99;
controls.enabled = true;

const movementState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  up: false,
  down: false,
};

const cameraController = {
  moveSpeed: 24,
};

function onMouseDown(event) {
  if (event.button !== 0) return;
  if (!controls.isLocked) {
    controls.lock();
  }
}

function setMovementKey(code, isPressed) {
  if (code === "KeyW") movementState.forward = isPressed;
  if (code === "KeyS") movementState.backward = isPressed;
  if (code === "KeyA") movementState.left = isPressed;
  if (code === "KeyD") movementState.right = isPressed;
  if (code === "Space") movementState.up = isPressed;
  if (code === "ShiftLeft" || code === "ShiftRight")
    movementState.down = isPressed;
}

function onKeyDown(event) {
  if (event.code === "Space") {
    event.preventDefault();
  }
  setMovementKey(event.code, true);
}

function onKeyUp(event) {
  setMovementKey(event.code, false);
}

function getcenterchunk() {
  const centerChunkX = getCameraChunkCoordinate1(
    camera.position.x,
    CONFIG.width,
  );
  const centerChunkZ = getCameraChunkCoordinate1(
    camera.position.z,
    CONFIG.depth,
  );
  const chunkId = `${centerChunkX},${centerChunkZ}`;
  return activeChunks.get(chunkId);
}
function updateCameraMovement(deltaTime) {
  const distance = cameraController.moveSpeed * deltaTime;
  if (movementState.forward) controls.moveForward(distance);
  if (movementState.backward) controls.moveForward(-distance);
  if (movementState.left) controls.moveRight(-distance);
  if (movementState.right) controls.moveRight(distance);
  if (movementState.up) camera.position.y += distance;
  if (movementState.down) camera.position.y -= distance;
  // const terrain = getcenterchunk().terrainMesh;
  // const x = camera.position.x - terrain.position.x;
  // const z = camera.position.z - terrain.position.z;
  // const target = camera.position.clone();
  // const height = getTerrainHeight(
  //   target.x,
  //   target.z,
  //   terrain.heightMap,
  //   CONFIG,
  // );

  // const worldHeight = height + terrain.position.y;

  // if (camera.position.y < worldHeight + 0.1) {
  //   camera.position.y = worldHeight + 0.1;
  // }
}

function applyChunkFloatSetting(enabled) {
  if (enabled) {
    for (const chunk of activeChunks.values()) {
      if (chunk.object.position.y < 0) {
        chunk.object.userData.transitionState = "entering";
      } else {
        chunk.object.userData.transitionState = "idle";
        chunk.object.position.y = 0;
      }
    }
    return;
  }

  for (const chunk of activeChunks.values()) {
    chunk.object.userData.transitionState = "idle";
    chunk.object.position.y = 0;
  }

  for (const [chunkId, chunk] of retiringChunks.entries()) {
    retiringChunks.delete(chunkId);
    disposeChunk(chunk);
  }
}

renderer.domElement.addEventListener("mousedown", onMouseDown);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

const gui = new GUI();
gui.close();
let CONFIG = {
  seed: 42,
  width: 32,
  depth: 32,
  segmentsX: 64,
  segmentsY: 64,
  renderRadius: 4,
  highLodRadius: 1,
  mediumLodRadius: 3,
  chunkTransitionEnabled: true,
  chunkTransitionSpeed: 42,
  chunkFloatDistance: 18,
  heightScale: 40,
  noiseScale: 0.02,
  octaves: 5,
  treeMinHeight: 0.42,
  treeMaxHeight: 0.62,
  treeMaxSlope: 0.7,
  treeScale: 0.35,
  treeSampleStep: 2,
  treeDensity: 0.8,
  treeLod: "high",
  waterEnabled: true,
  waterLevel: 0.38,
  waterOpacity: 0.55,
};

gui
  .add(CONFIG, "seed", 0, 9999, 1)
  .name("Seed")
  .onChange((value) => {
    CONFIG.seed = value;
    regenerateTerrain();
  });

gui
  .add(CONFIG, "noiseScale", 0.01, 0.2, 0.001)
  .name("Noise Scale")
  .onChange(regenerateTerrain);
gui
  .add(CONFIG, "renderRadius", 1, 8, 1)
  .name("Render Radius")
  .onChange(regenerateTerrain);
gui
  .add(CONFIG, "chunkTransitionEnabled")
  .name("Chunk Float")
  .onChange((value) => {
    CONFIG.chunkTransitionEnabled = value;
    applyChunkFloatSetting(value);
  });
gui
  .add(CONFIG, "heightScale", 10, 80, 1)
  .name("Height Scale")
  .onChange(regenerateTerrain);
gui.add(CONFIG, "octaves", 1, 8, 1).name("Octaves").onChange(regenerateTerrain);

const treeFolder = gui.addFolder("Tree Settings");
treeFolder
  .add(CONFIG, "treeMaxSlope", 0, 1, 0.01)
  .name("Max Slope")
  .onChange(regenerateTerrain);
treeFolder
  .add(CONFIG, "treeScale", 0.1, 2, 0.05)
  .name("Scale")
  .onChange(regenerateTerrain);
treeFolder
  .add(CONFIG, "treeDensity", 0, 1, 0.05)
  .name("Density")
  .onChange(regenerateTerrain);

const waterFolder = gui.addFolder("Water Settings");
waterFolder
  .add(CONFIG, "waterEnabled")
  .name("Enabled")
  .onChange(regenerateTerrain);
waterFolder
  .add(CONFIG, "waterOpacity", 0, 1, 0.01)
  .name("Opacity")
  .onChange(regenerateTerrain);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.16);
const sunLight = new THREE.DirectionalLight(0xfff4d8, 5.0);
sunLight.position.set(180, 240, 140);
sunLight.castShadow = true;
sunLight.shadow.camera.left = -260;
sunLight.shadow.camera.right = 260;
sunLight.shadow.camera.top = 260;
sunLight.shadow.camera.bottom = -260;
sunLight.shadow.mapSize.set(2048, 2048);

const hemisphereLight = new THREE.HemisphereLight(0x7ea2d8, 0x223128, 0.25);
scene.add(ambientLight, sunLight, hemisphereLight);

// const grid = new THREE.GridHelper(360, 36, 0x334455, 0x112233);
// grid.position.y = -18;
// scene.add(grid);

const activeChunks = new Map();
const retiringChunks = new Map();
const chunkLoadQueue = [];
const pendingChunkIds = new Set();
let desiredChunkIds = new Set();
let lastCameraChunkX = Number.NaN;
let lastCameraChunkZ = Number.NaN;

function getCameraChunkCoordinate1(position, chunkSize) {
  return Math.floor((position + chunkSize * 0.5) / chunkSize);
}

function getChunkLodLevel(chunkX, chunkZ, centerChunkX, centerChunkZ) {
  const distance = Math.max(
    Math.abs(chunkX - centerChunkX),
    Math.abs(chunkZ - centerChunkZ),
  );
  const highLodRadius = Math.min(CONFIG.highLodRadius, CONFIG.renderRadius);
  const mediumLodRadius = Math.min(
    Math.max(CONFIG.mediumLodRadius, highLodRadius + 1),
    CONFIG.renderRadius,
  );

  if (distance <= highLodRadius) return "high";
  if (distance <= mediumLodRadius) return "medium";
  return "low";
}

function getChunkLodSettings(lodLevel) {
  if (lodLevel === "high") {
    return {
      treeSampleStep: CONFIG.treeSampleStep,
      treeDensity: CONFIG.treeDensity,
      treeLod: CONFIG.treeLod,
      reflectorLod: "high",
    };
  }

  if (lodLevel === "medium") {
    return {
      treeSampleStep: CONFIG.treeSampleStep,
      treeDensity: CONFIG.treeDensity * 0.8,
      treeLod: CONFIG.treeLod === "high" ? "medium" : CONFIG.treeLod,
      reflectorLod: "medium",
    };
  }

  return {
    treeSampleStep: Math.max(CONFIG.treeSampleStep * 2, 4),
    treeDensity: CONFIG.treeDensity * 0.8,
    treeLod: "low",
    reflectorLod: "low",
  };
}

function updateChunkLod(chunk, lodLevel) {
  const lodSettings = getChunkLodSettings(lodLevel);
  chunk.setLod(lodLevel, {
    sampleStep: lodSettings.treeSampleStep,
    density: lodSettings.treeDensity,
    reflectorLod: lodSettings.reflectorLod,
  });
  chunk.object.userData.lodLevel = lodLevel;
}

function enqueueChunkLoad(chunkX, chunkZ, lodLevel, distance) {
  const chunkId = `${chunkX},${chunkZ}`;
  if (activeChunks.has(chunkId) || pendingChunkIds.has(chunkId)) {
    return;
  }

  pendingChunkIds.add(chunkId);
  chunkLoadQueue.push({
    chunkId,
    chunkX,
    chunkZ,
    lodLevel,
    distance,
  });
  chunkLoadQueue.sort((a, b) => a.distance - b.distance);
}

function removePendingChunkLoad(chunkId) {
  if (!pendingChunkIds.delete(chunkId)) return;
  const index = chunkLoadQueue.findIndex((task) => task.chunkId === chunkId);
  if (index !== -1) {
    chunkLoadQueue.splice(index, 1);
  }
}

function processChunkLoadQueue(maxLoads = 1) {
  for (let i = 0; i < maxLoads && chunkLoadQueue.length > 0; i += 1) {
    const task = chunkLoadQueue.shift();
    pendingChunkIds.delete(task.chunkId);

    if (activeChunks.has(task.chunkId)) continue;
    if (!desiredChunkIds.has(task.chunkId)) continue;

    const chunk = createChunkAt(
      task.chunkX,
      task.chunkZ,
      task.lodLevel,
      CONFIG.chunkTransitionEnabled,
    );
    activeChunks.set(task.chunkId, chunk);
    scene.add(chunk.object);
  }
}

function createChunkAt(
  chunkX,
  chunkZ,
  lodLevel,
  animate = CONFIG.chunkTransitionEnabled,
) {
  const lodSettings = getChunkLodSettings(lodLevel);
  const chunk = createTerrainChunk({
    chunkX,
    chunkZ,
    yOffset: -18,
    terrain: {
      width: CONFIG.width,
      depth: CONFIG.depth,
      heightScale: CONFIG.heightScale,
      noiseScale: CONFIG.noiseScale,
      octaves: CONFIG.octaves,
      seed: CONFIG.seed,
      segmentsX: CONFIG.segmentsX,
      segmentsY: CONFIG.segmentsY,
    },
    trees: {
      sampleStep: lodSettings.treeSampleStep,
      minHeight: CONFIG.treeMinHeight,
      maxHeight: CONFIG.treeMaxHeight,
      maxSlope: CONFIG.treeMaxSlope,
      scaleMin: CONFIG.treeScale,
      scaleMax: CONFIG.treeScale,
      density: lodSettings.treeDensity,
      lod: lodSettings.treeLod,
    },
    water: {
      enabled: CONFIG.waterEnabled,
      level: CONFIG.waterLevel,
      opacity: CONFIG.waterOpacity,
      reflectorLod: lodSettings.reflectorLod,
    },
  });

  chunk.object.userData.lodLevel = lodLevel;
  chunk.object.userData.transitionState = animate ? "entering" : "idle";
  chunk.object.position.y = animate ? -CONFIG.chunkFloatDistance : 0;

  return chunk;
}

function disposeChunk(chunk) {
  scene.remove(chunk.object);
  chunk.dispose();
}

function retireChunk(chunkId, chunk) {
  activeChunks.delete(chunkId);

  if (!CONFIG.chunkTransitionEnabled) {
    disposeChunk(chunk);
    return;
  }

  chunk.object.userData.transitionState = "exiting";
  retiringChunks.set(chunkId, chunk);
}

function updateChunkTransitions(deltaTime) {
  const step = CONFIG.chunkTransitionSpeed * deltaTime;

  for (const chunk of activeChunks.values()) {
    if (chunk.object.userData.transitionState !== "entering") continue;

    chunk.object.position.y = Math.min(chunk.object.position.y + step, 0);
    if (chunk.object.position.y >= 0) {
      chunk.object.position.y = 0;
      chunk.object.userData.transitionState = "idle";
    }
  }

  for (const [chunkId, chunk] of retiringChunks.entries()) {
    chunk.object.position.y = Math.max(
      chunk.object.position.y - step,
      -CONFIG.chunkFloatDistance,
    );
    if (chunk.object.position.y <= -CONFIG.chunkFloatDistance) {
      retiringChunks.delete(chunkId);
      disposeChunk(chunk);
    }
  }
}

function updateChunkRendering(force = false) {
  const centerChunkX = getCameraChunkCoordinate1(
    camera.position.x,
    CONFIG.width,
  );
  const centerChunkZ = getCameraChunkCoordinate1(
    camera.position.z,
    CONFIG.depth,
  );

  if (
    !force &&
    centerChunkX === lastCameraChunkX &&
    centerChunkZ === lastCameraChunkZ
  ) {
    return;
  }

  lastCameraChunkX = centerChunkX;
  lastCameraChunkZ = centerChunkZ;

  desiredChunkIds = new Set();

  for (let dz = -CONFIG.renderRadius; dz <= CONFIG.renderRadius; dz++) {
    for (let dx = -CONFIG.renderRadius; dx <= CONFIG.renderRadius; dx++) {
      const chunkX = centerChunkX + dx;
      const chunkZ = centerChunkZ + dz;
      const lodLevel = getChunkLodLevel(
        chunkX,
        chunkZ,
        centerChunkX,
        centerChunkZ,
      );
      const distance = Math.max(Math.abs(dx), Math.abs(dz));
      const chunkId = `${chunkX},${chunkZ}`;
      desiredChunkIds.add(chunkId);

      const retiringChunk = retiringChunks.get(chunkId);
      if (retiringChunk) {
        retiringChunks.delete(chunkId);
        removePendingChunkLoad(chunkId);
        if (retiringChunk.object.userData.lodLevel !== lodLevel) {
          updateChunkLod(retiringChunk, lodLevel);
        }
        retiringChunk.object.userData.transitionState =
          CONFIG.chunkTransitionEnabled ? "entering" : "idle";
        if (!CONFIG.chunkTransitionEnabled) {
          retiringChunk.object.position.y = 0;
        }
        activeChunks.set(chunkId, retiringChunk);
      }

      const existingChunk = activeChunks.get(chunkId);
      if (existingChunk) {
        removePendingChunkLoad(chunkId);
        if (existingChunk.object.userData.lodLevel === lodLevel) {
          continue;
        }

        updateChunkLod(existingChunk, lodLevel);
        continue;
      }

      enqueueChunkLoad(chunkX, chunkZ, lodLevel, distance);
    }
  }

  for (const [chunkId, chunk] of activeChunks.entries()) {
    if (desiredChunkIds.has(chunkId)) continue;
    retireChunk(chunkId, chunk);
  }
}

function regenerateTerrain() {
  for (const chunk of activeChunks.values()) {
    disposeChunk(chunk);
  }
  for (const chunk of retiringChunks.values()) {
    disposeChunk(chunk);
  }
  activeChunks.clear();
  retiringChunks.clear();
  lastCameraChunkX = Number.NaN;
  lastCameraChunkZ = Number.NaN;
  updateChunkRendering(true);
}

regenerateTerrain();

window.addEventListener("resize", onWindowResize);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function frame() {
  requestAnimationFrame(frame);
  timer.update();
  const deltaTime = timer.getDelta();
  const elapsedTime = timer.getElapsed();

  updateCameraMovement(deltaTime);
  skySphere.position.copy(camera.position);
  updateChunkRendering();
  processChunkLoadQueue(1);
  updateChunkTransitions(deltaTime);
  renderer.render(scene, camera);
}

frame();
