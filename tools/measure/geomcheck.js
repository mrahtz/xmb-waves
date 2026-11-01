// usage: PAGE=page.html node geomcheck.js [MOOD] [SEED] -> spec 17's checks of the wave's geometry and shading on this
// build, sampled over 50 s:
//   4.4d framing: the share of the sheet's length (from the shaken end) beyond the left edge of the screen, and where
//        the free end lies on screen (1 = the right edge); a share of the surface outside the frame
//   4.4d depth: the distance to the sheet at the left and at the right edge of the screen (the left should be nearer,
//        and the growth slight)
//   4.4d from below: the camera's height relative to the sheet's mean plane (negative = below), and whether the far
//        side of the sheet appears lower on screen than the near side
//   4.5: over the on-screen sheet (by screen area), the product cosine x size factor relative to the Fresnel-like peak,
//        and the share whose size factor is beyond the start of the sheen's cut-off; also the viewing cosine (4.4d, v16)
const src = require('fs').readFileSync(process.env.PAGE || require('path').resolve(__dirname, '../../index.html'), 'utf8');
const XMBW_SIM = new Function(src.match(/function XMBW_SIM\(\) \{[\s\S]*?\n\}\n/)[0] + '; return XMBW_SIM;')();
const camSrc = src.match(/const CAMERA = \{[^\n]*\n/)[0] + src.match(/function cameraFor\(pitchDeg, aspect\) \{[\s\S]*?\n\}\n/)[0];
const [cameraFor, CAMERA] = new Function(camSrc + '; return [cameraFor, CAMERA];')();
const moodName = process.argv[2] || 'day', seed = +(process.argv[3] || 5);
const moodTxt = src.match(new RegExp('\\n  ' + moodName + ': \\{[\\s\\S]*?\\},\\n'))[0];
const num = (t, k) => +t.match(new RegExp('\\b' + k + ': (-?[0-9.]+)'))[1];
const waveTxt = src.match(/const WAVE = \{[\s\S]*?\n\};/)[0];
const pitch = num(moodTxt, 'camPitch'), sizeK = num(moodTxt, 'sizeK'), peak = num(waveTxt, 'fresPeak'), cut0 = num(waveTxt, 'sheenCut0');
const asp = 16 / 9, cam = cameraFor(pitch, asp), M = XMBW_SIM(), N = M.N, T = M.tunables.SCENE;
const sim = M.createSim(seed);
sim.setMood({ envCross: num(moodTxt, 'envCross'), latScale: [num(moodTxt, 'latX'), num(moodTxt, 'latY'), num(moodTxt, 'latZ')], camFwd: cam.fwd });
sim.warm(sim.warmSteps);
const fx = cam.f / asp, fy = cam.f, W = 1920, H = 1080, norm = sizeK * CAMERA.dist / (T.len * T.wid / ((N - 1) * (N - 1)) * fx * fy);
const view = p => { const d = [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]], dot = a => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
  return [fx * dot(cam.right), fy * dot(cam.up), dot(cam.fwd)]; };
const scr = Q => [(Q[0] / Q[2] * 0.5 + 0.5), (0.5 - Q[1] / Q[2] * 0.5)];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const ev = (s, t) => { const o = [0, 0, 0]; sim.surf(sim.netCur, s, t, o); return o.slice(); };
const S = N - 3, n = 160, m = 32, h = 1e-3;
const acc = { left: [], free: [], outside: [], dl: [], dr: [], below: [], farLower: [], prod: [], cut: [], cos: [] };
for (let f = 0; f < 5; f++) {
  for (let k = 0; k < 600; k++) sim.step();
  // framing: the along-length fraction (at mid-width) where the sheet first enters the screen; the free end's screen x
  let first = null; for (let a = 0; a <= 400; a++) { const x = scr(view(ev(a / 400 * S, S / 2)))[0]; if (x >= 0 && first === null) first = a / 400; }
  acc.left.push(first === null ? 1 : first); acc.free.push(scr(view(ev(S, S / 2)))[0]);
  // depth: distance to the sheet's points nearest the left and right edges (mid-width); camera height vs mean plane
  let L = null, R = null, ys = 0, yc = 0, inF = 0, all = 0, wsum = 0, hist = [], pr = 0, cu = 0, co = [];
  const nearF = [], farF = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < m; b++) {
    const s = (a + 0.5) / n * S, t = (b + 0.5) / m * S, P = ev(s, t); ys += P[1]; yc++;
    const Q = view(P); all++; if (Q[2] <= 0.1) continue;
    const sp = scr(Q); if (sp[0] < 0 || sp[0] > 1 || sp[1] < 0 || sp[1] > 1) continue; inF++;
    if (b === m >> 1) { if (L === null || sp[0] < L[0]) L = [sp[0], len(sub(P, cam.pos))]; if (R === null || sp[0] > R[0]) R = [sp[0], len(sub(P, cam.pos))]; }
    if (b === 2) nearF.push(sp[1]); if (b === m - 3) farF.push(sp[1]);
    const Qs = sub(view(ev(s + h, t)), Q).map(x => x / h), Qt = sub(view(ev(s, t + h)), Q).map(x => x / h);
    const u = [Qs[0] / Q[2] - Q[0] * Qs[2] / (Q[2] * Q[2]), Qs[1] / Q[2] - Q[1] * Qs[2] / (Q[2] * Q[2])];
    const v = [Qt[0] / Q[2] - Q[0] * Qt[2] / (Q[2] * Q[2]), Qt[1] / Q[2] - Q[1] * Qt[2] / (Q[2] * Q[2])];
    const area = Math.abs(u[0] * v[1] - u[1] * v[0]);
    const Nq = cross(Qs, Qt), dist = len(Q), along = Math.abs(Nq[0] * Q[0] + Nq[1] * Q[1] + Nq[2] * Q[2]) / dist;
    const c = along / len(Nq), Sf = along / dist * norm;
    hist.push([c * Sf / peak, area]); if (Sf > cut0) cu += area; co.push([c, area]); wsum += area;
  }
  acc.outside.push(1 - inF / all); acc.dl.push(L ? L[1] : NaN); acc.dr.push(R ? R[1] : NaN);
  acc.below.push(cam.pos[1] - ys / yc);
  const mean = a => a.reduce((p, x) => p + x, 0) / a.length; acc.farLower.push(mean(farF) - mean(nearF)); // > 0: far side lower
  acc.prod.push(...hist); acc.cut.push(cu / wsum); acc.cos.push(...co);
}
const avg = a => a.reduce((p, x) => p + x, 0) / a.length;
const wq = (arr, q) => { const a = arr.slice().sort((x, y) => x[0] - y[0]), tot = a.reduce((p, x) => p + x[1], 0); let c = 0; for (const x of a) { c += x[1]; if (c >= q * tot) return x[0]; } return a[a.length - 1][0]; };
console.log('mood %s (pitch %s), seed %d', moodName, pitch, seed);
console.log('4.4d framing: sheet length beyond the left edge %s (from the shaken end); free end at screen x %s (1 = right edge); surface outside the frame %s',
  avg(acc.left).toFixed(2), avg(acc.free).toFixed(2), avg(acc.outside).toFixed(2));
console.log('4.4d depth: distance to the sheet at the left edge %s, at the right edge %s (ratio %s)', avg(acc.dl).toFixed(2), avg(acc.dr).toFixed(2), (avg(acc.dr) / avg(acc.dl)).toFixed(2));
console.log('4.4d from below: camera height above the sheet mean %s (negative = below); far edge lower on screen than near edge by %s of the height (positive = lower)',
  avg(acc.below).toFixed(3), avg(acc.farLower).toFixed(3));
console.log('4.5: cosine x size factor over the Fresnel-like peak: p25 / median / p75 %s / %s / %s; share with size factor beyond the sheen cut-off start %s',
  wq(acc.prod, 0.25).toFixed(2), wq(acc.prod, 0.5).toFixed(2), wq(acc.prod, 0.75).toFixed(2), avg(acc.cut).toFixed(2));
console.log('viewing cosine median %s', wq(acc.cos, 0.5).toFixed(2));
