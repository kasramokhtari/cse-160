var VSHADER_SOURCE = `
  attribute vec4 a_Position;
  uniform mat4 u_ModelMatrix;
  uniform mat4 u_GlobalRotateMatrix;
  void main() {
    gl_Position = u_GlobalRotateMatrix * u_ModelMatrix * a_Position;
  }`;

var FSHADER_SOURCE = `
  precision mediump float;
  uniform vec4 u_FragColor;
  void main() {
    gl_FragColor = u_FragColor;
  }`;

let canvas;
let gl;
let a_Position;
let u_FragColor;
let u_ModelMatrix;
let u_GlobalRotateMatrix;

// global rotation (slider + mouse drag)
let g_globalAngleY = 0;
let g_globalAngleX = 0;

// joint angles
let g_headAngle = 0;
let g_earAngle  = 0;

let g_tailBase = 20;
let g_tailMid  = 0;
let g_tailTip  = 0;

// extra tail rotations for the side-to-side walking sway
let g_tailBaseYaw = 0;
let g_tailMidYaw  = 0;
let g_tailTipYaw  = 0;

// legs: front-left, front-right, back-left, back-right
let g_flUpper = 0, g_flLower = 0, g_flPaw = 0;
let g_frUpper = 0, g_frLower = 0, g_frPaw = 0;
let g_blUpper = 0, g_blLower = 0, g_blPaw = 0;
let g_brUpper = 0, g_brLower = 0, g_brPaw = 0;

// sideways spread for the poke pose
let g_flSpread = 0, g_frSpread = 0, g_blSpread = 0, g_brSpread = 0;

let g_animationOn = true;
let g_pokeActive = false;
let g_pokeStartTime = 0;

// mouse drag state
let g_dragging = false;
let g_lastMouseX = 0;
let g_lastMouseY = 0;

let g_startTime = performance.now() / 1000.0;
let g_seconds = 0;

// fps counter (averaged over a short window)
let g_perfFrames = 0;
let g_perfWindowStart = performance.now();
const PERF_UPDATE_MS = 400;


function setupWebGL() {
  canvas = document.getElementById('webgl');
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!gl) {
    console.log('Failed to get the rendering context for WebGL');
    return;
  }
  gl.enable(gl.DEPTH_TEST);
}

function connectVariablesToGLSL() {
  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.log('Failed to intialize shaders.');
    return;
  }

  a_Position = gl.getAttribLocation(gl.program, 'a_Position');
  u_FragColor = gl.getUniformLocation(gl.program, 'u_FragColor');
  u_ModelMatrix = gl.getUniformLocation(gl.program, 'u_ModelMatrix');
  u_GlobalRotateMatrix = gl.getUniformLocation(gl.program, 'u_GlobalRotateMatrix');

  var I = new Matrix4();
  gl.uniformMatrix4fv(u_ModelMatrix, false, I.elements);
}

function sendTextToHTML(text, htmlID) {
  const el = document.getElementById(htmlID);
  if (!el) return;
  el.innerHTML = text;
}

// when animation is turned off, copy the current slider values into the
// joint globals so the cat snaps to whatever pose the sliders show
function snapJointsToSliders() {
  function read(id) {
    const el = document.getElementById(id);
    return el ? parseFloat(el.value) : 0;
  }

  g_headAngle = read('headSlide');
  g_earAngle  = read('earSlide');

  g_flUpper = read('flUpperSlide');
  g_flLower = read('flLowerSlide');
  g_flPaw   = read('flPawSlide');

  g_frUpper = read('frUpperSlide');
  g_frLower = read('frLowerSlide');
  g_frPaw   = read('frPawSlide');

  g_blUpper = read('blUpperSlide');
  g_blLower = read('blLowerSlide');
  g_blPaw   = read('blPawSlide');

  g_brUpper = read('brUpperSlide');
  g_brLower = read('brLowerSlide');
  g_brPaw   = read('brPawSlide');

  g_flSpread = 0;  g_frSpread = 0;  g_blSpread = 0;  g_brSpread = 0;
}

function addActionsForHtmlUI() {
  document.getElementById('animOnButton').onclick  = function() { g_animationOn = true; };
  document.getElementById('animOffButton').onclick = function() {
    g_animationOn = false;
    snapJointsToSliders();
  };

  document.getElementById('angleSlide').addEventListener('input', function() {
    g_globalAngleY = parseFloat(this.value);
  });
  document.getElementById('angleSlideX').addEventListener('input', function() {
    g_globalAngleX = parseFloat(this.value);
  });

  document.getElementById('headSlide').addEventListener('input', function() { g_headAngle = parseFloat(this.value); });
  document.getElementById('earSlide').addEventListener('input',  function() { g_earAngle  = parseFloat(this.value); });

  document.getElementById('tailBaseSlide').addEventListener('input', function() { g_tailBase = parseFloat(this.value); });
  document.getElementById('tailMidSlide').addEventListener('input',  function() { g_tailMid  = parseFloat(this.value); });
  document.getElementById('tailTipSlide').addEventListener('input',  function() { g_tailTip  = parseFloat(this.value); });

  document.getElementById('flUpperSlide').addEventListener('input', function() { g_flUpper = parseFloat(this.value); });
  document.getElementById('flLowerSlide').addEventListener('input', function() { g_flLower = parseFloat(this.value); });
  document.getElementById('flPawSlide').addEventListener('input',   function() { g_flPaw   = parseFloat(this.value); });

  document.getElementById('frUpperSlide').addEventListener('input', function() { g_frUpper = parseFloat(this.value); });
  document.getElementById('frLowerSlide').addEventListener('input', function() { g_frLower = parseFloat(this.value); });
  document.getElementById('frPawSlide').addEventListener('input',   function() { g_frPaw   = parseFloat(this.value); });

  document.getElementById('blUpperSlide').addEventListener('input', function() { g_blUpper = parseFloat(this.value); });
  document.getElementById('blLowerSlide').addEventListener('input', function() { g_blLower = parseFloat(this.value); });
  document.getElementById('blPawSlide').addEventListener('input',   function() { g_blPaw   = parseFloat(this.value); });

  document.getElementById('brUpperSlide').addEventListener('input', function() { g_brUpper = parseFloat(this.value); });
  document.getElementById('brLowerSlide').addEventListener('input', function() { g_brLower = parseFloat(this.value); });
  document.getElementById('brPawSlide').addEventListener('input',   function() { g_brPaw   = parseFloat(this.value); });

  // mouse drag rotates the cat, shift-click triggers the poke
  canvas.onmousedown = function(ev) {
    if (ev.shiftKey) {
      g_pokeActive = true;
      g_pokeStartTime = g_seconds;
      return;
    }
    g_dragging = true;
    g_lastMouseX = ev.clientX;
    g_lastMouseY = ev.clientY;
  };
  canvas.onmousemove = function(ev) {
    if (!g_dragging) return;
    const dx = ev.clientX - g_lastMouseX;
    const dy = ev.clientY - g_lastMouseY;
    g_globalAngleY += dx * 0.5;
    g_globalAngleX += dy * 0.5;
    g_lastMouseX = ev.clientX;
    g_lastMouseY = ev.clientY;
  };
  canvas.onmouseup    = function() { g_dragging = false; };
  canvas.onmouseleave = function() { g_dragging = false; };
}

function main() {
  setupWebGL();
  connectVariablesToGLSL();
  initCubeBuffer();
  initConeBuffer();
  addActionsForHtmlUI();

  gl.clearColor(0.96, 0.93, 0.86, 1.0);

  requestAnimationFrame(tick);
}

function tick() {
  g_seconds = performance.now() / 1000.0 - g_startTime;
  updateAnimationAngles();
  renderScene();
  requestAnimationFrame(tick);
}

function updateAnimationAngles() {
  // poke takes priority for ~1.2s
  if (g_pokeActive) {
    const t = g_seconds - g_pokeStartTime;
    if (t > 1.2) {
      g_pokeActive = false;
    } else {
      // 0 -> 1 -> 0 ramp so it eases in and out
      const k = Math.sin((t / 1.2) * Math.PI);

      // tail goes up
      g_tailBase = 80 * k + 20 * (1 - k);
      g_tailMid  = 25 * k;
      g_tailTip  = 30 * k;
      g_tailBaseYaw = 0;
      g_tailMidYaw  = 0;
      g_tailTipYaw  = 0;

      g_headAngle = 0;
      g_earAngle  = 30 * k;

      // legs straight + spread out at the hip
      g_flUpper = 0;  g_flLower = 0;  g_flPaw = 0;
      g_frUpper = 0;  g_frLower = 0;  g_frPaw = 0;
      g_blUpper = 0;  g_blLower = 0;  g_blPaw = 0;
      g_brUpper = 0;  g_brLower = 0;  g_brPaw = 0;
      g_flSpread = -55 * k;
      g_blSpread = -55 * k;
      g_frSpread =  55 * k;
      g_brSpread =  55 * k;
      return;
    }
  }

  if (!g_animationOn) {
    g_tailBaseYaw = 0;
    g_tailMidYaw  = 0;
    g_tailTipYaw  = 0;
    g_flSpread = 0;  g_frSpread = 0;  g_blSpread = 0;  g_brSpread = 0;
    return;
  }

  // walking - diagonal pairs swing together
  const phase = Math.sin(g_seconds * 4);

  g_flUpper =  30 * phase;
  g_brUpper =  30 * phase;
  g_frUpper = -30 * phase;
  g_blUpper = -30 * phase;

  // knees bend on the back-swing
  g_flLower = 25 * Math.max(0, -phase);
  g_brLower = 25 * Math.max(0, -phase);
  g_frLower = 25 * Math.max(0,  phase);
  g_blLower = 25 * Math.max(0,  phase);

  g_flPaw = 10 * Math.sin(g_seconds * 4 + 0.5);
  g_frPaw = 10 * Math.sin(g_seconds * 4 - 0.5);
  g_blPaw = 10 * Math.sin(g_seconds * 4 - 0.5);
  g_brPaw = 10 * Math.sin(g_seconds * 4 + 0.5);

  // tail sways side to side, segments slightly out of phase
  g_tailBase = 20;
  g_tailMid  = 0;
  g_tailTip  = 0;
  g_tailBaseYaw = 20 * Math.sin(g_seconds * 3);
  g_tailMidYaw  = 25 * Math.sin(g_seconds * 3 + 0.6);
  g_tailTipYaw  = 30 * Math.sin(g_seconds * 3 + 1.2);

  // small head bob and ear movement
  g_headAngle = 5 * Math.sin(g_seconds * 2);
  g_earAngle  = 4 * Math.sin(g_seconds * 6);
}

// colors for cat
const CAT_BODY = [0.62, 0.62, 0.65, 1.0];
const CAT_DARK = [0.42, 0.42, 0.45, 1.0];
const CAT_PINK = [1.00, 0.55, 0.65, 1.0];
const CAT_EYE  = [0.30, 0.55, 0.85, 1.0];


function renderScene() {
  var globalRotMat = new Matrix4();
  globalRotMat.rotate(g_globalAngleY, 0, 1, 0);
  globalRotMat.rotate(g_globalAngleX, 1, 0, 0);
  gl.uniformMatrix4fv(u_GlobalRotateMatrix, false, globalRotMat.elements);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  drawCat();

  // update fps text every PERF_UPDATE_MS based on real elapsed time
  g_perfFrames++;
  var now = performance.now();
  var elapsed = now - g_perfWindowStart;
  if (elapsed >= PERF_UPDATE_MS) {
    var fps = (g_perfFrames * 1000) / elapsed;
    var msPerFrame = elapsed / g_perfFrames;
    sendTextToHTML(
      'ms/frame: ' + msPerFrame.toFixed(2) + ' fps: ' + fps.toFixed(1),
      'numdot'
    );
    g_perfFrames = 0;
    g_perfWindowStart = now;
  }
}


function drawCat() {
  // body
  var bodyMat = new Matrix4();
  bodyMat.translate(0, -0.05, 0);

  var body = new Cube();
  body.color = CAT_BODY;
  body.matrix.set(bodyMat);
  body.matrix.scale(0.65, 0.30, 0.40);
  body.matrix.translate(-0.5, -0.5, -0.5);
  body.render();

  // head joint at the front of the body
  var headMat = new Matrix4();
  headMat.translate(0.30, 0.08, 0);
  headMat.rotate(g_headAngle, 0, 0, 1);

  var head = new Cube();
  head.color = CAT_BODY;
  head.matrix.set(headMat);
  head.matrix.scale(0.27, 0.27, 0.30);
  head.matrix.translate(0, -0.5, -0.5);
  head.render();

  // eyes
  for (let s = -1; s <= 1; s += 2) {
    var eye = new Cube();
    eye.color = CAT_EYE;
    eye.matrix.set(headMat);
    eye.matrix.translate(0.28, 0.04, s * 0.075);
    eye.matrix.scale(0.012, 0.055, 0.055);
    eye.matrix.translate(-0.5, -0.5, -0.5);
    eye.render();
  }

  // nose
  var nose = new Cube();
  nose.color = CAT_PINK;
  nose.matrix.set(headMat);
  nose.matrix.translate(0.26, -0.03, 0);
  nose.matrix.scale(0.04, 0.03, 0.05);
  nose.matrix.translate(-0.5, -0.5, -0.5);
  nose.render();

  // ears, which are cones, the non-cube primitive
  for (let s = -1; s <= 1; s += 2) {
    var earMat = new Matrix4();
    earMat.set(headMat);
    earMat.translate(0.06, 0.13, s * 0.10);
    earMat.rotate(s * g_earAngle, 1, 0, 0);

    var ear = new Cone();
    ear.color = CAT_BODY;
    ear.matrix.set(earMat);
    ear.matrix.scale(0.10, 0.13, 0.10);
    ear.render();
  }

  // tail that has 3-segment chain
  // 180 Y flip first so the Z rotations bend it up in the tail's own frame
  var tailMat = new Matrix4();
  tailMat.translate(-0.32, 0.05, 0);
  tailMat.rotate(180, 0, 1, 0);
  tailMat.rotate(g_tailBase, 0, 0, 1);
  tailMat.rotate(g_tailBaseYaw, 0, 1, 0);

  var tail1 = new Cube();
  tail1.color = CAT_BODY;
  tail1.matrix.set(tailMat);
  tail1.matrix.scale(0.18, 0.07, 0.07);
  tail1.matrix.translate(0, -0.5, -0.5);
  tail1.render();

  tailMat.translate(0.18, 0, 0);
  tailMat.rotate(g_tailMid, 0, 0, 1);
  tailMat.rotate(g_tailMidYaw, 0, 1, 0);

  var tail2 = new Cube();
  tail2.color = CAT_BODY;
  tail2.matrix.set(tailMat);
  tail2.matrix.scale(0.15, 0.06, 0.06);
  tail2.matrix.translate(0, -0.5, -0.5);
  tail2.render();

  tailMat.translate(0.15, 0, 0);
  tailMat.rotate(g_tailTip, 0, 0, 1);
  tailMat.rotate(g_tailTipYaw, 0, 1, 0);

  var tail3 = new Cube();
  tail3.color = CAT_DARK;
  tail3.matrix.set(tailMat);
  tail3.matrix.scale(0.12, 0.05, 0.05);
  tail3.matrix.translate(0, -0.5, -0.5);
  tail3.render();

  // 4 legs, each is upper -> lower -> paw
  drawLeg( 0.20,  0.14, g_flUpper, g_flLower, g_flPaw, g_flSpread);
  drawLeg( 0.20, -0.14, g_frUpper, g_frLower, g_frPaw, g_frSpread);
  drawLeg(-0.20,  0.14, g_blUpper, g_blLower, g_blPaw, g_blSpread);
  drawLeg(-0.20, -0.14, g_brUpper, g_brLower, g_brPaw, g_brSpread);
}


function drawLeg(hipX, hipZ, upperAngle, lowerAngle, pawAngle, spreadAngle) {
  var m = new Matrix4();
  m.translate(hipX, -0.20, hipZ);
  m.rotate(spreadAngle, 1, 0, 0);
  m.rotate(upperAngle, 0, 0, 1);

  var upper = new Cube();
  upper.color = CAT_BODY;
  upper.matrix.set(m);
  upper.matrix.scale(0.08, 0.14, 0.08);
  upper.matrix.translate(-0.5, -1.0, -0.5);
  upper.render();

  // knee
  m.translate(0, -0.14, 0);
  m.rotate(lowerAngle, 0, 0, 1);

  var lower = new Cube();
  lower.color = CAT_BODY;
  lower.matrix.set(m);
  lower.matrix.scale(0.07, 0.13, 0.07);
  lower.matrix.translate(-0.5, -1.0, -0.5);
  lower.render();

  // paw
  m.translate(0, -0.13, 0);
  m.rotate(pawAngle, 0, 0, 1);

  var paw = new Cube();
  paw.color = CAT_DARK;
  paw.matrix.set(m);
  paw.matrix.scale(0.09, 0.04, 0.09);
  paw.matrix.translate(-0.5, -1.0, -0.5);
  paw.render();
}
