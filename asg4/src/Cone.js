let g_coneBuffer = null;
let g_coneCount = 0;
const CONE_SEGMENTS = 16;
const CONE_FLOATS_PER_VERT = 8;
const CONE_STRIDE = CONE_FLOATS_PER_VERT * 4;

function initConeBuffer() {
  const verts = [];
  for (let i = 0; i < CONE_SEGMENTS; i++) {
    const a1 = (i / CONE_SEGMENTS) * 2 * Math.PI;
    const a2 = ((i + 1) / CONE_SEGMENTS) * 2 * Math.PI;
    const mid = (a1 + a2) * 0.5;

    const x1 = Math.cos(a1) * 0.5, z1 = Math.sin(a1) * 0.5;
    const x2 = Math.cos(a2) * 0.5, z2 = Math.sin(a2) * 0.5;

    let nx = Math.cos(mid);
    let ny = 0.5;
    let nz = Math.sin(mid);
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl; ny /= nl; nz /= nl;

    verts.push(
      0, 1, 0,   0, 0,   nx, ny, nz,
      x1, 0, z1, 0, 0,   nx, ny, nz,
      x2, 0, z2, 0, 0,   nx, ny, nz,
    );

    verts.push(
      0, 0, 0,   0, 0,   0, -1, 0,
      x2, 0, z2, 0, 0,   0, -1, 0,
      x1, 0, z1, 0, 0,   0, -1, 0,
    );
  }

  g_coneCount = verts.length / CONE_FLOATS_PER_VERT;
  g_coneBuffer = gl.createBuffer();
  if (!g_coneBuffer) {
    console.log('Failed to create cone vertex buffer');
    return;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, g_coneBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
}

const g_coneNormalMatrix = new Matrix4();

class Cone {
  constructor() {
    this.type = 'cone';
    this.color = [1.0, 1.0, 1.0, 1.0];
    this.matrix = new Matrix4();
    this.useLighting = true;
  }

  render() {
    const c = this.color;

    gl.uniformMatrix4fv(u_ModelMatrix, false, this.matrix.elements);

    g_coneNormalMatrix.setInverseOf(this.matrix);
    g_coneNormalMatrix.transpose();
    gl.uniformMatrix4fv(u_NormalMatrix, false, g_coneNormalMatrix.elements);

    gl.uniform4f(u_FragColor, c[0], c[1], c[2], c[3]);
    gl.uniform1i(u_whichTexture, -1);
    gl.uniform2f(u_TexScale, 1, 1);
    gl.uniform1i(u_ObjectLightingOn, this.useLighting ? 1 : 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, g_coneBuffer);
    gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, CONE_STRIDE, 0);
    gl.enableVertexAttribArray(a_Position);
    gl.vertexAttribPointer(a_TexCoord, 2, gl.FLOAT, false, CONE_STRIDE, 12);
    gl.enableVertexAttribArray(a_TexCoord);
    gl.vertexAttribPointer(a_Normal, 3, gl.FLOAT, false, CONE_STRIDE, 20);
    gl.enableVertexAttribArray(a_Normal);

    gl.drawArrays(gl.TRIANGLES, 0, g_coneCount);
  }
}
