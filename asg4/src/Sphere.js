let g_sphereBuffer = null;
let g_sphereCount = 0;
const SPHERE_FLOATS_PER_VERT = 8;
const SPHERE_STRIDE = SPHERE_FLOATS_PER_VERT * 4;
const SPHERE_LAT_BANDS = 18;
const SPHERE_LON_BANDS = 24;

function initSphereBuffer() {
  const grid = [];
  for (let lat = 0; lat <= SPHERE_LAT_BANDS; lat++) {
    const theta = (lat / SPHERE_LAT_BANDS) * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    const row = [];
    for (let lon = 0; lon <= SPHERE_LON_BANDS; lon++) {
      const phi = (lon / SPHERE_LON_BANDS) * 2 * Math.PI;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);

      const x = cosP * sinT;
      const y = cosT;
      const z = sinP * sinT;
      const u = lon / SPHERE_LON_BANDS;
      const v = 1.0 - lat / SPHERE_LAT_BANDS;

      row.push({ x, y, z, u, v });
    }
    grid.push(row);
  }

  const verts = [];
  function push(p) {
    verts.push(p.x, p.y, p.z, p.u, p.v, p.x, p.y, p.z);
  }

  for (let lat = 0; lat < SPHERE_LAT_BANDS; lat++) {
    for (let lon = 0; lon < SPHERE_LON_BANDS; lon++) {
      const a = grid[lat][lon];
      const b = grid[lat + 1][lon];
      const c = grid[lat][lon + 1];
      const d = grid[lat + 1][lon + 1];
      
      push(a); push(b); push(c);
      push(c); push(b); push(d);
    }
  }

  g_sphereCount = verts.length / SPHERE_FLOATS_PER_VERT;
  g_sphereBuffer = gl.createBuffer();
  if (!g_sphereBuffer) {
    console.log('Failed to create sphere vertex buffer');
    return;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, g_sphereBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
}

const g_sphereNormalMatrix = new Matrix4();

class Sphere {
  constructor() {
    this.type = 'sphere';
    this.color = [1.0, 1.0, 1.0, 1.0];
    this.matrix = new Matrix4();
    this.textureNum = -1;
    this.textureScale = [1, 1];
    this.useLighting = true;
  }

  render() {
    gl.uniformMatrix4fv(u_ModelMatrix, false, this.matrix.elements);

    g_sphereNormalMatrix.setInverseOf(this.matrix);
    g_sphereNormalMatrix.transpose();
    gl.uniformMatrix4fv(u_NormalMatrix, false, g_sphereNormalMatrix.elements);

    gl.uniform4f(u_FragColor, this.color[0], this.color[1], this.color[2], this.color[3]);
    gl.uniform1i(u_whichTexture, this.textureNum);
    gl.uniform2f(u_TexScale, this.textureScale[0], this.textureScale[1]);
    gl.uniform1i(u_ObjectLightingOn, this.useLighting ? 1 : 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, g_sphereBuffer);
    gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, SPHERE_STRIDE, 0);
    gl.enableVertexAttribArray(a_Position);
    gl.vertexAttribPointer(a_TexCoord, 2, gl.FLOAT, false, SPHERE_STRIDE, 12);
    gl.enableVertexAttribArray(a_TexCoord);
    gl.vertexAttribPointer(a_Normal, 3, gl.FLOAT, false, SPHERE_STRIDE, 20);
    gl.enableVertexAttribArray(a_Normal);

    gl.drawArrays(gl.TRIANGLES, 0, g_sphereCount);
  }
}
