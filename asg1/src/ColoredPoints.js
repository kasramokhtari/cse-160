// ColoredPoint.js (c) 2012 matsuda
// Vertex shader program
var VSHADER_SOURCE = `
  attribute vec4 a_Position;
  uniform float u_Size;
  void main() {
    gl_Position = a_Position;
    //gl_PointSize = 10.0;
    gl_PointSize = u_Size;
  }`

// Fragment shader program
var FSHADER_SOURCE = `
  precision mediump float;
  uniform vec4 u_FragColor;
  void main() {
    gl_FragColor = u_FragColor;
  }`

// Global Variables
let canvas;
let gl;
let a_Position;
let u_FragColor;
let u_Size;

function setupWebGL(){
  // Retrieve <canvas> element
  canvas = document.getElementById('webgl');

  // Get the rendering context for WebGL
  // gl = getWebGLContext(canvas);

  gl = canvas.getContext("webgl", { preserveDrawingBuffer: true});
  if (!gl) {
    console.log('Failed to get the rendering context for WebGL');
    return;
  }

}

function connectVariablesToGLSL(){
  // Initialize shaders
  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.log('Failed to intialize shaders.');
    return;
  }

  // Get the storage location of a_Position
  a_Position = gl.getAttribLocation(gl.program, 'a_Position');
  if (a_Position < 0) {
    console.log('Failed to get the storage location of a_Position');
    return;
  }

  // Get the storage location of u_FragColor
  u_FragColor = gl.getUniformLocation(gl.program, 'u_FragColor');
  if (!u_FragColor) {
    console.log('Failed to get the storage location of u_FragColor');
    return;
  }

  // Get the storage location of u_Size

  u_Size = gl.getUniformLocation(gl.program, 'u_Size');
  if (!u_Size) {
    console.log('Failed to get the storage location of u_Size');
    return;
  }

}

const POINT = 0;
const TRIANGLE = 1;
const CIRCLE = 2;

// Global related UI elements
let g_selectedColor = [1.0, 1.0, 1.0, 1.0];
let g_selectedSize = 5;
let g_selectedType = POINT;
let g_selectedSegments = 10;

// Drag state
let g_prevX = null;
let g_prevY = null;

// Set up actionjs for the HTML UI elements
function addActionsForHtmlUI(){

  // Button Events (Shape Type)
  // document.getElementById('green').onclick = function () { g_selectedColor = [0.0, 1.0, 0.0, 1.0]; };
  // document.getElementById('red').onclick = function () { g_selectedColor = [1.0, 0.0, 0.0, 1.0]; };

  document.getElementById('clearButton').onclick = function () { g_shapesList = []; renderAllShapes();};

  document.getElementById('pointButton').onclick = function () { g_selectedType = POINT};
  document.getElementById('triButton').onclick = function () { g_selectedType = TRIANGLE};
  document.getElementById('circleButton').onclick = function () { g_selectedType = CIRCLE};

  // Draw Picture Event
  document.getElementById('drawPictureButton').onclick = function () { drawPicture(); };

  // Slider Events
  document.getElementById("redSlide").addEventListener('mouseup',   function() { g_selectedColor[0] = this.value/100; });
  document.getElementById("greenSlide").addEventListener('mouseup', function() { g_selectedColor[1] = this.value/100; });
  document.getElementById("blueSlide").addEventListener('mouseup',  function() { g_selectedColor[2] = this.value/100; });

  // Size Slider Event
  document.getElementById("sizeSlide").addEventListener('mouseup', function() { g_selectedSize = this.value; });

  // Segement Silder Event
  document.getElementById("segmentSlide").addEventListener('mouseup', function() { g_selectedSegments = this.value; });

}

function main() {

  // Set up canvas and gl variables
  setupWebGL();
  // Set up GLSL shader programs and connect GLSL variables
  connectVariablesToGLSL();

  // Set up actions for the HTML UI elements
  addActionsForHtmlUI();

  canvas.onmousedown = function(ev) {
    click(ev);
  };

  canvas.onmousemove = function(ev) {
    if (ev.buttons == 1) {
      drag(ev);
    }
  };

  canvas.onmouseup = function() {
    g_prevX = null;
    g_prevY = null;
  };

  canvas.onmouseleave = function() {
    g_prevX = null;
    g_prevY = null;
  };

  // Specify the color for clearing <canvas>
  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  // Clear <canvas>
  gl.clear(gl.COLOR_BUFFER_BIT);
}


var g_shapesList = [];

// var g_points = [];  // The array for the position of a mouse press
// var g_colors = [];  // The array to store the color of a point
// var g_sizes = [];   // The arrya to store the size of a point

function addShapeAt(x, y) {
  let shape;

  if (g_selectedType == POINT) {
    shape = new Point();
  } else if (g_selectedType == TRIANGLE) {
    shape = new Triangle();
  } else {
    shape = new Circle();
    shape.segments = g_selectedSegments;
  }

  shape.position = [x, y];
  shape.color = g_selectedColor.slice();
  shape.size = g_selectedSize;

  g_shapesList.push(shape);
}

function click(ev) {
  //Extract the event click and return it in WebGL coordinates
  let [x,y] = convertCoordinatesEventsToGL(ev);

  // Create and store the new point
  addShapeAt(x, y);

  // Draw every shape that is supposed to be in the canvas
  renderAllShapes();

  g_prevX = x;
  g_prevY = y;
}

function drag(ev) {
  let [x, y] = convertCoordinatesEventsToGL(ev);

  if (g_prevX === null || g_prevY === null) {
    addShapeAt(x, y);
    renderAllShapes();
    g_prevX = x;
    g_prevY = y;
    return;
  }

  let dx = x - g_prevX;
  let dy = y - g_prevY;
  let dist = Math.sqrt(dx * dx + dy * dy);

  let spacing = g_selectedSize / 200;
  let steps = Math.max(1, Math.ceil(dist / spacing));

  for (let i = 1; i <= steps; i++) {
    let t = i / steps;
    let ix = g_prevX + dx * t;
    let iy = g_prevY + dy * t;
    addShapeAt(ix, iy);
  }

  renderAllShapes();

  g_prevX = x;
  g_prevY = y;
}

//Extract the event click and return it in WebGL coordinates
function convertCoordinatesEventsToGL(ev){
  var x = ev.clientX; // x coordinate of a mouse pointer
  var y = ev.clientY; // y coordinate of a mouse pointer
  var rect = ev.target.getBoundingClientRect();

  x = ((x - rect.left) - canvas.width/2)/(canvas.width/2);
  y = (canvas.height/2 - (y - rect.top))/(canvas.height/2);

  return([x,y]);
}


//Draw every shape that is supposed to be in the canvas
function renderAllShapes(){
  // Clear <canvas>
  gl.clear(gl.COLOR_BUFFER_BIT);

  var len = g_shapesList.length;

  for(var i = 0; i < len; i++) {
    
    g_shapesList[i].render();

  }

}

function drawPicture() {
  g_shapesList = [];
  gl.clear(gl.COLOR_BUFFER_BIT);
  
  gl.uniform4f(u_FragColor, 0.5, 0.8, 1.0, 1.0);
  // Background
  drawTriangle([-1.0, -1.0,  1.0, -1.0,  -1.0,  1.0]);
  drawTriangle([-1.0,  1.0,  1.0, -1.0,   1.0,  1.0]);
 
  gl.uniform4f(u_FragColor, 0.8, 0.8, 0.8, 1.0);
  // Mountains
  drawTriangle([-1, -1, -.5,-1, -.75, -.33])
  drawTriangle([-.5, -1, 0,-1, -.25, -.33])
  drawTriangle([.5, -1, 0,-1, .25, -.33])
  drawTriangle([.5, -1, 1,-1, .75, -.33])

  // Clouds
  // Cloud 1
  drawTriangle([-5/8,0,-5/8,-1/6,-3/8,-1/6])
  drawTriangle([-5/8,0,-3/8,0,-3/8,-1/6])
  drawTriangle([-3/8,0,-3/8,-1/6,-2/8,-1/12])
  drawTriangle([-5/8,0,-5/8,-1/6,-6/8,-1/12])
  drawTriangle([-5/8,0,-4/8,0,-4.5/8,1/6])
  drawTriangle([-4/8,0,-3/8,0,-3.5/8,1/6])
  drawTriangle([-5/8,-1/6,-4/8,-1/6,-4.5/8,-2/6])
  drawTriangle([-4/8,-1/6,-3/8,-1/6,-3.5/8,-2/6])

  // Cloud 2
  drawTriangle([3/8,0,3/8,-1/6,5/8,-1/6])
  drawTriangle([3/8,0,5/8,0,5/8,-1/6])
  drawTriangle([5/8,0,5/8,-1/6,6/8,-1/12])
  drawTriangle([3/8,0,3/8,-1/6,2/8,-1/12])
  drawTriangle([3/8,0,4/8,0,3.5/8,1/6])
  drawTriangle([4/8,0,5/8,0,4.5/8,1/6])
  drawTriangle([3/8,-1/6,4/8,-1/6,3.5/8,-2/6])
  drawTriangle([4/8,-1/6,5/8,-1/6,4.5/8,-2/6])

  
  gl.uniform4f(u_FragColor, 1.0, 1.0, 1.0, 1.0)
  // Snow on mountains
  drawTriangle([-7/8,-2/3,-6/8,-1/3,-5/8,-2/3])
  drawTriangle([-1/4,-1/3,-3/8,-2/3,-1/8,-2/3])
  drawTriangle([1/4,-1/3,1/8,-2/3, 3/8,-2/3])
  drawTriangle([3/4,-1/3,5/8,-2/3, 7/8,-2/3])

  // Initals
  // K
  drawTriangle([-3/8,-4/6,-2.8/8,-1,-2.7/8,-4/6])
  drawTriangle([-1/8,-4/6,-2.8/8,-5/6,-1.3/8,-4/6])
  drawTriangle([-2.8/8,-5/6,-1.2/8,-1,-2.5/8,-5/6])

  // M
  drawTriangle([1/8,-4/6,5/24,-4/6,1.3/8,-1])
  drawTriangle([5/24,-4/6,7/24,-4/6,2.3/8,-1])
  drawTriangle([7/24,-4/6,3/8,-4/6,3/8,-1])



  // Sun
  gl.uniform4f(u_FragColor, 1.0, 0.85, 0.2, 1.0)
  drawTriangle([-1/8,4/6,-1/8,2/6,1/8,2/6])
  drawTriangle([-1/8,4/6,1/8,4/6,1/8,2/6])
  drawTriangle([-1/8,2/6,0,2/6,-1/16,1/6])
  drawTriangle([1/8,2/6,0,2/6,1/16,1/6])
  drawTriangle([-1/8,4/6,0,4/6,-1/16,5/6])
  drawTriangle([1/8,4/6,0,4/6,1/16,5/6])
  drawTriangle([-1/8,4/6,-1/8,3/6,-2/8,3.5/6])
  drawTriangle([-1/8,2/6,-1/8,3/6,-2/8,2.5/6])
  drawTriangle([1/8,4/6,1/8,3/6,2/8,3.5/6])
  drawTriangle([1/8,2/6,1/8,3/6,2/8,2.5/6])
}