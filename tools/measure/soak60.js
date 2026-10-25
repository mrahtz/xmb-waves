// usage: PAGE=page.html node soak60.js -> the net's bounds and largest node speed every 2 minutes over a 60-minute run
const src = require('fs').readFileSync(process.env.PAGE || require('path').resolve(__dirname, '../../index.html'), 'utf8');
const XMBW_SIM = new Function(src.match(/function XMBW_SIM\(\) \{[\s\S]*?\n\}\n/)[0] + '; return XMBW_SIM;')();
const M = XMBW_SIM(); const sim = M.createSim(9); sim.warm(sim.warmSteps);
const p = sim.debug.pos, v = sim.debug.vel; let worst = 0;
for (let s = 1; s <= 216000; s++) { // 60 minutes
  sim.step();
  if (s % 7200 === 0) {
    let ymin = 1e9, ymax = -1e9, zmin = 1e9, zmax = -1e9, vmax = 0, xmin = 1e9;
    for (let i = 0; i < p.length; i += 3) { ymin = Math.min(ymin, p[i+1]); ymax = Math.max(ymax, p[i+1]); zmin = Math.min(zmin, p[i+2]); zmax = Math.max(zmax, p[i+2]); xmin = Math.min(xmin, p[i]); vmax = Math.max(vmax, Math.abs(v[i]), Math.abs(v[i+1]), Math.abs(v[i+2])); }
    console.log(String(s / 60 / 60).padStart(3) + ' min  net y [' + ymin.toFixed(3) + ', ' + ymax.toFixed(3) + ']  z [' + zmin.toFixed(3) + ', ' + zmax.toFixed(3) + ']  x min ' + xmin.toFixed(3) + '  |v|max ' + vmax.toFixed(3) + '  alive ' + sim.debug.alive());
  }
}
