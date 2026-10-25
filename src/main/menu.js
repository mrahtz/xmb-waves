// ---- the settings panel ----
const $ = id => document.getElementById(id);
const panel = $('panel'), gear = $('gear'), fpsEl = $('fps'), fpsText = $('fpsText'), fpsGraph = $('fpsGraph'), statsEl = $('stats');
const syncers = []; // every control's refresh; syncPanel() runs them all
function syncPanel() { for (const f of syncers) f(); }
function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k];
    else if (k.startsWith('on')) e[k] = attrs[k]; else e.setAttribute(k, attrs[k]);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}
function section(id, title, ...content) { // a collapsible section; whether it is open is remembered
  const d = el('details', {}, el('summary', { text: title }), el('div', { class: 'body' }, ...content));
  d.open = !!S.open[id];
  d.addEventListener('toggle', () => { S.open[id] = d.open; saveSettings(); });
  panel.append(d);
  return d;
}
function row(label, ...controls) { return el('div', { class: 'row' }, el('span', { class: 'lbl', text: label }), el('span', { class: 'ctl' }, ...controls)); }
function seg(options, get, set) { // a group of exclusive buttons
  const box = el('div', { class: 'seg' });
  const btns = options.map(([v, label]) => el('button', { type: 'button', text: label, onclick: () => { set(v); syncPanel(); } }));
  btns.forEach(b => box.append(b));
  syncers.push(() => { const v = get(); options.forEach(([ov], i) => btns[i].classList.toggle('on', ov === v)); });
  return box;
}
function check(label, get, set) {
  const c = el('input', { type: 'checkbox' }); c.onchange = () => { set(c.checked); syncPanel(); };
  syncers.push(() => { c.checked = !!get(); });
  return el('label', { class: 'chk' }, c, el('span', { text: label }));
}
function select(options, get, set) {
  const s = el('select'); for (const [v, label] of options) s.append(el('option', { value: v, text: label }));
  s.onchange = () => { set(s.value); syncPanel(); };
  syncers.push(() => { s.value = String(get()); });
  return s;
}
function button(label, onclick, attrs) { return el('button', { type: 'button', text: label, onclick, ...(attrs || {}) }); }
const pad = n => String(n).padStart(2, '0');
const decimals = step => Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
const fmt = (v, step) => (+v).toFixed(decimals(step));
const setting = (key, sub) => [() => (sub ? S[sub][key] : S[key]), v => { if (sub) S[sub][key] = v; else S[key] = v; saveSettings(); }];

// Picture
const scaleR = el('input', { type: 'range', min: 0, max: SCALES.length - 1, step: 1 }), scaleV = el('span', { class: 'val' }), scaleNote = el('div', { class: 'note' });
scaleR.oninput = () => { S.scale = SCALES[+scaleR.value]; saveSettings(); syncPanel(); };
syncers.push(() => { scaleR.value = SCALES.indexOf(S.scale); scaleV.textContent = S.scale + 'x'; });
section('picture', 'Picture',
  row('output shape', seg([['16:9', '16:9'], ['4:3', '4:3']], ...setting('shape'))),
  row('render scale', scaleR, scaleV), scaleNote,
  row('fit to window', seg([['fill', 'fill'], ['whole', 'whole'], ['stretch', 'stretch'], ['one', '1:1 pixels']], ...setting('fit'))),
  el('div', { class: 'hint', text: 'fill crops the edges, whole letterboxes, stretch distorts, 1:1 shows one picture pixel per screen pixel' }),
  check('show pixels when enlarged (no smoothing)', ...setting('pixelated')));

// Performance
const gpuOut = el('pre', { class: 'out' });
section('performance', 'Performance',
  check('frame-rate counter (F)', ...setting('fps')),
  check('detailed stats', ...setting('stats')),
  row('frame-rate cap', seg([[60, '60 fps'], [30, '30 fps (battery)'], [0, 'display rate']], ...setting('fpsCap'))),
  row('wave buffer', seg([['auto', '1 sample/px when enlarged'], ['full', 'full supersampling']], ...setting('waveQuality'))),
  el('div', { class: 'hint', text: 'at render scale 1.5x and above the first choice draws the wave at the render size and lets the final shrink to the screen do the smoothing; far less GPU work, no visible difference' }),
  el('div', { class: 'btns' }, button('measure GPU time per pass', () => startGpuProbe())), gpuOut);

// Time and theme
const dateIn = el('input', { type: 'datetime-local', step: 1 });
dateIn.onchange = () => { if (parseTime(dateIn.value)) { setClock(dateIn.value); syncPanel(); } };
const todIn = el('input', { type: 'range', min: 0, max: 1439, step: 1 }), todVal = el('span', { class: 'val' });
todIn.oninput = () => { const d = new Date(clockNow(performance.now())); d.setHours(0, +todIn.value, 0, 0); setClock(toLocalInput(d)); todVal.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const pauseBtn = button('pause', () => setPaused(!paused)), stepBtn = button('step', stepOnce, { title: 'one frame (. or the right arrow)' });
syncers.push(() => { pauseBtn.textContent = paused ? 'play (Space)' : 'pause (Space)'; stepBtn.disabled = !paused; });
section('time', 'Time and theme',
  row('date and time', dateIn, button('Now', () => { S.useFixed = false; S.fixedTime = ''; resetClock(); saveSettings(); refreshPanel(); }, { class: 'act' })),
  row('time of day', todIn, todVal),
  row('clock speed', seg(CLOCK_SPEEDS, () => S.speed, setClockSpeed)),
  row('wave speed', seg(WAVE_SPEEDS, () => S.waveSpeed, v => { S.waveSpeed = v; worker.postMessage({ type: 'speed', k: v }); saveSettings(); })),
  el('div', { class: 'hint', text: 'the wave speed runs the wave and sparkles only; the clock is separate' }),
  el('div', { class: 'btns' }, pauseBtn, stepBtn, button('restart the wave', restartWave, { title: 'a fresh settled state' })),
  row('colour', select([[0, 'automatic (date and time)'], ...THEME_NAMES.map((n, i) => [i + 1, (i + 1) + ' ' + n])], () => S.theme, v => { S.theme = +v; saveSettings(); })),
  row('mood', seg([['auto', 'follow the clock'], ['night', 'night'], ['dawn', 'dawn'], ['day', 'day'], ['dusk', 'dusk']], ...setting('mood'))));

// Layers
section('layers', 'Layers', ...LAYER_NAMES.map(([k, n]) => check(n, ...setting(k, 'layers'))));

// Wireframes
section('wire', 'Wireframes',
  check('wave surface mesh', ...setting('mesh', 'wire')),
  row('mesh lines', seg([[1, 'all'], [4, 'every 4th'], [16, 'every 16th']], ...setting('meshStride', 'wire'))),
  check('control grid', ...setting('grid', 'wire')),
  check('sparkle quads', ...setting('quads', 'wire')));

// Inspect
const levelSel = el('select'); levelSel.onchange = () => { S.inspect.level = +levelSel.value; saveSettings(); };
const gainR = el('input', { type: 'range', min: -6, max: 12, step: 0.1 }), gainVal = el('span', { class: 'val' });
gainR.oninput = () => { S.inspect.gain = Math.pow(2, +gainR.value); saveSettings(); refreshInspect(); };
let autoGain = 1;
function refreshInspect() {
  const I = S.inspect, g = I.autoGain ? autoGain : I.gain;
  if (document.activeElement !== gainR) gainR.value = Math.log2(g);
  gainR.disabled = I.autoGain; gainVal.textContent = 'x' + (g >= 10 ? g.toFixed(0) : g.toFixed(2));
  levelSel.disabled = !I.buffer.startsWith('glare');
}
syncers.push(refreshInspect);
section('inspect', 'Inspect',
  row('buffer', select(INSPECT_BUFFERS, () => S.inspect.buffer, v => { S.inspect.buffer = v; saveSettings(); })),
  row('level', levelSel),
  row('gain', gainR, gainVal),
  check('automatic gain (for faint buffers)', ...setting('autoGain', 'inspect')),
  row('stop after pass', select([[0, 'run every pass'], ...PASSES.map((p, i) => [i + 1, p])], () => S.inspect.stopAfter, v => { S.inspect.stopAfter = +v; saveSettings(); })),
  el('div', { class: 'hint', text: 'stopping before the composite shows the last buffer drawn' }));

// Parameters
function paramRow(it) {
  const r = el('input', { type: 'range', min: it.min, max: it.max, step: it.step });
  const n = el('input', { type: 'number', min: it.min, max: it.max, step: it.step });
  const reset = button('↺', () => { resetParam(it); syncPanel(); }, { class: 'reset', title: it.kind === 'mood' ? 'follow the mood again' : 'back to the default' });
  r.oninput = () => { setParam(it, +r.value); n.value = fmt(S.params[it.id], it.step); reset.disabled = false; rowEl.classList.remove('follow'); };
  n.onchange = () => { if (n.value !== '') setParam(it, +n.value); syncPanel(); };
  const rowEl = el('div', { class: 'row param' }, el('span', { class: 'lbl', text: it.label, title: it.id }), el('span', { class: 'ctl' }, r, n, reset));
  syncers.push(() => {
    const v = paramValue(it), over = S.params[it.id] != null;
    if (document.activeElement !== r) r.value = v;
    if (document.activeElement !== n) n.value = fmt(v, it.step);
    rowEl.classList.toggle('follow', it.kind === 'mood' && !over); reset.disabled = !over;
  });
  return rowEl;
}
{
  const sec = section('params', 'Parameters',
    el('div', { class: 'hint', text: 'each slider changes the picture live; a dimmed slider follows the mood of the moment until it is moved' }),
    el('div', { class: 'btns' }, button('reset all', () => { for (const it of PARAM_ITEMS) resetParam(it); syncPanel(); })));
  const body = sec.querySelector('.body');
  for (const g of PARAM_GROUPS) { body.append(el('h4', { text: g.name })); for (const it of g.items) body.append(paramRow(it)); }
}

// opening and closing
function setPanel(open) {
  panel.classList.toggle('open', open); gear.classList.toggle('open', open);
  gear.setAttribute('aria-expanded', String(open)); gear.setAttribute('aria-label', open ? 'close settings' : 'settings');
  if (open) refreshPanel();
}
gear.onclick = () => setPanel(!panel.classList.contains('open'));
panel.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') e.target.blur(); }); // so Space keeps pausing after a click
window.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if ((tag === 'BUTTON' || tag === 'SUMMARY') && (e.key === ' ' || e.key === 'Enter')) return; // keyboard activation of a focused control
  const k = e.key.toLowerCase();
  if (k === 'h' || k === 'p') setPanel(!panel.classList.contains('open'));
  else if (k === 'f') { S.fps = !S.fps; saveSettings(); syncPanel(); }
  else if (e.key === ' ') { setPaused(!paused); e.preventDefault(); }
  else if (e.key === '.' || e.key === 'ArrowRight') stepOnce();
});
let gearTimer = 0;
function pokeGear() { document.body.classList.add('active'); clearTimeout(gearTimer); gearTimer = setTimeout(() => document.body.classList.remove('active'), 2500); }
window.addEventListener('pointermove', pokeGear); window.addEventListener('pointerdown', pokeGear);
syncPanel();

// The clock display, the stats and the mood-following sliders change on their
// own, so the open panel is refreshed a few times a second.
let lastLayout = null;
function refreshPanel() {
  const d = new Date(clockNow(performance.now()));
  if (document.activeElement !== dateIn) dateIn.value = toLocalInput(d);
  if (document.activeElement !== todIn) todIn.value = d.getHours() * 60 + d.getMinutes();
  todVal.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
  if (lastLayout) scaleNote.textContent = `renders ${lastLayout.renderW} x ${lastLayout.renderH} pixels` + (lastLayout.outW !== lastLayout.renderW ? `, shown at ${lastLayout.outW} x ${lastLayout.outH}` : '');
  const n = RT ? RT.levels.length : 0;
  if (levelSel.options.length !== n) { levelSel.textContent = ''; for (let i = 0; i < n; i++) levelSel.append(el('option', { value: i, text: `${i}: ${RT.levels[i].w} x ${RT.levels[i].h}` })); }
  if (n) levelSel.value = Math.min(S.inspect.level, n - 1);
  syncPanel();
}

// ---- the picture's placement: shape, render scale and fit ----
// The picture has the chosen shape. Its display size follows the window and the
// fit; the render size is the display size times the render scale. A render
// larger than the display is averaged down in the final pass (the canvas stays
// at the display size); a smaller one is a smaller canvas that the browser
// enlarges, smoothed or not. With one-to-one pixels the canvas is the window
// and the picture is placed in it unscaled, centred.
function layout() {
  const dpr = window.devicePixelRatio || 1, winW = window.innerWidth, winH = window.innerHeight;
  const A = S.shape === '4:3' ? 4 / 3 : 16 / 9;
  const fitW = Math.min(winW, winH * A), coverW = Math.max(winW, winH * A);
  const baseW = S.fit === 'fill' ? coverW : fitW, baseH = baseW / A;          // display size in CSS px (stretch: the fitted size, stretched over the window)
  const dispW = Math.max(1, Math.round(baseW * dpr)), dispH = Math.max(1, Math.round(baseH * dpr));
  let renderW = Math.max(1, Math.round(dispW * S.scale)), renderH = Math.max(1, Math.round(dispH * S.scale));
  const k = MAX_TEX / Math.max(renderW, renderH); if (k < 1) { renderW = Math.floor(renderW * k); renderH = Math.floor(renderH * k); }
  const one = S.fit === 'one', small = one || S.scale < 1;
  const outW = small ? renderW : dispW, outH = small ? renderH : dispH;
  const ss = S.waveQuality === 'full' ? 2 : (renderW >= outW * 1.5 ? 1 : 2);
  let canvasW = outW, canvasH = outH, css, view = null;
  if (one) {
    canvasW = Math.max(1, Math.round(winW * dpr)); canvasH = Math.max(1, Math.round(winH * dpr));
    css = { left: 0, top: 0, width: winW, height: winH };
    view = { x: Math.floor((canvasW - outW) / 2), y: Math.floor((canvasH - outH) / 2) };
  } else if (S.fit === 'stretch') css = { left: 0, top: 0, width: winW, height: winH };
  else css = { left: (winW - baseW) / 2, top: (winH - baseH) / 2, width: baseW, height: baseH };
  return { dpr, dispW, dispH, renderW, renderH, outW, outH, ss, canvasW, canvasH, css, view };
}
let layoutKey = '';
function applyLayout(lay) {
  const key = [lay.canvasW, lay.canvasH, lay.css.left, lay.css.top, lay.css.width, lay.css.height, S.pixelated].join(',');
  if (key === layoutKey) return;
  layoutKey = key;
  if (canvas.width !== lay.canvasW || canvas.height !== lay.canvasH) { canvas.width = lay.canvasW; canvas.height = lay.canvasH; }
  canvas.style.left = lay.css.left + 'px'; canvas.style.top = lay.css.top + 'px';
  canvas.style.width = lay.css.width + 'px'; canvas.style.height = lay.css.height + 'px';
  canvas.style.imageRendering = S.pixelated ? 'pixelated' : 'auto';
}

// ---- GPU time per pass (EXT_disjoint_timer_query_webgl2), on request ----
const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
let gpuProbe = null; // { left: frames still to time, queries: [{name, q}], sums, counts, order }
function startGpuProbe() {
  if (!timerExt) { gpuOut.textContent = 'GPU timing is not available: this browser does not expose EXT_disjoint_timer_query_webgl2.'; return; }
  gpuProbe = { left: 8, queries: [], sums: {}, counts: {}, order: [] };
  gpuOut.textContent = 'measuring…';
}
function probeTimer() { // the timer hooks for one frame: one query per pass
  let cur = null;
  return {
    begin(name) { cur = { name, q: gl.createQuery() }; gl.beginQuery(timerExt.TIME_ELAPSED_EXT, cur.q); },
    end() { gl.endQuery(timerExt.TIME_ELAPSED_EXT); gpuProbe.queries.push(cur); cur = null; },
  };
}
function pollGpuProbe() {
  const P = gpuProbe, disjoint = gl.getParameter(timerExt.GPU_DISJOINT_EXT), keep = [];
  for (const e of P.queries) {
    if (!gl.getQueryParameter(e.q, gl.QUERY_RESULT_AVAILABLE)) { keep.push(e); continue; }
    const ns = gl.getQueryParameter(e.q, gl.QUERY_RESULT); gl.deleteQuery(e.q);
    if (disjoint) continue; // the GPU clock was disturbed: this result is not trustworthy
    if (!(e.name in P.sums)) { P.sums[e.name] = 0; P.counts[e.name] = 0; P.order.push(e.name); }
    P.sums[e.name] += ns; P.counts[e.name]++;
  }
  P.queries = keep;
  if (P.left > 0 || keep.length) return;
  let total = 0; const lines = [];
  for (const name of P.order) { const ms = P.sums[name] / P.counts[name] / 1e6; total += ms; lines.push(name.padEnd(11) + ms.toFixed(3).padStart(8) + ' ms'); }
  lines.push('total'.padEnd(11) + total.toFixed(3).padStart(8) + ' ms per frame, GPU, averaged over 8 frames');
  gpuOut.textContent = lines.length > 1 ? lines.join('\n') : 'no result (the GPU clock was disturbed); try again';
  gpuProbe = null;
}

// ---- Inspect: which buffer to show ----
function inspectEntry() { // the chosen buffer, or the last buffer drawn when the frame stops before the composite
  const I = S.inspect; let b = I.buffer;
  if (b === 'output') b = I.stopAfter === 1 ? 'bg' : I.stopAfter === 2 ? 'wave' : 'glareB';
  const lv = RT.levels, level = Math.min(I.level, lv.length - 1);
  switch (b) {
    case 'bg': return { tex: RT.bgA.tex, mono: false, own: gl.LINEAR };
    case 'wave': return { tex: RT.wave.tex, mono: true, own: gl.LINEAR };
    case 'glareA': return { tex: lv[level].a.tex, mono: false, own: gl.LINEAR };
    case 'glareC': return { tex: lv[level].c.tex, mono: false, own: gl.LINEAR };
    case 'glareB': return { tex: lv[level].b.tex, mono: false, own: gl.LINEAR };
    case 'net': return { tex: netTex[1], mono: false, own: gl.NEAREST };
  }
  return null;
}
let lastPeak = 0;
function showInspect(lay, now) {
  const e = inspectEntry(); if (!e) return;
  const I = S.inspect;
  if (I.autoGain && now - lastPeak > 300) { lastPeak = now; const peak = bufferPeak(e.tex); autoGain = peak > 0 ? Math.max(1, Math.min(4096, 0.9 / peak)) : 1; }
  drawInspect(e.tex, e.mono, I.autoGain ? autoGain : I.gain, S.pixelated ? gl.NEAREST : gl.LINEAR, e.own, lay.view);
}

// ---- frame-rate counter and stats ----
const FT_N = 120, frameTimes = new Float32Array(FT_N); let ftPos = 0, fpsCount = 0, fpsT = performance.now(), fpsVal = 0, graph2d = null;
function drawFpsGraph() { // the last 120 frame times as bars; the line is 60 fps
  if (!graph2d) graph2d = fpsGraph.getContext('2d'); const g = graph2d; if (!g) return;
  const dpr = window.devicePixelRatio || 1, W = Math.round(FT_N * dpr), H = Math.round(28 * dpr), top = 50; // the graph's top is 50 ms
  if (fpsGraph.width !== W || fpsGraph.height !== H) { fpsGraph.width = W; fpsGraph.height = H; }
  g.clearRect(0, 0, W, H);
  const bw = W / FT_N;
  for (let i = 0; i < FT_N; i++) {
    const t = frameTimes[(ftPos + i) % FT_N]; if (!t) continue;
    const h = Math.min(1, t / top) * H;
    g.fillStyle = t <= 17.5 ? '#6c6' : t <= 34 ? '#dc5' : '#e55';
    g.fillRect(i * bw, H - h, Math.max(1, bw - 0.5 * dpr), h);
  }
  g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(0, Math.round(H - H * 16.67 / top), W, 1);
}
function statsText(lay) {
  let sum = 0, n = 0; for (let i = 0; i < FT_N; i++) if (frameTimes[i]) { sum += frameTimes[i]; n++; }
  const ss = RT.ww / lay.renderW;
  return [
    `render ${lay.renderW} x ${lay.renderH}`,
    `wave buffer ${RT.ww} x ${RT.wh} (${ss >= 1.95 ? '2x supersampled' : ss > 1.05 ? ss.toFixed(2) + 'x, texture limit' : '1 sample per render pixel'})`,
    `output ${lay.outW} x ${lay.outH}${lay.outW !== lay.canvasW || lay.outH !== lay.canvasH ? `, canvas ${lay.canvasW} x ${lay.canvasH}` : ''}`,
    `glare ${RT.levels[0].w} x ${RT.levels[0].h}, ${RT.levels.length} levels`,
    `sim step ${latest && latest.stepMs != null ? latest.stepMs.toFixed(2) + ' ms' : '-'} (worker), wave speed ${S.waveSpeed}x`,
    `frame ${n ? (sum / n).toFixed(1) : '-'} ms, cap ${S.fpsCap ? S.fpsCap + ' fps' : 'display rate'}`,
    `${S.shape} ${S.fit}, scale ${S.scale}x, wave buffer ${S.waveQuality}, pixelated ${S.pixelated ? 'on' : 'off'}`,
  ].join('\n');
}
let lastRefresh = 0;
function fpsTick(now, lay) {
  fpsCount++;
  if (now - fpsT > 500) {
    fpsVal = fpsCount * 1000 / (now - fpsT); fpsCount = 0; fpsT = now;
    if (S.stats) statsEl.textContent = statsText(lay);
  }
  fpsEl.classList.toggle('on', S.fps || S.stats);
  fpsText.hidden = fpsGraph.hidden = !S.fps; statsEl.hidden = !S.stats;
  if (S.fps) { fpsText.textContent = fpsVal.toFixed(0) + ' fps'; drawFpsGraph(); }
  if (panel.classList.contains('open') && now - lastRefresh > 250) { lastRefresh = now; refreshPanel(); }
}

// screen wake lock
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !document.hidden && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { wakeLock = null; }
}
keepAwake();
window.addEventListener('pointerdown', keepAwake);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { worker.postMessage({ type: 'run', on: false }); }
  else { worker.postMessage({ type: 'run', on: !paused }); keepAwake(); lastDraw = 0; schedule(); }
});

// a lost WebGL context (memory pressure on a tablet): stop drawing, reload when it comes back
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); worker.postMessage({ type: 'run', on: false }); }, false);
canvas.addEventListener('webglcontextrestored', () => { location.reload(); }, false);

