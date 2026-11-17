// usage: PAGE=page.html node settlecheck.js [MINUTES] [SEED] -> spec 26 (4.4a, "a changed sheet needs a new warm-up"):
// follows the net from the flat start and prints, every half minute of simulation, the quantities that say whether it has
// found its own settled state: the path it follows across its width over the straight line between the width's edges (the
// folded-slack check of 4.4a, the same measure geomcheck.js reports), the same along its length, the extent of the net in
// depth and in height, and the typical speed of its points. A settled net's rows of numbers stop trending.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.env.PAGE || path.resolve(__dirname, '../../index.html'), 'utf8');
const XMBW_SIM = new Function(src.match(/function XMBW_SIM\(\) \{[\s\S]*?\n\}\n/)[0] + '; return XMBW_SIM;')();
const minutes = +(process.argv[2] || 10), seed = +(process.argv[3] || 1);
const M = XMBW_SIM(), N = M.N, sim = M.createSim(seed, true); // fresh: the flat start, no stored state
const pos = M.tunables ? null : null;
const d = sim.debug.pos, v = sim.debug.vel;
const P = (i, j) => { const k = (j * N + i) * 3; return [d[k], d[k + 1], d[k + 2]]; };
const len = a => Math.hypot(a[0], a[1], a[2]), sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const med = a => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
console.log('sim s | across path/straight | along path/straight | depth extent | height extent | typical speed');
for (let half = 0; half <= minutes * 2; half++) {
  if (half) for (let s = 0; s < 1800; s++) sim.step();
  const aw = [], al = [];
  for (let i = 0; i < N; i++) { let p = 0; for (let j = 0; j + 1 < N; j++) p += len(sub(P(i, j + 1), P(i, j)));
    aw.push(p / Math.max(1e-9, len(sub(P(i, N - 1), P(i, 0))))); }
  for (let j = 0; j < N; j++) { let p = 0; for (let i = 0; i + 1 < N; i++) p += len(sub(P(i + 1, j), P(i, j)));
    al.push(p / Math.max(1e-9, len(sub(P(N - 1, j), P(0, j))))); }
  let zmin = Infinity, zmax = -Infinity, ymin = Infinity, ymax = -Infinity, sp = [];
  for (let p = 0; p < N * N; p++) {
    zmin = Math.min(zmin, d[p * 3 + 2]); zmax = Math.max(zmax, d[p * 3 + 2]);
    ymin = Math.min(ymin, d[p * 3 + 1]); ymax = Math.max(ymax, d[p * 3 + 1]);
    sp.push(Math.hypot(v[p * 3], v[p * 3 + 1], v[p * 3 + 2]));
  }
  console.log('%s %s %s %s %s %s', String(half * 30).padStart(5), med(aw).toFixed(2).padStart(6), med(al).toFixed(3).padStart(6),
    (zmax - zmin).toFixed(3).padStart(6), (ymax - ymin).toFixed(3).padStart(6), med(sp).toExponential(2));
}
