// usage: PAGE=page.html node big.js -> renders at 3840x2160 and 5120x2880 and reports errors and the texture limit
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (!/GPU stall|Driver/.test(m.text())) errs.push(m.text()); });
  await p.goto('file://' + (process.env.PAGE || require('path').resolve(__dirname, '../../index.html')) + '?mode=score&time=2026-09-01T12:00:00&seed=5&frames=60');
  await p.evaluate(() => window.XMBW.ready);
  for (const [w, h] of [[3840, 2160], [5120, 2880]]) {
    const t0 = Date.now();
    const r = await p.evaluate(([w, h]) => { const r = window.XMBW.render({ w, h }); let s = 0, mx = 0; for (let i = 0; i < r.data.length; i += 4) { s += r.data[i]; mx = Math.max(mx, r.data[i]); } return { w: r.width, h: r.height, mean: +(s / (r.data.length / 4)).toFixed(1), max: mx }; }, [w, h]);
    console.log(JSON.stringify(r), ((Date.now() - t0) / 1000).toFixed(0) + ' s', 'maxTex', await p.evaluate(() => document.getElementById('c').getContext('webgl2').getParameter(0x0D33)));
  }
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})();
