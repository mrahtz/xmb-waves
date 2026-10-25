// usage: node soak.js PAGE seed minutes -> bounds of the net over a long run (fast sim): max node speed, |y|, depth offset, free-end x, per minute
'use strict';
const fw = require('./fastwave.js');
const P = fw.loadPage(process.argv[2]); const seed = +process.argv[3], mins = +process.argv[4];
const { sim } = fw.makeSim(P, seed, {}, {}, 16 / 9, true);
const vel = sim.debug.vel, pos = sim.debug.pos; const NP = 361;
for (let m = 1; m <= mins; m++) {
  let ms = 0, my = 0, mz = 0, xend = 0, xmin = 1e9;
  for (let s = 0; s < 3600; s++) {
    sim.step();
    if (s % 30 === 0) for (let p = 0; p < NP; p++) { const k = p * 3; const v2 = vel[k] ** 2 + vel[k + 1] ** 2 + vel[k + 2] ** 2; if (v2 > ms) ms = v2; const y = Math.abs(pos[k + 1]); if (y > my) my = y; const j = Math.floor(p / 19), i = p % 19; const z = Math.abs(pos[k + 2] - j / 18); if (z > mz) mz = z; if (i === 18) { if (pos[k] > xend) xend = pos[k]; if (pos[k] < xmin) xmin = pos[k]; } }
  }
  console.log(`minute ${m}: max speed ${Math.sqrt(ms).toFixed(3)} net/s, max |y| ${my.toFixed(3)}, max depth offset ${mz.toFixed(3)}, free end x ${xmin.toFixed(3)}-${xend.toFixed(3)}`);
}
