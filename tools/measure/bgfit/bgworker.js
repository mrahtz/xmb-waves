// persistent evaluator: node bgworker.js PAGE  (stdin: one JSON {id, p} per line; stdout: {id, err: [per condition]})
// p: {BGL: {...}, BGW: {...}, PAL: {monthIndex: {key: value}}}; renders the background only (score mode) at 240 x 135 at
// every condition in meta.json and returns the mean absolute difference (levels, over kept pixels and channels)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), rl = require('readline');
const D = require('path').join(__dirname, '..', 'work', 'bgfit'), meta = JSON.parse(fs.readFileSync(path.join(D, 'meta.json'))), W = 240, H = 135;
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file:///' + path.resolve(process.argv[2]).split(path.sep).join('/') + '?mode=score&w=240&h=135&layers=bg');
  await pg.waitForFunction(() => window.XMBW);
  const T = fs.readFileSync(path.join(D, 'targets.f32')).toString('base64'), K = fs.readFileSync(path.join(D, 'keep.u8')).toString('base64');
  await pg.evaluate(([T, K, meta]) => {
    const dec = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    window.__T = new Float32Array(dec(T).buffer); window.__K = dec(K); window.__meta = meta;
    const I = window.XMBW._internals.bg; window.__def = JSON.parse(JSON.stringify({ BGL: I.BGL, BGW: I.BGW, PAL: I.PALETTES, grid: I.grid }));
    // picture statistics over the day (the background's own colour, before the composite) for October 4 (one month alone)
    window.__curve = (date) => {
      const I = window.XMBW._internals, out = [];
      for (let k = 0; k < 48; k++) {
        const h = k / 2, hh = Math.floor(h), mm = Math.round((h - hh) * 60);
        const sc = I.sceneParams([2026, +date.slice(5, 7), +date.slice(8, 10), hh, mm, 0], 0);
        let all = 0, top = 0, bot = 0, satLow = 0, satMax = 0, n = 0, nt = 0, nb = 0, bl = 0, br = 0;
        for (let j = 0; j <= 8; j++) for (let i = 0; i <= 8; i++) {
          const c = I.bg.colorAt(sc, i / 8, j / 8), l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
          const mx = Math.max(...c), sat = mx > 0.02 ? (mx - Math.min(...c)) / mx : 0;
          all += l; n++;
          if (j >= 7) { top += l; nt++; }
          if (j <= 1) { bot += l; nb++; satLow += sat; if (i <= 2) bl += l; if (i >= 6) br += l; }
          if (mx > 0.05 && sat > satMax) satMax = sat;
        }
        out.push({ h, asym: (br - bl) / (br + bl + 1e-6), all: all / n, top: top / nt, bot: bot / nb, satLow: satLow / nb, satMax, night: sc.night, day: sc.daylight, top_: sc.top, env: sc.nightEnv });
      }
      return out;
    };
    window.__eval = (p, want) => {
      const I = window.XMBW._internals.bg, d = window.__def;
      Object.assign(I.BGL, d.BGL, p.BGL || {}); Object.assign(I.BGW, d.BGW, p.BGW || {});
      d.PAL.forEach((P, m) => { const Q = I.PALETTES[m]; for (const k in P) Q[k] = JSON.parse(JSON.stringify(P[k])); });
      for (const m in (p.PAL || {})) Object.assign(I.PALETTES[m], p.PAL[m]);
      I.remake();
      const n = 240 * 135, out = [], imgs = [], regs = [];
      const want_ = p.conds ? new Set(p.conds) : null;   // only the conditions this block needs
      meta.forEach((c, j) => {
        if (want_ && !want_.has(j)) return;
        const r = window.XMBW.render({ time: c.time, theme: 0, seed: 1, frames: 0, w: 240, h: 135, layers: 'bg' }).data;
        let s = 0, cnt = 0; const t0 = j * n * 3;
        // also the signed mean difference over a 3 x 3 grid of regions, as the battery's bgpixel measures take it
        const rs = new Float64Array(27), rn = new Float64Array(9);
        for (let i = 0; i < n; i++) if (window.__K[j * n + i]) {
          const reg = Math.min(2, Math.floor((i / 240) / 45)) * 3 + Math.min(2, Math.floor((i % 240) / 80));
          rn[reg]++;
          for (let ch = 0; ch < 3; ch++) {
            const d = r[i * 4 + ch] - window.__T[t0 + i * 3 + ch];
            s += Math.abs(d); rs[reg * 3 + ch] += d;
          }
          cnt += 3;
        }
        out.push(s / cnt);
        regs.push(Array.from(rs, (v, q) => rn[q / 3 | 0] > 50 ? v / rn[q / 3 | 0] : 0));
        if (want) imgs.push(Array.from(r));
      });
      const res = want ? { err: out, regs, imgs } : { err: out, regs };
      if (p.curve) res.curve = window.__curve(p.curve);
      return res;
    };
  }, [T, K, meta]);
  const def = await pg.evaluate(() => window.__def);
  process.stdout.write(JSON.stringify({ ready: true, errs, def }) + '\n');
  const lines = rl.createInterface({ input: process.stdin });
  for await (const line of lines) {
    if (!line.trim()) continue; const q = JSON.parse(line);
    if (q.quit) break;
    const r = await pg.evaluate(([p, w]) => window.__eval(p, w), [q.p, !!q.imgs]);
    process.stdout.write(JSON.stringify({ id: q.id, ...r }) + '\n');
  }
  await b.close();
})();
