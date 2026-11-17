// usage: node bglin.js PAGE OUT.json [DATES] [HOURS]
// Spec 5 (version 24 and 27): what the bright-pass is fed. For each date and hour it scans the background's own colour
// before the composite's exposure and tone curve (the page's own bgColorAt, the function the background image is painted
// from) on a grid over the picture, and reports the largest single channel it finds and where. The bright-pass follows the
// brightest channel, so this number, put through a mood's offset, gain and white point, is the background's own side of
// that mood's threshold - without any rendering, so any offset, gain or white point can be tried on it afterwards.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const [page, outf, datesArg, hoursArg] = process.argv.slice(2);
  const dates = (datesArg || '2026-01-01,2026-02-01,2026-03-01,2026-04-01,2026-05-01,2026-06-01,2026-07-01,2026-08-01,2026-09-01,2026-10-01,2026-11-01,2026-12-01').split(',');
  const hours = (hoursArg || '00:00,06:00,12:00,18:00').split(',');
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); let bad = false;
  p.on('pageerror', e => { bad = true; console.error('pageerror:', e.message); });
  await p.goto('file://' + path.resolve(page) + '?mode=score');
  await p.evaluate(() => window.XMBW.ready);
  const res = await p.evaluate(([dates, hours]) => {
    const I = window.XMBW._internals, N = 160, M = 90, out = [];
    for (const d of dates) for (const h of hours) {
      const tp = I.sceneParams ? null : null;
      const parts = d.split('-').map(Number).concat(h.split(':').map(Number)).concat([0]);
      const sc = I.sceneParams([parts[0], parts[1], parts[2], parts[3], parts[4], 0], 0);
      let mx = -1, mu = 0, mv = 0, mc = [0, 0, 0];
      for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) {
        const u = i / N, v = j / M, c = I.bg.colorAt(sc, u, v), m = Math.max(c[0], c[1], c[2]);
        if (m > mx) { mx = m; mu = u; mv = v; mc = c; }
      }
      out.push({ date: d, hour: h, lin: mx, u: mu, v: mv, rgb: mc, gain: sc.mood.exposure, white: sc.mood.white, thr: sc.mood.glareThr });
    }
    return out;
  }, [dates, hours]);
  fs.writeFileSync(outf, JSON.stringify(res)); await b.close(); process.exit(bad ? 1 : 0);
})();
