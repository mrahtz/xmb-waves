// usage: PAGE=page.html node geomcheck.js [MOOD] [SEED] -> spec 17's checks of the wave's geometry and shading on this
// build, sampled over 50 s:
//   4.4d framing: the share of the sheet's length (from the shaken end) beyond the left edge of the screen, and where
//        the free end lies on screen (1 = the right edge); a share of the surface outside the frame
//   4.4b layout on screen (version 30): how many screen pixels one step of the sheet's material (one control-point
//        spacing along the length) covers at the two edges of the frame; the free-end edge should be the larger
//   4.4d depth: the distance to the sheet at the left and at the right edge of the screen (the left should be nearer,
//        and the growth slight)
//   4.4d from below: the camera's height relative to the sheet's mean plane (negative = below), and whether the far
//        side of the sheet appears lower on screen than the near side
//   4.4d depth across the band (spec 22): down each of 24 screen columns, the spread (10th to 90th percentile) of the
//        distance to the visible sheet, and of its height on screen; the median over columns, against the change from left to right
//   4.5 (version 31): where the sheet sits on this build's own two shading curves, with each bit weighted by how much of
//        the screen it covers. Three things, each against a feature of the build's own curves rather than in peak units:
//        the typical (median) product cosine x size factor, which must lie above the Fresnel-like peak on its falling
//        side; the share of the sheet beyond the response's half-height point on the falling side against the share
//        below the matching point on its rising side (the first must be the larger); and the share of the sheen's own
//        light that the cut-off removes, which must be substantial rather than a trace. The half-height points are read
//        from the build's own fresZero and fresTail, so a build with wider or narrower curves is compared with itself.
//        Also the distribution of the product and of the viewing cosine (4.4d, v16).
//   4.4a folded slack across the width (spec 26): by one and the same measure both ways, the length of the path the net
//        follows across its width against the straight line between the width's edges, and the same along its length;
//        how many times the width turns over down a column of the screen; and how much of the depth the sheet's width
//        could occupy (the across cloth laid straight) the drawn surface actually occupies
const src = require('fs').readFileSync(process.env.PAGE || require('path').resolve(__dirname, '../../index.html'), 'utf8');
const XMBW_SIM = new Function(src.match(/function XMBW_SIM\(\) \{[\s\S]*?\n\}\n/)[0] + '; return XMBW_SIM;')();
const camSrc = src.match(/const CAMERA = \{[^\n]*\n/)[0] + src.match(/function cameraFor\(pitchDeg, aspect[^)]*\) \{[\s\S]*?\n\}\n/)[0];
const [cameraFor, CAMERA] = new Function(camSrc + '; return [cameraFor, CAMERA];')();
const moodName = process.argv[2] || 'day', seed = +(process.argv[3] || 5);
const moodTxt = src.match(new RegExp('\\n  ' + moodName + ': \\{[\\s\\S]*?\\},\\n'))[0];
const num = (t, k) => +t.match(new RegExp('\\b' + k + ': (-?[0-9.]+)'))[1];
const waveTxt = src.match(/const WAVE = \{[\s\S]*?\n\};/)[0];
const pitch = num(moodTxt, 'camPitch'), lift = /camLift/.test(moodTxt) ? num(moodTxt, 'camLift') : 0, sizeK = num(moodTxt, 'sizeK'), peak = num(waveTxt, 'fresPeak'), cut0 = num(waveTxt, 'sheenCut0');
const cut1 = num(waveTxt, 'sheenCut1'), fresZero = num(waveTxt, 'fresZero'), fresTail = num(waveTxt, 'fresTail');
// the build's own two curves, as the wave shader computes them (x is the product cosine x size factor in peak units)
const fresResp = x => { const r = Math.min(Math.max((x - fresZero) / (1 - fresZero), 0), 1); return x < 1 ? r * r * (3 - 2 * r) : Math.exp(-(x - 1) / fresTail); };
const sheenProf = S => S < cut0 ? 1 : (S < cut1 ? 1 - 0.95 * (S - cut0) / (cut1 - cut0) : 0.05 * Math.exp(-(S - cut1) / cut1));
// the half-height points of this build's own response: on the rising side the smoothstep is half way at r = 0.5, on the
// falling side the tail has dropped to half at ln 2 tail lengths above the peak
const xLo = fresZero + 0.5 * (1 - fresZero), xHi = 1 + fresTail * Math.LN2;
const asp = 16 / 9, cam = cameraFor(pitch, asp, lift), M = XMBW_SIM(), N = M.N, T = M.tunables.SCENE;
const sim = M.createSim(seed);
sim.setMood({ envCross: num(moodTxt, 'envCross'), latScale: [num(moodTxt, 'latX'), num(moodTxt, 'latY'), num(moodTxt, 'latZ')], camFwd: cam.fwd });
sim.warm(sim.warmSteps);
const fx = cam.f / asp, fy = cam.f, W = 1920, H = 1080, norm = sizeK * CAMERA.dist / (T.len * T.wid / ((N - 1) * (N - 1)) * fx * fy);
const view = p => { const d = [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]], dot = a => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
  return [fx * dot(cam.right), fy * dot(cam.up), dot(cam.fwd)]; };
const scr = Q => [(Q[0] / Q[2] * 0.5 + 0.5), (0.5 - Q[1] / Q[2] * 0.5)];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const ev = (s, t) => { const o = [0, 0, 0]; sim.surf(sim.netCur, s, t, o); return o.slice(); };
const S = N - 3, n = 160, m = 32, h = 1e-3;
// GEOM_DUMP=file.tsv also writes every sample of the on-screen sheet as cosine, size factor and screen area, so that the
// version-31 placement check can be worked out for other shapes of the two curves without running the simulation again
const dump = process.env.GEOM_DUMP ? [] : null;
const acc = { farY: [], colD: [], colY: [], ally: [], left: [], free: [], outside: [], dl: [], dr: [], below: [], farLower: [], prod: [], cut: [], cos: [], bite: [],
  slackW: [], slackL: [], turns: [], depthUse: [], top: [], pxLeft: [], pxRight: [] };
for (let f = 0; f < 5; f++) {
  for (let k = 0; k < 600; k++) sim.step();
  // framing: the along-length fraction (at mid-width) where the sheet first enters the screen; the free end's screen x
  let first = null; for (let a = 0; a <= 400; a++) { const x = scr(view(ev(a / 400 * S, S / 2)))[0]; if (x >= 0 && first === null) first = a / 400; }
  acc.left.push(first === null ? 1 : first); acc.free.push(scr(view(ev(S, S / 2)))[0]);
  // 4.4b (version 30): the uneven layout read on the screen, not in the sheet's own coordinates. How many screen pixels
  // one step of the sheet's material (one control-point spacing along the length) covers at the two edges of the frame:
  // the free-end edge should be the larger, perspective having already shrunk it.
  { const px = [null, null];
    for (let a = 0; a <= 800; a++) {
      const s = a / 800 * S, x = scr(view(ev(s, S / 2)))[0];
      if (x < 0 || x > 1) continue;
      const d = Math.abs(scr(view(ev(Math.min(s + 1, S), S / 2)))[0] - scr(view(ev(Math.max(s - 1, 0), S / 2)))[0])
        / ((Math.min(s + 1, S) - Math.max(s - 1, 0))) * W;   // screen px per one control-point step along the length
      if (px[0] === null) px[0] = d; px[1] = d;
    }
    if (px[0] !== null) { acc.pxLeft.push(px[0]); acc.pxRight.push(px[1]); } }
  // depth: distance to the sheet's points nearest the left and right edges (mid-width); camera height vs mean plane
  let L = null, R = null, ys = 0, yc = 0, inF = 0, all = 0, wsum = 0, hist = [], pr = 0, cu = 0, co = [], sheenK = 0, sheenC = 0;
  const nearF = [], farF = [], cols = Array.from({ length: 24 }, () => [[], []]);
  for (let a = 0; a < n; a++) for (let b = 0; b < m; b++) {
    const s = (a + 0.5) / n * S, t = (b + 0.5) / m * S, P = ev(s, t); ys += P[1]; yc++;
    const Q = view(P); all++; if (Q[2] <= 0.1) continue;
    const sp = scr(Q); if (sp[0] < 0 || sp[0] > 1 || sp[1] < 0 || sp[1] > 1) continue; inF++;
    if (b === m >> 1) { if (L === null || sp[0] < L[0]) L = [sp[0], len(sub(P, cam.pos))]; if (R === null || sp[0] > R[0]) R = [sp[0], len(sub(P, cam.pos))]; }
    { const cc = cols[Math.min(23, Math.floor(sp[0] * 24))]; cc[0].push(len(sub(P, cam.pos))); cc[1].push(sp[1]); }
    if (b === 2) nearF.push(sp[1]); if (b === m - 3) farF.push(sp[1]);
    const Qs = sub(view(ev(s + h, t)), Q).map(x => x / h), Qt = sub(view(ev(s, t + h)), Q).map(x => x / h);
    const u = [Qs[0] / Q[2] - Q[0] * Qs[2] / (Q[2] * Q[2]), Qs[1] / Q[2] - Q[1] * Qs[2] / (Q[2] * Q[2])];
    const v = [Qt[0] / Q[2] - Q[0] * Qt[2] / (Q[2] * Q[2]), Qt[1] / Q[2] - Q[1] * Qt[2] / (Q[2] * Q[2])];
    const area = Math.abs(u[0] * v[1] - u[1] * v[0]);
    const Nq = cross(Qs, Qt), dist = len(Q), along = Math.abs(Nq[0] * Q[0] + Nq[1] * Q[1] + Nq[2] * Q[2]) / dist;
    const c = along / len(Nq), Sf = along / dist * norm;
    hist.push([c * Sf / peak, area]); if (Sf > cut0) cu += area; co.push([c, area]); wsum += area;
    if (dump) dump.push([c, Sf, area]);
    // the sheen's light from this bit is its light per pixel (the size factor times the profile) times the screen area
    // it covers, so what the cut-off removes over the sheet is 1 - sum(area x S x profile) / sum(area x S)
    sheenK += area * Sf; sheenC += area * Sf * sheenProf(Sf);
  }
  const pq = (a, q) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
  for (const [d, y] of cols) acc.ally.push(...y);
  for (const [d, y] of cols) if (d.length > 20) { // by distance: the farthest quarter's mean height on screen minus the nearest quarter's
    const ix = d.map((v, i) => i).sort((a, b) => d[a] - d[b]), q4 = Math.max(1, ix.length >> 2), mY = a => a.reduce((p, i) => p + y[i], 0) / a.length;
    acc.farY.push(mY(ix.slice(-q4)) - mY(ix.slice(0, q4))); }
  for (const [d, y] of cols) if (d.length > 20) { acc.colD.push(pq(d, 0.9) - pq(d, 0.1)); acc.colY.push(pq(y, 0.9) - pq(y, 0.1)); }
  acc.outside.push(1 - inF / all); acc.dl.push(L ? L[1] : NaN); acc.dr.push(R ? R[1] : NaN);
  acc.below.push(cam.pos[1] - ys / yc);
  const mean = a => a.reduce((p, x) => p + x, 0) / a.length; acc.farLower.push(mean(farF) - mean(nearF)); // > 0: far side lower
  acc.prod.push(...hist); acc.cut.push(cu / wsum); acc.cos.push(...co); acc.bite.push(1 - sheenC / sheenK);

  // spec 26, 4.4a: the same measure both ways on the deformed scene net: the path it follows across its width against
  // the straight line between the width's edges, and the path along its length against the straight line end to end
  const netP = (i, j) => { const k = (j * N + i) * 3; return [sim.netCur[k], sim.netCur[k + 1], sim.netCur[k + 2]]; };
  for (let i = 0; i < N; i++) { let p = 0; for (let j = 0; j + 1 < N; j++) p += len(sub(netP(i, j + 1), netP(i, j)));
    acc.slackW.push(p / Math.max(1e-9, len(sub(netP(i, N - 1), netP(i, 0))))); }
  for (let j = 0; j < N; j++) { let p = 0; for (let i = 0; i + 1 < N; i++) p += len(sub(netP(i + 1, j), netP(i, j)));
    acc.slackL.push(p / Math.max(1e-9, len(sub(netP(N - 1, j), netP(0, j))))); }
  // how many times the width turns over down a column of the screen, and how much of the depth its cloth could occupy
  // the drawn surface occupies: at each of 32 positions along the length, the width's trace on screen and in distance
  let topY = Infinity;
  for (let a = 0; a < 32; a++) {
    const s = (a + 0.5) / 32 * S, ys = [], ds = [];
    for (let b = 0; b <= 96; b++) {
      const P = ev(s, b / 96 * S), Q = view(P); if (Q[2] <= 0.1) continue;
      const sp = scr(Q); ys.push(sp[1]); ds.push(len(sub(P, cam.pos)));
      if (sp[0] >= 0 && sp[0] <= 1) topY = Math.min(topY, sp[1]);
    }
    if (ys.length < 10) continue;
    // turns: reversals of the trace's screen height, each at least this far (in screen heights) from the last extreme
    const thr = 0.012; let turns = 0, dir = 0, ext = ys[0];
    for (const y of ys) {
      if (dir === 0) { if (Math.abs(y - ext) > thr) { dir = Math.sign(y - ext); ext = y; } }
      else if ((y - ext) * dir > 0) ext = y;
      else if (Math.abs(y - ext) > thr) { turns++; dir = -dir; ext = y; }
    }
    acc.turns.push(turns);
    let path = 0; for (let b = 0; b + 1 < 96; b++) path += len(sub(ev(s, (b + 1) / 96 * S), ev(s, b / 96 * S)));
    acc.depthUse.push((Math.max(...ds) - Math.min(...ds)) / Math.max(1e-9, path));
  }
  acc.top.push(topY);
}
const avg = a => a.reduce((p, x) => p + x, 0) / a.length;
const wq = (arr, q) => { const a = arr.slice().sort((x, y) => x[0] - y[0]), tot = a.reduce((p, x) => p + x[1], 0); let c = 0; for (const x of a) { c += x[1]; if (c >= q * tot) return x[0]; } return a[a.length - 1][0]; };
console.log('mood %s (pitch %s), seed %d', moodName, pitch, seed);
console.log('4.4d framing: sheet length beyond the left edge %s (from the shaken end); free end at screen x %s (1 = right edge); surface outside the frame %s',
  avg(acc.left).toFixed(2), avg(acc.free).toFixed(2), avg(acc.outside).toFixed(2));
console.log('4.4b layout on screen: one step of the material covers %s px at the shaken-end edge of the frame and %s px at the free-end edge (ratio %s; the free end should be the larger)',
  avg(acc.pxLeft).toFixed(1), avg(acc.pxRight).toFixed(1), (avg(acc.pxRight) / avg(acc.pxLeft)).toFixed(2));
console.log('4.4d depth: distance to the sheet at the left edge %s, at the right edge %s (ratio %s)', avg(acc.dl).toFixed(2), avg(acc.dr).toFixed(2), (avg(acc.dr) / avg(acc.dl)).toFixed(2));
const med = a => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
console.log('4.4d depth across the band: distance spread down a column (p10-p90), median over columns %s (left-to-right change %s, ratio %s); height on screen of the visible sheet down a column %s',
  med(acc.colD).toFixed(2), Math.abs(avg(acc.dr) - avg(acc.dl)).toFixed(2), (med(acc.colD) / Math.abs(avg(acc.dr) - avg(acc.dl))).toFixed(2), med(acc.colY).toFixed(3));
console.log('aim: the visible sheet height on screen (0 = top), p10 / median / p90 %s / %s / %s', ...[0.1, 0.5, 0.9].map(q => { const b = acc.ally.slice().sort((x, y) => x - y); return b[Math.floor(q * b.length)].toFixed(3); }));
console.log('4.4d from below: camera height above the sheet mean %s (negative = below); far edge lower on screen than near edge by %s of the height (positive = lower; rows near the two long edges, which in a gathered net need not be the near and far side); by distance, down a column, the farthest quarter of the visible sheet lies %s of the height lower than the nearest quarter (median over columns)',
  avg(acc.below).toFixed(3), avg(acc.farLower).toFixed(3), med(acc.farY).toFixed(3));
{ // spec 4.5 (version 31): the three points, each against this build's own curves, weighted by screen area
  const tot = acc.prod.reduce((p, x) => p + x[1], 0);
  const share = f => acc.prod.reduce((p, x) => p + (f(x[0]) ? x[1] : 0), 0) / tot;
  const above = share(x => x > xHi), below = share(x => x < xLo), xmed = wq(acc.prod, 0.5);
  console.log('4.5 (v31) where the sheet sits on its own curves: typical product %s of the peak (%s the peak, %s); beyond the falling half-height (%s of the peak) %s of the sheet against %s below the rising one (%s of the peak) (%s); the sheen cut-off removes %s of the sheen light (%s)',
    xmed.toFixed(2), xmed > 1 ? 'above' : 'BELOW', xmed > 1 ? 'pass' : 'FAIL', xHi.toFixed(2), above.toFixed(2), below.toFixed(2), xLo.toFixed(2),
    above > below ? 'pass' : 'FAIL', avg(acc.bite).toFixed(2), avg(acc.bite) >= 0.2 ? 'pass' : 'FAIL');
  console.log('4.5: cosine x size factor over the Fresnel-like peak: p25 / median / p75 %s / %s / %s; share with size factor beyond the sheen cut-off start %s',
    wq(acc.prod, 0.25).toFixed(2), wq(acc.prod, 0.5).toFixed(2), wq(acc.prod, 0.75).toFixed(2), avg(acc.cut).toFixed(2)); }
console.log('viewing cosine p10 / p25 / median / p75 / p90 %s / %s / %s / %s / %s', ...[0.1, 0.25, 0.5, 0.75, 0.9].map(q => wq(acc.cos, q).toFixed(2)));
const pct = (a, q) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
console.log('4.4a folded slack: path / straight line across the width %s (p10 %s, p90 %s), along the length %s; the width turns over down a column %s times (median; p10 %s, p90 %s); the drawn surface occupies %s of the depth its across cloth could',
  med(acc.slackW).toFixed(2), pct(acc.slackW, 0.1).toFixed(2), pct(acc.slackW, 0.9).toFixed(2), med(acc.slackL).toFixed(2),
  med(acc.turns).toFixed(1), pct(acc.turns, 0.1).toFixed(0), pct(acc.turns, 0.9).toFixed(0), med(acc.depthUse).toFixed(2));
console.log('top of the sheet on screen (0 = top row): min over frames %s, median %s', Math.min(...acc.top).toFixed(3), med(acc.top).toFixed(3));
if (dump) require('fs').writeFileSync(process.env.GEOM_DUMP, dump.map(r => r.join(' ')).join(String.fromCharCode(10)));
