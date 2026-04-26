let g_coneBuffer = null;
let g_coneCount = 0;
const CONE_SEGMENTS = 16;

function initConeBuffer() {
  const verts = [];
  for (let i = 0; i < CONE_SEGMENTS; i++) {
    const a1 = (i / CONE_SEGMENTS) * 2 * Math.PI;
    const a2 = ((i + 1) / CONE_SEGMENTS) * 2 * Math.PI;
    const x1 = Math.cos(a1) * 0.5, z1 = Math.sin(a1) * 0.5;
    const x2 = Math.cos(a2) * 0.5, z2 = Math.sin(a2) * 0.5;
    verts.push(0, 1, 0,  x1, 0, z1,  x2, 0, z2);   // side triangle
    verts.push(0, 0, 0,  x2, 0, z2,  x1, 0, z1);   // base triangle
  }

  g_coneCount = verts.length / 3;
  g_coneBuffer = gl.createBuffer();
  if (!g_coneBuffer) {
    console.log('Failed to create cone vertex buffer');
    return;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, g_coneBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
}

class Cone {
  constructor() {
    this.type = 'cone';
    this.color = [1.0, 1.0, 1.0, 1.0];
    this.matrix = new Matrix4();
  }

  render() {
    const c = this.color;

    gl.uniformMatrix4fv(u_ModelMatrix, false, this.matrix.elements);

    gl.bindBuffer(gl.ARRAY_BUFFER, g_coneBuffer);
    gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_Position);

    gl.uniform4f(u_FragColor, c[0], c[1], c[2], c[3]);
    gl.drawArrays(gl.TRIANGLES, 0, g_coneCount);
  }
}
