let g_cubeBuffer = null;
const CUBE_FLOATS_PER_VERT = 8;
const CUBE_STRIDE = CUBE_FLOATS_PER_VERT * 4;
const CUBE_VERT_COUNT = 36;


const CUBE_VERTS = new Float32Array([
  0,0,0, 0,0, 0,0,-1,   1,1,0, 1,1, 0,0,-1,   1,0,0, 1,0, 0,0,-1,
  0,0,0, 0,0, 0,0,-1,   0,1,0, 0,1, 0,0,-1,   1,1,0, 1,1, 0,0,-1,

  0,0,1, 1,0, 0,0,1,    1,0,1, 0,0, 0,0,1,    1,1,1, 0,1, 0,0,1,
  0,0,1, 1,0, 0,0,1,    1,1,1, 0,1, 0,0,1,    0,1,1, 1,1, 0,0,1,

  0,1,0, 0,0, 0,1,0,    0,1,1, 0,1, 0,1,0,    1,1,1, 1,1, 0,1,0,
  0,1,0, 0,0, 0,1,0,    1,1,1, 1,1, 0,1,0,    1,1,0, 1,0, 0,1,0,

  0,0,0, 0,0, 0,-1,0,   1,0,0, 1,0, 0,-1,0,   1,0,1, 1,1, 0,-1,0,
  0,0,0, 0,0, 0,-1,0,   1,0,1, 1,1, 0,-1,0,   0,0,1, 0,1, 0,-1,0,

  0,0,0, 0,0, -1,0,0,   0,0,1, 1,0, -1,0,0,   0,1,1, 1,1, -1,0,0,
  0,0,0, 0,0, -1,0,0,   0,1,1, 1,1, -1,0,0,   0,1,0, 0,1, -1,0,0,

  1,0,0, 1,0, 1,0,0,    1,1,0, 1,1, 1,0,0,    1,1,1, 0,1, 1,0,0,
  1,0,0, 1,0, 1,0,0,    1,1,1, 0,1, 1,0,0,    1,0,1, 0,0, 1,0,0,
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

const g_cubeNormalMatrix = new Matrix4();

class Cube {
  constructor() {
    this.type = 'cube';
    this.color = [1.0, 1.0, 1.0, 1.0];
    this.matrix = new Matrix4();
    this.textureNum = -1;
    this.textureScale = [1, 1];
    this.useLighting = true;
  }

  render() {
    gl.uniformMatrix4fv(u_ModelMatrix, false, this.matrix.elements);

    g_cubeNormalMatrix.setInverseOf(this.matrix);
    g_cubeNormalMatrix.transpose();
    gl.uniformMatrix4fv(u_NormalMatrix, false, g_cubeNormalMatrix.elements);

    gl.uniform4f(u_FragColor, this.color[0], this.color[1], this.color[2], this.color[3]);
    gl.uniform1i(u_whichTexture, this.textureNum);
    gl.uniform2f(u_TexScale, this.textureScale[0], this.textureScale[1]);
    gl.uniform1i(u_ObjectLightingOn, this.useLighting ? 1 : 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, g_cubeBuffer);
    gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, CUBE_STRIDE, 0);
    gl.enableVertexAttribArray(a_Position);
    gl.vertexAttribPointer(a_TexCoord, 2, gl.FLOAT, false, CUBE_STRIDE, 12);
    gl.enableVertexAttribArray(a_TexCoord);
    gl.vertexAttribPointer(a_Normal, 3, gl.FLOAT, false, CUBE_STRIDE, 20);
    gl.enableVertexAttribArray(a_Normal);

    gl.drawArrays(gl.TRIANGLES, 0, CUBE_VERT_COUNT);
  }
}
