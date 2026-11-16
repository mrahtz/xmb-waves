// usage: node slowparts.js PAGE [MOOD] [MINUTES] -> spec 4.4b (version 26, "what their sizes settle"): how much of the
// band's slow wandering each slow part of the warp carries. The band's geometric centre is taken every 10 s over the run
// (the same projection phasefit.js uses), first with the whole warp and then with one part's amplitude zeroed; the
// difference is what that part moves the band by (RMS and maximum, in screen heights). The warp does not act back on the
// net, so all the settings are read off one and the same run with sim.redeform().
'use strict';
const path = require('path');
const FW = require(path.join(__dirname, 'opt', 'fastwave.js'));
const fs = require('fs');
const pagePath = process.argv[2] || path.resolve(__dirname, '../../index.html');
const moodName = process.argv[3] || 'day', minutes = +(process.argv[4] || 10);
const src = fs.readFileSync(pagePath, 'utf8');
const P = FW.loadPage(pagePath);
const num = (txt, key) => { const m = txt.match(new RegExp('\\b' + key + ': *(-?[0-9.]+(?:e-?[0-9]+)?)')); return m ? +m[1] : undefined; };
const moodTxt = src.match(new RegExp('\\n  ' + moodName + ': \\{[\\s\\S]*?\\},\\n'))[0];
const mood = { envCross: num(moodTxt, 'envCross'), latScale: [num(moodTxt, 'latX'), num(moodTxt, 'latY'), num(moodTxt, 'latZ')],
  camPitch: num(moodTxt, 'camPitch'), camLift: num(moodTxt, 'camLift') || 0 };
const fadeFrac = num(src.match(/const WAVE = \{[\s\S]*?\n\};/)[0], 'fade');
const cam = P.cameraFor(mood.camPitch, 16 / 9, mood.camLift);
const M = P.XMBW_SIM_FAST();
const sim = M.createSim(1); sim.setMood({ envCross: mood.envCross, latScale: mood.latScale, camFwd: cam.fwd }); sim.warm(sim.warmSteps);
function centre() { // median over 48 column bins of the middle between the sheet's top and bottom on screen
  const N = sim.N, net = sim.netCur, vp = cam.vp, out = [0, 0, 0], NB = 48, S = N - 3;
  const top = new Float64Array(NB).fill(Infinity), bot = new Float64Array(NB).fill(-Infinity);
  for (let a = 0; a <= 4 * S; a++) for (let b = 0; b <= 4 * S; b++) {
    const s = a / 4, t = b / 4, fs_ = s / S, ft = t / S;
    if (Math.min(1, fs_ / fadeFrac, (1 - fs_) / fadeFrac, ft / fadeFrac, (1 - ft) / fadeFrac) < 0.5) continue;
    sim.surf(net, s, t, out);
    const cw = vp[3] * out[0] + vp[7] * out[1] + vp[11] * out[2] + vp[15]; if (cw <= 1e-6) continue;
    const sx = (vp[0] * out[0] + vp[4] * out[1] + vp[8] * out[2] + vp[12]) / cw;
    const sy = (vp[1] * out[0] + vp[5] * out[1] + vp[9] * out[2] + vp[13]) / cw;
    const u = (sx + 1) / 2, v = (1 - sy) / 2; if (u < 0 || u >= 1) continue;
    const k = Math.floor(u * NB); if (v < top[k]) top[k] = v; if (v > bot[k]) bot[k] = v;
  }
  const cs = []; for (let k = 0; k < NB; k++) if (isFinite(top[k])) cs.push((top[k] + bot[k]) / 2);
  return FW.median(cs);
}
const parts = { swell: { 'LAT.rollAmp': 0 }, bump: { 'LAT.bumpAmp': 0 }, bob: { 'LAT.bobAmp': 0 }, twist: { 'LAT.twistAmp': 0 } };
const names = Object.keys(parts), base = {};
for (const n of names) for (const k in parts[n]) base[k] = M.tunables.LAT[k.split('.')[1]];
const d = {}; for (const n of names) d[n] = [];
const all = [];
for (let s = 0; s <= minutes * 60; s += 10) {
  for (let k = 0; k < (s ? 600 : 0); k++) sim.step();
  M.setTunables(base); sim.redeform(); const c0 = centre(); all.push(c0);
  for (const n of names) { M.setTunables({ ...base, ...parts[n] }); sim.redeform(); d[n].push(centre() - c0); }
}
const rms = a => Math.sqrt(a.reduce((p, x) => p + x * x, 0) / a.length);
const srt = all.slice().sort((a, b) => a - b);
console.log('%s, %d min: the band\'s centre spans %s H (p10-p90 %s), and each part of the warp moves it by (H):',
  moodName, minutes, (Math.max(...all) - Math.min(...all)).toFixed(3), (FW.pct(srt, 90) - FW.pct(srt, 10)).toFixed(3));
for (const n of names) console.log('  %s: rms %s, max %s', n.padEnd(6), rms(d[n]).toFixed(4), Math.max(...d[n].map(Math.abs)).toFixed(4));
