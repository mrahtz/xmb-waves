// usage: PAGE=var_PROF.html node prof.js W H LAYERS FRAMES -> per-pass ms per frame (CPU timing with gl.finish between passes) and simulation step timing, in score mode
const { chromium } = require('playwright');
const [W, H, LAYERS, N] = [parseInt(process.argv[2] || '1920'), parseInt(process.argv[3] || '1080'), process.argv[4] || 'bg,wave,glare,sparkles,dither', parseInt(process.argv[5] || '60')];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + process.env.PAGE + '?mode=score&w=' + W + '&h=' + H + '&seed=5&time=2026-08-15T12:00:00&layers=' + LAYERS);
  await p.evaluate(() => window.XMBW.ready);
  const r = await p.evaluate((N) => {
    window.XMBW.render({ frames: 600 }); // warm-up: simulation and targets
    window.XMBW.render({ frames: 601 });
    window.__P.acc = {}; self.__simNet = 0; self.__simDeform = 0; self.__simSpark = 0; self.__steps = 0;
    const t0 = performance.now(); let tRender = 0;
    for (let i = 0; i < N; i++) { const a = performance.now(); window.XMBW.render({ frames: 602 + i }); tRender += performance.now() - a; }
    const total = performance.now() - t0;
    const gl = window.__gl; const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    return { steps: self.__steps, acc: window.__P.acc, simNet: self.__simNet, simDeform: self.__simDeform, simSpark: self.__simSpark, tRender, total, timerExt: !!ext, maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE), renderer: (gl.getExtension('WEBGL_debug_renderer_info') ? gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL) : 'n/a') };
  }, N);
  const passes = Object.entries(r.acc).map(([k, v]) => [k, v / N]);
  const sim = [['simulation: net step', r.simNet / N], ['simulation: lattice deform', r.simDeform / N], ['simulation: sparkles', r.simSpark / N]];
  const passSum = passes.reduce((s, x) => s + x[1], 0), simSum = sim.reduce((s, x) => s + x[1], 0);
  const other = r.tRender / N - passSum - simSum;
  const all = [...sim, ...passes, ['score-mode readback and other overhead', other]];
  const tot = r.tRender / N;
  console.log(`simulation steps per rendered frame: ${(r.steps / N).toFixed(1)}`);
  console.log(`${W}x${H} layers=${LAYERS} frames=${N}  renderer: ${r.renderer}  GPU timer extension: ${r.timerExt ? 'available' : 'not available (CPU timing with gl.finish)'}`);
  for (const [k, v] of all) console.log(`  ${k.padEnd(62)} ${v.toFixed(2).padStart(7)} ms  ${(100 * v / tot).toFixed(0).padStart(3)} %`);
  console.log(`  ${'total per frame'.padEnd(62)} ${tot.toFixed(2).padStart(7)} ms`);
  await b.close();
})();
