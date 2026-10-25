// ---------------------------------------------------------------------------
// Deterministic score mode
// ---------------------------------------------------------------------------
function parseLayers(s) {
  const all = { bg: true, wave: true, glare: true, sparkles: true, dither: true };
  if (s == null || s === '') return all;
  const L = { bg: false, wave: false, glare: false, sparkles: false, dither: false };
  for (const k of String(s).split(',')) { const t = k.trim(); if (t in L) L[t] = true; }
  return L;
}
const urlOpts = { time: params.get('time'), theme: params.get('theme'), seed: params.get('seed'), frames: params.get('frames'),
  w: params.get('w'), h: params.get('h'), layers: params.get('layers') };
function resolveOpts(opts) {
  const g = k => (opts && opts[k] != null ? opts[k] : urlOpts[k]);
  return {
    timeParts: parseTime(g('time')) || partsOf(new Date()),
    theme: Math.max(0, Math.min(12, parseInt(g('theme') ?? 0, 10) || 0)),
    seed: parseInt(g('seed') ?? 1, 10) || 0,
    frames: Math.max(0, parseInt(g('frames') ?? 0, 10) || 0),
    w: Math.max(1, parseInt(g('w') ?? 1920, 10) || 1920),
    h: Math.max(1, parseInt(g('h') ?? 1080, 10) || 1080),
    layers: parseLayers(g('layers')),
  };
}
function simMoodParams(mood, cam) { return { envCross: mood.envCross, latScale: [mood.latX, mood.latY, mood.latZ], camFwd: cam.fwd }; }
const sparkPack = new Float32Array(4096 * SPARK_STRIDE);
let scoreSim = null; // { key, sim, frames }
function render(opts) {
  const o = resolveOpts(opts);
  const scene = sceneParams(o.timeParts, o.theme);
  const cam = cameraFor(scene.mood.camPitch, o.w / o.h);
  const key = [o.seed, o.theme, o.timeParts.join(','), o.w / o.h].join('|');
  if (!scoreSim || scoreSim.key !== key || scoreSim.frames > o.frames) {
    const sim = SIMM.createSim(o.seed);
    sim.setMood(simMoodParams(scene.mood, cam));
    sim.warm(sim.warmSteps);
    scoreSim = { key, sim, frames: 0 };
  }
  while (scoreSim.frames < o.frames) { scoreSim.sim.step(); scoreSim.frames++; }
  const sim = scoreSim.sim;
  const n = sim.packSparks(sparkPack);
  ensureTargets(o.w, o.h, o.w, o.h, 2);
  RT.bgFresh = true;
  renderFrame({ scene, cam, net0: sim.netCur, net1: sim.netCur, alpha: 1, sparks: sparkPack, nSparks: n,
    layers: o.layers, frameNo: o.frames, ease: 1 }, RT.out);
  const px = new Uint8Array(o.w * o.h * 4);
  bindTarget(RT.out); gl.readPixels(0, 0, o.w, o.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const data = new Uint8ClampedArray(o.w * o.h * 4), row = o.w * 4;
  for (let y = 0; y < o.h; y++) data.set(px.subarray((o.h - 1 - y) * row, (o.h - y) * row), y * row);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  bindTarget(null);
  return { width: o.w, height: o.h, data };
}

window.XMBW = { ready: Promise.resolve(), render, _internals: { PALETTES, MOODS, WAVE, SPARKR, CAMERA, SIMM, moodAt, nightWeight, sceneParams } };
if (SCORE) { canvas.style.display = 'none'; return; }

