// shaders
var VSHADER_SOURCE = `
  attribute vec4 a_Position;
  attribute vec2 a_TexCoord;
  uniform mat4 u_ModelMatrix;
  uniform mat4 u_ViewMatrix;
  uniform mat4 u_ProjectionMatrix;
  varying vec2 v_TexCoord;
  void main() {
    gl_Position = u_ProjectionMatrix * u_ViewMatrix * u_ModelMatrix * a_Position;
    v_TexCoord = a_TexCoord;
  }`;

var FSHADER_SOURCE = `
  precision mediump float;
  uniform vec4 u_FragColor;
  uniform sampler2D u_Sampler0;     // 0 = grass / ground
  uniform sampler2D u_Sampler1;     // 1 = dirt  / walls
  uniform sampler2D u_Sampler2;     // 2 = cobblestone (tower + accent blocks)
  uniform int u_whichTexture;
  uniform vec2 u_TexScale;
  varying vec2 v_TexCoord;
  void main() {
    vec2 uv = v_TexCoord * u_TexScale;
    if (u_whichTexture == -1) {
      gl_FragColor = u_FragColor;
    } else if (u_whichTexture == 0) {
      gl_FragColor = texture2D(u_Sampler0, uv);
    } else if (u_whichTexture == 1) {
      gl_FragColor = texture2D(u_Sampler1, uv);
    } else if (u_whichTexture == 2) {
      gl_FragColor = texture2D(u_Sampler2, uv);
    } else {
      gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); // bad id -> magenta
    }
  }`;



// global vars
let canvas;
let gl;
let a_Position;
let a_TexCoord;
let u_FragColor;
let u_ModelMatrix;
let u_ViewMatrix;
let u_ProjectionMatrix;
let u_Sampler0;
let u_Sampler1;
let u_Sampler2;
let u_whichTexture;
let u_TexScale;

let camera;
let g_map;     // 32x32 wall heights 0..4; X/Z edits this at runtime
let g_baseMap; // copy for "Reset world"
const MAP_SIZE = 32;
const MAX_HEIGHT = 4;

// One Cube (or cone) per role, reused every frame — no per-frame allocation
let g_skyCube;
let g_groundCube;
let g_wallCube;
let g_cobbleCube;
let g_zombieCube;
let g_catCube;
let g_catCone;
let g_animalCube;
let g_beaconCube;

// Decorative mobs (no collision). Spawns are on open cells in buildMap().
const ANIMAL_PIG     = { x: -6, z: -2, yaw:  90 };
const ANIMAL_SHEEP   = { x:  4, z:  4, yaw:   0 };
const ANIMAL_COW     = { x:  6, z: -6, yaw: 180 };
const ANIMAL_CHICKEN = { x: -6, z:  4, yaw: -90 };

// Map cells that use cobble texture (cat tower NE + a few pillars). Key 'row,col'.
const COBBLE_CELLS = new Set([
  // tower: north wall
  '3,27', '3,28', '3,29',
  // tower: pedestal row (1, 2-tall pedestal, 1)
  '4,27', '4,28', '4,29',
  // tower: south wall (corner blocks; the middle is the doorway)
  '5,27',          '5,29',
  // accent pillars elsewhere on the map
  '5,5',           // 3-tall pillar in the NW
  '10,20',         // 3-tall pillar near the middle
  '25,25',         // full 4-tall pillar in the SE
]);

let g_catOriginMat;
let g_catHeadMat;
let g_catTailMat;

let g_dragging = false;
let g_lastMouseX = 0;
const MOUSE_SENSITIVITY = 0.3; // drag-to-yaw when pointer isn't locked
const PL_POINTER_YAW = 0.12;
const PL_POINTER_PITCH = 0.12;

const g_keys = {};
const HELD_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e']); // held keys; X/Z handled separately

const PLAYER_MOVE_SPEED = 3.0;
const TURN_SPEED = 90;
const MAX_DT = 0.05; // cap dt so tabbing away doesn't teleport anyone

let g_perfFrames = 0;
let g_perfWindowStart = performance.now();
const PERF_UPDATE_MS = 400;

const STATE_IDLE = 'idle';
const STATE_PLAYING = 'playing';
const STATE_WON = 'won';
const STATE_LOST = 'lost';
let g_gameState = STATE_IDLE;
let g_gameStartMs = 0;
let g_gameElapsed = 0;
let g_loseReason = ''; // 'zombie' | 'timer'
let g_wins = 0;
let g_losses = 0;
const TIME_LIMIT = 20;
const CATCH_RADIUS = 0.7;
const RESCUE_RADIUS = 1.5;

const PLAYER_RADIUS = 0.25;
const ZOMBIE_RADIUS = 0.30;

const ZOMBIE_SPEED = 1.75;
const g_zombies = [
  { x: 0, z: 0, yaw: 0 },
  { x: 0, z: 0, yaw: 0 },
  { x: 0, z: 0, yaw: 0 },
  { x: 0, z: 0, yaw: 0 },
];

let g_cat = {
  x: 12.5, y: 2.51, z: -11.5, yaw: 0,
};

let g_lastFrameMs = performance.now();
let g_seconds = 0; // for sin animations (zombie walk, beacon, etc.)


// webGL setup

function setupWebGL() {
  canvas = document.getElementById('webgl');
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) {
    console.log('Failed to get the rendering context for WebGL');
    return;
  }
  gl.enable(gl.DEPTH_TEST);
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function connectVariablesToGLSL() {
  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.log('Failed to initialize shaders.');
    return;
  }

  a_Position = gl.getAttribLocation(gl.program, 'a_Position');
  a_TexCoord = gl.getAttribLocation(gl.program, 'a_TexCoord');
  u_FragColor = gl.getUniformLocation(gl.program, 'u_FragColor');
  u_ModelMatrix = gl.getUniformLocation(gl.program, 'u_ModelMatrix');
  u_ViewMatrix = gl.getUniformLocation(gl.program, 'u_ViewMatrix');
  u_ProjectionMatrix = gl.getUniformLocation(gl.program, 'u_ProjectionMatrix');
  u_Sampler0 = gl.getUniformLocation(gl.program, 'u_Sampler0');
  u_Sampler1 = gl.getUniformLocation(gl.program, 'u_Sampler1');
  u_Sampler2 = gl.getUniformLocation(gl.program, 'u_Sampler2');
  u_whichTexture = gl.getUniformLocation(gl.program, 'u_whichTexture');
  u_TexScale = gl.getUniformLocation(gl.program, 'u_TexScale');

  const I = new Matrix4();
  gl.uniformMatrix4fv(u_ModelMatrix, false, I.elements);
  gl.uniform2f(u_TexScale, 1, 1);
}


// textures
function initTextures() {
  const groundImg = new Image();
  const wallImg = new Image();
  const cobbleImg = new Image();

  groundImg.onload = function() {
    sendTextureToGLSL(groundImg, 0, gl.TEXTURE0, u_Sampler0);
  };
  wallImg.onload = function() {
    sendTextureToGLSL(wallImg, 1, gl.TEXTURE1, u_Sampler1);
  };
  cobbleImg.onload = function() {
    sendTextureToGLSL(cobbleImg, 2, gl.TEXTURE2, u_Sampler2);
  };

  groundImg.onerror = function() { console.log('Failed to load ground.png'); };
  wallImg.onerror = function() { console.log('Failed to load wall.png'); };
  cobbleImg.onerror = function() { console.log('Failed to load cobble.jpeg'); };

  groundImg.src = 'ground.png';
  wallImg.src = 'wall.png';
  cobbleImg.src = 'cobble.jpeg';
}

function sendTextureToGLSL(image, unit, target, samplerLoc) {
  const tex = gl.createTexture();
  if (!tex) {
    console.log('Failed to create texture');
    return;
  }
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.activeTexture(target);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);

  gl.uniform1i(samplerLoc, unit);
}



// height map
function buildMap() {
  const N = MAP_SIZE;
  const m = [];
  for (let i = 0; i < N; i++) {
    const row = [];
    for (let j = 0; j < N; j++) {
      row.push(0);
    }
    m.push(row);
  }

  // Outer border wall, height 4
  for (let i = 0; i < N; i++) {
    m[0][i]   = 4;
    m[N-1][i] = 4;
    m[i][0]   = 4;
    m[i][N-1] = 4;
  }

  // A few interior pillars of varying heights
  const pillars = [
    [5,  5,  3], [5,  10, 2], [5,  15, 1],
    [10, 5,  2], [10, 20, 3], [10, 26, 1],
    [15, 8,  1], [15, 22, 2],
    [20, 5,  3], [20, 12, 2], [20, 26, 3],
    [25, 8,  1], [25, 18, 2], [25, 25, 4],
  ];
  for (const [r, c, h] of pillars) m[r][c] = h;

  // A short wall segment (height 2)
  for (let c = 14; c <= 20; c++) m[12][c] = 2;

  // NE cat tower: low walls + 2-block pedestal; south row has doorway at (5,28)
  m[3][27] = 1; m[3][28] = 1; m[3][29] = 1;
  m[4][27] = 1; m[4][28] = 2; m[4][29] = 1;
  m[5][27] = 1; m[5][28] = 0; m[5][29] = 1;

  return m;
}

// Deep-copy so X/Z never mutates g_baseMap.
function cloneMap(src) {
  const out = [];
  for (let i = 0; i < src.length; i++) {
    out.push(src[i].slice());
  }
  return out;
}


// input
function normalizeKey(k) {
  return (k && k.length === 1) ? k.toLowerCase() : k;
}

function addKeyboardListeners() {
  document.addEventListener('keydown', function(ev) {
    const k = normalizeKey(ev.key);

    if (g_gameState === STATE_LOST && (k === 'x' || k === 'z')) {
      ev.preventDefault();
      return;
    }

    if (k === 'x') {
      if (!ev.repeat) addBlockInFront();
      ev.preventDefault();
      return;
    }
    if (k === 'z') {
      if (!ev.repeat) removeBlockInFront();
      ev.preventDefault();
      return;
    }

    // W/A/S/D/Q/E — ignore while lost (no walk / no keyboard turn).
    if (g_gameState === STATE_LOST && HELD_KEYS.has(k)) {
      ev.preventDefault();
      return;
    }

    // W/A/S/D/Q/E are held-keys: just record the down state and let
    // updatePlayer(dt) handle motion every frame.
    if (HELD_KEYS.has(k)) {
      g_keys[k] = true;
      ev.preventDefault();
    }
  });

  document.addEventListener('keyup', function(ev) {
    const k = normalizeKey(ev.key);
    if (HELD_KEYS.has(k)) {
      g_keys[k] = false;
      ev.preventDefault();
    }
  });

  // If the window loses focus (alt-tab, click outside the page), drop all
  // held keys so we don't end up with a stuck-on key when refocusing.
  window.addEventListener('blur', function() {
    for (const k of HELD_KEYS) g_keys[k] = false;
    g_dragging = false;
  });
}

function addGameUIListeners() {
  const btn = document.getElementById('startBtn');
  if (btn) {
    btn.addEventListener('click', function() {
      startGame();
      btn.blur();
      if (canvas && canvas.focus) canvas.focus();
    });
  }

  const resetBtn = document.getElementById('resetWorldBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      resetDefaultWorld();
      resetBtn.blur();
      if (canvas && canvas.focus) canvas.focus();
    });
  }
}


// collision & player
function isWalkable(x, z, radius) {
  const half = MAP_SIZE / 2;
  const offsets = [-radius, radius];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const sx = x + offsets[i];
      const sz = z + offsets[j];
      const col = Math.floor(sx + half);
      const row = Math.floor(sz + half);
      if (row < 0 || row >= MAP_SIZE || col < 0 || col >= MAP_SIZE) return false;
      if (g_map[row][col] > 0) return false;
    }
  }
  return true;
}

// Move (dx, dz), sliding along walls if a corner would go inside a block.
function moveCameraBySafely(dx, dz) {
  if (dx === 0 && dz === 0) return;

  const e = camera.eye.elements;
  const a = camera.at.elements;
  const ex = e[0], ez = e[2];
  const tx = ex + dx;
  const tz = ez + dz;

  // try full step, then x-only, then z-only
  if (isWalkable(tx, tz, PLAYER_RADIUS)) {
    e[0] = tx; e[2] = tz;
    a[0] += dx; a[2] += dz;
    camera.updateView();
    return;
  }
  // x slide
  if (dx !== 0 && isWalkable(tx, ez, PLAYER_RADIUS)) {
    e[0] = tx;
    a[0] += dx;
    camera.updateView();
    return;
  }
  // z slide
  if (dz !== 0 && isWalkable(ex, tz, PLAYER_RADIUS)) {
    e[2] = tz;
    a[2] += dz;
    camera.updateView();
    return;
  }
  // both axes blocked -> stay put
}

function updatePlayer(dt) {
  if (g_gameState === STATE_LOST) return;

  // Q left, E right
  let turn = 0;
  if (g_keys['q']) turn += 1;
  if (g_keys['e']) turn -= 1;
  if (turn !== 0) camera.pan(turn * TURN_SPEED * dt);

  let mf = 0, ms = 0;
  if (g_keys['w']) mf += 1;
  if (g_keys['s']) mf -= 1;
  if (g_keys['d']) ms += 1;
  if (g_keys['a']) ms -= 1;
  if (mf === 0 && ms === 0) return;

  const inLen = Math.hypot(mf, ms);
  mf /= inLen;
  ms /= inLen;

  const e = camera.eye.elements;
  const a = camera.at.elements;
  let fx = a[0] - e[0];
  let fz = a[2] - e[2];
  const fLen = Math.hypot(fx, fz);
  if (fLen === 0) return;
  fx /= fLen;
  fz /= fLen;
  const rx = -fz;
  const rz = fx;

  const dist = PLAYER_MOVE_SPEED * dt;
  const dx = (fx * mf + rx * ms) * dist;
  const dz = (fz * mf + rz * ms) * dist;

  moveCameraBySafely(dx, dz);
}

function addMouseListeners() {
  canvas.addEventListener('mousedown', function(ev) {
    if (canvas.focus) canvas.focus();
    if (g_gameState !== STATE_LOST &&
        document.pointerLockElement !== canvas && canvas.requestPointerLock) {
      const p = canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') {
        p.catch(function() {});
      }
    }
    g_dragging = true;
    g_lastMouseX = ev.clientX;
  });

  // drag to yaw when pointer isn't locked
  canvas.addEventListener('mousemove', function(ev) {
    if (document.pointerLockElement === canvas) return;
    if (g_gameState === STATE_LOST) return;
    if (!g_dragging) return;
    const dx = ev.clientX - g_lastMouseX;
    g_lastMouseX = ev.clientX;
    camera.pan(-dx * MOUSE_SENSITIVITY);
  });

  document.addEventListener('mousemove', function(ev) {
    if (document.pointerLockElement !== canvas) return;
    if (g_gameState === STATE_LOST) return;
    camera.pan(-ev.movementX * PL_POINTER_YAW);
    camera.tiltPitch(-ev.movementY * PL_POINTER_PITCH);
  });

  document.addEventListener('mouseup', function() { g_dragging = false; });
  canvas.addEventListener('mouseleave', function() {
    if (document.pointerLockElement !== canvas) g_dragging = false;
  });
}


function updatePointerLockOverlay() {
  const ov = document.getElementById('pointerLockOverlay');
  const msg = document.getElementById('pointerLockMsg');
  if (!ov || !msg) return;
  if (document.pointerLockElement === canvas) {
    ov.classList.remove('pl-prompt');
    ov.classList.add('pl-locked');
    msg.textContent = 'Press ESC to exit';
  } else {
    ov.classList.remove('pl-locked');
    ov.classList.add('pl-prompt');
    msg.textContent = 'Click to enter world';
    g_dragging = false;
  }
}


function addPointerLockListeners() {
  document.addEventListener('pointerlockchange', updatePointerLockOverlay);
  document.addEventListener('pointerlockerror',   updatePointerLockOverlay);
}



// block edit functionality
function getMapCellInFrontOfCamera() {
  const e = camera.eye.elements;
  const a = camera.at.elements;
  let fx = a[0] - e[0];
  let fz = a[2] - e[2];
  const len = Math.hypot(fx, fz);
  if (len === 0) return null;
  fx /= len;
  fz /= len;

  const reach = 1.2;
  const targetX = e[0] + fx * reach;
  const targetZ = e[2] + fz * reach;

  const half = MAP_SIZE / 2;
  const col = Math.floor(targetX + half);
  const row = Math.floor(targetZ + half);

  if (row < 0 || row >= MAP_SIZE || col < 0 || col >= MAP_SIZE) return null;
  return { row, col };
}

function addBlockInFront() {
  const cell = getMapCellInFrontOfCamera();
  if (!cell) return;
  if (g_map[cell.row][cell.col] < MAX_HEIGHT) {
    g_map[cell.row][cell.col]++;
  }
}

function removeBlockInFront() {
  const cell = getMapCellInFrontOfCamera();
  if (!cell) return;
  if (g_map[cell.row][cell.col] > 0) {
    g_map[cell.row][cell.col]--;
  }
}


// game functionality
function startGame() {
  camera.eye.elements[0] = 0;   camera.eye.elements[1] = 0.6;  camera.eye.elements[2] = 12;
  camera.at.elements[0]  = 0;   camera.at.elements[1]  = 0.6;  camera.at.elements[2]  = 0;
  camera.resetPitch();
  camera.updateView();

  g_zombies[0].x = -12;
  g_zombies[0].z = -12;
  g_zombies[0].yaw = 0;

  g_zombies[1].x = 10;
  g_zombies[1].z = -8;
  g_zombies[1].yaw = 0;

  g_zombies[2].x = -12;
  g_zombies[2].z = 12;
  g_zombies[2].yaw = 0;

  g_zombies[3].x = 12;
  g_zombies[3].z = 12;
  g_zombies[3].yaw = 0;

  g_cat.x = 12.5;
  g_cat.z = -11.5;
  g_cat.y = 2.51;
  const vx = camera.eye.elements[0] - g_cat.x;
  const vz = camera.eye.elements[2] - g_cat.z;
  g_cat.yaw = Math.atan2(-vz, vx) * 180 / Math.PI;

  g_gameStartMs = performance.now();
  g_gameElapsed = 0;
  g_loseReason = '';
  g_gameState = STATE_PLAYING;

  updateGameHUD();
}

// Clear held movement keys after a loss (avoids stuck W/A/S/D).
function clearHeldMovementKeys() {
  for (const k of HELD_KEYS) g_keys[k] = false;
}

// Restore buildMap(), default spawns, idle. Does not reset win/loss counts.
function resetDefaultWorld() {
  g_map = cloneMap(g_baseMap);

  camera.eye.elements[0] = 0;   camera.eye.elements[1] = 0.6;  camera.eye.elements[2] = 12;
  camera.at.elements[0]  = 0;   camera.at.elements[1]  = 0.6;  camera.at.elements[2]  = 0;
  camera.resetPitch();
  camera.updateView();

  g_zombies[0].x = -12;
  g_zombies[0].z = -12;
  g_zombies[0].yaw = 0;
  g_zombies[1].x = 10;
  g_zombies[1].z = -8;
  g_zombies[1].yaw = 0;
  g_zombies[2].x = -12;
  g_zombies[2].z = 12;
  g_zombies[2].yaw = 0;
  g_zombies[3].x = 12;
  g_zombies[3].z = 12;
  g_zombies[3].yaw = 0;

  g_cat.x = 12.5;
  g_cat.z = -11.5;
  g_cat.y = 2.51;
  const vx = camera.eye.elements[0] - g_cat.x;
  const vz = camera.eye.elements[2] - g_cat.z;
  g_cat.yaw = Math.atan2(-vz, vx) * 180 / Math.PI;

  g_gameState = STATE_IDLE;
  g_gameElapsed = 0;
  g_gameStartMs = 0;
  g_loseReason = '';
  clearHeldMovementKeys();

  updateGameHUD();
}

function updateGame(dt) {
  if (g_gameState !== STATE_PLAYING) return;

  g_gameElapsed = (performance.now() - g_gameStartMs) / 1000;
  if (g_gameElapsed >= TIME_LIMIT) {
    g_gameElapsed = TIME_LIMIT;
    g_gameState = STATE_LOST;
    g_loseReason = 'timer';
    g_losses++;
    clearHeldMovementKeys();
    updateGameHUD();
    return;
  }

  for (let i = 0; i < g_zombies.length; i++) {
    updateZombie(g_zombies[i], dt);
  }

  const px = camera.eye.elements[0];
  const pz = camera.eye.elements[2];
  for (let i = 0; i < g_zombies.length; i++) {
    const z = g_zombies[i];
    if (Math.hypot(px - z.x, pz - z.z) < CATCH_RADIUS) {
      g_gameState = STATE_LOST;
      g_loseReason = 'zombie';
      g_losses++;
      clearHeldMovementKeys();
      updateGameHUD();
      return;
    }
  }

  const dxc = camera.eye.elements[0] - g_cat.x;
  const dzc = camera.eye.elements[2] - g_cat.z;
  if (Math.hypot(dxc, dzc) < RESCUE_RADIUS) {
    g_gameState = STATE_WON;
    g_wins++;
    updateGameHUD();
    return;
  }

  updateGameHUD();
}

function updateZombie(zombie, dt) {
  const px = camera.eye.elements[0];
  const pz = camera.eye.elements[2];
  let vx = px - zombie.x;
  let vz = pz - zombie.z;
  const dist = Math.hypot(vx, vz);
  if (dist < 0.0001) return;
  vx /= dist;
  vz /= dist;

  zombie.yaw = Math.atan2(-vx, -vz) * 180 / Math.PI;

  const step = ZOMBIE_SPEED * dt;
  const nx = zombie.x + vx * step;
  const nz = zombie.z + vz * step;

  if (isWalkable(nx, nz, ZOMBIE_RADIUS)) {
    zombie.x = nx;
    zombie.z = nz;
  } else if (isWalkable(nx, zombie.z, ZOMBIE_RADIUS)) {
    zombie.x = nx;
  } else if (isWalkable(zombie.x, nz, ZOMBIE_RADIUS)) {
    zombie.z = nz;
  }
}



function main() {
  setupWebGL();
  connectVariablesToGLSL();
  initCubeBuffer();
  initConeBuffer();
  initTextures();

  camera = new Camera();
  g_baseMap = buildMap();
  g_map = cloneMap(g_baseMap);

  g_skyCube = new Cube();
  g_skyCube.color = [0.55, 0.78, 0.95, 1.0];
  g_skyCube.textureNum = -1;

  g_groundCube = new Cube();
  g_groundCube.textureNum = 0;
  g_groundCube.textureScale = [MAP_SIZE, MAP_SIZE];

  g_wallCube = new Cube();
  g_wallCube.textureNum = 1;

  g_cobbleCube = new Cube();
  g_cobbleCube.textureNum = 2;

  g_zombieCube = new Cube();
  g_zombieCube.textureNum = -1;

  g_animalCube = new Cube();
  g_animalCube.textureNum = -1;

  g_beaconCube = new Cube();
  g_beaconCube.color = [1.0, 1.0, 1.0, 1.0];
  g_beaconCube.textureNum = -1;

  g_catCube = new Cube();
  g_catCube.textureNum = -1;
  g_catCone = new Cone();
  g_catOriginMat = new Matrix4();
  g_catHeadMat = new Matrix4();
  g_catTailMat = new Matrix4();

  addKeyboardListeners();
  addMouseListeners();
  addPointerLockListeners();
  addGameUIListeners();

  updatePointerLockOverlay();

  updateGameHUD();

  gl.clearColor(0.55, 0.78, 0.95, 1.0);

  g_lastFrameMs = performance.now();
  requestAnimationFrame(tick);
}

function tick() {
  const now = performance.now();
  let dt = (now - g_lastFrameMs) / 1000;
  g_lastFrameMs = now;
  if (dt > MAX_DT) dt = MAX_DT;

  g_seconds += dt;

  updatePlayer(dt);
  updateGame(dt);
  renderAllShapes();
  updatePerfHUD();
  requestAnimationFrame(tick);
}


// drawing
function renderAllShapes() {
  gl.uniformMatrix4fv(u_ViewMatrix, false, camera.viewMatrix.elements);
  gl.uniformMatrix4fv(u_ProjectionMatrix, false, camera.projectionMatrix.elements);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  drawSky();
  drawGround();
  drawWalls();
  drawAnimals();
  for (let i = 0; i < g_zombies.length; i++) {
    drawZombie(g_zombies[i]);
  }
  drawCat();
  drawShrineBeam();
}

// Sun orange blended in as the round clock runs (wow feature).
const SKY_DAY = [0.55, 0.78, 0.95, 1.0];
const SKY_SUNSET = [1.00, 0.45, 0.08, 1.0];

function drawSky() {
  const t = (g_gameState === STATE_IDLE)
    ? 0
    : Math.min(1, g_gameElapsed / TIME_LIMIT);

  const r = SKY_DAY[0] * (1 - t) + SKY_SUNSET[0] * t;
  const g = SKY_DAY[1] * (1 - t) + SKY_SUNSET[1] * t;
  const b = SKY_DAY[2] * (1 - t) + SKY_SUNSET[2] * t;

  g_skyCube.color = [r, g, b, 1.0];
  gl.clearColor(r, g, b, 1.0);

  g_skyCube.matrix.setIdentity();
  g_skyCube.matrix.translate(-500, -500, -500);
  g_skyCube.matrix.scale(1000, 1000, 1000);
  g_skyCube.render();
}

// Pulsing white column above the cat — visual only, PLAYING only.
function drawShrineBeam() {
  if (g_gameState !== STATE_PLAYING) return;

  const baseY = 3.0;
  const beamH = 17.0;
  const pulse = 0.35 + Math.sin(g_seconds * 3) * 0.05;
  const yaw = (g_seconds * 30) % 360;

  const m = g_beaconCube.matrix;
  m.setIdentity();
  m.translate(g_cat.x, baseY, g_cat.z);
  m.rotate(yaw, 0, 1, 0);
  m.translate(-pulse / 2, 0, -pulse / 2);
  m.scale(pulse, beamH, pulse);
  g_beaconCube.render();
}

// flattened cube on the x-z plane, ground texture (textureNum = 0).
function drawGround() {
  g_groundCube.matrix.setIdentity();
  g_groundCube.matrix.translate(-MAP_SIZE/2, -0.01, -MAP_SIZE/2);
  g_groundCube.matrix.scale(MAP_SIZE, 0.01, MAP_SIZE);
  g_groundCube.render();
}

// --- zombie (solid cubes, local -z = forward) ---
const ZOMBIE_GREEN = [0.30, 0.65, 0.25, 1.0];
const ZOMBIE_HEAD = [0.40, 0.75, 0.30, 1.0];
const ZOMBIE_SHIRT = [0.05, 0.65, 0.65, 1.0];
const ZOMBIE_PANTS = [0.20, 0.20, 0.45, 1.0];
const ZOMBIE_FOOT = [0.15, 0.15, 0.15, 1.0];
const ZOMBIE_EYE = [0.00, 0.00, 0.00, 1.0];
const ZOMBIE_MOUTH = [0.10, 0.30, 0.10, 1.0];

function drawZombie(zombie) {
  if (g_gameState === STATE_IDLE) return;

  let swing = 0;
  if (g_gameState === STATE_PLAYING) {
    swing = Math.sin(g_seconds * 8) * 30;
  }
  const legL = swing, legR = -swing;
  const armL = -swing, armR = swing;

  drawZombieLimb(zombie, -0.10, 0.60, legL,
    -0.18, 0.00, -0.10, 0.16, 0.10, 0.20, ZOMBIE_FOOT);
  drawZombieLimb(zombie, -0.10, 0.60, legL,
    -0.18, 0.10, -0.10, 0.16, 0.50, 0.20, ZOMBIE_PANTS);
  drawZombieLimb(zombie,  0.10, 0.60, legR,
     0.02, 0.00, -0.10, 0.16, 0.10, 0.20, ZOMBIE_FOOT);
  drawZombieLimb(zombie,  0.10, 0.60, legR,
     0.02, 0.10, -0.10, 0.16, 0.50, 0.20, ZOMBIE_PANTS);

  drawZombiePart(zombie, -0.20, 0.60, -0.15, 0.40, 0.50, 0.30, ZOMBIE_SHIRT);

  drawZombieLimb(zombie, -0.30, 1.10, armL,
    -0.40, 0.60, -0.10, 0.20, 0.50, 0.20, ZOMBIE_GREEN);
  drawZombieLimb(zombie,  0.30, 1.10, armR,
     0.20, 0.60, -0.10, 0.20, 0.50, 0.20, ZOMBIE_GREEN);

  drawZombiePart(zombie, -0.25, 1.10, -0.20, 0.50, 0.50, 0.40, ZOMBIE_HEAD);
  drawZombiePart(zombie, -0.16, 1.30, -0.21, 0.08, 0.08, 0.01, ZOMBIE_EYE);
  drawZombiePart(zombie,  0.08, 1.30, -0.21, 0.08, 0.08, 0.01, ZOMBIE_EYE);
  drawZombiePart(zombie, -0.10, 1.16, -0.21, 0.20, 0.04, 0.01, ZOMBIE_MOUTH);
}

function drawZombiePart(zombie, lx, ly, lz, sx, sy, sz, color) {
  g_zombieCube.color = color;
  const m = g_zombieCube.matrix;
  m.setIdentity();
  m.translate(zombie.x, 0, zombie.z);
  m.rotate(zombie.yaw, 0, 1, 0);
  m.translate(lx, ly, lz);
  m.scale(sx, sy, sz);
  g_zombieCube.render();
}

// Same as drawZombiePart but rotated around (pivotX, pivotY) for limbs.
function drawZombieLimb(zombie, pivotX, pivotY, swingDeg,
                        lx, ly, lz, sx, sy, sz, color) {
  g_zombieCube.color = color;
  const m = g_zombieCube.matrix;
  m.setIdentity();
  m.translate(zombie.x, 0, zombie.z);
  m.rotate(zombie.yaw, 0, 1, 0);
  m.translate(pivotX, pivotY, 0);
  m.rotate(swingDeg, 1, 0, 0);
  m.translate(lx - pivotX, ly - pivotY, lz);
  m.scale(sx, sy, sz);
  g_zombieCube.render();
}


// --- decorative animals (no collision) ---
const PIG_PINK = [0.96, 0.65, 0.72, 1.0];
const PIG_DARK = [0.78, 0.45, 0.55, 1.0];
const SHEEP_WOOL = [0.95, 0.95, 0.92, 1.0];
const SHEEP_FACE = [0.30, 0.30, 0.30, 1.0];
const SHEEP_LEG = [0.55, 0.40, 0.28, 1.0];
const SHEEP_HOOF = [0.20, 0.14, 0.10, 1.0];
const COW_WHITE = [0.95, 0.95, 0.95, 1.0];
const COW_DARK = [0.20, 0.18, 0.16, 1.0];
const COW_BROWN = [0.45, 0.30, 0.20, 1.0];
const COW_NOSE = [0.92, 0.65, 0.65, 1.0];
const CHICK_WHITE = [0.97, 0.97, 0.97, 1.0];
const CHICK_BEAK = [0.95, 0.65, 0.10, 1.0];
const CHICK_COMB = [0.85, 0.15, 0.15, 1.0];
const ANIMAL_EYE = [0.05, 0.05, 0.05, 1.0];

function drawAnimals() {
  drawPig(ANIMAL_PIG);
  drawSheep(ANIMAL_SHEEP);
  drawCow(ANIMAL_COW);
  drawChicken(ANIMAL_CHICKEN);
}

function drawAnimalPart(animal, lx, ly, lz, sx, sy, sz, color) {
  g_animalCube.color = color;
  const m = g_animalCube.matrix;
  m.setIdentity();
  m.translate(animal.x, 0, animal.z);
  m.rotate(animal.yaw, 0, 1, 0);
  m.translate(lx, ly, lz);
  m.scale(sx, sy, sz);
  g_animalCube.render();
}

function drawPig(a) {
  drawAnimalPart(a, -0.24, 0.00, -0.18, 0.08, 0.18, 0.08, PIG_DARK);
  drawAnimalPart(a,  0.16, 0.00, -0.18, 0.08, 0.18, 0.08, PIG_DARK);
  drawAnimalPart(a, -0.24, 0.00,  0.10, 0.08, 0.18, 0.08, PIG_DARK);
  drawAnimalPart(a,  0.16, 0.00,  0.10, 0.08, 0.18, 0.08, PIG_DARK);
  drawAnimalPart(a, -0.30, 0.18, -0.20, 0.60, 0.30, 0.40, PIG_PINK);
  drawAnimalPart(a, -0.18, 0.20, -0.50, 0.36, 0.30, 0.30, PIG_PINK);
  drawAnimalPart(a, -0.10, 0.26, -0.55, 0.20, 0.12, 0.05, PIG_DARK);
  drawAnimalPart(a, -0.14, 0.40, -0.51, 0.04, 0.04, 0.01, ANIMAL_EYE);
  drawAnimalPart(a,  0.10, 0.40, -0.51, 0.04, 0.04, 0.01, ANIMAL_EYE);
  drawAnimalPart(a, -0.04, 0.36,  0.20, 0.08, 0.08, 0.06, PIG_PINK);
}

function drawSheep(a) {
  const LX = [-0.20, 0.10, -0.20, 0.10];
  const LZ = [-0.24, -0.24, 0.14, 0.14];
  for (let i = 0; i < 4; i++) {
    drawAnimalPart(a, LX[i], 0.06, LZ[i], 0.10, 0.24, 0.10, SHEEP_LEG);
    drawAnimalPart(a, LX[i], 0.00, LZ[i], 0.10, 0.06, 0.10, SHEEP_HOOF);
  }
  drawAnimalPart(a, -0.25, 0.30, -0.30, 0.50, 0.40, 0.70, SHEEP_WOOL);
  drawAnimalPart(a, -0.15, 0.36, -0.50, 0.30, 0.28, 0.20, SHEEP_FACE);
  drawAnimalPart(a, -0.18, 0.66, -0.32, 0.36, 0.10, 0.16, SHEEP_WOOL);
  drawAnimalPart(a, -0.10, 0.48, -0.51, 0.04, 0.04, 0.01, ANIMAL_EYE);
  drawAnimalPart(a,  0.06, 0.48, -0.51, 0.04, 0.04, 0.01, ANIMAL_EYE);
}

function drawCow(a) {
  const LX = [-0.25, 0.15, -0.25, 0.15];
  const LZ = [-0.26, -0.26, 0.32, 0.32];
  for (let i = 0; i < 4; i++) {
    drawAnimalPart(a, LX[i], 0.06, LZ[i], 0.10, 0.30, 0.10, COW_BROWN);
    drawAnimalPart(a, LX[i], 0.00, LZ[i], 0.10, 0.06, 0.10, COW_DARK);
  }
  drawAnimalPart(a, -0.28, 0.36, -0.32, 0.56, 0.40, 0.80, COW_WHITE);
  drawAnimalPart(a, -0.22, 0.75, -0.20, 0.20, 0.02, 0.20, COW_BROWN);
  drawAnimalPart(a,  0.08, 0.75,  0.18, 0.20, 0.02, 0.22, COW_BROWN);
  drawAnimalPart(a, -0.29, 0.45,  0.10, 0.01, 0.16, 0.20, COW_BROWN);
  drawAnimalPart(a,  0.28, 0.45, -0.16, 0.01, 0.18, 0.18, COW_BROWN);
  drawAnimalPart(a, -0.20, 0.42, -0.62, 0.40, 0.32, 0.28, COW_BROWN);
  drawAnimalPart(a, -0.21, 0.46, -0.56, 0.01, 0.14, 0.14, COW_WHITE);
  drawAnimalPart(a,  0.20, 0.46, -0.56, 0.01, 0.14, 0.14, COW_WHITE);
  drawAnimalPart(a, -0.12, 0.46, -0.66, 0.24, 0.16, 0.04, COW_NOSE);
  drawAnimalPart(a, -0.20, 0.74, -0.56, 0.06, 0.06, 0.08, COW_DARK);
  drawAnimalPart(a,  0.14, 0.74, -0.56, 0.06, 0.06, 0.08, COW_DARK);
  drawAnimalPart(a, -0.14, 0.62, -0.63, 0.04, 0.04, 0.01, ANIMAL_EYE);
  drawAnimalPart(a,  0.10, 0.62, -0.63, 0.04, 0.04, 0.01, ANIMAL_EYE);
  drawAnimalPart(a, -0.02, 0.48,  0.48, 0.04, 0.22, 0.04, COW_BROWN);
  drawAnimalPart(a, -0.03, 0.42,  0.48, 0.06, 0.06, 0.06, COW_DARK);
}

function drawChicken(a) {
  drawAnimalPart(a, -0.10, 0.00, -0.04, 0.04, 0.28, 0.04, CHICK_BEAK);
  drawAnimalPart(a,  0.06, 0.00, -0.04, 0.04, 0.28, 0.04, CHICK_BEAK);
  drawAnimalPart(a, -0.14, 0.28, -0.16, 0.28, 0.30, 0.32, CHICK_WHITE);
  drawAnimalPart(a, -0.10, 0.55, -0.30, 0.20, 0.20, 0.20, CHICK_WHITE);
  drawAnimalPart(a, -0.06, 0.74, -0.24, 0.12, 0.05, 0.10, CHICK_COMB);
  drawAnimalPart(a, -0.04, 0.62, -0.36, 0.08, 0.06, 0.06, CHICK_BEAK);
  drawAnimalPart(a, -0.08, 0.68, -0.31, 0.03, 0.03, 0.01, ANIMAL_EYE);
  drawAnimalPart(a,  0.04, 0.68, -0.31, 0.03, 0.03, 0.01, ANIMAL_EYE);
  drawAnimalPart(a, -0.06, 0.34,  0.15, 0.12, 0.20, 0.06, CHICK_WHITE);
}


// --- cat (rescue goal; blocky model, +x forward in cat space) ---
const CAT_BODY = [0.62, 0.62, 0.65, 1.0];
const CAT_DARK = [0.42, 0.42, 0.45, 1.0];
const CAT_PINK = [1.00, 0.55, 0.65, 1.0];
const CAT_EYE = [0.30, 0.55, 0.85, 1.0];

function drawCat() {
  if (g_gameState === STATE_IDLE) return;

  g_catOriginMat.setIdentity();
  g_catOriginMat.translate(g_cat.x, g_cat.y, g_cat.z);
  g_catOriginMat.rotate(g_cat.yaw, 0, 1, 0);

  // body
  g_catCube.color = CAT_BODY;
  g_catCube.matrix.set(g_catOriginMat);
  g_catCube.matrix.translate(0, -0.05, 0);
  g_catCube.matrix.scale(0.65, 0.30, 0.40);
  g_catCube.matrix.translate(-0.5, -0.5, -0.5);
  g_catCube.render();

  // head joint at the front of the body (saved so the eyes/nose/ears can stack)
  g_catHeadMat.set(g_catOriginMat);
  g_catHeadMat.translate(0.30, 0.08, 0);

  // head cube
  g_catCube.color = CAT_BODY;
  g_catCube.matrix.set(g_catHeadMat);
  g_catCube.matrix.scale(0.27, 0.27, 0.30);
  g_catCube.matrix.translate(0, -0.5, -0.5);
  g_catCube.render();

  // eyes
  for (let s = -1; s <= 1; s += 2) {
    g_catCube.color = CAT_EYE;
    g_catCube.matrix.set(g_catHeadMat);
    g_catCube.matrix.translate(0.28, 0.04, s * 0.075);
    g_catCube.matrix.scale(0.012, 0.055, 0.055);
    g_catCube.matrix.translate(-0.5, -0.5, -0.5);
    g_catCube.render();
  }

  // pink nose
  g_catCube.color = CAT_PINK;
  g_catCube.matrix.set(g_catHeadMat);
  g_catCube.matrix.translate(0.26, -0.03, 0);
  g_catCube.matrix.scale(0.04, 0.03, 0.05);
  g_catCube.matrix.translate(-0.5, -0.5, -0.5);
  g_catCube.render();

  // ears (cones) - the only non-cube primitive on the cat
  for (let s = -1; s <= 1; s += 2) {
    g_catCone.color = CAT_BODY;
    g_catCone.matrix.set(g_catHeadMat);
    g_catCone.matrix.translate(0.06, 0.13, s * 0.10);
    g_catCone.matrix.scale(0.10, 0.13, 0.10);
    g_catCone.render();
  }

  // tail (3 segments). Static slight upward bend so the cat looks alert.
  g_catTailMat.set(g_catOriginMat);
  g_catTailMat.translate(-0.32, 0.05, 0);
  g_catTailMat.rotate(180, 0, 1, 0);   // flip so we extend along +x in tail-local
  g_catTailMat.rotate(25, 0, 0, 1);    // base bend up

  g_catCube.color = CAT_BODY;
  g_catCube.matrix.set(g_catTailMat);
  g_catCube.matrix.scale(0.18, 0.07, 0.07);
  g_catCube.matrix.translate(0, -0.5, -0.5);
  g_catCube.render();

  g_catTailMat.translate(0.18, 0, 0);
  g_catTailMat.rotate(15, 0, 0, 1);

  g_catCube.matrix.set(g_catTailMat);
  g_catCube.matrix.scale(0.15, 0.06, 0.06);
  g_catCube.matrix.translate(0, -0.5, -0.5);
  g_catCube.render();

  g_catTailMat.translate(0.15, 0, 0);
  g_catTailMat.rotate(15, 0, 0, 1);

  g_catCube.color = CAT_DARK;
  g_catCube.matrix.set(g_catTailMat);
  g_catCube.matrix.scale(0.12, 0.05, 0.05);
  g_catCube.matrix.translate(0, -0.5, -0.5);
  g_catCube.render();

  // four legs (front-left, front-right, back-left, back-right)
  drawCatLeg( 0.20,  0.14);
  drawCatLeg( 0.20, -0.14);
  drawCatLeg(-0.20,  0.14);
  drawCatLeg(-0.20, -0.14);
}

function drawCatLeg(hipX, hipZ) {
  g_catCube.color = CAT_BODY;
  g_catCube.matrix.set(g_catOriginMat);
  g_catCube.matrix.translate(hipX, -0.20, hipZ);
  g_catCube.matrix.scale(0.08, 0.14, 0.08);
  g_catCube.matrix.translate(-0.5, -1.0, -0.5);
  g_catCube.render();

  g_catCube.matrix.set(g_catOriginMat);
  g_catCube.matrix.translate(hipX, -0.34, hipZ);
  g_catCube.matrix.scale(0.07, 0.13, 0.07);
  g_catCube.matrix.translate(-0.5, -1.0, -0.5);
  g_catCube.render();

  g_catCube.color = CAT_DARK;
  g_catCube.matrix.set(g_catOriginMat);
  g_catCube.matrix.translate(hipX, -0.47, hipZ);
  g_catCube.matrix.scale(0.09, 0.04, 0.09);
  g_catCube.matrix.translate(-0.5, -1.0, -0.5);
  g_catCube.render();
}

// Textured stack per map cell; cobble vs dirt from COBBLE_CELLS.
function drawWalls() {
  const half = MAP_SIZE / 2;
  for (let i = 0; i < MAP_SIZE; i++) {
    const row = g_map[i];
    for (let j = 0; j < MAP_SIZE; j++) {
      const h = row[j];
      if (h <= 0) continue;
      const x = j - half;
      const z = i - half;
      const cube = COBBLE_CELLS.has(i + ',' + j) ? g_cobbleCube : g_wallCube;
      for (let y = 0; y < h; y++) {
        cube.matrix.setTranslate(x, y, z);
        cube.render();
      }
    }
  }
}


// hud functionalities
function updatePerfHUD() {
  g_perfFrames++;
  const now = performance.now();
  const elapsed = now - g_perfWindowStart;
  if (elapsed >= PERF_UPDATE_MS) {
    const fps = (g_perfFrames * 1000) / elapsed;
    const msPerFrame = elapsed / g_perfFrames;
    const el = document.getElementById('numdot');
    if (el) {
      el.innerHTML = 'ms/frame: ' + msPerFrame.toFixed(2) + ' fps: ' + fps.toFixed(1);
    }
    g_perfFrames = 0;
    g_perfWindowStart = now;
  }
}

function updateGameHUD() {
  const stateEl = document.getElementById('gameState');
  const goalEl = document.getElementById('gameGoal');
  const timerEl = document.getElementById('gameTimer');
  const scoreEl = document.getElementById('gameScore');
  const btn = document.getElementById('startBtn');
  if (!stateEl || !timerEl || !scoreEl || !btn) {
    updateDamageOverlay();
    updateResultOverlay();
    return;
  }

  let label;
  switch (g_gameState) {
    case STATE_PLAYING:
      label = 'Playing - reach the cat tower before the zombies get you!';
      break;
    case STATE_WON:
      label = 'You reached the cat tower! The cat has been rescued!';
      break;
    case STATE_LOST:
      label = (g_loseReason === 'timer')
        ? 'You lost - time ran out before you reached the tower.'
        : 'You lost - a zombie ate you!';
      break;
    default:
      label = 'Not started';
  }
  stateEl.textContent = 'State: ' + label;

  if (goalEl) {
    goalEl.textContent = 'Goal: Reach the cat tower before a zombie gets you!';
  }

  const remaining = Math.max(0, TIME_LIMIT - g_gameElapsed);
  timerEl.textContent =
    'Time: ' + g_gameElapsed.toFixed(1) + 's  /  Remaining: ' + remaining.toFixed(1) + 's';

  scoreEl.textContent = 'Wins: ' + g_wins + '   Losses: ' + g_losses;

  btn.textContent = (g_gameState === STATE_IDLE) ? 'Start Game' : 'Restart Game';

  updateDamageOverlay();
  updateResultOverlay();
}

// Red wash under the canvas win/loss text when you lose.
function updateDamageOverlay() {
  const el = document.getElementById('damageOverlay');
  if (!el) return;
  const show = g_gameState === STATE_LOST;
  if (show) el.classList.add('damage-visible');
  else el.classList.remove('damage-visible');
}

function updateResultOverlay() {
  const wrap = document.getElementById('resultOverlay');
  const titleEl = document.getElementById('resultTitle');
  const subEl = document.getElementById('resultSubtitle');
  if (!wrap || !titleEl || !subEl) return;

  wrap.classList.remove('showWin', 'showLose', 'result-visible');

  if (g_gameState === STATE_WON) {
    wrap.classList.add('showWin', 'result-visible');
    wrap.setAttribute('aria-hidden', 'false');
    titleEl.textContent = 'YOU WIN!';
    subEl.textContent = 'Cat rescued!';
    return;
  }
  if (g_gameState === STATE_LOST) {
    wrap.classList.add('showLose', 'result-visible');
    wrap.setAttribute('aria-hidden', 'false');
    titleEl.textContent = 'YOU LOSE!';
    subEl.textContent = (g_loseReason === 'timer')
      ? 'Time ran out!'
      : 'A zombie caught you!';
    return;
  }

  wrap.setAttribute('aria-hidden', 'true');
  titleEl.textContent = '';
  subEl.textContent = '';
}
