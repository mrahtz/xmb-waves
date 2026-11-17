// usage: node restart.js [PAGE] [MOOD] [SPAN_S] -> what the warp clock's restart (spec 4.4b, version 30) does on screen.
// Geometry only (no rendering): the page's own simulation and camera, the band's centre taken as phasefit.js takes it.
// Prints, over a span of seconds around the restart, the band's centre per frame, the frame-to-frame change of the centre
// (against its usual size away from the restart), the correlation of the band's profile with the profile one second later,
// and the typical speed of the net's points, so that the disturbance can be seen to travel and die away.
'use strict';
const fs = require('fs'), path = require('path');
const FW = require(path.join(__dirname, 'opt', 'fastwave.js'));
const pagePath = process.argv[2] || path.resolve(__dirname, '../../index.html');
const moodName = process.argv[3] || 'day', span = +(process.argv[4] || 20);
const src = fs.readFileSync(pagePath, 'utf8');
const P = FW.loadPage(pagePath);
const num = (txt, key) => { const m = txt.match(new RegExp('\\b' + key + ': *(-?[0-9.]+(?:e-?[0-9]+)?)')); return m ? +m[1] : undefined; };
const moodTxt = src.match(new RegExp('\\n  ' + moodName + ': \\{[\\s\\S]*?\\},\\n'))[0];
const fadeFrac = num(src.match(/const WAVE = \{[\s\S]*?\n\};/)[0], 'fade');
const M = P.XMBW_SIM_FAST(), LAT = M.tunables.LAT;
const cam = P.cameraFor(num(moodTxt, 'camPitch'), 16 / 9, num(moodTxt, 'camLift') || 0);
const sim = M.createSim(1);
sim.setMood({ envCross: num(moodTxt, 'envCross'), latScale: [num(moodTxt, 'latX'), num(moodTxt, 'latY'), num(moodTxt, 'latZ')], camFwd: cam.fwd });
sim.warm(sim.warmSteps);

const NB = 48;
function profile() { // the band's centre per column bin, and the median over bins
  const N = sim.N, net = sim.netCur, vp = cam.vp, out = [0, 0, 0], S = N - 3;
  const top = new Float64Array(NB).fill(Infinity), bot = new Float64Array(NB).fill(-Infinity);
  for (let a = 0; a <= 4 * S; a++) for (let b = 0; b <= 4 * S; b++) {
    const s = a / 4, t = b / 4, fs_ = s / S, ft = t / S;
    if (Math.min(1, fs_ / fadeFrac, (1 - fs_) / fadeFrac, ft / fadeFrac, (1 - ft) / fadeFrac) < 0.5) continue;
    sim.surf(net, s, t, out);
    const w = vp[3] * out[0] + vp[7] * out[1] + vp[11] * out[2] + vp[15]; if (w <= 1e-6) continue;
    const u = ((vp[0] * out[0] + vp[4] * out[1] + vp[8] * out[2] + vp[12]) / w + 1) / 2;
    const v = (1 - (vp[1] * out[0] + vp[5] * out[1] + vp[9] * out[2] + vp[13]) / w) / 2;
    if (u < 0 || u >= 1) continue;
    const k = Math.floor(u * NB); if (v < top[k]) top[k] = v; if (v > bot[k]) bot[k] = v;
  }
  const bins = [], cs = [];
  for (let k = 0; k < NB; k++) { const c = isFinite(top[k]) ? (top[k] + bot[k]) / 2 : NaN; bins.push(c); if (isFinite(c)) cs.push(c); }
  return { bins, centre: FW.median(cs) };
}
const speed = () => { const v = sim.debug.vel, a = []; for (let i = 0; i < v.length; i += 3) a.push(Math.hypot(v[i], v[i + 1], v[i + 2])); return FW.median(a); };

// the restart happens when the clock reaches the ceiling: find the frame from the clock's value now
const framesTo = Math.round((LAT.clockMax - sim.clock) * 60);
console.log('page %s, mood %s: clock %s s now, ceiling %s s, restart in %s s of running time',
  path.basename(pagePath), moodName, sim.clock.toFixed(1), LAT.clockMax, (framesTo / 60).toFixed(1));
const start = framesTo - Math.round(span * 60 / 2);
for (let i = 0; i < start; i++) sim.step();
const rows = [];
for (let i = 0; i < span * 60; i++) {
  const t = (start + i - framesTo) / 60;   // seconds relative to the restart
  rows.push({ t, p: profile(), v: speed() });
  sim.step();
}
const corr = (a, b) => { const xs = [], ys = [];
  for (let k = 0; k < NB; k++) if (isFinite(a[k]) && isFinite(b[k])) { xs.push(a[k]); ys.push(b[k]); }
  const m = z => z.reduce((p, x) => p + x, 0) / z.length, mx = m(xs), my = m(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy || 1e-12); };
let worst = 0, usual = [];
for (let i = 1; i < rows.length; i++) {
  const d = Math.abs(rows[i].p.centre - rows[i - 1].p.centre);
  if (Math.abs(rows[i].t) < 0.5) worst = Math.max(worst, d); else usual.push(d);
}
console.log('centre step within one frame at the restart %s H; median elsewhere %s H (p90 %s)',
  worst.toFixed(4), FW.median(usual).toFixed(4), usual.slice().sort((a, b) => a - b)[Math.floor(0.9 * usual.length)].toFixed(4));
{ const vs = rows.map(r => r.v), before = vs.slice(0, Math.floor(rows.length / 2) - 60), after = vs.slice(Math.floor(rows.length / 2));
  console.log('net point speed: median before the restart %s, after %s, largest after %s',
    FW.median(before).toExponential(2), FW.median(after).toExponential(2), Math.max(...after).toExponential(2)); }
console.log('  t(s)  centre  frame step  corr with +1 s  net point speed');
for (let i = 0; i < rows.length; i += 15) {
  const j = i + 60;
  console.log('%s  %s  %s  %s  %s', rows[i].t.toFixed(2).padStart(6), rows[i].p.centre.toFixed(4),
    (i ? Math.abs(rows[i].p.centre - rows[i - 1].p.centre) : NaN).toFixed(4),
    j < rows.length ? corr(rows[i].p.bins, rows[j].p.bins).toFixed(3) : '  -  ', rows[i].v.toExponential(2));
}
