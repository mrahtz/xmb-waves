// usage: node topreach.js PAGE [MOOD] -> spec 26 (4.1, "how far it reaches"): how close to the top row of the frame the
// sheet's surface itself comes. At many times since the start (tens of seconds to tens of minutes) the whole surface is
// projected through the page's camera and the highest point of it that lies within the frame's width is reported, in
// screen heights from the top (0 = the top row). Only samples whose edge fade is above 0.02 count, so the faint far face
// counts as well as the band. Light can only reach the topmost rows where the surface does, so a run whose smallest value
// stays well below the top rows cannot show a pale wash there.
'use strict';
const path = require('path'), fs = require('fs');
const FW = require(path.join(__dirname, 'opt', 'fastwave.js'));
const pagePath = process.argv[2] || path.resolve(__dirname, '../../index.html');
const moodName = process.argv[3] || 'day';
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
function top() {
  const N = sim.N, net = sim.netCur, vp = cam.vp, out = [0, 0, 0], S = N - 3;
  let best = Infinity;
  for (let a = 0; a <= 8 * S; a++) for (let b = 0; b <= 8 * S; b++) {
    const s = a / 8, t = b / 8, fs_ = s / S, ft = t / S;
    if (Math.min(1, fs_ / fadeFrac, (1 - fs_) / fadeFrac, ft / fadeFrac, (1 - ft) / fadeFrac) < 0.02) continue;
    sim.surf(net, s, t, out);
    const cw = vp[3] * out[0] + vp[7] * out[1] + vp[11] * out[2] + vp[15]; if (cw <= 1e-6) continue;
    const sx = (vp[0] * out[0] + vp[4] * out[1] + vp[8] * out[2] + vp[12]) / cw;
    const sy = (vp[1] * out[0] + vp[5] * out[1] + vp[9] * out[2] + vp[13]) / cw;
    const u = (sx + 1) / 2, v = (1 - sy) / 2; if (u < 0 || u >= 1) continue;
    if (v < best) best = v;
  }
  return best;
}
const times = [];
for (let t = 30; t <= 300; t += 10) times.push(t);
for (let t = 320; t <= 1800; t += 20) times.push(t);
let f = 0; const tops = [];
for (const t of times) {
  const fr = Math.round(60 * t); while (f < fr) { sim.step(); f++; }
  const v = top(); tops.push(v);
}
const srt = tops.slice().sort((a, b) => a - b);
console.log('%s, %d moments from %d to %d s after the start: the sheet\'s highest point on screen (0 = top row) is at %s at its highest, %s (p10) and %s (median); it is above 0.10 H in %s of them and above 0.05 H in %s',
  moodName, times.length, times[0], times[times.length - 1], srt[0].toFixed(3), FW.pct(srt, 10).toFixed(3), FW.pct(srt, 50).toFixed(3),
  tops.filter(v => v < 0.10).length + '/' + tops.length, tops.filter(v => v < 0.05).length + '/' + tops.length);
