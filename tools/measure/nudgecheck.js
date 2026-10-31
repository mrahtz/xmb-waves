// usage: PAGE=page.html node nudgecheck.js [NOISE] -> spec 16's check of the nudges' strength: the shaken edge held still,
// the nudges alone act on the net until its motion has settled (the warm-up's decay times); then the typical speed (RMS
// over points and time) of the points in the free half of the sheet, against the shaken edge's peak speed when it moves.
// The spec asks for the two to be of the same order, within a factor of two.
const src = require('fs').readFileSync(process.env.PAGE || require('path').resolve(__dirname, '../../index.html'), 'utf8');
const XMBW_SIM = new Function(src.match(/function XMBW_SIM\(\) \{[\s\S]*?\n\}\n/)[0] + '; return XMBW_SIM;')();
const M = XMBW_SIM(), NET = M.tunables.NET, N = M.N;
if (process.argv[2]) NET.noise = +process.argv[2];
const edge = Math.max(NET.driveA * NET.driveW1, NET.driveB * NET.driveW2);
M.setTunables({ 'NET.driveA': 0, 'NET.driveB': 0 });
const sim = M.createSim(3, true); sim.warm(sim.warmSteps);
const v = sim.debug.vel; let s = 0, n = 0;
for (let t = 0; t < 60 * 60; t++) {
  sim.step(); if (t % 30) continue;
  for (let j = 0; j < N; j++) for (let i = (N - 1) >> 1; i < N; i++) { const k = (j * N + i) * 3; s += v[k] * v[k] + v[k + 1] * v[k + 1] + v[k + 2] * v[k + 2]; n++; }
}
const free = Math.sqrt(s / n);
console.log('noise %s: free-half speed (RMS) %s, shaken edge peak speed %s, ratio %s (spec: within 0.5-2)', NET.noise.toExponential(2), free.toExponential(2), edge.toExponential(2), (free / edge).toFixed(2));
