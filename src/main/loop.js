// draw loop (capped at 60 fps unless the cap says otherwise)
let lastDraw = 0, frameNo = 0, rafPending = false, firstState = 0;
function schedule() { if (!rafPending) { rafPending = true; requestAnimationFrame(tick); } }
function tick(now) {
  rafPending = false;
  if (document.hidden) return;
  schedule();
  if (S.fpsCap && now - lastDraw < 1000 / S.fpsCap - 1.5) return;
  if (lastDraw) { frameTimes[ftPos] = now - lastDraw; ftPos = (ftPos + 1) % FT_N; }
  lastDraw = now;
  const lay = lastLayout = layout();
  applyLayout(lay);
  ensureTargets(lay.renderW, lay.renderH, lay.outW, lay.outH, lay.ss);
  const scene = currentScene(now);
  const cam = cameraFor(scene.mood.camPitch, lay.renderW / lay.renderH);
  const ms = JSON.stringify(simMoodParams(scene.mood, cam), (k, v) => typeof v === 'number' ? +v.toFixed(3) : v);
  if (ms !== lastMoodSent) { worker.postMessage({ type: 'mood', mood: JSON.parse(ms) }); lastMoodSent = ms; }
  if (tunePending) { worker.postMessage({ type: 'tune', values: simTuneMap() }); tunePending = false; }
  if (lay.view) { bindTarget(null); gl.viewport(0, 0, lay.canvasW, lay.canvasH); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); } // the canvas around the picture
  const ease = S.layers.bgEase ? BG_EASE : 1;
  const I = S.inspect, stopAfter = I.stopAfter || undefined, inspecting = I.buffer !== 'output' || (I.stopAfter > 0 && I.stopAfter < 4);
  if (!latest) { // the worker is still warming up: show the background alone
    renderFrame({ scene, cam, net0: null, net1: null, alpha: 1, sparks: null, nSparks: 0,
      layers: { ...S.layers, wave: false, glare: false, sparkles: false }, frameNo: frameNo++, ease, view: lay.view }, null);
    fpsTick(now, lay);
    return;
  }
  const alpha = paused ? 1 : Math.min(1, latest.alpha + (performance.timeOrigin + now - latest.at) / 1000 / DT * S.waveSpeed);
  if (!firstState) firstState = now;
  const fadeIn = Math.min(1, (now - firstState) / 1200); // the wave and sparkles fade in over the first second
  if (fadeIn < 1) { scene.mood = { ...scene.mood, waveBright: scene.mood.waveBright * fadeIn, sparkBright: scene.mood.sparkBright * fadeIn, glareStrength: scene.mood.glareStrength * fadeIn }; }
  const W = S.wire, wire = W.mesh || W.grid || W.quads ? { ...W, meshSA: 16 * WAVE.samplesAlong / W.meshStride, meshSV: 16 * WAVE.samplesAcross / W.meshStride } : null;
  const timer = gpuProbe && gpuProbe.left > 0 ? (gpuProbe.left--, probeTimer()) : null;
  renderFrame({ scene, cam, net0: latest.net0, net1: latest.net1, alpha, sparks: latest.sparks, nSparks: latest.n,
    layers: S.layers, frameNo: frameNo++, ease, view: lay.view, stopAfter, timer, wire }, null);
  if (inspecting) showInspect(lay, now);
  if (gpuProbe) pollGpuProbe();
  fpsTick(now, lay);
}
schedule();
