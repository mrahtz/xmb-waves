// mean height of the deformed net per station along the length (scene units), averaged over 60 s, to find any static slope of the sheet
const src = require('fs').readFileSync(process.env.PAGE || require('path').resolve(__dirname, '../../index.html'), 'utf8');
const code = src.match(/function XMBW_SIM\(\) \{[\s\S]*?\n\}\n/)[0];
const XMBW_SIM = new Function(code + '; return XMBW_SIM;')();
const M = XMBW_SIM(); const sim = M.createSim(5); sim.warm(sim.warmSteps);
const N = 19; const acc = new Float64Array(N); let cnt = 0;
for (let s = 0; s < 3600; s++) { sim.step(); if (s % 30 === 0) { const n = sim.netCur; for (let i = 0; i < N; i++) { let y = 0; for (let j = 0; j < N; j++) y += n[(j * N + i) * 3 + 1]; acc[i] += y / N; } cnt++; } }
const xs = []; const ys = [];
for (let i = 0; i < N; i++) { const n = sim.netCur; xs.push(n[(9 * N + i) * 3].toFixed(1)); ys.push((acc[i] / cnt).toFixed(3)); }
console.log('x (scene):  ' + xs.join(' '));
console.log('mean y:     ' + ys.join(' '));
