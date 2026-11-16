// usage: node glareab.js PAGE SETJSON CONDS.json OUT.json   (SETJSON: in-page overrides, e.g. {"MOODS":{"day":{"glareThr":0.8}}})
// Spec 5 (version 20): the glare measured by switching its layer on and off. CONDS.json: [{time, seed, frames, w, h, bgToo}].
// For each condition {time, seed, frames}: renders bg+wave with and without the glare layer (no sparkles, no dither) and,
// separately, the background alone with and without the glare, in the page, and returns per-frame statistics of the
// difference (output levels): total over the frame (sum of the three channels / 3, in level-pixels), maximum, pixels whose
// largest channel differs by >= 1 and >= 4 levels.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const [page, setj, condf, outf] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); let bad = false;
  p.on('pageerror', e => { bad = true; console.error('pageerror:', e.message); });
  await p.goto('file://' + path.resolve(page) + '?mode=score');
  await p.evaluate(() => window.XMBW.ready);
  const res = await p.evaluate(([set, conds]) => {
    const I = window.XMBW._internals;
    if (set.MOODS) for (const [m, kv] of Object.entries(set.MOODS)) Object.assign(I.MOODS[m], kv);
    if (set.WAVE) Object.assign(I.WAVE, set.WAVE);
    const st = (a, b) => { let tot = 0, mx = 0, n1 = 0, n4 = 0;
      for (let i = 0; i < a.length; i += 4) { const d0 = a[i] - b[i], d1 = a[i + 1] - b[i + 1], d2 = a[i + 2] - b[i + 2];
        const m = Math.max(d0, d1, d2); tot += (d0 + d1 + d2) / 3; if (m > mx) mx = m; if (m >= 1) n1++; if (m >= 4) n4++; }
      return { tot, mx, n1, n4 }; };
    const out = [];
    for (const c of conds) {
      const on = window.XMBW.render({ ...c, layers: 'bg,wave,glare' }).data.slice();
      const off = window.XMBW.render({ ...c, layers: 'bg,wave' }).data;
      const r = { ...c, wave: st(on, off) };
      if (c.bgToo) { const bon = window.XMBW.render({ ...c, layers: 'bg,glare' }).data.slice(); r.bg = st(bon, window.XMBW.render({ ...c, layers: 'bg' }).data); }
      out.push(r);
    }
    return out;
  }, [JSON.parse(setj), JSON.parse(fs.readFileSync(condf, 'utf8'))]);
  fs.writeFileSync(outf, JSON.stringify(res)); await b.close(); process.exit(bad ? 1 : 0);
})();
