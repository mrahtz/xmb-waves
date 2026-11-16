// usage: node bandcolour_render.js PAGE CONDS.json OUTDIR
// Spec 4.5 (version 24): renders frames for bandcolour.py through score mode on the GPU. CONDS.json: [{name, time, seed,
// frames, w, h, layers}]; each frame is written as OUTDIR/<name>.rgb (raw 8-bit RGB, top row first).
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const [page, condf, outd] = process.argv.slice(2); fs.mkdirSync(outd, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); let bad = false;
  p.on('pageerror', e => { bad = true; console.error('pageerror:', e.message); });
  p.on('console', m => { if (m.type() === 'error') { bad = true; console.error('console:', m.text()); } });
  await p.goto('file://' + path.resolve(page) + '?mode=score');
  await p.evaluate(() => window.XMBW.ready);
  // sort so that each simulation is stepped forward only
  const conds = JSON.parse(fs.readFileSync(condf, 'utf8'));
  for (const c of conds) {
    const s = await p.evaluate(o => {
      const r = window.XMBW.render(o), d = r.data, n = r.width * r.height, rgb = new Uint8Array(n * 3);
      for (let i = 0; i < n; i++) { rgb[3 * i] = d[4 * i]; rgb[3 * i + 1] = d[4 * i + 1]; rgb[3 * i + 2] = d[4 * i + 2]; }
      let s = ''; for (let i = 0; i < rgb.length; i += 0x8000) s += String.fromCharCode.apply(null, rgb.subarray(i, i + 0x8000));
      return btoa(s);
    }, c);
    fs.writeFileSync(path.join(outd, c.name + '.rgb'), Buffer.from(s, 'base64'));
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
