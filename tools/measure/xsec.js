// cross-section of the sheet across its width at three stations along the length, at t = 15 s: (z, y) in scene units, plus the local tilt in degrees
const src = require('fs').readFileSync(process.env.PAGE || require('path').resolve(__dirname, '../../index.html'), 'utf8');
const code = src.match(/function XMBW_SIM\(\) \{[\s\S]*?\n\}\n/)[0];
const XMBW_SIM = new Function(code + '; return XMBW_SIM;')();
const M = XMBW_SIM(); const sim = M.createSim(5); sim.warm(sim.warmSteps);
for (let s = 0; s < 900; s++) sim.step();
const N = 19, n = sim.netCur;
for (const i of [3, 9, 15]) {
  const pts = []; for (let j = 0; j < N; j++) { const k = (j * N + i) * 3; pts.push([n[k + 2], n[k + 1]]); }
  const tilts = []; for (let j = 1; j < N; j++) tilts.push(Math.atan2(pts[j][1] - pts[j - 1][1], pts[j][0] - pts[j - 1][0]) * 180 / Math.PI);
  console.log('station i=' + i + '  y across (scene units): ' + pts.map(p => p[1].toFixed(2)).join(' '));
  console.log('             tilt between rows (deg): ' + tilts.map(t => t.toFixed(0)).join(' '));
}
// roughness: std of the change of tilt between neighbouring row pairs, averaged over all stations
let acc = 0, cnt = 0;
for (let i = 0; i < N; i++) { const t = []; for (let j = 1; j < N; j++) { const a = (j * N + i) * 3, b = ((j - 1) * N + i) * 3; t.push(Math.atan2(n[a + 1] - n[b + 1], n[a + 2] - n[b + 2])); }
  for (let j = 1; j < t.length; j++) { let d = t[j] - t[j - 1]; acc += d * d; cnt++; } }
console.log('roughness (rms tilt change between neighbouring row pairs, deg): ' + (Math.sqrt(acc / cnt) * 180 / Math.PI).toFixed(1));
