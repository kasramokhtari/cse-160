import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const MAP_SIZE = 32;
const HALF = MAP_SIZE / 2;

const PLAYER_RADIUS = 0.3;
const PLAYER_EYE_Y = 1.6;

const FALLBACK_GROUND = 0x4a8a3a;
const FALLBACK_WALL = 0x9a6a3a;
const FALLBACK_COBBLE = 0x888888;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 25, 80);

let skyDomeMaterial = null;
let skyTextured = false;
(function addSkyDome() {
  new THREE.TextureLoader().load(
    "./textures/skybox/Panorama_Sky_08-512x512.png",
    (tex) => {
      skyDomeMaterial = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.BackSide,
        fog: false,
      });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(250, 32, 16), skyDomeMaterial);
      scene.add(dome);
      skyTextured = true;
      scene.background = null;
    },
    undefined,
    () => console.warn("Failed to load sky panorama; using plain sky color fallback.")
  );
})();

const worldContainer = document.getElementById("world-container");

const camera = new THREE.PerspectiveCamera(
  70,
  worldContainer.clientWidth / worldContainer.clientHeight,
  0.1,
  500
);
camera.position.set(0, PLAYER_EYE_Y, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(worldContainer.clientWidth, worldContainer.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
worldContainer.appendChild(renderer.domElement);

window.addEventListener("resize", () => {
  const w = worldContainer.clientWidth;
  const h = worldContainer.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// Controls
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

const lockPrompt = document.getElementById("lockPrompt");
lockPrompt.addEventListener("click", () => controls.lock());
controls.addEventListener("lock", () => lockPrompt.classList.add("hidden"));
controls.addEventListener("unlock", () => {
  if (game.state === STATE_WON || game.state === STATE_LOST) return;
  lockPrompt.classList.remove("hidden");
});

const move = { forward: false, backward: false, left: false, right: false };

document.addEventListener("keydown", (e) => {
  switch (e.code) {
    case "KeyW": move.forward = true; break;
    case "KeyS": move.backward = true; break;
    case "KeyA": move.left = true; break;
    case "KeyD": move.right = true; break;
  }
});
document.addEventListener("keyup", (e) => {
  switch (e.code) {
    case "KeyW": move.forward = false; break;
    case "KeyS": move.backward = false; break;
    case "KeyA": move.left = false; break;
    case "KeyD": move.right = false; break;
  }
});

// Textures
const textureLoader = new THREE.TextureLoader();

function loadTexture(url, { repeat = null } = {}) {
  return new Promise((resolve) => {
    textureLoader.load(
      url,
      (tex) => {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestMipmapLinearFilter;
        if (repeat) {
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(repeat[0], repeat[1]);
        }
        resolve(tex);
      },
      undefined,
      () => {
        console.warn("Failed to load texture: " + url + " (using fallback color)");
        resolve(null);
      }
    );
  });
}

function makeMaterial(tex, fallbackColor) {
  return new THREE.MeshStandardMaterial({
    map: tex || null,
    color: tex ? 0xffffff : fallbackColor,
    roughness: 0.95,
    metalness: 0.0,
  });
}

// map
function buildMap() {
  const m = [];
  for (let i = 0; i < MAP_SIZE; i++) {
    const row = [];
    for (let j = 0; j < MAP_SIZE; j++) row.push(0);
    m.push(row);
  }

  for (let i = 0; i < MAP_SIZE; i++) {
    m[0][i] = 4;
    m[MAP_SIZE - 1][i] = 4;
    m[i][0] = 4;
    m[i][MAP_SIZE - 1] = 4;
  }

  const pillars = [
    [5, 5, 3], [5, 10, 2], [5, 15, 1],
    [10, 5, 2], [10, 20, 3], [10, 26, 1],
    [15, 8, 1], [15, 22, 2],
    [20, 5, 3], [20, 12, 2], [20, 26, 3],
    [25, 8, 1], [25, 18, 2], [25, 25, 4],
  ];
  for (const [r, c, h] of pillars) m[r][c] = h;

  for (let c = 14; c <= 20; c++) m[12][c] = 2;

  m[3][27] = 1; m[3][28] = 1; m[3][29] = 1;
  m[4][27] = 1; m[4][28] = 2; m[4][29] = 1;
  m[5][27] = 1; m[5][29] = 1;

  return m;
}

const COBBLE_CELLS = new Set([
  "3,27", "3,28", "3,29",
  "4,27", "4,28", "4,29",
  "5,27", "5,29",
  "5,5", "25,25",
]);

let worldMap = null;

function cellToWorld(row, col) {
  return { x: col - HALF + 0.5, z: row - HALF + 0.5 };
}

async function buildWorld() {
  const [groundTex, wallTex, cobbleTex] = await Promise.all([
    loadTexture("./textures/ground.png", { repeat: [MAP_SIZE, MAP_SIZE] }),
    loadTexture("./textures/wall.png"),
    loadTexture("./textures/cobble.jpeg"),
  ]);

  // Flat grass ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE),
    makeMaterial(groundTex, FALLBACK_GROUND)
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // One shared block geometry reused for every wall block.
  const blockGeom = new THREE.BoxGeometry(1, 1, 1);
  const wallMat = makeMaterial(wallTex, FALLBACK_WALL);
  const cobbleMat = makeMaterial(cobbleTex, FALLBACK_COBBLE);

  worldMap = buildMap();
  for (let i = 0; i < MAP_SIZE; i++) {
    for (let j = 0; j < MAP_SIZE; j++) {
      const h = worldMap[i][j];
      if (h <= 0) continue;
      const mat = COBBLE_CELLS.has(i + "," + j) ? cobbleMat : wallMat;
      const { x, z } = cellToWorld(i, j);
      for (let y = 0; y < h; y++) {
        const block = new THREE.Mesh(blockGeom, mat);
        block.position.set(x, y + 0.5, z);
        block.castShadow = true;
        block.receiveShadow = true;
        scene.add(block);
      }
    }
  }
}

const ambient = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff2cc, 0.9);
sun.position.set(20, 30, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
scene.add(sun);

const shrine = cellToWorld(4, 28); // cat pedestal cell
const beaconLight = new THREE.PointLight(0xffcc66, 1.6, 12);
beaconLight.position.set(shrine.x, 3.6, shrine.z);
scene.add(beaconLight);

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2e6b2e, roughness: 0.85 });
const torchWoodMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.9 });
const flameMat = new THREE.MeshStandardMaterial({
  color: 0xffaa22, emissive: 0xff7700, emissiveIntensity: 1.1,
});

function makePineTree() {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.0, 10), trunkMat);
  trunk.position.y = 0.5;
  trunk.castShadow = true;
  tree.add(trunk);
  const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.6, 12), leavesMat);
  leaves.position.y = 1.8;
  leaves.castShadow = true;
  tree.add(leaves);
  return tree;
}

function makeTorch() {
  const torch = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 8), torchWoodMat);
  stick.position.y = 0.35;
  stick.castShadow = true;
  torch.add(stick);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 8), flameMat);
  flame.position.y = 0.85;
  torch.add(flame);
  return torch;
}

const treeObstacles = [];
const animalObstacles = [];
const TREE_COLLIDER_RADIUS = 0.45;

const treeCells = [
  [10, 10], [6, 18], [18, 9], [22, 17], [14, 18], [6, 22], [27, 11],
];
for (const [r, c] of treeCells) {
  const { x, z } = cellToWorld(r, c);
  const tree = makePineTree();
  tree.position.set(x, 0, z);
  scene.add(tree);
  treeObstacles.push({ x, z, radius: TREE_COLLIDER_RADIUS });
}

const torchFlames = [];
for (const spot of [cellToWorld(6, 27), cellToWorld(6, 29)]) {
  const torch = makeTorch();
  torch.position.set(spot.x, 0, spot.z);
  scene.add(torch);
  torchFlames.push(torch.children[1]);
}

const beaconOrb = new THREE.Mesh(
  new THREE.SphereGeometry(0.28, 20, 20),
  new THREE.MeshStandardMaterial({ color: 0xffcc66, emissive: 0xffaa22, emissiveIntensity: 1.4 })
);
beaconOrb.position.set(shrine.x, 3.6, shrine.z);
scene.add(beaconOrb);
const beaconBaseY = beaconOrb.position.y;

const gltfLoader = new GLTFLoader();

let zombieProto = null;
const zombieSpawns = [
  { x: -10, z: -10 },
  { x: 10,  z: -8 },
  { x: -9,  z: 6 },
  { x: 11,  z: 4 },
];

function loadModel(url) {
  return new Promise((resolve) => {
    gltfLoader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => {
        console.warn("Failed to load model: " + url, err);
        resolve(null);
      }
    );
  });
}

function makePrototype(modelOrNull, fallbackColor, targetHeight) {
  const proto = new THREE.Group();
  if (modelOrNull) {
    const inner = modelOrNull;
    const box = new THREE.Box3().setFromObject(inner);
    const size = new THREE.Vector3();
    box.getSize(size);
    inner.scale.setScalar(size.y > 0 ? targetHeight / size.y : 1);

    box.setFromObject(inner);
    inner.position.x = -(box.min.x + box.max.x) / 2;
    inner.position.y = -box.min.y;
    inner.position.z = -(box.min.z + box.max.z) / 2;

    inner.traverse((c) => {
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
    });
    proto.add(inner);
  } else {
    const fb = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, targetHeight, 0.6),
      new THREE.MeshStandardMaterial({ color: fallbackColor })
    );
    fb.position.y = targetHeight / 2;
    fb.castShadow = true;
    proto.add(fb);
  }
  return proto;
}

function placeInstance(proto, x, y, z, ry = 0) {
  const inst = proto.clone(true);
  inst.position.set(x, y, z);
  inst.rotation.y = ry;
  scene.add(inst);
  return inst;
}

function placeAnimal(proto, row, col, ry, radius) {
  const { x, z } = cellToWorld(row, col);
  placeInstance(proto, x, 0, z, ry);
  animalObstacles.push({ x, z, radius });
}

async function loadAndPlaceMobs() {
  const [catModel, sheepModel, cowModel, pigModel, zombieModel] = await Promise.all([
    loadModel("./models/cat.glb"),
    loadModel("./models/sheep.glb"),
    loadModel("./models/cow.glb"),
    loadModel("./models/pig.glb"),
    loadModel("./models/zombie.glb"),
  ]);

  const catProto   = makePrototype(catModel,   0xffcc66, 0.7);
  const sheepProto = makePrototype(sheepModel, 0xeeeeee, 1.0);
  const cowProto   = makePrototype(cowModel,   0x553311, 1.2);
  const pigProto   = makePrototype(pigModel,   0xff99aa, 0.8);
  zombieProto      = makePrototype(zombieModel, 0x33aa33, 1.9);

  placeInstance(catProto, shrine.x, 2.0, shrine.z, Math.PI);

  placeAnimal(sheepProto, 8, 8,  0.3,  0.45);
  placeAnimal(sheepProto, 24, 22, -0.6, 0.45);
  placeAnimal(cowProto,   16, 5,  1.2,  0.55);
  placeAnimal(cowProto,   16, 12, -1.4, 0.55);
  placeAnimal(pigProto,   8, 16,  0.0,  0.4);
  placeAnimal(pigProto,   24, 14, 2.0,  0.4);
}

// Collision
function isPositionWalkable(x, z, radius = PLAYER_RADIUS) {
  if (!worldMap) return true;

  const offsets = [-radius, radius];
  for (let a = 0; a < 2; a++) {
    for (let b = 0; b < 2; b++) {
      const col = Math.floor(x + offsets[a] + HALF);
      const row = Math.floor(z + offsets[b] + HALF);
      if (row < 0 || row >= MAP_SIZE || col < 0 || col >= MAP_SIZE) return false;
      if (worldMap[row][col] > 0) return false;
    }
  }

  for (const o of treeObstacles.concat(animalObstacles)) {
    const dx = x - o.x;
    const dz = z - o.z;
    const minD = radius + o.radius;
    if (dx * dx + dz * dz < minD * minD) return false;
  }
  return true;
}

function applySlideMovement(dx, dz) {
  if (dx === 0 && dz === 0) return;
  const px = camera.position.x;
  const pz = camera.position.z;
  if (isPositionWalkable(px + dx, pz + dz)) {
    camera.position.x = px + dx;
    camera.position.z = pz + dz;
  } else if (dx !== 0 && isPositionWalkable(px + dx, pz)) {
    camera.position.x = px + dx;
  } else if (dz !== 0 && isPositionWalkable(px, pz + dz)) {
    camera.position.z = pz + dz;
  }
}

// player movement
const MOVE_SPEED = 5.0;

let prevTime = performance.now();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

function updateMovement(dt) {
  if (!controls.isLocked) return;
  if (game.state === STATE_WON || game.state === STATE_LOST) return;

  const forwardInput = Number(move.forward) - Number(move.backward);
  const rightInput = Number(move.right) - Number(move.left);
  if (forwardInput === 0 && rightInput === 0) return;

  camera.getWorldDirection(_forward);
  _forward.y = 0;
  if (_forward.lengthSq() === 0) return;
  _forward.normalize();
  _right.crossVectors(_forward, _worldUp).normalize();

  const len = Math.hypot(rightInput, forwardInput);
  const stepX = (_forward.x * forwardInput + _right.x * rightInput) / len;
  const stepZ = (_forward.z * forwardInput + _right.z * rightInput) / len;

  applySlideMovement(stepX * MOVE_SPEED * dt, stepZ * MOVE_SPEED * dt);
  camera.position.y = PLAYER_EYE_Y; // no flying
}

const STATE_NOT_STARTED = "not_started";
const STATE_PLAYING = "playing";
const STATE_WON = "won";
const STATE_LOST = "lost";

const STATE_LABELS = {
  not_started: "Not started",
  playing: "Playing",
  won: "You won!",
  lost: "You lost",
};

const GAME_DURATION = 20.0;
const ZOMBIE_SPEED = 1.6;
const ZOMBIE_CATCH_RADIUS = 1.0;
const ZOMBIE_RADIUS = 0.35;
const WIN_DISTANCE = 1.8;
const SPAWN_POS = new THREE.Vector3(0, PLAYER_EYE_Y, 12);


const ZOMBIE_MODEL_Y_OFFSET = Math.PI;

const game = {
  state: STATE_NOT_STARTED,
  timeRemaining: 0,
  wins: 0,
  losses: 0,
  zombies: [],
};

// Zombies
function clearZombies() {
  for (const z of game.zombies) scene.remove(z);
  game.zombies = [];
}

function isZombiePositionWalkable(x, z, alreadyPlaced) {
  if (!isPositionWalkable(x, z, ZOMBIE_RADIUS)) return false;
  if ((x - SPAWN_POS.x) ** 2 + (z - SPAWN_POS.z) ** 2 < 16) return false;
  if ((x - shrine.x) ** 2 + (z - shrine.z) ** 2 < 9) return false;
  for (const o of alreadyPlaced) {
    if ((x - o.x) ** 2 + (z - o.z) ** 2 < 2.25) return false;
  }
  return true;
}

function findOpenZombieSpawn(preferredX, preferredZ, alreadyPlaced) {
  if (isZombiePositionWalkable(preferredX, preferredZ, alreadyPlaced)) {
    return { x: preferredX, z: preferredZ };
  }
  for (const r of [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const nx = preferredX + Math.cos(a) * r;
      const nz = preferredZ + Math.sin(a) * r;
      if (isZombiePositionWalkable(nx, nz, alreadyPlaced)) return { x: nx, z: nz };
    }
  }
  return null;
}

function makeZombieInstance(x, z) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);

  const visual = new THREE.Group();
  visual.rotation.y = ZOMBIE_MODEL_Y_OFFSET;

  let clonedZombie = null;
  if (zombieProto) {
    clonedZombie = SkeletonUtils.clone(zombieProto);
    visual.add(clonedZombie);
  } else {
    const fb = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.9, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x33aa33 })
    );
    fb.position.y = 0.95;
    fb.castShadow = true;
    visual.add(fb);
  }
  root.add(visual);
  root.userData.visual = visual;

  root.userData.swingPhase = Math.random() * Math.PI * 2;
  root.userData.limbs = {};
  if (clonedZombie) {
    const LIMB_SPEC = [
      ["leftArm",  "leftArm_10",  +1],
      ["rightArm", "rightArm_7",  -1],
      ["leftLeg",  "leftLeg_14",  -1],
      ["rightLeg", "rightLeg_12", +1],
    ];
    for (const [key, nodeName, dir] of LIMB_SPEC) {
      const node = clonedZombie.getObjectByName(nodeName);
      if (node) root.userData.limbs[key] = { node, baseRotX: node.rotation.x, dir };
    }
  }
  return root;
}

function spawnZombies() {
  clearZombies();
  if (!zombieProto) return;
  const placed = [];
  for (const s of zombieSpawns) {
    const safe = findOpenZombieSpawn(s.x, s.z, placed);
    if (!safe) continue;
    const inst = makeZombieInstance(safe.x, safe.z);
    scene.add(inst);
    game.zombies.push(inst);
    placed.push(safe);
  }
}

function updateZombies(dt) {
  if (game.state !== STATE_PLAYING) return;
  const px = camera.position.x;
  const pz = camera.position.z;

  for (const z of game.zombies) {
    const dx = px - z.position.x;
    const dz = pz - z.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < ZOMBIE_CATCH_RADIUS) {
      onPlayerLost("zombie");
      return;
    }
    if (dist < 0.01) continue;

    // Step toward the player with the same try-full / X-slide / Z-slide logic.
    const nextX = z.position.x + (dx / dist) * ZOMBIE_SPEED * dt;
    const nextZ = z.position.z + (dz / dist) * ZOMBIE_SPEED * dt;
    if (isPositionWalkable(nextX, nextZ, ZOMBIE_RADIUS)) {
      z.position.x = nextX;
      z.position.z = nextZ;
    } else if (isPositionWalkable(nextX, z.position.z, ZOMBIE_RADIUS)) {
      z.position.x = nextX;
    } else if (isPositionWalkable(z.position.x, nextZ, ZOMBIE_RADIUS)) {
      z.position.z = nextZ;
    }

    // Face the player
    z.lookAt(px, z.position.y, pz);

    const limbs = z.userData.limbs;
    if (limbs) {
      const swing = Math.sin(performance.now() / 1000 * 8 + z.userData.swingPhase) * 0.6;
      for (const key in limbs) {
        limbs[key].node.rotation.x = limbs[key].baseRotX + limbs[key].dir * swing;
      }
    }
  }
}

function checkWinCondition() {
  if (game.state !== STATE_PLAYING) return;
  const dx = camera.position.x - shrine.x;
  const dz = camera.position.z - shrine.z;
  if (Math.hypot(dx, dz) < WIN_DISTANCE) onPlayerWon();
}

function startGame() {
  camera.position.copy(SPAWN_POS);
  ensureSafeSpawn();
  camera.rotation.set(0, 0, 0);

  spawnZombies();
  game.state = STATE_PLAYING;
  game.timeRemaining = GAME_DURATION;
  resetSkyToDay();
  hideResult();
  updateHUD();
}

function onPlayerWon() {
  if (game.state !== STATE_PLAYING) return;
  game.state = STATE_WON;
  game.wins++;
  clearZombies();
  showResult(true);
  updateHUD();
  controls.unlock();
}

function onPlayerLost(reason) {
  if (game.state !== STATE_PLAYING) return;
  game.state = STATE_LOST;
  game.losses++;
  for (const z of game.zombies) {
    const limbs = z.userData.limbs;
    if (!limbs) continue;
    for (const key in limbs) limbs[key].node.rotation.x = limbs[key].baseRotX;
  }
  showResult(false, reason);
  updateHUD();
  controls.unlock();
}

function updateGame(dt) {
  if (game.state !== STATE_PLAYING) return;
  game.timeRemaining -= dt;
  if (game.timeRemaining <= 0) {
    game.timeRemaining = 0;
    updateSkyByTime();
    onPlayerLost("time");
    return;
  }
  updateZombies(dt);
  checkWinCondition();
  updateSkyByTime();
  updateHUD();
}

// Dynamic sunset sky
const SKY_DAY = new THREE.Color(0x87ceeb);
const SKY_SUNSET = new THREE.Color(0xff7a33);
const SKY_NIGHT = new THREE.Color(0x3a1f4d);
const SUN_DAY = new THREE.Color(0xfff2cc);
const SUN_SUNSET = new THREE.Color(0xff4d1a);
const TINT_DAY = new THREE.Color(0xffffff);  
const TINT_SUNSET = new THREE.Color(0xff9a55);
const TINT_NIGHT = new THREE.Color(0x6e4d7a);
const AMB_DAY = new THREE.Color(0xffffff);
const AMB_SUNSET = new THREE.Color(0xffd2b0);

const _skyScratch = new THREE.Color();
const _sunScratch = new THREE.Color();
const _tintScratch = new THREE.Color();
const _ambScratch = new THREE.Color();

// progress 0 = day, 1 = end of sunset.
function setSkyByProgress(progress) {
  const p = Math.max(0, Math.min(1, progress));

  if (p < 0.5) {
    _skyScratch.lerpColors(SKY_DAY, SKY_SUNSET, p / 0.5);
    _tintScratch.lerpColors(TINT_DAY, TINT_SUNSET, p / 0.5);
  } else {
    _skyScratch.lerpColors(SKY_SUNSET, SKY_NIGHT, (p - 0.5) / 0.5);
    _tintScratch.lerpColors(TINT_SUNSET, TINT_NIGHT, (p - 0.5) / 0.5);
  }

  if (skyTextured && skyDomeMaterial) {
    skyDomeMaterial.color.copy(_tintScratch);
  } else if (scene.background) {
    scene.background.copy(_skyScratch);
  }
  if (scene.fog) scene.fog.color.copy(_skyScratch);

  _sunScratch.lerpColors(SUN_DAY, SUN_SUNSET, p);
  sun.color.copy(_sunScratch);
  sun.intensity = 0.9 - 0.45 * p;

  _ambScratch.lerpColors(AMB_DAY, AMB_SUNSET, p);
  ambient.color.copy(_ambScratch);
  ambient.intensity = 0.35 + 0.15 * p;
}

function resetSkyToDay() {
  setSkyByProgress(0);
}

function updateSkyByTime() {
  setSkyByProgress(1 - game.timeRemaining / GAME_DURATION);
}

// HUD + result overlay
function updateHUD() {
  const stateEl = document.getElementById("gameState");
  const timerEl = document.getElementById("gameTimer");
  const scoreEl = document.getElementById("gameScore");
  const btnEl = document.getElementById("startBtn");

  if (stateEl) stateEl.textContent = "State: " + STATE_LABELS[game.state];
  if (timerEl) {
    timerEl.textContent = game.state === STATE_PLAYING
      ? "Time remaining: " + game.timeRemaining.toFixed(1) + "s"
      : "Time remaining: --";
  }
  if (scoreEl) scoreEl.textContent = "Wins: " + game.wins + "   Losses: " + game.losses;
  if (btnEl) btnEl.textContent = game.state === STATE_NOT_STARTED ? "Start Game" : "Restart Game";
}

function showResult(won, reason) {
  const overlay = document.getElementById("resultOverlay");
  const title = document.getElementById("resultTitle");
  const subtitle = document.getElementById("resultSubtitle");
  if (!overlay || !title || !subtitle) return;
  if (won) {
    title.textContent = "You Win!";
    subtitle.textContent = "You reached the cat in time!";
    overlay.className = "result-visible win";
  } else {
    title.textContent = "You Lose";
    subtitle.textContent = reason === "time" ? "Time ran out." : "A zombie got you!";
    overlay.className = "result-visible lose";
  }
}

function hideResult() {
  const overlay = document.getElementById("resultOverlay");
  if (overlay) overlay.className = "";
}

// Buttons. Both scroll back to the top so the canvas is fully visible.
const startBtn = document.getElementById("startBtn");
if (startBtn) {
  startBtn.addEventListener("click", () => {
    startGame();
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!controls.isLocked) {
      try { controls.lock(); } catch (err) { }
    }
  });
}

const resetWorldBtn = document.getElementById("resetWorldBtn");
if (resetWorldBtn) {
  resetWorldBtn.addEventListener("click", () => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, behavior: "smooth" });
    location.reload();
  });
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min(0.05, (now - prevTime) / 1000);
  prevTime = now;
  const t = now / 1000;

  beaconOrb.position.y = beaconBaseY + Math.sin(t * 1.5) * 0.2;
  beaconOrb.rotation.y += dt * 0.8;
  beaconLight.intensity = 1.4 + Math.sin(t * 3.0) * 0.3;
  beaconLight.position.y = beaconOrb.position.y;

  // Torch flame flicker.
  const flicker = 0.9 + Math.sin(t * 12.0) * 0.1 + Math.sin(t * 7.0) * 0.05;
  for (const f of torchFlames) f.scale.y = flicker;

  updateGame(dt);
  updateMovement(dt);
  renderer.render(scene, camera);
}

function ensureSafeSpawn() {
  if (isPositionWalkable(camera.position.x, camera.position.z)) return;
  for (const [fx, fz] of [[0, 12], [0, -12], [12, 0], [-12, 0], [0, 0]]) {
    if (isPositionWalkable(fx, fz)) {
      camera.position.set(fx, PLAYER_EYE_Y, fz);
      return;
    }
  }
}

buildWorld().then(loadAndPlaceMobs).then(() => {
  ensureSafeSpawn();
  updateHUD();
  animate();
});
