// ---------------------------------------------------------------------------
// Normal mode: settings, the settings menu, worker, draw loop
// ---------------------------------------------------------------------------
const STORE_KEY = 'xmb-waves-settings-v2';
const SCALES = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];           // render scales offered; a URL scale= snaps to the nearest
const CLOCK_SPEEDS = [[0, 'stopped'], [1, 'real time'], [60, '1 min/s'], [600, '10 min/s'], [3600, '1 h/s'], [21600, '6 h/s']];
const WAVE_SPEEDS = [[0, 'frozen'], [0.25, '0.25x'], [0.5, '0.5x'], [1, '1x'], [2, '2x'], [4, '4x']];
const THEME_NAMES = ['silver', 'yellow', 'light green', 'pink', 'green', 'lavender', 'teal', 'blue', 'purple', 'gold', 'brown', 'red'];
const PASSES = ['background', 'wave', 'glare', 'composite', 'sparkles', 'glints']; // in drawing order; "stop after pass" counts from 1
const LAYER_NAMES = [['bg', 'background gradient'], ['wave', 'wave'], ['glare', 'glare'], ['sparkles', 'sparkles'],
  ['glints', 'sparkle glints'], ['dither', 'dither'], ['bgEase', 'background easing (frame to frame)']];
const INSPECT_BUFFERS = [['output', 'the picture'], ['bg', 'background gradient'], ['wave', 'wave buffer (intensity)'],
  ['glareA', 'glare: bright pass / downsampled'], ['glareC', 'glare: blurred'], ['glareB', 'glare: combined'], ['net', 'control net texture']];
const DEFAULTS = {
  shape: '16:9', scale: 1, fit: 'fill', pixelated: false,                          // Picture
  fps: false, stats: false, fpsCap: 60, waveQuality: 'auto',                       // Performance
  useFixed: false, fixedTime: '', speed: 1, waveSpeed: 1, theme: 0, mood: 'auto',  // Time and theme
  layers: { bg: true, wave: true, glare: true, sparkles: true, glints: true, dither: true, bgEase: true },
  wire: { mesh: false, grid: false, quads: false, meshStride: 4 },
  inspect: { buffer: 'output', level: 0, gain: 1, autoGain: true, stopAfter: 0 },
  params: {},                                                                       // overridden tunables, by id
  open: { picture: true, performance: true, time: true, layers: true, wire: false, inspect: false, params: false },
};

// Settings are read defensively: a stored value is taken only where it has the
// type of its default, every choice is snapped to what the menu offers, and
// storage that is missing, disabled or full is simply ignored.
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { s = {}; }
  if (!s || typeof s !== 'object') s = {};
  const merge = (def, got) => {
    const o = {};
    for (const k in def) {
      const d = def[k], g = got && typeof got === 'object' ? got[k] : undefined;
      if (d && typeof d === 'object') o[k] = merge(d, g);
      else o[k] = typeof g === typeof d && (typeof g !== 'number' || isFinite(g)) ? g : d;
    }
    return o;
  };
  const o = merge(DEFAULTS, s);
  if (s.params && typeof s.params === 'object') for (const k in s.params) if (typeof s.params[k] === 'number' && isFinite(s.params[k])) o.params[k] = s.params[k];
  // URL parameters override stored settings
  if (params.has('theme')) o.theme = parseInt(params.get('theme'), 10) || 0;
  if (params.has('time')) { o.useFixed = true; o.fixedTime = params.get('time'); }
  if (params.has('speed')) { const v = parseFloat(params.get('speed')); o.speed = isFinite(v) ? v : 1; }
  if (params.has('scale')) o.scale = parseFloat(params.get('scale')) || 1;
  if (params.has('fps')) o.fps = params.get('fps') === '1';
  if (params.has('layers')) { const L = parseLayers(params.get('layers')); o.layers = { ...L, glints: L.sparkles, bgEase: true }; }
  return validate(o);
}
function validate(o) { // keep every setting within what the menu offers
  const snap = (v, list) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  if (!['16:9', '4:3'].includes(o.shape)) o.shape = '16:9';
  o.scale = snap(o.scale, SCALES);
  if (!['fill', 'whole', 'stretch', 'one'].includes(o.fit)) o.fit = 'fill';
  if (![0, 30, 60].includes(o.fpsCap)) o.fpsCap = 60;
  if (!['auto', 'full'].includes(o.waveQuality)) o.waveQuality = 'auto';
  o.speed = snap(o.speed, CLOCK_SPEEDS.map(x => x[0]));
  o.waveSpeed = snap(o.waveSpeed, WAVE_SPEEDS.map(x => x[0]));
  o.theme = Math.max(0, Math.min(12, Math.round(o.theme) || 0));
  if (o.mood !== 'auto' && !(o.mood in MOODS)) o.mood = 'auto';
  o.wire.meshStride = snap(o.wire.meshStride, [1, 4, 16]);
  if (!INSPECT_BUFFERS.some(b => b[0] === o.inspect.buffer)) o.inspect.buffer = 'output';
  o.inspect.level = Math.max(0, Math.round(o.inspect.level) || 0);
  o.inspect.gain = Math.max(1 / 64, Math.min(4096, o.inspect.gain));
  o.inspect.stopAfter = Math.max(0, Math.min(PASSES.length, Math.round(o.inspect.stopAfter) || 0));
  return o;
}
let saveTimer = 0;
function saveSettings() { // written a moment later, so a slider drag does not write on every move
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable or full */ } }, 250);
}
const S = loadSettings();
let paused = params.get('pause') === '1';

// day clock: virtual time = anchor + (now - anchorReal) * speed; it freezes while paused
let clockAnchor = null, clockReal = 0, clockFrozenAt = null;
function resetClock() {
  const fixed = S.useFixed ? parseTime(S.fixedTime) : null;
  clockAnchor = fixed ? new Date(fixed[0], fixed[1] - 1, fixed[2], fixed[3], fixed[4], Math.floor(fixed[5])).getTime() : Date.now();
  clockReal = performance.now(); clockFrozenAt = null;
}
function clockNow(now) {
  if (paused) { if (clockFrozenAt == null) clockFrozenAt = clockAnchor + (now - clockReal) * S.speed; return clockFrozenAt; }
  if (clockFrozenAt != null) { clockAnchor = clockFrozenAt; clockReal = now; clockFrozenAt = null; }
  return clockAnchor + (now - clockReal) * S.speed;
}
function setClock(timeString) { S.useFixed = true; S.fixedTime = timeString; resetClock(); saveSettings(); }
function setClockSpeed(v) { const now = performance.now(); clockAnchor = clockNow(now); clockReal = now; S.speed = v; saveSettings(); }
function toLocalInput(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
resetClock();

// ---- Parameters: the tunables, grouped by part ----
// kind 'live': a value of this file (get/set); 'sim': a value of the simulation
// module, sent to the worker; 'mood': a per-mood value, which follows the mood
// until it is overridden. The defaults are the committed values, read at start-up.
const PARAM_GROUPS = [], PARAM_ITEMS = [];
function group(name, items) { PARAM_GROUPS.push({ name, items }); PARAM_ITEMS.push(...items); }
function live(id, label, get, set, min, max, step) { return { id, kind: 'live', label, get, set, def: get(), min, max, step }; }
function field(name, obj, key, label, min, max, step) { return live(name + '.' + key, label, () => obj[key], v => { obj[key] = v; }, min, max, step); }
function index(name, arr, i, label, min, max, step) { return live(name + '.' + i, label, () => arr[i], v => { arr[i] = v; }, min, max, step); }
function sim(path, label, min, max, step) { let d = SIMM.tunables; for (const k of path.split('.')) d = d[k]; return { id: 'sim.' + path, kind: 'sim', path, label, def: d, min, max, step }; }
function mood(key, label, min, max, step) { return { id: 'mood.' + key, kind: 'mood', key, label, def: null, min, max, step }; }
group('Wave motion', [
  sim('NET.kStruct', 'spring stiffness', 0.02, 2, 0.01), sim('NET.kBend', 'bending stiffness', 0.05, 6, 0.05),
  sim('NET.acrossK', 'across stiffness', 0.05, 2, 0.01), sim('NET.damping', 'damping', 0, 0.02, 0.0001),
  sim('NET.noise', 'random kick', 0, 0.001, 0.00001), sim('NET.push', 'pull on free end', 0, 0.03, 0.0005),
  sim('NET.driveA', 'drive height', 0, 0.2, 0.001), sim('NET.driveW1', 'drive rate 1', 0.05, 1.5, 0.01),
  sim('NET.driveB', 'drive depth', 0, 0.2, 0.001), sim('NET.driveW2', 'drive rate 2', 0.05, 1.5, 0.01),
  sim('NET.drivePhase1', 'phase per row 1', -2, 2, 0.01),
  sim('NET.drivePhase2', 'phase per row 2', -2, 2, 0.01), sim('NET.driveEase', 'drive easing', 0.001, 0.2, 0.001),
  sim('NET.envLow', 'envelope low', 0, 1, 0.01), sim('NET.envWidth', 'envelope width', 0.02, 0.5, 0.01),
  mood('envCross', 'envelope crossover', 0, 1, 0.01),
  sim('LAT.sways.0.0', 'sway 1 amplitude', 0, 0.1, 0.001), sim('LAT.sways.0.2', 'sway 1 rate', -0.5, 0.5, 0.001),
  sim('LAT.sways.1.0', 'sway 2 amplitude', 0, 0.1, 0.001), sim('LAT.sways.1.2', 'sway 2 rate', -0.5, 0.5, 0.001),
  sim('LAT.sways.2.0', 'swell amplitude', 0, 0.1, 0.001), sim('LAT.sways.2.2', 'swell rate', -1, 1, 0.001),
  sim('LAT.bump.amp', 'bump amplitude', 0, 0.1, 0.001), sim('LAT.bump.width', 'bump width', 0.05, 0.5, 0.005),
  sim('LAT.bump.speed', 'bump speed', 0, 0.1, 0.001), sim('LAT.ease', 'warp easing', 0.001, 0.2, 0.001),
  sim('SCENE.len', 'sheet length', 4, 16, 0.1), sim('SCENE.wid', 'sheet width', 1, 8, 0.1),
  sim('SCENE.height', 'height scale', 1, 14, 0.1), sim('SCENE.y0', 'height offset', -2, 2, 0.01),
  sim('SCENE.tilt', 'sheet tilt', -0.3, 0.3, 0.005),
  mood('latX', 'lattice scale x', 0.5, 1.5, 0.01), mood('latY', 'lattice scale y', 0.5, 1.5, 0.01), mood('latZ', 'lattice scale z', 0.5, 1.5, 0.01),
]);
group('Wave look', [
  mood('waveBright', 'brightness', 0, 1.5, 0.01), mood('base', 'sheen level', 0, 1, 0.01), mood('baseC', 'sheen width', 0.05, 1, 0.01),
  mood('baseK', 'sheen exponent', 0.5, 6, 0.05),
  mood('threadAmp', 'thread amplitude', 0, 1, 0.01), field('WAVE', WAVE, 'threads', 'thread periods', 10, 800, 1),
  field('WAVE', WAVE, 'fadeEnds', 'end fade', 0, 0.4, 0.005), field('WAVE', WAVE, 'fadeEdges', 'edge fade', 0, 0.3, 0.005),
  field('WAVE', WAVE, 'minWidth', 'minimum cell width', 0.5, 3, 0.05), field('WAVE', WAVE, 'filterSpread', 'filter spread', 1, 8, 0.1),
  field('WAVE', WAVE, 'samplesAlong', 'samples along', 4, 96, 1), field('WAVE', WAVE, 'samplesAcross', 'samples across', 1, 16, 1),
]);
group('Camera', [
  mood('camPitch', 'pitch', -10, 30, 0.1), field('CAMERA', CAMERA, 'yaw', 'yaw', -60, 60, 0.5),
  field('CAMERA', CAMERA, 'fovY', 'field of view', 5, 60, 0.5), field('CAMERA', CAMERA, 'dist', 'distance', 3, 30, 0.1),
  index('CAMERA.target', CAMERA.target, 0, 'target x', -5, 5, 0.05), index('CAMERA.target', CAMERA.target, 1, 'target y', -3, 3, 0.05),
  index('CAMERA.target', CAMERA.target, 2, 'target z', -5, 5, 0.05),
]);
group('Background', [
  live('BG_HL', 'daytime highlight', () => BG_HL, v => { BG_HL = v; }, 0, 0.5, 0.005),
  live('BG_EASE', 'frame easing', () => BG_EASE, v => { BG_EASE = v; }, 0.005, 1, 0.005),
  live('DITHER', 'dither amplitude', () => DITHER, v => { DITHER = v; }, 0, 3, 0.05),
]);
group('Glare', [
  mood('exposure', 'exposure', 0.2, 3, 0.01), mood('white', 'white point', 0.5, 4, 0.05), mood('glareThr', 'threshold', 0, 1, 0.01),
  mood('glareSigma', 'blur radius', 0.3, 4, 0.05), mood('glareRatio', 'level ratio', 0.3, 1.5, 0.01), mood('glareStrength', 'strength', 0, 3, 0.01),
  live('GLARE_DESAT', 'desaturation', () => GLARE_DESAT, v => { GLARE_DESAT = v; }, 0, 1, 0.01),
]);
group('Sparkles', [
  mood('sparkBright', 'brightness', 0, 2, 0.01), mood('sparkSize', 'size (mood)', 0.2, 3, 0.01), mood('focusFar', 'far focus', 6, 20, 0.1), mood('glint', 'glint', 0, 1, 0.01),
  field('SPARKR', SPARKR, 'size', 'size', 0.5, 8, 0.1), field('SPARKR', SPARKR, 'blur', 'bokeh blur', 0, 12, 0.1),
  field('SPARKR', SPARKR, 'dofPow', 'bokeh dimming', 0.2, 3, 0.05), field('SPARKR', SPARKR, 'focusNear', 'near focus', 3, 15, 0.1),
  field('SPARKR', SPARKR, 'nearSoft', 'near softness', 0.5, 6, 0.1), field('SPARKR', SPARKR, 'farSoft', 'far softness', 0.5, 6, 0.1),
  field('SPARKR', SPARKR, 'bright', 'base brightness', 0, 2, 0.01), field('SPARKR', SPARKR, 'dimPow', 'brightness spread', 0.5, 6, 0.1),
  field('SPARKR', SPARKR, 'iri', 'iridescence', 0, 1, 0.01), field('SPARKR', SPARKR, 'iriExp', 'iridescence exponent', 0.5, 4, 0.05),
  field('SPARKR', SPARKR, 'flare', 'flare', 0, 4, 0.05), field('SPARKR', SPARKR, 'glintSize', 'glint size', 1, 10, 0.1),
  field('SPARKR', SPARKR, 'glintBright', 'glint brightness', 0, 0.5, 0.005),
  sim('SPARK.burstP', 'burst chance', 0, 1, 0.01), sim('SPARK.burstMax', 'burst size', 1, 20, 1),
  sim('SPARK.walkerP', 'walker chance', 0, 0.3, 0.005), sim('SPARK.walkStep', 'walker step', 0.005, 0.2, 0.005),
  sim('SPARK.cone', 'birth cone', 0, 1, 0.01), sim('SPARK.reverseP', 'reversed births', 0, 0.5, 0.01),
  sim('SPARK.speedK', 'speed factor', 0, 1, 0.01), sim('SPARK.speedPow', 'speed exponent', 0.1, 1.5, 0.01), sim('SPARK.speedMin', 'minimum speed', 0, 0.2, 0.005),
  sim('SPARK.rateMean', 'ageing rate', 0.02, 0.5, 0.005), sim('SPARK.rateSpread', 'ageing spread', 0, 1, 0.01),
  sim('SPARK.jitter', 'jitter', 0, 0.2, 0.005), sim('SPARK.gravity', 'gravity', -0.02, 0.02, 0.0005), sim('SPARK.friction', 'friction', 0, 1, 0.01),
  sim('SPARK.spinA', 'spin', 0, 6, 0.05),
]);
let currentMood = null, tunePending = false;
function paramValue(it) { // the value in effect
  if (S.params[it.id] != null) return S.params[it.id];
  if (it.kind === 'mood') return currentMood ? currentMood[it.key] : MOODS.day[it.key];
  return it.def;
}
function setParam(it, v) {
  if (!isFinite(v)) return;
  v = Math.max(it.min, Math.min(it.max, v));
  S.params[it.id] = v;
  if (it.kind === 'live') it.set(v); else if (it.kind === 'sim') tunePending = true;
  saveSettings();
}
function resetParam(it) {
  delete S.params[it.id];
  if (it.kind === 'live') it.set(it.def); else if (it.kind === 'sim') tunePending = true;
  saveSettings();
}
function applyParams() { // the remembered overrides, at start-up; unknown or out-of-range ones are dropped
  const known = new Map(PARAM_ITEMS.map(it => [it.id, it]));
  for (const id in S.params) {
    const it = known.get(id), v = S.params[id];
    if (!it || v < it.min || v > it.max) { delete S.params[id]; continue; }
    if (it.kind === 'live') it.set(v);
  }
}
function simTuneMap() { const m = {}; for (const it of PARAM_ITEMS) if (it.kind === 'sim') m[it.path] = S.params[it.id] != null ? S.params[it.id] : it.def; return m; }
applyParams();

// The scene for this frame: the clock (or a held mood), then the overrides.
function currentScene(now) {
  const tp = partsOf(new Date(clockNow(now)));
  const scene = sceneParams(tp, S.theme);
  if (S.mood !== 'auto' && MOODS[S.mood]) scene.mood = { ...MOODS[S.mood] };
  currentMood = scene.mood;                                                  // what the mood sliders follow
  let copied = false;
  for (const it of PARAM_ITEMS) {
    if (it.kind !== 'mood' || S.params[it.id] == null) continue;
    if (!copied) { scene.mood = { ...scene.mood }; copied = true; }
    scene.mood[it.key] = S.params[it.id];
  }
  return scene;
}

// ---- worker ----
function workerMain(SIMF) {
  const M = SIMF(); let sim = null, running = false, last = 0, acc = 0, speed = 1, stepMs = 0, mood = null, tuning = null; const spare = [];
  const absNow = () => performance.timeOrigin + performance.now();
  function send(alpha) {
    const need = M.N * M.N * 6 + 4096 * M.SPARK_STRIDE;
    let buf = spare.pop(); if (!buf || buf.byteLength < need * 4) buf = new ArrayBuffer(need * 4);
    const f = new Float32Array(buf);
    f.set(sim.netPrev, 0); f.set(sim.netCur, M.N * M.N * 3);
    const n = sim.packSparks(f.subarray(M.N * M.N * 6));
    postMessage({ buf, n, alpha, at: absNow(), stepMs }, [buf]);
  }
  function fresh(seed) { // a new, settled state with the current mood and tuning
    sim = M.createSim(seed); if (mood) sim.setMood(mood); if (tuning) sim.tune(tuning);
    sim.warm(sim.warmSteps); send(1);
  }
  function loop() {
    if (!running) return;
    const now = performance.now();
    acc += Math.min(0.25, (now - last) / 1000) * speed; last = now; // capped: no catch-up after a stall; the wave speed scales it
    let n = 0; const t0 = performance.now();
    while (acc >= M.DT && n < 8) { sim.step(); acc -= M.DT; n++; }
    if (n) { stepMs += ((performance.now() - t0) / n - stepMs) * 0.1; send(acc / M.DT); }
    setTimeout(loop, Math.max(1, Math.min(50, Math.floor((M.DT - acc) / Math.max(speed, 0.05) * 1000)))); // sleep until the next step is due
  }
  onmessage = e => {
    const d = e.data;
    if (d.type === 'init') { mood = d.mood; tuning = d.tune || null; speed = d.speed == null ? 1 : d.speed; fresh(d.seed); }
    else if (d.type === 'restart') fresh(d.seed);
    else if (d.type === 'mood') { mood = d.mood; if (sim) sim.setMood(d.mood); }
    else if (d.type === 'tune') { tuning = d.values; if (sim) sim.tune(d.values); }
    else if (d.type === 'speed') speed = d.k;
    else if (d.type === 'run') { const was = running; running = d.on; if (running && !was) { last = performance.now(); acc = 0; loop(); } }
    else if (d.type === 'step') { if (sim) { sim.step(); send(1); } }
    else if (d.type === 'return') spare.push(d.buf);
  };
}
const workerSrc = `${XMBW_SIM.toString()}\n(${workerMain.toString()})(XMBW_SIM);`;
const worker = new Worker(URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' })));
let latest = null, restartPending = false;
const NET3 = NN * NN * 3;
worker.onmessage = e => {
  if (latest) worker.postMessage({ type: 'return', buf: latest.buf }, [latest.buf]);
  const d = e.data, f = new Float32Array(d.buf);
  latest = { buf: d.buf, net0: f.subarray(0, NET3), net1: f.subarray(NET3, NET3 * 2), sparks: f.subarray(NET3 * 2), n: d.n, alpha: d.alpha, at: d.at, stepMs: d.stepMs };
  if (restartPending) { restartPending = false; firstState = 0; } // a restarted wave fades in like the first
};
const seed = params.has('seed') ? (parseInt(params.get('seed'), 10) || 0) : (Date.now() & 0x7fffffff);
let lastMoodSent = '';
{
  const sc0 = currentScene(performance.now());
  worker.postMessage({ type: 'init', seed, mood: simMoodParams(sc0.mood, cameraFor(sc0.mood.camPitch, 16 / 9)), tune: simTuneMap(), speed: S.waveSpeed });
  worker.postMessage({ type: 'run', on: !paused });
}
function setPaused(p) { paused = p; worker.postMessage({ type: 'run', on: !paused && !document.hidden }); syncPanel(); }
function stepOnce() { if (paused) worker.postMessage({ type: 'step' }); }
function restartWave() { restartPending = true; worker.postMessage({ type: 'restart', seed: params.has('seed') ? seed : (Date.now() & 0x7fffffff) }); }

