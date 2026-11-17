// usage: node wavetop.js PAGE CONDS.json OUT.json   (CONDS: [{time, theme, seed, frames, w, h}])
// Spec 4.5 (version 27), "One ceiling worth checking": the wave's own light must not drive the picture to white.
// Per condition it renders the wave alone (layers=wave: no background, glare, sparkles or dither, the mood's exposure and
// tone curve included) and reports the brightest output level it reaches and how much of the frame sits near the top, and
// then the same frame with the background under it (layers=bg,wave) for the full picture's own top end.
// Levels are 0..255 of the output; shares are fractions of the frame.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const [page, condf, outf] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); let bad = false;
  p.on('pageerror', e => { bad = true; console.error('pageerror:', e.message); });
  await p.goto('file://' + path.resolve(page) + '?mode=score');
  await p.evaluate(() => window.XMBW.ready);
  const res = await p.evaluate((conds) => {
    const stats = (r) => { const d = r.data, n = r.width * r.height; let mx = 0, n255 = 0, n250 = 0, n240 = 0, sum = 0;
      for (let k = 0; k < d.length; k += 4) { const m = Math.max(d[k], Math.max(d[k + 1], d[k + 2]));
        if (m > mx) mx = m; if (m >= 255) n255++; if (m >= 250) n250++; if (m >= 240) n240++; sum += m; }
      return { max: mx, s255: n255 / n, s250: n250 / n, s240: n240 / n, mean: sum / n }; };
    const out = [];
    for (const c of conds) {
      out.push({ ...c, wave: stats(window.XMBW.render({ ...c, layers: 'wave' })),
        full: stats(window.XMBW.render({ ...c, layers: 'bg,wave' })),
        all: stats(window.XMBW.render({ ...c })) });
    }
    return out;
  }, JSON.parse(fs.readFileSync(condf, 'utf8')));
  fs.writeFileSync(outf, JSON.stringify(res)); await b.close(); process.exit(bad ? 1 : 0);
})();
