// usage: node fw_frame.js PAGE seed frame[,frame...] [NC S T] [dumpPrefix]  -> spec46/fill statistics of the fast raster, with timings
'use strict';
const fw = require('./fastwave.js'); const fs = require('fs');
const [page, seedS, framesS, NC = 480, S = 512, T = 128, preBlur = 0, fast = 0, dump] = process.argv.slice(2);
const P = fw.loadPage(page);
let t0 = Date.now();
const { sim, cam, mood } = fw.makeSim(P, +seedS, null, null, 16 / 9, +fast > 0);
console.error('warm-up', Date.now() - t0, 'ms');
const ras = new fw.Raster({ W: 1920, H: 1080, NC: +NC, S: +S, T: +T, fadeEnds: P.WAVE.fadeEnds, fadeEdges: P.WAVE.fadeEdges, filterSpread: P.WAVE.filterSpread, tintL: P.WAVE.tintL, tintR: P.WAVE.tintR, preBlur: +preBlur });
const shade = fw.makeShade(mood);
let done = 0; const results = [];
for (const f of framesS.split(',').map(Number)) {
  t0 = Date.now(); while (done < f) { sim.step(); done++; } const tSim = Date.now() - t0;
  t0 = Date.now(); const total = ras.splat(sim.netCur, cam, shade); const tRas = Date.now() - t0;
  t0 = Date.now(); const st = fw.frameStats(ras); const tSt = Date.now() - t0;
  console.error(`frame ${f}: sim ${tSim} ms, raster ${tRas} ms, stats ${tSt} ms, total light ${total.toFixed(1)}, fmax ${st.fmax.toFixed(1)}`);
  results.push(Object.assign({ frame: f }, st));
  if (dump) fs.writeFileSync(`${dump}_${f}.f32`, Buffer.from(new Float32Array(ras.L).buffer));
}
console.log(JSON.stringify(results));
