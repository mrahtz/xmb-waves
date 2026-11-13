// usage: node battery_render.js PAGE '{"time":..,"theme":..,"seed":..,"w":..,"h":..,"layers":..}' FRAMES [--cpu]
// Renders the given simulation frames (a comma-separated, increasing list of frame numbers, or @file with one per line)
// of PAGE through its deterministic score mode (window.XMBW.render, spec section 9) and writes them to stdout as raw RGB
// (w * h * 3 bytes per frame, rows top to bottom, in the order given). Used by battery_frames.py.
// The browser runs on the GPU (ANGLE on Direct3D 11) unless --cpu is given or XMBW_GPU=0 (then SwiftShader, as shot.js).
// Progress and page errors go to stderr; the exit code is non-zero on any page error.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const args = process.argv.slice(2).filter(a => a !== '--cpu');
  const cpu = process.argv.includes('--cpu') || process.env.XMBW_GPU === '0';
  const [page, optsJ, framesArg] = args;
  if (!framesArg) { console.error('usage: node battery_render.js PAGE OPTS-JSON FRAMES [--cpu]'); process.exit(2); }
  const txt = framesArg.startsWith('@') ? fs.readFileSync(framesArg.slice(1), 'utf8') : framesArg;
  const frames = txt.split(/[\s,]+/).filter(Boolean).map(Number);
  const opts = JSON.parse(optsJ);
  const b = await chromium.launch({ args: cpu ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  let failed = false;
  const p = await b.newPage();
  p.on('pageerror', e => { failed = true; console.error('pageerror:', e.message); });
  await p.goto('file://' + path.resolve(page) + '?mode=score');
  await p.evaluate(() => window.XMBW.ready);
  const gpuName = await p.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
  console.error('renderer:', gpuName);
  await p.evaluate(() => {
    // RGBA -> RGB, base64 (the fastest transfer through page.evaluate measured here: about 0.16 s per 1080p frame)
    window.__rgb64 = (d, n) => {
      const rgb = new Uint8Array(n * 3);
      for (let k = 0, j = 0, i = 0; k < n; k++, j += 4, i += 3) { rgb[i] = d[j]; rgb[i + 1] = d[j + 1]; rgb[i + 2] = d[j + 2]; }
      let s = ''; const C = 0x8000;
      for (let k = 0; k < rgb.length; k += C) s += String.fromCharCode.apply(null, rgb.subarray(k, k + C));
      return btoa(s);
    };
  });
  const out = process.stdout; const t0 = Date.now();
  for (let i = 0; i < frames.length; i++) {
    const s = await p.evaluate(o => { const r = window.XMBW.render(o); return window.__rgb64(r.data, r.width * r.height); }, { ...opts, frames: frames[i] });
    const buf = Buffer.from(s, 'base64');
    if (buf.length !== opts.w * opts.h * 3) { console.error('bad frame size', buf.length); failed = true; break; }
    if (!out.write(buf)) await new Promise(r => out.once('drain', r));
    if (i % 100 === 99) console.error('rendered', i + 1, 'of', frames.length, ((Date.now() - t0) / (i + 1)).toFixed(0), 'ms/frame');
  }
  await new Promise(r => out.end(r));
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
