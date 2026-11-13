// usage: node battery_render.js PAGE '{"time":..,"theme":..,"seed":..,"w":..,"h":..,"layers":..}' FRAMES [--cpu]
// Renders the given simulation frames (a comma-separated, increasing list of frame numbers, or @file with one per line)
// of PAGE through its deterministic score mode (window.XMBW.render, spec section 9) and writes them to stdout as raw RGB
// (w * h * 3 bytes per frame, rows top to bottom, in the order given). Used by battery_frames.py.
// The browser runs on the GPU (ANGLE on Direct3D 11) unless --cpu is given or XMBW_GPU=0 (then SwiftShader, as shot.js).
// Transfer out of the page: the page POSTs each frame's RGBA bytes to a small HTTP server of this script on 127.0.0.1 (an
// ephemeral port; nothing leaves the machine), about 10 times faster than returning them through page.evaluate. The bytes
// are the same either way; XMBW_TRANSFER=cdp uses the older base64 transfer through page.evaluate.
// Progress and page errors go to stderr; the exit code is non-zero on any page error.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
(async () => {
  const args = process.argv.slice(2).filter(a => a !== '--cpu');
  const cpu = process.argv.includes('--cpu') || process.env.XMBW_GPU === '0';
  const viaCdp = process.env.XMBW_TRANSFER === 'cdp';
  const [page, optsJ, framesArg] = args;
  if (!framesArg) { console.error('usage: node battery_render.js PAGE OPTS-JSON FRAMES [--cpu]'); process.exit(2); }
  const txt = framesArg.startsWith('@') ? fs.readFileSync(framesArg.slice(1), 'utf8') : framesArg;
  const frames = txt.split(/[\s,]+/).filter(Boolean).map(Number);
  const opts = JSON.parse(optsJ);
  const n = opts.w * opts.h;
  const b = await chromium.launch({ args: cpu ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  let failed = false;
  const p = await b.newPage();
  p.on('pageerror', e => { failed = true; console.error('pageerror:', e.message); });
  await p.goto('file://' + path.resolve(page) + '?mode=score');
  await p.evaluate(() => window.XMBW.ready);
  const gpuName = await p.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
  console.error('renderer:', gpuName, viaCdp ? '(transfer: page.evaluate)' : '(transfer: http)');
  const out = process.stdout; const t0 = Date.now();
  const emit = async (buf) => { if (!out.write(buf)) await new Promise(r => out.once('drain', r)); };
  if (viaCdp) {
    await p.evaluate(() => {
      // RGBA -> RGB, base64
      window.__rgb64 = (d, n) => {
        const rgb = new Uint8Array(n * 3);
        for (let k = 0, j = 0, i = 0; k < n; k++, j += 4, i += 3) { rgb[i] = d[j]; rgb[i + 1] = d[j + 1]; rgb[i + 2] = d[j + 2]; }
        let s = ''; const C = 0x8000;
        for (let k = 0; k < rgb.length; k += C) s += String.fromCharCode.apply(null, rgb.subarray(k, k + C));
        return btoa(s);
      };
    });
    for (let i = 0; i < frames.length; i++) {
      const s = await p.evaluate(o => { const r = window.XMBW.render(o); return window.__rgb64(r.data, r.width * r.height); }, { ...opts, frames: frames[i] });
      const buf = Buffer.from(s, 'base64');
      if (buf.length !== n * 3) { console.error('bad frame size', buf.length); failed = true; break; }
      await emit(buf);
      if (i % 100 === 99) console.error('rendered', i + 1, 'of', frames.length, ((Date.now() - t0) / (i + 1)).toFixed(0), 'ms/frame');
    }
  } else {
    // the page POSTs frame k's RGBA bytes to /k; frames are written to stdout in order, as RGB
    let next = 0; const got = new Map(); let pending = Promise.resolve();
    const toRgb = (rgba) => {
      const rgb = Buffer.allocUnsafe(n * 3);
      for (let k = 0, j = 0, i = 0; k < n; k++, j += 4, i += 3) { rgb[i] = rgba[j]; rgb[i + 1] = rgba[j + 1]; rgb[i + 2] = rgba[j + 2]; }
      return rgb;
    };
    const srv = http.createServer((req, res) => {
      const parts = []; req.on('data', c => parts.push(c));
      req.on('end', () => {
        const k = Number(req.url.slice(1)); const body = Buffer.concat(parts);
        res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); res.end();
        if (body.length !== n * 4) { console.error('bad frame size', body.length, 'for frame', k); failed = true; return; }
        got.set(k, body);
        pending = pending.then(async () => { while (got.has(next)) { const buf = got.get(next); got.delete(next); next++; await emit(toRgb(buf)); } });
      });
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + srv.address().port + '/';
    const B = 20;  // frames per page.evaluate
    for (let i = 0; i < frames.length && !failed; i += B) {
      await p.evaluate(async ({ o, fs_, i0, url }) => {
        for (let j = 0; j < fs_.length; j++) {
          const r = window.XMBW.render({ ...o, frames: fs_[j] });
          const resp = await fetch(url + (i0 + j), { method: 'POST', body: new Blob([r.data], { type: 'text/plain' }) });
          if (!resp.ok) throw new Error('transfer failed: ' + resp.status);
        }
      }, { o: opts, fs_: frames.slice(i, i + B), i0: i, url });
      if (Math.floor((i + B) / 100) > Math.floor(i / 100)) console.error('rendered', Math.min(i + B, frames.length), 'of', frames.length, ((Date.now() - t0) / Math.min(i + B, frames.length)).toFixed(0), 'ms/frame');
    }
    await pending;
    if (!failed && next !== frames.length) { console.error('only', next, 'of', frames.length, 'frames arrived'); failed = true; }
    srv.close();
  }
  await new Promise(r => out.end(r));
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
