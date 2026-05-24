// First-person camera

class Camera {
  constructor() {
    this.fov = 60;

    this.eye = new Vector3([0, 0.6, 12]);
    this.at  = new Vector3([0, 0.6, 0]);
    this.up  = new Vector3([0, 1, 0]);

    this.viewMatrix = new Matrix4();
    this.projectionMatrix = new Matrix4();

    this.speed = 0.2;
    this.alpha = 5;
    this.pitchDeg = 0;

    this.updateView();
    this.updateProjection();
  }

  updateView() {
    const e = this.eye.elements;
    const a = this.at.elements;
    const u = this.up.elements;
    this.viewMatrix.setLookAt(
      e[0], e[1], e[2],
      a[0], a[1], a[2],
      u[0], u[1], u[2]
    );
  }

  updateProjection() {
    const aspect = canvas.width / canvas.height;
    this.projectionMatrix.setPerspective(this.fov, aspect, 0.1, 1000);
  }

  _forward() {
    const e = this.eye.elements;
    const a = this.at.elements;
    return [a[0] - e[0], a[1] - e[1], a[2] - e[2]];
  }

  _shift(dx, dy, dz) {
    this.eye.elements[0] += dx;
    this.eye.elements[1] += dy;
    this.eye.elements[2] += dz;
    this.at.elements[0]  += dx;
    this.at.elements[1]  += dy;
    this.at.elements[2]  += dz;
  }

  moveForward() {
    const f = this._forward();
    const len = Math.hypot(f[0], f[1], f[2]);
    if (len === 0) return;
    const s = this.speed / len;
    this._shift(f[0] * s, f[1] * s, f[2] * s);
    this.updateView();
  }

  moveBackward() {
    const f = this._forward();
    const len = Math.hypot(f[0], f[1], f[2]);
    if (len === 0) return;
    const s = -this.speed / len;
    this._shift(f[0] * s, f[1] * s, f[2] * s);
    this.updateView();
  }

  moveLeft() {
    // side = up x forward
    const f = this._forward();
    const u = this.up.elements;
    const sx = u[1]*f[2] - u[2]*f[1];
    const sy = u[2]*f[0] - u[0]*f[2];
    const sz = u[0]*f[1] - u[1]*f[0];
    const len = Math.hypot(sx, sy, sz);
    if (len === 0) return;
    const s = this.speed / len;
    this._shift(sx * s, sy * s, sz * s);
    this.updateView();
  }

  moveRight() {
    // side = forward x up
    const f = this._forward();
    const u = this.up.elements;
    const sx = f[1]*u[2] - f[2]*u[1];
    const sy = f[2]*u[0] - f[0]*u[2];
    const sz = f[0]*u[1] - f[1]*u[0];
    const len = Math.hypot(sx, sy, sz);
    if (len === 0) return;
    const s = this.speed / len;
    this._shift(sx * s, sy * s, sz * s);
    this.updateView();
  }

  panLeft() {
    this._panBy(this.alpha);
  }

  panRight() {
    this._panBy(-this.alpha);
  }

  pan(deg) {
    this._panBy(deg);
  }

  tiltPitch(deg) {
    if (deg === 0) return;
    const f = this._forward();
    const len = Math.hypot(f[0], f[1], f[2]);
    if (len === 0) return;

    const u = this.up.elements;
    const rx = f[1] * u[2] - f[2] * u[1];
    const ry = f[2] * u[0] - f[0] * u[2];
    const rz = f[0] * u[1] - f[1] * u[0];
    const rlen = Math.hypot(rx, ry, rz);
    if (rlen === 0) return;

    const nextPitch = this.pitchDeg + deg;
    const clamped = Math.max(-80, Math.min(80, nextPitch));
    const actual = clamped - this.pitchDeg;
    this.pitchDeg = clamped;
    if (actual === 0) return;

    const inv = 1 / rlen;
    const rot = new Matrix4();
    rot.setRotate(actual, rx * inv, ry * inv, rz * inv);
    const fv = new Vector3([f[0], f[1], f[2]]);
    const fp = rot.multiplyVector3(fv);

    const e = this.eye.elements;
    this.at.elements[0] = e[0] + fp.elements[0];
    this.at.elements[1] = e[1] + fp.elements[1];
    this.at.elements[2] = e[2] + fp.elements[2];
    this.updateView();
  }

  resetPitch() {
    this.pitchDeg = 0;
  }

  _panBy(deg) {
    const f = this._forward();
    const u = this.up.elements;

    const rot = new Matrix4();
    rot.setRotate(deg, u[0], u[1], u[2]);

    const fv = new Vector3([f[0], f[1], f[2]]);
    const fp = rot.multiplyVector3(fv);

    const e = this.eye.elements;
    this.at.elements[0] = e[0] + fp.elements[0];
    this.at.elements[1] = e[1] + fp.elements[1];
    this.at.elements[2] = e[2] + fp.elements[2];
    this.updateView();
  }
}
