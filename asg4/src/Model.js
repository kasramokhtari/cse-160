let g_modelNormalMatrix = new Matrix4();

class Model {
  constructor(filePath) {
    this.type = 'model';
    this.filePath = filePath;
    this.color = [1.0, 1.0, 1.0, 1.0];
    this.matrix = new Matrix4();
    this.useLighting = true;

    this.ready = false;
    this.failed = false;
    this.positionBuffer = null;
    this.normalBuffer = null;
    this.vertexCount = 0;

    const self = this;
    fetch(filePath)
      .then(function(response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.text();
      })
      .then(function(text) {
        self._buildFromText(text);
      })
      .catch(function(err) {
        self.failed = true;
        console.log('Model load failed for ' + filePath + ': ' + err);
      });
  }

  _buildFromText(text) {
    const positions = [];
    const normals = [];
    const outPos = [];
    const outNor = [];

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const hashIdx = line.indexOf('#');
      if (hashIdx >= 0) line = line.substring(0, hashIdx);
      line = line.trim();
      if (line.length === 0) continue;

      const parts = line.split(/\s+/);
      const tag = parts[0];

      if (tag === 'v' && parts.length >= 4) {
        positions.push([
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3]),
        ]);
      } else if (tag === 'vn' && parts.length >= 4) {
        normals.push([
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3]),
        ]);
      } else if (tag === 'f' && parts.length >= 4) {
        const verts = [];
        for (let j = 1; j < parts.length; j++) {
          const tokens = parts[j].split('/');
          const pi = parseInt(tokens[0], 10);
          let ni = NaN;
          if (tokens.length === 3 && tokens[2].length > 0) {
            ni = parseInt(tokens[2], 10);
          }
          verts.push({ pi: pi, ni: ni });
        }
        for (let k = 1; k < verts.length - 1; k++) {
          this._emitTriangle(verts[0], verts[k], verts[k + 1],
                             positions, normals, outPos, outNor);
        }
      }
    }

    if (outPos.length === 0) {
      this.failed = true;
      console.log('Model ' + this.filePath + ' had no triangles to render');
      return;
    }

    const posArr = new Float32Array(outPos);
    const norArr = new Float32Array(outNor);
    this.vertexCount = outPos.length / 3;

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, posArr, gl.STATIC_DRAW);

    this.normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, norArr, gl.STATIC_DRAW);

    this.ready = true;
  }

  _emitTriangle(a, b, c, positions, normals, outPos, outNor) {
    const pa = positions[a.pi - 1];
    const pb = positions[b.pi - 1];
    const pc = positions[c.pi - 1];
    if (!pa || !pb || !pc) return;

    let na = (a.ni > 0) ? normals[a.ni - 1] : null;
    let nb = (b.ni > 0) ? normals[b.ni - 1] : null;
    let nc = (c.ni > 0) ? normals[c.ni - 1] : null;

    if (!na || !nb || !nc) {
      const e1x = pb[0] - pa[0], e1y = pb[1] - pa[1], e1z = pb[2] - pa[2];
      const e2x = pc[0] - pa[0], e2y = pc[1] - pa[1], e2z = pc[2] - pa[2];
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-8) { nx /= len; ny /= len; nz /= len; }
      const face = [nx, ny, nz];
      if (!na) na = face;
      if (!nb) nb = face;
      if (!nc) nc = face;
    }

    outPos.push(pa[0], pa[1], pa[2],
                pb[0], pb[1], pb[2],
                pc[0], pc[1], pc[2]);
    outNor.push(na[0], na[1], na[2],
                nb[0], nb[1], nb[2],
                nc[0], nc[1], nc[2]);
  }

  render() {
    if (!this.ready) return;

    gl.uniformMatrix4fv(u_ModelMatrix, false, this.matrix.elements);

    g_modelNormalMatrix.setInverseOf(this.matrix);
    g_modelNormalMatrix.transpose();
    gl.uniformMatrix4fv(u_NormalMatrix, false, g_modelNormalMatrix.elements);

    const c = this.color;
    gl.uniform4f(u_FragColor, c[0], c[1], c[2], c[3]);
    gl.uniform1i(u_whichTexture, -1);
    gl.uniform2f(u_TexScale, 1, 1);
    gl.uniform1i(u_ObjectLightingOn, this.useLighting ? 1 : 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_Position);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.vertexAttribPointer(a_Normal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_Normal);

    gl.disableVertexAttribArray(a_TexCoord);
    gl.vertexAttrib2f(a_TexCoord, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
  }
}
