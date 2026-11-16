// usage: node brightmax.js PAGE CONDS.json OUT.json   (CONDS: [{time, seed, frames, w, h}])
// Spec 5 (version 24): both sides of the bright-pass threshold, per condition. Renders the composite without glare, sparkles
// or dither, with the wave and without it, box-averages it to the bright-pass's resolution (1/8 of the output) and returns
// the largest channel's maximum (0..1, output units) for each, where the background-only maximum lies (x, y as fractions),
// and the mood's threshold. The bright-pass reads the composite before the 8-bit output; below 1 the two agree to a level.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const [page, condf, outf] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); let bad = false;
  p.on('pageerror', e => { bad = true; console.error('pageerror:', e.message); });
  await p.goto('file://' + path.resolve(page) + '?mode=score');
  await p.evaluate(() => window.XMBW.ready);
  const res = await p.evaluate((conds) => {
    const I = window.XMBW._internals;
    const bmax = (r) => { const W = r.width, H = r.height, w = Math.ceil(W / 8), h = Math.ceil(H / 8), d = r.data;
      let best = -1, bx = 0, by = 0;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const s = [0, 0, 0]; let n = 0;
        for (let y = j * 8; y < Math.min(H, j * 8 + 8); y++) for (let x = i * 8; x < Math.min(W, i * 8 + 8); x++) {
          const k = 4 * (y * W + x); s[0] += d[k]; s[1] += d[k + 1]; s[2] += d[k + 2]; n++; }
        const m = Math.max(s[0], s[1], s[2]) / n / 255; if (m > best) { best = m; bx = (i + 0.5) / w; by = (j + 0.5) / h; } }
      return [best, bx, by]; };
    const out = [];
    for (const c of conds) {
      const t = c.time.match(/T(\d+):(\d+)/), hour = +t[1] + +t[2] / 60, thr = I.moodAt(hour).glareThr;
      const wv = bmax(window.XMBW.render({ ...c, layers: 'bg,wave' })), bg = bmax(window.XMBW.render({ ...c, layers: 'bg' }));
      out.push({ ...c, thr, wave: wv[0], bg: bg[0], bgx: bg[1], bgy: bg[2] });
    }
    return out;
  }, JSON.parse(fs.readFileSync(condf, 'utf8')));
  fs.writeFileSync(outf, JSON.stringify(res)); await b.close(); process.exit(bad ? 1 : 0);
})();
