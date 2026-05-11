let g_cubeBuffer = null;
const CUBE_FLOATS_PER_VERT = 5;
const CUBE_STRIDE = CUBE_FLOATS_PER_VERT * 4;
const CUBE_VERT_COUNT = 36;

const CUBE_VERTS = new Float32Array([
  // front face (z = 0), looking toward -z
  0,0,0, 0,0,   1,1,0, 1,1,   1,0,0, 1,0,
  0,0,0, 0,0,   0,1,0, 0,1,   1,1,0, 1,1,

  // back face (z = 1), looking toward +z
  0,0,1, 1,0,   1,0,1, 0,0,   1,1,1, 0,1,
  0,0,1, 1,0,   1,1,1, 0,1,   0,1,1, 1,1,

  // top face (y = 1)
  0,1,0, 0,0,   0,1,1, 0,1,   1,1,1, 1,1,
  0,1,0, 0,0,   1,1,1, 1,1,   1,1,0, 1,0,

  // bottom face (y = 0)
  0,0,0, 0,0,   1,0,0, 1,0,   1,0,1, 1,1,
  0,0,0, 0,0,   1,0,1, 1,1,   0,0,1, 0,1,

  // left face (x = 0)
  0,0,0, 0,0,   0,0,1, 1,0,   0,1,1, 1,1,
  0,0,0, 0,0,   0,1,1, 1,1,   0,1,0, 0,1,

  // right face (x = 1)
  1,0,0, 1,0,   1,1,0, 1,1,   1,1,1, 0,1,
  1,0,0, 1,0,   1,1,1, 0,1,   1,0,1, 0,0,
]);

function initCubeBuffer() {
  g_cubeBuffer = gl.createBuffer();
  if (!g_cubeBuffer) {
    console.log('Failed to create cube vertex buffer');
    return;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, g_cubeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, CUBE_VERTS, gl.STATIC_DRAW);

  // a_Position: first 3 floats of each vertex, offset 0
  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, CUBE_STRIDE, 0);
  gl.enableVertexAttribArray(a_Position);

  // a_TexCoord: next 2 floats, offset 12 bytes
  gl.vertexAttribPointer(a_TexCoord, 2, gl.FLOAT, false, CUBE_STRIDE, 12);
  gl.enableVertexAttribArray(a_TexCoord);
}

class Cube {
  constructor() {
    this.type = 'cube';
    this.color = [1.0, 1.0, 1.0, 1.0];
    this.matrix = new Matrix4();
    // -1 solid, 0 grass, 1 dirt, 2 cobble
    this.textureNum = -1;
    this.textureScale = [1, 1];
  }

  render() {
    gl.uniformMatrix4fv(u_ModelMatrix, false, this.matrix.elements);
    gl.uniform4f(u_FragColor, this.color[0], this.color[1], this.color[2], this.color[3]);
    gl.uniform1i(u_whichTexture, this.textureNum);
    gl.uniform2f(u_TexScale, this.textureScale[0], this.textureScale[1]);

    // Re-bind layout in case Cone.render left different state
    gl.bindBuffer(gl.ARRAY_BUFFER, g_cubeBuffer);
    gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, CUBE_STRIDE, 0);
    gl.enableVertexAttribArray(a_Position);
    gl.vertexAttribPointer(a_TexCoord, 2, gl.FLOAT, false, CUBE_STRIDE, 12);
    gl.enableVertexAttribArray(a_TexCoord);

    gl.drawArrays(gl.TRIANGLES, 0, CUBE_VERT_COUNT);
  }
}
