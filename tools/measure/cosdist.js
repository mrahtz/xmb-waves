// usage: PAGE=page.html node cosdist.js [PITCH] [SEED] -> spec 16's check of how the sheet is seen: over the on-screen
// surface (weighted by its area on screen), the distribution of the shading cosine of 4.5, i.e. between the surface normal
// and the line of sight, both in the projected space (view axes scaled by the projection, before the divide), and of the
// size factor (area times cosine over the first power of the distance, with a face-on cell at rest at the camera's
// distance = 1). Also how much the distance to the visible sheet changes across the screen (90th / 10th percentile).
const src = require('fs').readFileSync(process.env.PAGE || require('path').resolve(__dirname, '../../index.html'), 'utf8');
const XMBW_SIM = new Function(src.match(/function XMBW_SIM\(\) \{[\s\S]*?\n\}\n/)[0] + '; return XMBW_SIM;')();
const camSrc = src.match(/const CAMERA = \{[^\n]*\n/)[0] + src.match(/function cameraFor\(pitchDeg, aspect\) \{[\s\S]*?\n\}\n/)[0];
const [cameraFor, CAMERA] = new Function(camSrc + '; return [cameraFor, CAMERA];')();
const pitch = +(process.argv[2] || src.match(/\n  day: \{[\s\S]*?camPitch: ([-0-9.]+)/)[1]), seed = +(process.argv[3] || 5);
const asp = 16 / 9, cam = cameraFor(pitch, asp), M = XMBW_SIM(), N = M.N, T = M.tunables.SCENE;
const sim = M.createSim(seed); sim.setMood({ camFwd: cam.fwd }); sim.warm(sim.warmSteps);
const fx = cam.f / asp, fy = cam.f, W = 1920, H = 1080;
const aRest = T.len * T.wid / ((N - 1) * (N - 1)) * fx * fy, norm = CAMERA.dist / aRest;
const proj = p => { const d = [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]];
  const dot = a => a[0] * d[0] + a[1] * d[1] + a[2] * d[2]; return [fx * dot(cam.right), fy * dot(cam.up), dot(cam.fwd)]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cs = [], ss = [], ds = []; const S = N - 3, n = 200, m = 40, h = 1e-3;
const ev = (s, t) => { const o = [0, 0, 0]; sim.surf(sim.netCur, s, t, o); return o.slice(); };
for (let f = 0; f < 5; f++) {
  for (let k = 0; k < 600; k++) sim.step();
  for (let a = 0; a < n; a++) for (let b = 0; b < m; b++) {
    const s = (a + 0.5) / n * S, t = (b + 0.5) / m * S;
    const Q = proj(ev(s, t)), Qs = sub(proj(ev(s + h, t)), Q).map(x => x / h), Qt = sub(proj(ev(s, t + h)), Q).map(x => x / h);
    if (Q[2] <= 0.1) continue;
    const sx = (Q[0] / Q[2] * 0.5 + 0.5) * W, sy = (0.5 - Q[1] / Q[2] * 0.5) * H;
    if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
    // on-screen area of this sample's cell: the screen-space derivatives' cross product times the parameter cell
    const scr = q => [q[0] / Q[2] - Q[0] * q[2] / (Q[2] * Q[2]), q[1] / Q[2] - Q[1] * q[2] / (Q[2] * Q[2])];
    const u = scr(Qs), v = scr(Qt), area = Math.abs(u[0] * v[1] - u[1] * v[0]) * (S / n) * (S / m) * W * H / 4;
    const Nq = cross(Qs, Qt), dist = len(Q), along = Math.abs(Nq[0] * Q[0] + Nq[1] * Q[1] + Nq[2] * Q[2]) / dist;
    cs.push([along / len(Nq), area]); ss.push([along / dist * norm * (S / (N - 1)) ** 0, area]); ds.push([dist, area]);
  }
}
function wq(arr, qs) { const a = arr.slice().sort((x, y) => x[0] - y[0]); const tot = a.reduce((p, x) => p + x[1], 0);
  return qs.map(q => { let c = 0; for (const x of a) { c += x[1]; if (c >= q * tot) return x[0]; } return a[a.length - 1][0]; }); }
const f2 = a => a.map(x => x.toFixed(2)).join(' / ');
console.log('pitch %s: cosine p10 / p25 / median / p75 / p90: %s', pitch, f2(wq(cs, [0.1, 0.25, 0.5, 0.75, 0.9])));
console.log('share of on-screen sheet with cosine < 0.2, 0.2-0.8, > 0.8: %s', (() => { const tot = cs.reduce((p, x) => p + x[1], 0);
  const b = [0, 0, 0]; for (const x of cs) b[x[0] < 0.2 ? 0 : x[0] > 0.8 ? 2 : 1] += x[1]; return b.map(x => (x / tot).toFixed(2)).join(' / '); })());
console.log('size factor (face-on rest cell at the camera distance = 1) p10 / median / p90: %s', f2(wq(ss, [0.1, 0.5, 0.9])));
const dq = wq(ds, [0.1, 0.9]); console.log('distance p90 / p10 across the visible sheet: %s', (dq[1] / dq[0]).toFixed(2));
