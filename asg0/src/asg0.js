// DrawTriangle.js (c) 2012 matsuda
function main() {  
  // Retrieve <canvas> element
  var canvas = document.getElementById('example');  
  if (!canvas) { 
    console.log('Failed to retrieve the <canvas> element');
    return false; 
  } 

  // Get the rendering context for 2DCG
  var ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(0, 0, 0, 1)'; 
  ctx.fillRect(0, 0, canvas.width, canvas.height);     

  let v1 = new Vector3([2.25, 2.25, 0])
  drawVector(v1, "red")
}

function drawVector(v, color){
  var canvas = document.getElementById('example')
  var ctx = canvas.getContext('2d');

  ctx.strokeStyle = color;

  // starting new line
  ctx.beginPath();

  // getting center
  let origin_x = canvas.width / 2;
  let origin_y = canvas.height / 2;

  // moves the item that is drawing to the center
  ctx.moveTo(origin_x, origin_y);

  // calulating the end of the line
  let end_x = origin_x + v.elements[0] * 20;
  let end_y = origin_y - v.elements[1] * 20;

  
  ctx.lineTo(end_x, end_y);
  ctx.stroke();
}

function handleDrawEvent() {
  var canvas = document.getElementById('example');
  var ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // converts inputs from strings to floats
  let x1 = parseFloat(document.getElementById('xVal').value);
  let y1 = parseFloat(document.getElementById('yVal').value);
  let v1 = new Vector3([x1, y1, 0]);

  let x2 = parseFloat(document.getElementById('xVal2').value);
  let y2 = parseFloat(document.getElementById('yVal2').value);
  let v2 = new Vector3([x2, y2, 0]);

  drawVector(v1, "red");
  drawVector(v2, "blue");
}


function handleDrawOperationEvent() {
  var canvas = document.getElementById('example');
  var ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // converts inputs from strings to floats
  let x1 = parseFloat(document.getElementById('xVal').value);
  let y1 = parseFloat(document.getElementById('yVal').value);
  let v1 = new Vector3([x1, y1, 0]);

  let x2 = parseFloat(document.getElementById('xVal2').value);
  let y2 = parseFloat(document.getElementById('yVal2').value);
  let v2 = new Vector3([x2, y2, 0]);

  drawVector(v1, "red");
  drawVector(v2, "blue");

  let operation = document.getElementById('operation').value;
  let scalar = parseFloat(document.getElementById('scalar').value);

  if (operation === "add"){
    // make copy to perserve original v1 vector
    let v3 = new Vector3(v1.elements);
    v3.add(v2);
    drawVector(v3, "green")
  }
  else if (operation === "sub") {
    let v3 = new Vector3(v1.elements);
    v3.sub(v2);
    drawVector(v3, "green");
  }
  else if (operation === "mul") {
    let v3 = new Vector3(v1.elements);
    v3.mul(scalar);
    
    let v4 = new Vector3(v2.elements);
    v4.mul(scalar);

    drawVector(v3, "green");
    drawVector(v4, "green");
  }
  else if (operation === "div") {
    let v3 = new Vector3(v1.elements);
    v3.div(scalar);

    let v4 = new Vector3(v2.elements);
    v4.div(scalar);

    drawVector(v3, "green");
    drawVector(v4, "green");
  }
  else if (operation === "angle") {
    console.log("Angle:", angleBetween(v1, v2));
  }
  else if (operation === "area") {
    console.log("Area of the triangle:", areaTriangle(v1, v2));
  }
  else if (operation === "mag") {
    console.log("Magnitude v1:", v1.magnitude());
    console.log("Magnitude v2:", v2.magnitude());
  }
  else if (operation === "norm") {
    let v3 = new Vector3(v1.elements);
    let v4 = new Vector3(v2.elements);

    v3.normalize();
    v4.normalize();

    drawVector(v3, "green");
    drawVector(v4, "green");
  }
}

function angleBetween(v1, v2) {
  let dotp = Vector3.dot(v1, v2);

  let m1 = v1.magnitude();
  let m2 = v2.magnitude();

  // defintion
  let cos = dotp / (m1 * m2);

  // find angle in radians and then convert into degrees
  let angleR = Math.acos(cos);
  return angleR * (180 / Math.PI);
}

function areaTriangle(v1, v2) {
  let cross = Vector3.cross(v1, v2)
  let areaPara = cross.magnitude()
  let areaTri = areaPara / 2;

  return areaTri
}