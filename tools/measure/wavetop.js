// usage: node wavetop.js PAGE CONDS.json OUT.json       (CONDS: [{time, theme, seed, frames, w, h}])
//        node wavetop.js PAGE --sweep OUT.json [--size 1280x720] [--frames 2400] [--seed 1] [--days 4,15]
// Spec 4.5 (version 36), "Two ceilings worth checking", which replaces version 27's single check.
//
// The first ceiling is version 27's and is kept with its reasoning: the wave's own light must not drive the picture to
// white. Per condition the wave is rendered alone (layers=wave: no background, glare, sparkles or dither, the mood's
// exposure and tone curve included) and its brightest output level reported; it must fall well short of the top of the
// range in every mood, because folds that reach the top on their own clip detail out of exactly the places where the
// original keeps its crispest lines.
//
// The second is the finished frame, which is what a viewer sees: background and wave and glare and sparkles together, in
// every mood and in every month rather than only the months there is footage of. The test is not that nothing may clip,
// nor even that no patch may clip - in the original, pixels at the top level turn up at every mood hold and in every
// month, and in some months at dusk and dawn the crest of the band, with its own glare over it, clips over a connected
// patch. The test is **what lies underneath the clipped pixels**. So each clipped pixel of the finished frame is sorted
// by what it needed: the frame is rendered again without the sparkles, without the wave and without the glare, and a
// pixel that stops clipping when one of those is dropped depended on it. Clipped sparkle cores and a clipped band crest
// are in the original's character; a patch that still clips with the wave and the sparkles taken away, or one that needs
// only the glare lying over a bright background with no fold under it, is not - that is a background too bright for its
// mood or a bright-pass being fed too much (section 5), to be cured there and not by dimming the wave. The background on
// its own is therefore rendered too, and in the original it never reaches the top level in any mood or any month.
// Patches, not only counts: the largest connected run of clipped pixels is reported for the finished frame and for the
// part of it that survives dropping the wave and the sparkles.
// Levels are 0..255 of the output; shares are fractions of the frame.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const MOODS = [['00:00:00', 'night'], ['06:00:00', 'dawn'], ['12:00:00', 'day'], ['18:00:00', 'dusk']];
(async () => {
  const argv = process.argv.slice(2);
  const page = argv[0];
  const opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
  const sweep = argv.includes('--sweep');
  const outf = sweep ? argv[argv.indexOf('--sweep') + 1] : argv[2];
  let conds;
  if (sweep) {
    const [w, h] = opt('--size', '1280x720').split('x').map(Number);
    const frames = +opt('--frames', 2400), seed = +opt('--seed', 1);
    const days = opt('--days', '4,15').split(',').map(Number);
    conds = [];
    for (let mo = 1; mo <= 12; mo++) for (const d of days) for (const [t, name] of MOODS)
      conds.push({ time: '2026-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0') + 'T' + t,
        theme: 0, seed, frames, w, h, month: mo, day: d, mood: name });
  } else {
    conds = JSON.parse(fs.readFileSync(argv[1], 'utf8'));
  }
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); let bad = false;
  p.on('pageerror', e => { bad = true; console.error('pageerror:', e.message); });
  await p.goto('file://' + path.resolve(page) + '?mode=score');
  await p.evaluate(() => window.XMBW.ready);
  const res = await p.evaluate((conds) => {
    const TOP = 255;
    const bright = (r) => { const d = r.data, n = r.width * r.height, m = new Uint8Array(n);
      for (let k = 0, i = 0; i < n; i++, k += 4) m[i] = Math.max(d[k], Math.max(d[k + 1], d[k + 2]));
      return m; };
    const stats = (m) => { let mx = 0, n255 = 0, n250 = 0, n240 = 0, sum = 0;
      for (let i = 0; i < m.length; i++) { const v = m[i]; if (v > mx) mx = v; if (v >= 255) n255++; if (v >= 250) n250++; if (v >= 240) n240++; sum += v; }
      return { max: mx, s255: n255 / m.length, s250: n250 / m.length, s240: n240 / m.length, mean: sum / m.length }; };
    // the largest connected run of set pixels (4-connected), and where its middle lies, as fractions of the frame
    const patches = (sel, w, h) => {
      const seen = new Uint8Array(sel.length); let best = 0, bx = -1, by = -1, count = 0, nPatch = 0;
      const stack = new Int32Array(sel.length);
      for (let s = 0; s < sel.length; s++) {
        if (!sel[s] || seen[s]) continue;
        let top = 0; stack[top++] = s; seen[s] = 1; let n = 0, sx = 0, sy = 0;
        while (top) { const q = stack[--top]; n++; const x = q % w, y = (q - x) / w; sx += x; sy += y;
          if (x > 0 && sel[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; stack[top++] = q - 1; }
          if (x + 1 < w && sel[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; stack[top++] = q + 1; }
          if (y > 0 && sel[q - w] && !seen[q - w]) { seen[q - w] = 1; stack[top++] = q - w; }
          if (y + 1 < h && sel[q + w] && !seen[q + w]) { seen[q + w] = 1; stack[top++] = q + w; } }
        count += n; nPatch++;
        if (n > best) { best = n; bx = sx / n; by = sy / n; }
      }
      return { pixels: count, patches: nPatch, largest: best, at_x: bx < 0 ? null : bx / w, at_y: by < 0 ? null : by / h };
    };
    const out = [];
    for (const c of conds) {
      const w = c.w, h = c.h;
      const mWave = bright(window.XMBW.render({ ...c, layers: 'wave' }));
      const mBg = bright(window.XMBW.render({ ...c, layers: 'bg' }));
      const mBgWave = bright(window.XMBW.render({ ...c, layers: 'bg,wave' }));
      const mAll = bright(window.XMBW.render({ ...c }));
      const mNoSpark = bright(window.XMBW.render({ ...c, layers: 'bg,wave,glare,dither' }));
      const mNoWave = bright(window.XMBW.render({ ...c, layers: 'bg,glare,sparkles,dither' }));
      const mNoGlare = bright(window.XMBW.render({ ...c, layers: 'bg,wave,sparkles,dither' }));
      // what each clipped pixel of the finished frame needed
      const clip = new Uint8Array(mAll.length), hard = new Uint8Array(mAll.length);
      let needSpark = 0, needWave = 0, needGlare = 0, needNone = 0;
      for (let i = 0; i < mAll.length; i++) {
        if (mAll[i] < TOP) continue;
        clip[i] = 1;
        const ns = mNoSpark[i] < TOP, nw = mNoWave[i] < TOP, ng = mNoGlare[i] < TOP;
        if (ns) needSpark++;
        if (nw) needWave++;
        if (ng) needGlare++;
        if (!ns && !nw && !ng) needNone++;
        // the strict part of the test: still at the top with the wave and the sparkles taken away
        if (!nw && !ns) hard[i] = 1;
      }
      out.push({ ...c, wave: stats(mWave), bg: stats(mBg), bgwave: stats(mBgWave), all: stats(mAll),
        no_spark: stats(mNoSpark), no_wave: stats(mNoWave), no_glare: stats(mNoGlare),
        clipped: patches(clip, w, h), clipped_without_wave_or_sparkles: patches(hard, w, h),
        needs: { sparkles: needSpark, wave: needWave, glare: needGlare, none_of_the_three: needNone } });
    }
    return out;
  }, conds);
  fs.writeFileSync(outf, JSON.stringify(res, null, 1)); await b.close(); process.exit(bad ? 1 : 0);
})();
