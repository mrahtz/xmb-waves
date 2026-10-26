// usage: PAGE=page.html node sparkmotion.js [PITCH] [SEED] [MOOD-JSON] -> on-screen motion of the sparkles straight from the simulation:
// every sparkle's step (current minus previous position) projected through the page's camera at 1920x1080, sampled
// over 60 s, counting only sparkles past their fade-in and inside the frame. Prints the share moving up, the speed and
// vertical speed (px/s at 1080p), the mean number on screen, and how much a sparkle's velocity changes over 2 s (its path's bend), in the same units.
const src = require('fs').readFileSync(process.env.PAGE || require('path').resolve(__dirname, '../../index.html'), 'utf8');
const XMBW_SIM = new Function(src.match(/function XMBW_SIM\(\) \{[\s\S]*?\n\}\n/)[0] + '; return XMBW_SIM;')();
const camSrc = src.match(/const CAMERA = \{[^\n]*\n/)[0] + src.match(/function cameraFor\(pitchDeg, aspect\) \{[\s\S]*?\n\}\n/)[0];
const [cameraFor, CAMERA] = new Function(camSrc + '; return [cameraFor, CAMERA];')();
const pitch = +(process.argv[2] || 2.7), seed = +(process.argv[3] || 5);
const M = XMBW_SIM(), sim = M.createSim(seed), cam = cameraFor(pitch, 16 / 9);
sim.setMood({ ...JSON.parse(process.argv[4] || '{}'), camFwd: cam.fwd }); sim.warm(sim.warmSteps);
const W = 1920, H = 1080, vp = cam.vp;
function proj(x, y, z) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  return [(cx / cw * 0.5 + 0.5) * W, (0.5 - cy / cw * 0.5) * H, cw];
}
const S = M.SPARK_STRIDE, buf = new Float32Array(sim.pool * S);
const speeds = [], vys = []; let up = 0, n = 0, samples = 0;
for (let f = 0; f < 60 * 60; f++) {
  sim.step();
  if (f % 30) continue;
  const k = sim.packSparks(buf); samples++;
  for (let i = 0; i < k; i++) {
    const o = i * S; if (buf[o + 9] < 0.5) continue;
    const a = proj(buf[o], buf[o + 1], buf[o + 2]), b = proj(buf[o + 3], buf[o + 4], buf[o + 5]);
    if (b[2] < 0.1 || b[0] < 0 || b[0] > W || b[1] < 0 || b[1] > H) continue;
    const vx = (b[0] - a[0]) * 60, vy = (b[1] - a[1]) * 60;
    speeds.push(Math.hypot(vx, vy)); vys.push(Math.abs(vy)); if (vy < 0) up++; n++;
  }
}
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log('on screen (mean)', (n / samples).toFixed(0), '| moving up share', (up / n).toFixed(2));
console.log('speed median %s, p10-p90 %s-%s px/s @1080p; vertical speed median %s', q(speeds, 0.5).toFixed(1), q(speeds, 0.1).toFixed(1), q(speeds, 0.9).toFixed(1), q(vys, 0.5).toFixed(1));
// path bend: change of the 3D velocity over 2 s (120 steps) from the simulation's own constants: gravity, and the jitter's
// random walk over three axes; converted to px/s at the camera's distance
const T = M.tunables.SPARK, dv = Math.hypot(T.gravity * 2, T.jitter * Math.sqrt(3 * 120) * M.DT);
const pxPerUnit = H / (2 * Math.tan(CAMERA.fovY * Math.PI / 360) * CAMERA.dist);
console.log('velocity change over 2 s from gravity and jitter: %s scene units/s, about %s px/s', dv.toFixed(4), (dv * pxPerUnit).toFixed(1));
