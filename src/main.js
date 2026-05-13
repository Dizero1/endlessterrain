import * as THREE from "../build/three.module.js";
import { OrbitControls } from "../build/controls/OrbitControls.js";
import { createTerrainChunk } from "./chunk.js";
import { GUI } from "../build/gui/lil-gui.module.min.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1725);
scene.fog = new THREE.FogExp2(0x0d1725, 0.005);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1200,
);
camera.position.set(20, 0, 40);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, -30, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 10;
controls.maxDistance = 100;

const gui = new GUI();
let CONFIG = {
  seed: 42,
  width: 128,
  depth: 128,
  chunkGridSize: 4,
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
treeFolder
  .add(CONFIG, "treeLod", ["high", "medium", "low"])
  .name("LOD")
  .onChange(regenerateTerrain);

const waterFolder = gui.addFolder("Water Settings");
waterFolder
  .add(CONFIG, "waterEnabled")
  .name("Enabled")
  .onChange(regenerateTerrain);
waterFolder
  .add(CONFIG, "waterLevel", 0, 1, 0.01)
  .name("Level")
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

const grid = new THREE.GridHelper(360, 36, 0x334455, 0x112233);
grid.position.y = -18;
scene.add(grid);

let activeChunks = [];

function regenerateTerrain() {
  activeChunks.forEach((chunk) => {
    scene.remove(chunk.object);
    chunk.dispose();
  });
  activeChunks = [];

  const chunkGridSize = CONFIG.chunkGridSize;
  const chunkWidth = CONFIG.width / chunkGridSize;
  const chunkDepth = CONFIG.depth / chunkGridSize;
  const chunkSegmentsX = 256 / chunkGridSize;
  const chunkSegmentsY = 256 / chunkGridSize;
  const gridCenterOffset = (chunkGridSize - 1) * 0.5;

  for (let chunkZ = 0; chunkZ < chunkGridSize; chunkZ++) {
    for (let chunkX = 0; chunkX < chunkGridSize; chunkX++) {
      const centerX = (chunkX - gridCenterOffset) * chunkWidth;
      const centerZ = (chunkZ - gridCenterOffset) * chunkDepth;
      const chunk = createTerrainChunk({
        chunkX,
        chunkZ,
        centerX,
        centerZ,
        yOffset: -18,
        terrain: {
          width: chunkWidth,
          depth: chunkDepth,
          heightScale: CONFIG.heightScale,
          noiseScale: CONFIG.noiseScale,
          octaves: CONFIG.octaves,
          seed: CONFIG.seed,
          segmentsX: chunkSegmentsX,
          segmentsY: chunkSegmentsY,
        },
        trees: {
          sampleStep: CONFIG.treeSampleStep,
          minHeight: CONFIG.treeMinHeight,
          maxHeight: CONFIG.treeMaxHeight,
          maxSlope: CONFIG.treeMaxSlope,
          scaleMin: CONFIG.treeScale,
          scaleMax: CONFIG.treeScale,
          density: CONFIG.treeDensity,
          lod: CONFIG.treeLod,
        },
        water: {
          enabled: CONFIG.waterEnabled,
          level: CONFIG.waterLevel,
          opacity: CONFIG.waterOpacity,
        },
      });

      activeChunks.push(chunk);
      scene.add(chunk.object);
    }
  }
}

regenerateTerrain();

window.addEventListener("resize", onWindowResize);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
