// usage: node fw_validate.js stills|motion NAME [NAME...]  -> opt/val/NAME.json (seed 5), NAME_s7.json (seed 7, if vNAME/s7 exists), NAME_m.json (motion)
'use strict';
const fw = require('./fastwave.js'); const fs = require('fs'); const path = require('path');
const SP = process.env.MEASURE_WORK || path.resolve(__dirname, '../work'); fs.mkdirSync(`${SP}/opt/val`, { recursive: true }); const mode = process.argv[2];
const PRE = 1.0;
function stills(P, seed, frames, out) {
  if (fs.existsSync(out)) return;
  const t0 = Date.now();
  const { sim, cam, mood } = fw.makeSim(P, seed);
  const ras = new fw.Raster({ W: 1920, H: 1080, NC: 480, S: 512, T: 128, fadeEnds: P.WAVE.fadeEnds, fadeEdges: P.WAVE.fadeEdges, filterSpread: P.WAVE.filterSpread, tintL: P.WAVE.tintL, tintR: P.WAVE.tintR, preBlur: PRE });
  const shade = fw.makeShade(mood); let done = 0; const res = [];
  for (const f of frames) { while (done < f) { sim.step(); done++; } ras.splat(sim.netCur, cam, shade); res.push(Object.assign({ frame: f }, fw.frameStats(ras))); }
  fs.writeFileSync(out, JSON.stringify(res)); console.log(out, Date.now() - t0, 'ms');
}
function motion(P, out) {
  if (fs.existsSync(out)) return;
  const t0 = Date.now();
  const { sim, cam, mood } = fw.makeSim(P, 5, null, null, 960 / 540);
  const ras = new fw.Raster({ W: 960, H: 540, NC: 240, S: 512, T: 128, fadeEnds: P.WAVE.fadeEnds, fadeEdges: P.WAVE.fadeEdges, filterSpread: P.WAVE.filterSpread, tintL: P.WAVE.tintL, tintR: P.WAVE.tintR, preBlur: PRE });
  const shade = fw.makeShade(mood); let done = 0; const frames = [];
  for (let i = 0; i < 300; i++) { const f = 900 + 6 * i; while (done < f) { sim.step(); done++; } ras.splat(sim.netCur, cam, shade); frames.push(Float64Array.from(ras.B)); }
  const st = fw.motionStats(frames, 10, ras);
  fs.writeFileSync(out, JSON.stringify(st)); console.log(out, Date.now() - t0, 'ms');
}
for (const name of process.argv.slice(3)) {
  const page = `${SP}/var_${name}.html`; if (!fs.existsSync(page)) { console.log('no page', name); continue; }
  try {
    const P = fw.loadPage(page);
    if (mode === 'stills') {
      if (process.env.FORCE || fs.existsSync(`${SP}/v${name}/spec46.txt`)) stills(P, 5, [600, 1200, 1800], `${SP}/opt/val/${name}.json`);
      if (process.env.FORCE || fs.existsSync(`${SP}/v${name}/s7/spec46.txt`)) stills(P, 7, [600, 1500, 3000], `${SP}/opt/val/${name}_s7.json`);
    } else if (process.env.FORCE || fs.existsSync(`${SP}/v${name}/spec46m.txt`)) motion(P, `${SP}/opt/val/${name}_m.json`);
  } catch (e) { console.log('FAILED', name, e.message); }
}
