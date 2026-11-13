// usage: node phasefit.js PAGE eval '{"LAT.ph.0":..,...}'            -> the band's geometric centre and tilt at the sample moments
//        node phasefit.js PAGE fit N SEED [TARGETS.json] [BIAS.json]  -> random search plus refinement over the warp's five phases
// The warp's parts read one fixed clock (spec 4.4a/b, version 18), so the band's height at a given time since the start is fixed.
// This tool fits the phases the four parts have at clock 0 (LAT.ph) so that the band's height and tilt at the moments the
// footage shows match. It needs no rendering: it runs the page's own simulation (without the sparkles, whose draws no longer
// touch the net) and projects the B-spline surface through the page's camera. Per frame, in 48 column bins over the screen's
// width, the sheet's top and bottom on screen are taken over the surface samples whose edge fade is at least 0.5; the centre
// is their middle (fraction of the height from the top), and the tilt the slope of a line fitted to the centres (H per width).
// The geometric centre differs from the lit band's centre measured on renders by a near-constant amount: BIAS.json
// ({"centre": c, "tilt": t}) is added before the comparison (fitted by comparing this tool's output with full renders).
// TARGETS.json: [{"mood": "day"|"night", "since": s, "stills": [1, 5, 9], "centre": c, "tilt": t, "w": weight}, ...]; a target may
// also give "speed" (H/s) and "seconds": the centre's speed, per column bin over 1 s steps from since to since + seconds, median of
// the absolute changes, times BIAS.json's "speedScale" (the ratio of the rendered band's centre speed to this geometric one).
'use strict';
const fs = require('fs'), path = require('path');
const FW = require(path.join(__dirname, 'opt', 'fastwave.js'));
const [pagePath, mode] = process.argv.slice(2);
const src = fs.readFileSync(pagePath, 'utf8');
const P = FW.loadPage(pagePath);
function num(txt, key) { const m = txt.match(new RegExp('\\b' + key + ': *(-?[0-9.]+(?:e-?[0-9]+)?)')); return m ? +m[1] : undefined; }
function moodOf(name) {
  const t = src.match(new RegExp('\\n  ' + name + ': \\{[\\s\\S]*?\\},\\n'))[0];
  return { envCross: num(t, 'envCross'), latScale: [num(t, 'latX'), num(t, 'latY'), num(t, 'latZ')], camPitch: num(t, 'camPitch') };
}
const MOODS = { day: moodOf('day'), night: moodOf('night') };
const fadeFrac = num(src.match(/const WAVE = \{[\s\S]*?\n\};/)[0], 'fade');

function frameGeom(sim, cam) {
  const N = sim.N, net = sim.netCur, vp = cam.vp, out = [0, 0, 0], NB = 48;
  const top = new Float64Array(NB).fill(Infinity), bot = new Float64Array(NB).fill(-Infinity);
  const S = N - 3;
  for (let a = 0; a <= 4 * S; a++) for (let b = 0; b <= 4 * S; b++) {
    const s = a / 4, t = b / 4, fs_ = s / S, ft = t / S;
    const fade = Math.min(1, fs_ / fadeFrac, (1 - fs_) / fadeFrac, ft / fadeFrac, (1 - ft) / fadeFrac);
    if (fade < 0.5) continue;
    sim.surf(net, s, t, out);
    const x = out[0], y = out[1], z = out[2];
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (cw <= 1e-6) continue;
    const sx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / cw, sy = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / cw;
    const u = (sx + 1) / 2, v = (1 - sy) / 2;
    if (u < 0 || u >= 1) continue;
    const k = Math.floor(u * NB);
    if (v < top[k]) top[k] = v; if (v > bot[k]) bot[k] = v;
  }
  const xs = [], cs = [];
  for (let k = 0; k < NB; k++) if (isFinite(top[k])) { xs.push((k + 0.5) / NB); cs.push((top[k] + bot[k]) / 2); }
  const n = xs.length; let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += xs[i]; my += cs[i]; } mx /= n; my /= n;
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (cs[i] - my); sxx += (xs[i] - mx) ** 2; }
  const bins = new Float64Array(NB).fill(NaN); for (let k = 0; k < NB; k++) if (isFinite(top[k])) bins[k] = (top[k] + bot[k]) / 2;
  return { centre: FW.median(cs), tilt: sxx > 0 ? sxy / sxx : NaN, bins };
}

// One run of the simulation per mood for a whole population of warp settings (the warp does not act back on the net, so each
// setting is applied to the same net state with sim.redeform()); returns, per setting, the per-target medians over its stills.
function evaluatePop(tunes, base, targets) {
  const res = tunes.map(() => []);
  const byMood = {};
  for (const tg of targets) (byMood[tg.mood] = byMood[tg.mood] || []).push(tg);
  for (const m in byMood) {
    const M = P.XMBW_SIM_FAST(); M.setTunables(base);
    const mood = MOODS[m], cam = P.cameraFor(mood.camPitch, 16 / 9);
    const sim = M.createSim(1); sim.setMood({ envCross: mood.envCross, latScale: mood.latScale, camFwd: cam.fwd }); sim.warm(sim.warmSteps);
    const want = [];
    for (const tg of byMood[m]) {
      for (const st of tg.stills) want.push([Math.round(60 * (tg.since + st)), tg]);
      if (tg.speed != null) for (let st = 0; st <= tg.seconds; st++) want.push([Math.round(60 * (tg.since + st)), tg, 'speed']);
    }
    want.sort((a, b) => a[0] - b[0]);
    let f = 0; const got = tunes.map(() => new Map()), spd = tunes.map(() => new Map());
    for (const [fr, tg, kind] of want) {
      while (f < fr) { sim.step(); f++; }
      tunes.forEach((tu, k) => {
        M.setTunables(tu); sim.redeform();
        const g = frameGeom(sim, cam), G = kind ? spd[k] : got[k]; if (!G.has(tg)) G.set(tg, []); G.get(tg).push(g);
      });
    }
    tunes.forEach((tu, k) => {
      for (const tg of byMood[m]) {
        const gs = got[k].get(tg);
        // centre speed: per column bin, the centre's change over each 1 s step, median of the absolute values (H/s)
        let speed = NaN; const ss = spd[k].get(tg);
        if (ss) { const d = []; for (let i = 1; i < ss.length; i++) for (let b = 0; b < ss[i].bins.length; b++) { const v = Math.abs(ss[i].bins[b] - ss[i - 1].bins[b]); if (!Number.isNaN(v)) d.push(v); } speed = FW.median(d); }
        res[k].push({ tg, centre: FW.median(gs.map(g => g.centre)), tilt: FW.median(gs.map(g => g.tilt)), speed });
      }
    });
  }
  return res;
}

if (mode === 'eval') {
  const tune = JSON.parse(process.argv[4] || '{}');
  const targets = [];
  for (const m of ['day', 'night']) for (let s = 0; s <= 600; s += 20) targets.push({ mood: m, since: s, stills: [1, 5, 9] });
  if (process.argv[5]) { targets.length = 0; for (const t of JSON.parse(fs.readFileSync(process.argv[5], 'utf8'))) targets.push(t); }
  if (process.argv[6] === 'speed') for (const t of targets) { t.speed = 0; t.seconds = t.seconds || 9; }
  for (const r of evaluatePop([tune], tune, targets)[0]) console.log(JSON.stringify({ mood: r.tg.mood, since: r.tg.since, centre: +r.centre.toFixed(4), tilt: +r.tilt.toFixed(4), speed: +(+r.speed).toFixed(5) }));
} else if (mode === 'fit') {
  const n = +process.argv[4] || 200, seed = +process.argv[5] || 1;
  const targets = JSON.parse(fs.readFileSync(process.argv[6], 'utf8'));
  const bias = process.argv[7] ? JSON.parse(fs.readFileSync(process.argv[7], 'utf8')) : { centre: 0, tilt: 0 };
  const extra = process.argv[8] ? JSON.parse(process.argv[8]) : {};
  let s = seed >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const tuneOf = ph => { const t = {}; ph.forEach((v, i) => { t['LAT.ph.' + i] = v; }); return t; };
  const costs = phs => evaluatePop(phs.map(tuneOf), extra, targets).map(rs => {
    let c = 0;
    for (const r of rs) {
      const dc = (r.centre + bias.centre - r.tg.centre) / 0.02, dt = r.tg.tilt == null ? 0 : (r.tilt + bias.tilt - r.tg.tilt) / 0.05;
      const ds = r.tg.speed == null ? 0 : (r.speed * (bias.speedScale || 1) - r.tg.speed) / 0.004;
      c += (r.tg.w || 1) * (dc * dc + dt * dt + ds * ds);
    }
    return c;
  });
  const pop = []; for (let i = 0; i < n; i++) pop.push([0, 1, 2, 3, 4].map(() => 6.283185 * rnd()));
  const c0 = costs(pop); let bi = 0; c0.forEach((c, i) => { if (c < c0[bi]) bi = i; });
  let best = pop[bi], bc = c0[bi];
  let step = 0.6;
  for (let it = 0; it < 40 && step > 0.02; it++) {
    const cand = [];
    for (let i = 0; i < 5; i++) for (const d of [-1, 1]) { const ph = best.slice(); ph[i] += d * step; cand.push(ph); }
    const cc = costs(cand); let k = -1; cc.forEach((c, i) => { if (c < bc) { bc = c; k = i; } });
    if (k >= 0) best = cand[k]; else step /= 2;
  }
  best = best.map(v => +(((v % 6.283185) + 6.283185) % 6.283185).toFixed(4));
  console.log(JSON.stringify({ cost: bc, ph: best }));
}
