let g_cubeBuffer = null;

const CUBE_VERTS = new Float32Array([
  // front
  0,0,0,  1,1,0,  1,0,0,
  0,0,0,  0,1,0,  1,1,0,
  // back
  0,0,1,  1,0,1,  1,1,1,
  0,0,1,  1,1,1,  0,1,1,
  // top
  0,1,0,  0,1,1,  1,1,1,
  0,1,0,  1,1,1,  1,1,0,
  // bottom
  0,0,0,  1,0,0,  1,0,1,
  0,0,0,  1,0,1,  0,0,1,
  // left
  0,0,0,  0,0,1,  0,1,1,
  0,0,0,  0,1,1,  0,1,0,
  // right
  1,0,0,  1,1,0,  1,1,1,
  1,0,0,  1,1,1,  1,0,1,
]);

function initCubeBuffer() {
  g_cubeBuffer = gl.createBuffer();
  if (!g_cubeBuffer) {
    console.log('Failed to create cube vertex buffer');
    return;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, g_cubeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, CUBE_VERTS, gl.STATIC_DRAW);
}

class Cube {
  constructor() {
    this.type = 'cube';
    this.color = [1.0, 1.0, 1.0, 1.0];
    this.matrix = new Matrix4();
  }

  render() {
    const c = this.color;

    gl.uniformMatrix4fv(u_ModelMatrix, false, this.matrix.elements);

    gl.bindBuffer(gl.ARRAY_BUFFER, g_cubeBuffer);
    gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_Position);

    gl.uniform4f(u_FragColor, c[0], c[1], c[2], c[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 30);

    // darker right face for a bit of shading
    gl.uniform4f(u_FragColor, c[0]*0.7, c[1]*0.7, c[2]*0.7, c[3]);
    gl.drawArrays(gl.TRIANGLES, 30, 6);
  }
}
