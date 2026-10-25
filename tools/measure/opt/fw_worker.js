// fw_worker.js: persistent candidate evaluator. Reads JSON lines {id, tune:{dotted sim paths}, mood:{camPitch,...}, seeds, stillFrames, motion:{from,count,step}}
// from stdin and writes one JSON line per candidate with the aggregated statistics, stability measures and timing.
// usage: node fw_worker.js PAGE [opts-json]   (PAGE: the build whose code is used; its tunables are the defaults)
'use strict';
const fw = require('./fastwave.js'); const readline = require('readline');
const page = fw.loadPage(process.argv[2]);
const O = Object.assign({ NC: 480, S: 512, T: 128, mNC: 240, mS: 320, mT: 96, preBlur: 1.0, exact: false }, JSON.parse(process.argv[3] || '{}'));
const rasS = new fw.Raster({ W: 1920, H: 1080, NC: O.NC, S: O.S, T: O.T, fadeEnds: page.WAVE.fadeEnds, fadeEdges: page.WAVE.fadeEdges, filterSpread: page.WAVE.filterSpread, tintL: page.WAVE.tintL, tintR: page.WAVE.tintR, preBlur: O.preBlur });
const rasM = new fw.Raster({ W: 960, H: 540, NC: O.mNC, S: O.mS, T: O.mT, fadeEnds: page.WAVE.fadeEnds, fadeEdges: page.WAVE.fadeEdges, filterSpread: page.WAVE.filterSpread, tintL: page.WAVE.tintL, tintR: page.WAVE.tintR, preBlur: O.preBlur });
const STILL_KEYS = ['centre', 'thick', 'thickP10', 'thickP90', 'thickRatio', 'pinch8', 'pinch5', 'peaks12', 'peaks25', 'peaks40', 'face', 'foldface', 'avgface', 'overlap', 'widthLines', 'widthAll', 'bwidth', 'edge', 'partcol', 'partings', 'partLen', 'lines10', 'lines25', 'lineLen', 'outer', 'linepk', 'a40', 'a25', 'fmean', 'dark', 'fmax', 'tilt', 'arch', 'topMin', 'botMax'];
const MOTION_KEYS = ['cspeed', 'cspeedP90', 'drift5', 'shift', 'crossing', 'corr1', 'corr5', 'adjdiff', 'pkspeed', 'pspeed', 'pright', 'npart', 'lifeMed', 'lifeMax', 'nlife'];
function med(a) { return fw.median(a.filter(v => v != null && !Number.isNaN(v))); }
function evaluate(c) {
  const t0 = Date.now();
  const seeds = c.seeds || [11, 12, 13], stillFrames = c.stillFrames || [600, 1500, 2400];
  const mo = c.motion || { from: 600, count: 60, step: 12, fps: 5 };
  const per = {}; for (const k of STILL_KEYS) per[k] = [];
  const motion = {}; for (const k of MOTION_KEYS) motion[k] = [];
  let maxSpeed0 = 0, maxSpeed1 = 0, maxY = 0, maxZoff = 0, bad = 0, light = [];
  for (const seed of seeds) {
    let sim, cam, mood;
    try { ({ sim, cam, mood } = fw.makeSim(page, seed, c.tune || {}, c.mood || {}, 16 / 9, !O.exact)); }
    catch (e) { return { id: c.id, error: e.message }; }
    const shade = fw.makeShade(mood);
    const vel = sim.debug.vel, pos = sim.debug.pos; const NP = 19 * 19;
    const probe = (late) => { // node speeds (scene units/s approx: net units * 10) and height / depth excursions in net units
      let ms = 0, my = 0, mz = 0;
      for (let p = 0; p < NP; p++) { const k = p * 3; const s = vel[k] * vel[k] + vel[k + 1] * vel[k + 1] + vel[k + 2] * vel[k + 2]; if (s > ms) ms = s; const y = Math.abs(pos[k + 1]); if (y > my) my = y; const j = Math.floor(p / 19); const z = Math.abs(pos[k + 2] - j / 18); if (z > mz) mz = z; }
      ms = Math.sqrt(ms); if (late) maxSpeed1 = Math.max(maxSpeed1, ms); else maxSpeed0 = Math.max(maxSpeed0, ms); maxY = Math.max(maxY, my); maxZoff = Math.max(maxZoff, mz);
      if (!Number.isFinite(ms) || !Number.isFinite(my)) bad++;
    };
    let done = 0; const frames = []; const want = new Map();
    for (const f of stillFrames) want.set(f, (want.get(f) || 0) | 1);
    for (let i = 0; i < mo.count; i++) { const f = mo.from + i * mo.step; want.set(f, (want.get(f) || 0) | 2); }
    const last = Math.max(...want.keys());
    for (let f = 1; f <= last; f++) {
      sim.step(); done = f;
      if (f % 60 === 0) probe(f > last / 2);
      const w = want.get(f); if (!w) continue;
      if (w & 1) { const tot = rasS.splat(sim.netCur, cam, shade); light.push(tot); const st = fw.frameStats(rasS); if (st) for (const k of STILL_KEYS) per[k].push(st[k]); else bad++; }
      if (w & 2) { rasM.splat(sim.netCur, cam, shade); frames.push(Float64Array.from(rasM.B)); }
    }
    if (frames.length > 2) { try { const ms = fw.motionStats(frames, mo.fps, rasM); for (const k of MOTION_KEYS) motion[k].push(ms[k]); } catch (e) { bad++; } }
  }
  const out = { id: c.id, n: per.thick.length, ms: Date.now() - t0, maxSpeed0, maxSpeed1, maxY, maxZoff, bad, light: med(light) };
  for (const k of STILL_KEYS) { out[k] = med(per[k]); }
  out.centreMin = Math.min(...per.centre); out.centreMax = Math.max(...per.centre);
  out.thickMin = Math.min(...per.thick); out.thickMax = Math.max(...per.thick);
  for (const k of MOTION_KEYS) out[k] = med(motion[k]);
  return out;
}
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', line => { if (!line.trim()) return; let c; try { c = JSON.parse(line); } catch (e) { process.stdout.write(JSON.stringify({ error: 'bad json' }) + '\n'); return; }
  process.stdout.write(JSON.stringify(evaluate(c)) + '\n'); });
