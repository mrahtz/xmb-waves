// usage: node coursefit.js PAGE eval TARGETS.json [BIAS.json] ['{"LAT.bobAmp":..}']
//        node coursefit.js PAGE fit  TARGETS.json  BIAS.json  TRIES SEED ['{"LAT.clockMax":1800}']
// Spec 4.4b, version 30: the warp's rates and sizes (and the ceiling of the clock they read) are fitted against the
// band's whole course - the same times since the start on the footage and on this build, spread from tens of seconds to
// tens of minutes - rather than by giving each part a free phase to bring single moments into line. This tool is
// phasefit.js widened to the sizes and the rates: it searches over LAT.bobAmp, LAT.bumpAmp, LAT.bobW, LAT.bumpW and the
// five phases, keeping the ordering the spec asks for (the swell fastest, then the twist, then the bob, then the bump),
// and leaves the swell's own rate and wavelength alone, those being pinned by the crest's crossing time.
// The clock's ceiling changes the drive as well as the warp, so it cannot be applied with redeform(): pass it in the
// last argument and run the tool once per value of it.
// Geometry only, as phasefit.js: the band's centre is the middle of the sheet's top and bottom on screen in 48 column
// bins, over the samples whose edge fade is at least 0.5, and BIAS.json's "centre" is added before the comparison.
'use strict';
const fs = require('fs'), path = require('path');
const FW = require(path.join(__dirname, 'opt', 'fastwave.js'));
const [pagePath, mode] = process.argv.slice(2);
const src = fs.readFileSync(pagePath, 'utf8');
const P = FW.loadPage(pagePath);
function num(txt, key) { const m = txt.match(new RegExp('\\b' + key + ': *(-?[0-9.]+(?:e-?[0-9]+)?)')); return m ? +m[1] : undefined; }
function moodOf(name) {
  const t = src.match(new RegExp('\\n  ' + name + ': \\{[\\s\\S]*?\\},\\n'))[0];
  return { envCross: num(t, 'envCross'), latScale: [num(t, 'latX'), num(t, 'latY'), num(t, 'latZ')], camPitch: num(t, 'camPitch'), camLift: num(t, 'camLift') || 0 };
}
const MOODS = { night: moodOf('night'), dawn: moodOf('dawn'), day: moodOf('day'), dusk: moodOf('dusk') };
const fadeFrac = num(src.match(/const WAVE = \{[\s\S]*?\n\};/)[0], 'fade');

function frameCentre(sim, cam) {
  const N = sim.N, net = sim.netCur, vp = cam.vp, out = [0, 0, 0], NB = 48, S = N - 3;
  const top = new Float64Array(NB).fill(Infinity), bot = new Float64Array(NB).fill(-Infinity);
  for (let a = 0; a <= 4 * S; a++) for (let b = 0; b <= 4 * S; b++) {
    const s = a / 4, t = b / 4, fs_ = s / S, ft = t / S;
    if (Math.min(1, fs_ / fadeFrac, (1 - fs_) / fadeFrac, ft / fadeFrac, (1 - ft) / fadeFrac) < 0.5) continue;
    sim.surf(net, s, t, out);
    const w = vp[3] * out[0] + vp[7] * out[1] + vp[11] * out[2] + vp[15]; if (w <= 1e-6) continue;
    const u = ((vp[0] * out[0] + vp[4] * out[1] + vp[8] * out[2] + vp[12]) / w + 1) / 2;
    const v = (1 - (vp[1] * out[0] + vp[5] * out[1] + vp[9] * out[2] + vp[13]) / w) / 2;
    if (u < 0 || u >= 1) continue;
    const k = Math.floor(u * NB); if (v < top[k]) top[k] = v; if (v > bot[k]) bot[k] = v;
  }
  const cs = []; for (let k = 0; k < NB; k++) if (isFinite(top[k])) cs.push((top[k] + bot[k]) / 2);
  return FW.median(cs);
}

// One simulation run per mood for a whole population of warp settings (the warp does not act back on the net, so the
// population is applied to the same net state with redeform()).
function evaluatePop(tunes, base, targets) {
  const res = tunes.map(() => []);
  const byMood = {};
  for (const tg of targets) (byMood[tg.mood] = byMood[tg.mood] || []).push(tg);
  for (const m in byMood) {
    const M = P.XMBW_SIM_FAST(); M.setTunables(base);
    const mood = MOODS[m], cam = P.cameraFor(mood.camPitch, 16 / 9, mood.camLift);
    const sim = M.createSim(1); sim.setMood({ envCross: mood.envCross, latScale: mood.latScale, camFwd: cam.fwd }); sim.warm(sim.warmSteps);
    const want = [];
    for (const tg of byMood[m]) for (const st of tg.stills) want.push([Math.round(60 * (tg.since + st)), tg]);
    want.sort((a, b) => a[0] - b[0]);
    let f = 0; const got = tunes.map(() => new Map());
    for (const [fr, tg] of want) {
      while (f < fr) { sim.step(); f++; }
      tunes.forEach((tu, k) => {
        M.setTunables(tu); sim.redeform();
        const G = got[k]; if (!G.has(tg)) G.set(tg, []); G.get(tg).push(frameCentre(sim, cam));
      });
    }
    tunes.forEach((tu, k) => { for (const tg of byMood[m]) res[k].push({ tg, centre: FW.median(got[k].get(tg)) }); });
  }
  return res;
}

// the parameters searched, with their bounds; the swell's own rate and wavelength are not among them (spec 30)
const PARS = [
  ['LAT.bobAmp', 0.02, 0.25], ['LAT.bumpAmp', 0.02, 0.25],
  ['LAT.bobW', 0.025, 0.07], ['LAT.bumpW', 0.005, 0.05],
  ['LAT.ph.0', 0, 6.283185], ['LAT.ph.1', 0, 6.283185], ['LAT.ph.2', 0, 6.283185], ['LAT.ph.3', 0, 6.283185], ['LAT.ph.4', 0, 6.283185],
];
const twistW = num(src.match(/const LAT = \{[\s\S]*?\n  \};/)[0], 'twistW');
// A slow part's contribution to how fast the band moves is its amplitude times its rate, and the band's centre speed is
// already where the footage puts it, so the search is kept to candidates whose slow parts are no quicker than the build's
// (SPEEDCAP times its amplitude x rate). Without this the fit buys the course's reach with a bob twice as large and
// half as slow again, which trebles its speed: the band then swings out of the top of the frame and every speed measure
// in the battery goes high. The bob is also held to a period over a minute and a half, 4.6's "over minutes".
const SPEEDCAP = 1.15, bobV0 = 0.045 * 0.09, bumpV0 = 0.10 * 0.0555;
function legal(v) {        // the ordering of 4.4b: the swell fastest, the twist next, the bob much slower, the bump slower still
  const o = Object.fromEntries(PARS.map((p, i) => [p[0], v[i]]));
  if (o['LAT.bobW'] >= twistW * 0.8) return false;
  if (o['LAT.bumpW'] >= o['LAT.bobW'] * 0.8) return false;
  if (o['LAT.bobAmp'] * o['LAT.bobW'] > SPEEDCAP * bobV0) return false;
  if (o['LAT.bumpAmp'] * o['LAT.bumpW'] > SPEEDCAP * bumpV0) return false;
  for (let i = 0; i < PARS.length; i++) if (v[i] < PARS[i][1] || v[i] > PARS[i][2]) return false;
  return true;
}
const tuneOf = v => Object.fromEntries(PARS.map((p, i) => [p[0], v[i]]));
const current = () => PARS.map(p => { const [g, k, i] = p[0].split('.'); const o = P.XMBW_SIM_FAST().tunables[g][k]; return i === undefined ? o : o[+i]; });

const targets = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
const bias = process.argv[5] && process.argv[5] !== '-' ? JSON.parse(fs.readFileSync(process.argv[5], 'utf8')) : { centre: 0 };

if (mode === 'eval') {
  const extra = process.argv[6] ? JSON.parse(process.argv[6]) : {};
  const rs = evaluatePop([extra], extra, targets)[0];
  let s = 0, n = 0, lo = 1, hi = 0;
  for (const r of rs) {
    const c = r.centre + (bias.centre || 0);
    lo = Math.min(lo, c); hi = Math.max(hi, c);
    console.log(JSON.stringify({ mood: r.tg.mood, since: r.tg.since, centre: +c.toFixed(4), target: r.tg.centre }));
    if (r.tg.centre != null) { s += (c - r.tg.centre) ** 2; n++; }
  }
  if (n) console.log('rms %s H over %d targets; course %s to %s H', Math.sqrt(s / n).toFixed(4), n, lo.toFixed(3), hi.toFixed(3));
} else if (mode === 'fit') {
  const tries = +process.argv[6] || 120, seed = +process.argv[7] || 1;
  const extra = process.argv[8] ? JSON.parse(process.argv[8]) : {};
  let s = seed >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const costs = vs => evaluatePop(vs.map(v => Object.assign({}, extra, tuneOf(v))), extra, targets).map(rs => {
    let c = 0; for (const r of rs) { const d = (r.centre + (bias.centre || 0) - r.tg.centre) / 0.02; c += (r.tg.w || 1) * d * d; }
    return c / rs.length;
  });
  // one evaluatePop pass runs the simulation once for the whole population, so the search is population-based:
  // a wide random draw, then rounds of narrowing Gaussian steps about the best
  const pop = [current()];
  while (pop.length < tries) { const v = PARS.map(p => p[1] + (p[2] - p[1]) * rnd()); if (legal(v)) pop.push(v); }
  const c0 = costs(pop); let bi = 0; c0.forEach((c, i) => { if (c < c0[bi]) bi = i; });
  let best = pop[bi], bc = c0[bi];
  console.error('random pass: best cost %s (this build %s)', bc.toFixed(2), c0[0].toFixed(2));
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-12))) * Math.cos(6.283185307 * rnd());
  for (let round = 0, sig = 0.25; round < 5; round++, sig /= 2) {
    const cand = [best];
    while (cand.length < tries) { const v = best.map((x, i) => x + sig * (PARS[i][2] - PARS[i][1]) * gauss()); if (legal(v)) cand.push(v); }
    const cc = costs(cand); let k = 0; cc.forEach((c, i) => { if (c < cc[k]) k = i; });
    if (cc[k] < bc) { bc = cc[k]; best = cand[k]; }
    console.error('round %d (sigma %s): cost %s', round + 1, sig.toFixed(3), bc.toFixed(2));
  }
  const out = tuneOf(best.map(v => +v.toFixed(5)));
  console.log(JSON.stringify({ cost: +bc.toFixed(3), rms: +(0.02 * Math.sqrt(bc)).toFixed(4), extra, pars: out }));
}
