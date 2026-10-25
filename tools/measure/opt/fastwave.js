// fastwave.js: headless (no GPU) evaluator of the wave's on-screen statistics.
//
// Loads the pure simulation (XMBW_SIM) and the camera (cameraFor) from a built page,
// evaluates the bicubic B-spline surface on a fine (s, t) grid, shades every cell with
// the page's fragment-shader response, projects it through the real camera and splats its
// light (response x edge fade x projected area) additively into a raster of NC column
// bins x H rows. The page's wave filter (4 x 4 bilinear taps spread over filterSpread
// output pixels) is applied as a vertical kernel, the result is scaled to 8-bit L units
// like the PNG frames, and the same statistics as spec46.py / fill.py / spec46m.py are
// computed on that raster.
'use strict';
const fs = require('fs');

// ------------------------------------------------------------------ page loading
function num(txt, key, def) {
  const m = txt.match(new RegExp('\\b' + key + ': *(-?[0-9.]+(?:e-?[0-9]+)?)'));
  return m ? +m[1] : def;
}
function loadPage(path) {
  const src = fs.readFileSync(path, 'utf8');
  const simCode = src.match(/function XMBW_SIM\(\) \{[\s\S]*?\n\}\n/)[0];
  const XMBW_SIM = new Function(simCode + '; return XMBW_SIM;')();
  // the same simulation without the sparkle pool (its random draws are skipped, so the kicks differ in detail but not in kind)
  const fastCode = simCode.replace(/\n\s*stepSparks\(\);\n\s*emit\(\);/, '\n');
  if (fastCode === simCode) throw new Error('could not strip the sparkle steps');
  const XMBW_SIM_FAST = new Function(fastCode + '; return XMBW_SIM;')();
  const camLine = src.match(/const CAMERA = [^\n]*\n/)[0];
  const cameraFor = new Function(camLine + src.match(/function cameraFor[\s\S]*?\n\}\n/)[0] + '; return cameraFor;')();
  const dayTxt = src.match(/\n  day: \{[\s\S]*?\},\n/)[0];
  const fsWave = src.match(/const FS_WAVE = `[\s\S]*?`;/)[0];
  const mood = {};
  for (const k of ['waveBright', 'base', 'baseC', 'baseK', 'edge', 'edgeC', 'envCross', 'camPitch', 'latX', 'latY', 'latZ']) mood[k] = num(dayTxt, k, undefined);
  if (!/uBaseK/.test(fsWave)) mood.baseK = 1; // older shading: sheen = base * exp(-c / baseC)
  if (mood.latX == null) { mood.latX = mood.latY = mood.latZ = 1; }
  const waveTxt = src.match(/const WAVE = \{[\s\S]*?\n\};/)[0];
  const tint = (name) => { const m = waveTxt.match(new RegExp(name + ': \\[([^\\]]*)\\]')); return m ? m[1].split(',').map(Number) : [1, 1, 1]; };
  const WAVE = { fadeEnds: num(waveTxt, 'fadeEnds', 0.1), fadeEdges: num(waveTxt, 'fadeEdges', 0.04), filterSpread: num(waveTxt, 'filterSpread', 5.5), tintL: tint('tintL'), tintR: tint('tintR') };
  return { XMBW_SIM, XMBW_SIM_FAST, cameraFor, mood, WAVE, path, camYaw: num(camLine, 'yaw', -20) };
}

// ------------------------------------------------------------------ maths helpers
function bsp(t, b, d) {
  const t2 = t * t, t3 = t2 * t, u = 1 - t;
  b[0] = u * u * u / 6; b[1] = (3 * t3 - 6 * t2 + 4) / 6; b[2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6; b[3] = t3 / 6;
  if (d) { d[0] = -u * u / 2; d[1] = (3 * t2 - 4 * t) / 2; d[2] = (-3 * t2 + 2 * t + 1) / 2; d[3] = t2 / 2; }
}
function smoothstep(e0, e1, x) { const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t); }
function median(a) { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); const n = s.length; return n & 1 ? s[n >> 1] : 0.5 * (s[n / 2 - 1] + s[n / 2]); }
function pct(a, q) { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); const k = (s.length - 1) * q / 100, f = Math.floor(k), c = Math.min(f + 1, s.length - 1); return s[f] + (s[c] - s[f]) * (k - f); }
function mean(a) { if (!a.length) return NaN; let s = 0; for (const v of a) s += v; return s / a.length; }
function nanmean(a) { let s = 0, n = 0; for (const v of a) if (!Number.isNaN(v)) { s += v; n++; } return n ? s / n : NaN; }
function nanmedian(a) { return median(a.filter(v => !Number.isNaN(v))); }

// scipy.signal.find_peaks(x, prominence=p) and peak_widths(rel_height=0.5), ported.
// Returns { idx, prom, width, lbase, rbase } for the peaks with prominence >= promMin.
function findPeaks(x, n, promMin, out) {
  const idx = [], prom = [], width = [];
  let i = 1;
  while (i < n - 1) {
    if (x[i - 1] < x[i]) {
      let ahead = i + 1;
      while (ahead < n - 1 && x[ahead] === x[i]) ahead++;
      if (x[ahead] < x[i]) { // peak (plateau midpoint)
        const p = (i + ahead - 1) >> 1;
        // prominence: walk out while x <= x[p]
        let lmin = x[p], j = p, lb = p;
        while (j >= 0 && x[j] <= x[p]) { if (x[j] < lmin) { lmin = x[j]; lb = j; } j--; }
        let rmin = x[p], rb = p; j = p;
        while (j < n && x[j] <= x[p]) { if (x[j] < rmin) { rmin = x[j]; rb = j; } j++; }
        const pr = x[p] - Math.max(lmin, rmin);
        if (pr >= promMin) {
          const h = x[p] - pr * 0.5;
          let k = p; while (lb < k && h < x[k]) k--;
          let lip = k; if (x[k] < h) lip += (h - x[k]) / (x[k + 1] - x[k]);
          k = p; while (k < rb && h < x[k]) k++;
          let rip = k; if (x[k] < h) rip -= (h - x[k]) / (x[k - 1] - x[k]);
          idx.push(p); prom.push(pr); width.push(rip - lip);
        }
        i = ahead;
      } else i = ahead;
    } else i++;
  }
  return { idx, prom, width };
}

// ------------------------------------------------------------------ the rasteriser
class Raster {
  // W, H: the emulated frame size in px (statistics are in these px); NC: column bins; S, T: surface cells along / across
  constructor(o) {
    this.W = o.W; this.H = o.H; this.NC = o.NC; this.cw = o.W / o.NC; this.S = o.S; this.T = o.T;
    this.fadeEnds = o.fadeEnds; this.fadeEdges = o.fadeEdges; this.spread = o.filterSpread;
    this.tintL = o.tintL; this.tintR = o.tintR; this.preBlur = o.preBlur || 0;
    const S = o.S, T = o.T;
    this.sIdx = new Int32Array(S); this.sB = new Float64Array(S * 4); this.sD = new Float64Array(S * 4); this.sFade = new Float64Array(S);
    const b = [0, 0, 0, 0], d = [0, 0, 0, 0];
    for (let m = 0; m < S; m++) {
      const s = (m + 0.5) / S * 16, is = Math.min(Math.floor(s), 15); bsp(s - is, b, d);
      this.sIdx[m] = is; for (let a = 0; a < 4; a++) { this.sB[m * 4 + a] = b[a]; this.sD[m * 4 + a] = d[a]; }
      const f = s / 16; this.sFade[m] = smoothstep(0, this.fadeEnds, f) * smoothstep(1, 1 - this.fadeEnds, f);
    }
    this.tIdx = new Int32Array(T); this.tB = new Float64Array(T * 4); this.tD = new Float64Array(T * 4); this.tFade = new Float64Array(T);
    for (let k = 0; k < T; k++) {
      const t = (k + 0.5) / T * 16, it = Math.min(Math.floor(t), 15); bsp(t - it, b, d);
      this.tIdx[k] = it; for (let a = 0; a < 4; a++) { this.tB[k * 4 + a] = b[a]; this.tD[k * 4 + a] = d[a]; }
      const f = t / 16; this.tFade[k] = smoothstep(0, this.fadeEdges, f) * smoothstep(1, 1 - this.fadeEdges, f);
    }
    this.R = new Float64Array(T * 19 * 3); this.RT = new Float64Array(T * 19 * 3);
    this.img = new Float64Array(o.NC * o.H);
    this.colLo = new Int32Array(o.NC); this.colHi = new Int32Array(o.NC);
    this.lab = new Int32Array(o.NC * o.H); this.stackX = new Int32Array(o.NC * o.H); this.stackY = new Int32Array(o.NC * o.H);
    this.L = new Float64Array(o.NC * o.H);   // 8-bit L units (quantised) after the page filter
    this.B = new Float64Array(o.NC * o.H);   // after the analysis blur (sigma 1 row)
    // the page's wave filter as a vertical kernel over integer row offsets (bilinear taps on the 2x buffer, approximated
    // as linear interpolation of the row values at offsets ((i + 0.5) / 4 - 0.5) * spread, i = 0..3)
    const K = {}; const taps = 4;
    for (let i = 0; i < taps; i++) {
      const off = ((i + 0.5) / taps - 0.5) * this.spread, f0 = Math.floor(off), w1 = off - f0;
      K[f0] = (K[f0] || 0) + (1 - w1) / taps; K[f0 + 1] = (K[f0 + 1] || 0) + w1 / taps;
    }
    const offs = Object.keys(K).map(Number); let kMin = Math.min(...offs), kMax = Math.max(...offs);
    let kern = new Float64Array(kMax - kMin + 1); for (const k of offs) kern[k - kMin] = K[k];
    if (this.preBlur > 0) { // convolve the page kernel with a gaussian (the extra softness of the real render's 2x buffer and bilinear taps)
      const sg = this.preBlur, R = Math.ceil(3 * sg); const g = []; let gs = 0;
      for (let k = -R; k <= R; k++) { const v = Math.exp(-k * k / (2 * sg * sg)); g.push(v); gs += v; }
      const nk = new Float64Array(kern.length + 2 * R);
      for (let i = 0; i < kern.length; i++) for (let k = -R; k <= R; k++) nk[i + k + R] += kern[i] * g[k + R] / gs;
      kern = nk; kMin -= R; kMax += R;
    }
    this.kMin = kMin; this.kMax = kMax; this.kern = kern;
    // analysis blur: gaussian sigma 1 row, truncated at 4 sigma (scipy default)
    const g = []; let gs = 0; for (let k = -4; k <= 4; k++) { const v = Math.exp(-k * k / 2); g.push(v); gs += v; }
    this.gauss = Float64Array.from(g.map(v => v / gs));
    this.tmp = new Float64Array(o.H);
    // per-column luma factor of the tint (ITU-R 601 as PIL's convert('L'))
    this.lum = new Float64Array(o.NC);
    for (let c = 0; c < o.NC; c++) {
      const x = (c + 0.5) / o.NC; let l = 0; const w = [0.299, 0.587, 0.114];
      for (let ch = 0; ch < 3; ch++) l += w[ch] * (this.tintL[ch] * (1 - x) + this.tintR[ch] * x);
      this.lum[c] = l;
    }
  }

  // Splat one frame: net = deformed 19 x 19 x 3 control net (scene units), cam = cameraFor(...), shade = { bright, base, baseC, baseK, edge, edgeC }.
  splat(net, cam, shade) {
    const { S, T, NC, H, cw, img, R, RT, colLo, colHi } = this;
    img.fill(0); colLo.fill(H); colHi.fill(-1);
    // blend the control net across t for every t sample: R[k][i] = sum_b Bt_b C[it+b][i]
    for (let k = 0; k < T; k++) {
      const it = this.tIdx[k], o = k * 57;
      for (let i = 0; i < 19; i++) {
        let x = 0, y = 0, z = 0, dx = 0, dy = 0, dz = 0;
        for (let bb = 0; bb < 4; bb++) {
          const w = this.tB[k * 4 + bb], dw = this.tD[k * 4 + bb], q = ((it + bb) * 19 + i) * 3;
          x += w * net[q]; y += w * net[q + 1]; z += w * net[q + 2];
          dx += dw * net[q]; dy += dw * net[q + 1]; dz += dw * net[q + 2];
        }
        R[o + i * 3] = x; R[o + i * 3 + 1] = y; R[o + i * 3 + 2] = z;
        RT[o + i * 3] = dx; RT[o + i * 3 + 1] = dy; RT[o + i * 3 + 2] = dz;
      }
    }
    const v = cam.vp, cx = cam.pos[0], cy = cam.pos[1], cz = cam.pos[2];
    const v0 = v[0], v4 = v[4], v8 = v[8], v12 = v[12], v1 = v[1], v5 = v[5], v9 = v[9], v13 = v[13], v3 = v[3], v7 = v[7], v11 = v[11], v15 = v[15];
    const Wpx = this.W, Hpx = H, dsdt = (16 / S) * (16 / T);
    const bright = shade.bright, base = shade.base, baseC = shade.baseC, baseK = shade.baseK, edge = shade.edge, edgeC = shade.edgeC;
    const kIs2 = Math.abs(baseK - 2) < 1e-9;
    let total = 0;
    for (let k = 0; k < T; k++) {
      const o = k * 57, ft = this.tFade[k];
      if (ft <= 0) continue;
      for (let m = 0; m < S; m++) {
        const fade = ft * this.sFade[m];
        if (fade <= 0) continue;
        const is = this.sIdx[m], mb = m * 4;
        let px = 0, py = 0, pz = 0, sx = 0, sy = 0, sz = 0, tx = 0, ty = 0, tz = 0;
        for (let a = 0; a < 4; a++) {
          const w = this.sB[mb + a], dw = this.sD[mb + a], q = o + (is + a) * 3;
          px += w * R[q]; py += w * R[q + 1]; pz += w * R[q + 2];
          sx += dw * R[q]; sy += dw * R[q + 1]; sz += dw * R[q + 2];
          tx += w * RT[q]; ty += w * RT[q + 1]; tz += w * RT[q + 2];
        }
        // clip-space position and its derivatives
        const xc = v0 * px + v4 * py + v8 * pz + v12, yc = v1 * px + v5 * py + v9 * pz + v13, wc = v3 * px + v7 * py + v11 * pz + v15;
        if (wc <= 0.1) continue;
        const X = (0.5 + 0.5 * xc / wc) * Wpx, Y = (0.5 - 0.5 * yc / wc) * Hpx;
        if (X < -cw || X >= Wpx + cw || Y < -2 || Y >= Hpx + 2) continue;
        const xs = v0 * sx + v4 * sy + v8 * sz, ys = v1 * sx + v5 * sy + v9 * sz, ws = v3 * sx + v7 * sy + v11 * sz;
        const xt = v0 * tx + v4 * ty + v8 * tz, yt = v1 * tx + v5 * ty + v9 * tz, wt = v3 * tx + v7 * ty + v11 * tz;
        const iw2 = 1 / (wc * wc);
        const Xs = 0.5 * Wpx * (xs * wc - xc * ws) * iw2, Ys = -0.5 * Hpx * (ys * wc - yc * ws) * iw2;
        const Xt = 0.5 * Wpx * (xt * wc - xc * wt) * iw2, Yt = -0.5 * Hpx * (yt * wc - yc * wt) * iw2;
        const area = Math.abs(Xs * Yt - Xt * Ys) * dsdt; // projected area of the cell in output px^2
        // shading: c = |cos(normal, view)|
        const nx = sy * tz - sz * ty, ny = sz * tx - sx * tz, nz = sx * ty - sy * tx;
        const vx = cx - px, vy = cy - py, vz = cz - pz;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz), vl = Math.sqrt(vx * vx + vy * vy + vz * vz);
        const c = nl > 0 ? Math.abs(nx * vx + ny * vy + nz * vz) / (nl * vl) : 0;
        const r = c / baseC;
        const sheen = base * Math.exp(-(kIs2 ? r * r : Math.pow(r, baseK)));
        const I = bright * (sheen + edge * Math.exp(-c / edgeC)) * fade;
        const val = I * area / cw; // light density per raster cell (cw px wide, 1 px tall)
        total += I * area;
        // bilinear splat
        const fx = X / cw - 0.5, fy = Y - 0.5;
        const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
        if (iy >= 0 && iy < H) {
          if (ix >= 0 && ix < NC) { img[ix * H + iy] += val * (1 - ax) * (1 - ay); if (iy < colLo[ix]) colLo[ix] = iy; if (iy > colHi[ix]) colHi[ix] = iy; }
          if (ix + 1 >= 0 && ix + 1 < NC) { img[(ix + 1) * H + iy] += val * ax * (1 - ay); if (iy < colLo[ix + 1]) colLo[ix + 1] = iy; if (iy > colHi[ix + 1]) colHi[ix + 1] = iy; }
        }
        if (iy + 1 >= 0 && iy + 1 < H) {
          if (ix >= 0 && ix < NC) { img[ix * H + iy + 1] += val * (1 - ax) * ay; if (iy + 1 > colHi[ix]) colHi[ix] = iy + 1; if (iy + 1 < colLo[ix]) colLo[ix] = iy + 1; }
          if (ix + 1 >= 0 && ix + 1 < NC) { img[(ix + 1) * H + iy + 1] += val * ax * ay; if (iy + 1 > colHi[ix + 1]) colHi[ix + 1] = iy + 1; if (iy + 1 < colLo[ix + 1]) colLo[ix + 1] = iy + 1; }
        }
      }
    }
    this.finish();
    return total;
  }

  // page filter (vertical), 8-bit L quantisation, analysis blur
  finish() {
    const { NC, H, img, L, B, tmp, kern, kMin, kMax, gauss, colLo, colHi } = this;
    L.fill(0); B.fill(0); tmp.fill(0);
    const reach = Math.max(-kMin, kMax) + 5;
    for (let c = 0; c < NC; c++) {
      if (colHi[c] < 0) continue;
      const o = c * H, lum = this.lum[c] * 255;
      const r0 = Math.max(0, colLo[c] - reach), r1 = Math.min(H - 1, colHi[c] + reach);
      for (let r = r0; r <= r1; r++) {
        let s = 0;
        for (let k = kMin; k <= kMax; k++) { const q = r + k; if (q >= 0 && q < H) s += img[o + q] * kern[k - kMin]; }
        tmp[r] = Math.round(Math.min(255, s * lum));
      }
      for (let r = r0; r <= r1; r++) {
        L[o + r] = tmp[r];
        let s = 0;
        for (let k = -4; k <= 4; k++) { let q = r + k; if (q < 0) q = -q - 1; else if (q >= H) q = 2 * H - q - 1; s += tmp[q] * gauss[k + 4]; }
        B[o + r] = s;
      }
      for (let r = r0; r <= r1; r++) tmp[r] = 0;
    }
  }
}

// ------------------------------------------------------------------ spec46 + fill statistics on a raster (B = blurred L)
// Column bins stand for cw px each; "px" thresholds along y are in rows (1 px), along x in W fractions.
function frameStats(ras) {
  const { NC, H, cw, B, W } = ras;
  let fmax = 0; for (let i = 0; i < B.length; i++) if (B[i] > fmax) fmax = B[i];
  const thick = [], centre = [], npk12 = [], npk25 = [], npk40 = [], face = [], foldface = [], avgface = [], overlap = [], widths = [], bwidths = [], edge = [], part = [], linepk = [];
  const a40 = [], a25 = [], fmean = [], dark = [];
  const top = new Int32Array(NC).fill(-1), bot = new Int32Array(NC).fill(-1);
  const colMax = new Float64Array(NC);
  const peakrows = new Array(NC).fill(null);
  const xsUsed = [];
  const MARGIN = 24;
  for (let x = 0; x < NC; x++) {
    const o = x * H; const col = B.subarray(o, o + H); let cm = 0;
    if (ras.colHi[x] < 0) { colMax[x] = 0; continue; }
    const lo0 = Math.max(0, ras.colLo[x] - MARGIN), hi0 = Math.min(H - 1, ras.colHi[x] + MARGIN);
    for (let r = lo0; r <= hi0; r++) if (col[r] > cm) cm = col[r];
    colMax[x] = cm;
    if (cm < Math.max(6, 0.08 * fmax)) continue;
    const thr = Math.max(3, 0.06 * cm); let t = -1, b = -1;
    for (let r = lo0; r <= hi0; r++) if (col[r] > thr) { if (t < 0) t = r; b = r; }
    top[x] = t; bot[x] = b; xsUsed.push(x);
    thick.push((b - t) / H); centre.push((t + b) / 2 / H);
    const lo = Math.max(0, t - MARGIN), hi = Math.min(H - 1, b + MARGIN);
    const p12 = findPeaks(col.subarray(lo, hi + 1), hi + 1 - lo, 0.12 * cm);
    for (let i = 0; i < p12.idx.length; i++) p12.idx[i] += lo;
    let k25 = 0, k40 = 0; for (const pr of p12.prom) { if (pr >= 0.25 * cm) k25++; if (pr >= 0.40 * cm) k40++; }
    npk12.push(p12.idx.length); npk25.push(k25); npk40.push(k40);
    peakrows[x] = p12;
    const n12 = p12.idx.length;
    if (n12 >= 2) {
      const mins = [];
      for (let i = 0; i < n12 - 1; i++) { let m = Infinity; for (let r = p12.idx[i]; r <= p12.idx[i + 1]; r++) if (col[r] < m) m = col[r]; mins.push(m); }
      const fl = median(mins);
      face.push(fl / cm); foldface.push(cm / Math.max(fl, 1e-3));
      let pm = 0; for (const p of p12.idx) pm += col[p]; avgface.push(pm / n12 / Math.max(fl, 1e-3));
      overlap.push(Math.max(...mins) / Math.max(Math.min(...mins), 1e-3));
      let np = 0; for (const m of mins) if (m < 0.08 * cm) np++; part.push(np);
    } else if (n12 === 1) part.push(0);
    if (n12) {
      let bi = 0; for (let i = 1; i < n12; i++) if (col[p12.idx[i]] > col[p12.idx[bi]]) bi = i;
      for (let i = 0; i < n12; i++) widths.push(p12.width[i]);
      bwidths.push(p12.width[bi]);
      const band = []; for (let r = t; r <= b; r++) if (col[r] > thr) band.push(col[r]);
      const med = median(band);
      for (let i = 0; i < n12; i++) if (p12.width[i] < 12) linepk.push(col[p12.idx[i]] / Math.max(med, 1e-3));
      for (let side = 0; side < 2; side++) {
        const pk = side === 0 ? p12.idx[0] : p12.idx[n12 - 1], h = col[pk];
        let i10 = -1, i90 = -1;
        if (side === 0) { for (let r = t, q = 0; r <= pk; r++, q++) { if (i10 < 0 && col[r] >= 0.1 * h) i10 = q; if (i90 < 0 && col[r] >= 0.9 * h) i90 = q; } }
        else { for (let r = b, q = 0; r >= pk; r--, q++) { if (i10 < 0 && col[r] >= 0.1 * h) i10 = q; if (i90 < 0 && col[r] >= 0.9 * h) i90 = q; } }
        if (i10 < 0) i10 = 0; if (i90 < 0) i90 = 0;
        if (i90 > i10) edge.push(i90 - i10);
      }
    }
    // fill (fill.py): over the visible segment t..b of the column, relative to the column max
    let n = 0, c40 = 0, c25 = 0, sm = 0, cd = 0;
    for (let r = t; r <= b; r++) { const v = col[r] / cm; n++; if (v > 0.4) c40++; if (v > 0.25) c25++; sm += v; if (v < 0.08) cd++; }
    a40.push(c40 / n); a25.push(c25 / n); fmean.push(sm / n); dark.push(cd / n);
  }
  if (!xsUsed.length) return null;
  // partings: dark gaps inside the band hull as 4-connected components
  const lab = ras.lab; lab.fill(0); let nl = 0; const comps = [];
  const stackX = ras.stackX, stackY = ras.stackY;
  for (let x = 0; x < NC; x++) {
    if (top[x] < 0) continue; const thr = 0.08 * Math.max(colMax[x], 1e-3);
    for (let y = top[x]; y <= bot[x]; y++) {
      if (lab[x * H + y] || !(B[x * H + y] < thr)) continue;
      nl++; let sp = 0; stackX[sp] = x; stackY[sp] = y; sp++; lab[x * H + y] = nl;
      let xmin = x, xmax = x, cnt = 0, sx = 0, sy = 0;
      while (sp > 0) {
        sp--; const cx = stackX[sp], cy = stackY[sp]; cnt++; sx += cx; sy += cy; if (cx < xmin) xmin = cx; if (cx > xmax) xmax = cx;
        for (let d = 0; d < 4; d++) {
          const qx = d === 0 ? cx - 1 : d === 1 ? cx + 1 : cx, qy = d === 2 ? cy - 1 : d === 3 ? cy + 1 : cy;
          if (qx < 0 || qx >= NC || qy < 0 || qy >= H || lab[qx * H + qy] || top[qx] < 0 || qy < top[qx] || qy > bot[qx]) continue;
          if (!(B[qx * H + qy] < 0.08 * Math.max(colMax[qx], 1e-3))) continue;
          lab[qx * H + qy] = nl; stackX[sp] = qx; stackY[sp] = qy; sp++;
        }
      }
      comps.push({ len: (xmax - xmin + 1) / NC, cnt: cnt * cw, cx: sx / cnt, cy: sy / cnt, xmin, xmax });
    }
  }
  const lens = comps.filter(c => c.len >= 0.05 && c.cnt > 200).map(c => c.len);
  // thin bright lines tracked along x
  const tol = 1.5 * cw, gap = Math.max(6, 2 * cw);
  const segs = []; let active = [];
  for (let x = 0; x < NC; x++) {
    const xp = x * cw;
    if (!peakrows[x]) { active = active.filter(s => xp - s[2] <= gap); continue; }
    const p = peakrows[x]; const cand = [];
    for (let i = 0; i < p.idx.length; i++) if (p.width[i] < 12) cand.push(p.idx[i]);
    const used = new Set(); const newact = [];
    const T = top[x], Bt = bot[x], th = Math.max(Bt - T, 1);
    for (const s of active) {
      let best = -1, bd = Infinity;
      for (let k = 0; k < cand.length; k++) { if (used.has(k)) continue; const d = Math.abs(cand[k] - s[0]); if (d <= tol && d < bd) { bd = d; best = k; } }
      if (best >= 0) { used.add(best); const py = cand[best]; const outer = (py - T) / th < 0.2 || (Bt - py) / th < 0.2; newact.push([py, s[1], xp, s[3] + (outer ? 1 : 0), s[4] + 1]); }
      else if (xp - s[2] <= gap) newact.push(s);
      else segs.push(s);
    }
    for (let k = 0; k < cand.length; k++) if (!used.has(k)) { const py = cand[k]; const outer = (py - T) / th < 0.2 || (Bt - py) / th < 0.2; newact.push([py, xp, xp, outer ? 1 : 0, 1]); }
    active = newact;
  }
  segs.push(...active);
  const seglen = segs.map(s => (s[2] - s[1]) / W), outer = segs.map(s => s[3] / Math.max(s[4], 1));
  const long10 = [], long25 = [], outer10 = [];
  for (let i = 0; i < segs.length; i++) { if (seglen[i] >= 0.10) { long10.push(seglen[i]); outer10.push(outer[i]); } if (seglen[i] >= 0.25) long25.push(seglen[i]); }
  const n = xsUsed.length;
  const third = (lo, hi) => { const v = []; for (let i = 0; i < n; i++) { const f = xsUsed[i] / NC; if (f >= lo && f < hi) v.push(npk12[i]); } return mean(v); };
  const hist = []; for (let k = 1; k <= 6; k++) hist.push(100 * npk12.filter(v => v === k).length / n); hist.push(100 * npk12.filter(v => v >= 7).length / n);
  const topMin = Math.min(...xsUsed.map(x => top[x])) / H, botMax = Math.max(...xsUsed.map(x => bot[x])) / H;
  const n20 = Math.min(20, centre.length);
  const cl = mean(centre.slice(0, n20)), cr = mean(centre.slice(-n20));
  let arch = 0; for (let i = 0; i < centre.length; i++) { const lin = cl + (cr - cl) * i / Math.max(centre.length - 1, 1); arch = Math.max(arch, Math.abs(centre[i] - lin)); }
  const wd = widths, wl = wd.filter(w => w < 15), ws = wd.filter(w => w >= 15);
  return {
    fmax,
    centre: median(centre), centreMin: Math.min(...centre), centreMax: Math.max(...centre), topMin, botMax, tilt: cr - cl, arch,
    thick: median(thick), thickP10: pct(thick, 10), thickP90: pct(thick, 90), thickRatio: pct(thick, 95) / Math.max(pct(thick, 5), 1e-3),
    pinch8: 100 * thick.filter(v => v < 0.08).length / n, pinch5: 100 * thick.filter(v => v < 0.05).length / n,
    peaks12: mean(npk12), hist, peaks25: mean(npk25), peaks40: mean(npk40), thirds: [third(0, 1 / 3), third(1 / 3, 2 / 3), third(2 / 3, 1.01)],
    face: median(face), faceP10: pct(face, 10), faceP90: pct(face, 90),
    foldface: median(foldface), foldfaceP90: pct(foldface, 90), avgface: median(avgface), overlap: median(overlap),
    widthLines: median(wl), widthAll: median(wd), widthSheen: median(ws), bwidth: median(bwidths),
    edge: median(edge), edgeP10: pct(edge, 10), edgeP90: pct(edge, 90),
    partcol: mean(part), partings: lens.length, partLen: median(lens), partMax: lens.length ? Math.max(...lens) : NaN,
    lines10: long10.length, lines25: long25.length, lineLen: median(long10), outer: mean(outer10), linepk: median(linepk),
    a40: mean(a40), a25: mean(a25), fmean: mean(fmean), dark: mean(dark),
    ncols: n,
  };
}

// ------------------------------------------------------------------ spec46m-like motion statistics on a sequence of rasters
// frames: array of { B (blurred raster NC x H), NC, H, cw }; fps; W: px width the x-speeds are quoted at (1920); Hq: px height for y speeds (1080)
function motionStats(frames, fps, ras) {
  const { NC, H, cw } = ras; const nF = frames.length; const sx = 1920 / NC; // px at 1920 per bin
  const k1 = Math.round(fps);
  // centres per column per frame
  const C = frames.map(B => {
    let fmax = 0; for (let i = 0; i < B.length; i++) if (B[i] > fmax) fmax = B[i];
    const c = new Float64Array(NC).fill(NaN);
    for (let x = 0; x < NC; x++) {
      let cm = 0; for (let r = 0; r < H; r++) if (B[x * H + r] > cm) cm = B[x * H + r];
      if (cm < Math.max(6, 0.08 * fmax)) continue;
      const thr = Math.max(3, 0.06 * cm); let t = -1, b = -1;
      for (let r = 0; r < H; r++) if (B[x * H + r] > thr) { if (t < 0) t = r; b = r; }
      c[x] = (t + b) / 2 / H;
    }
    return c;
  });
  const dv = [];
  for (let i = 0; i + k1 < nF; i++) for (let x = 0; x < NC; x++) { const d = Math.abs(C[i + k1][x] - C[i][x]); if (!Number.isNaN(d)) dv.push(d); }
  const m = C.map(c => nanmean(c));
  const n40 = Math.min(nF - 1, Math.round(40 * fps)); let mx = -Infinity, mn = Infinity; for (let i = 0; i <= n40; i++) { if (m[i] > mx) mx = m[i]; if (m[i] < mn) mn = m[i]; }
  const k5 = Math.round(5 * fps); const drift5 = []; for (let i = 0; i + k5 < nF; i++) drift5.push(Math.abs(m[i + k5] - m[i]) / 5);
  // swell shift: best shift of the centre-line profile 1 s later
  const shifts = [];
  for (let t0 = 0; t0 + k1 < nF; t0 += k1) {
    const a = C[t0], b = C[t0 + k1], ma = nanmean(a), mb = nanmean(b); let best = null;
    const maxdx = Math.floor(0.25 * NC);
    for (let dx = -maxdx; dx <= maxdx; dx++) {
      const lo = Math.max(0, -dx), hi = Math.min(NC, NC - dx);
      let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let x = lo; x < hi; x++) { const u = a[x] - ma, v = b[x + dx] - mb; if (Number.isNaN(u) || Number.isNaN(v)) continue; n++; sa += u; sb += v; saa += u * u; sbb += v * v; sab += u * v; }
      if (n < NC * 0.3) continue;
      const cov = sab / n - (sa / n) * (sb / n), va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
      const cc = cov / Math.sqrt(Math.max(va * vb, 1e-18));
      if (best === null || cc > best[0]) best = [cc, dx];
    }
    if (best) shifts.push(best[1] / NC);
  }
  // picture correlation after 1 s / 5 s within the band region
  const corr = (A, Bf) => {
    let amax = 0, bmax = 0; for (let i = 0; i < A.length; i++) { if (A[i] > amax) amax = A[i]; if (Bf[i] > bmax) bmax = Bf[i]; }
    let n = 0, sa = 0, sb = 0; for (let i = 0; i < A.length; i++) if (A[i] > 0.06 * amax || Bf[i] > 0.06 * bmax) { n++; sa += A[i]; sb += Bf[i]; }
    const ma = sa / n, mb = sb / n; let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < A.length; i++) if (A[i] > 0.06 * amax || Bf[i] > 0.06 * bmax) { const u = A[i] - ma, v = Bf[i] - mb; sab += u * v; saa += u * u; sbb += v * v; }
    return sab / Math.sqrt(saa * sbb);
  };
  const c1s = [], c5s = [];
  for (let i = 0; i + k1 < nF; i += k1) c1s.push(corr(frames[i], frames[i + k1]));
  for (let i = 0; i + k5 < nF; i += k5) c5s.push(corr(frames[i], frames[i + k5]));
  // strand coherence: adjacent peaks' vertical speed difference over ~0.3 s (sub-pixel), in px/s at 1080p
  const kd = Math.max(1, Math.round(0.3 * fps)); const diffs = [], speeds = [];
  const subpix = (c, p) => { if (p > 0 && p < H - 1) { const den = c[p - 1] - 2 * c[p] + c[p + 1]; if (den < 0) return p + 0.5 * (c[p - 1] - c[p + 1]) / den; } return p; };
  const colA = new Float64Array(H), colB = new Float64Array(H);
  const xstep = Math.max(1, Math.floor(NC / 120));
  for (let i = 0; i + kd < nF; i++) {
    const A = frames[i], Bf = frames[i + kd];
    for (let x = 0; x < NC; x += xstep) {
      let ma = 0, mb = 0;
      for (let r = 0; r < H; r++) { colA[r] = A[x * H + r]; colB[r] = Bf[x * H + r]; if (colA[r] > ma) ma = colA[r]; if (colB[r] > mb) mb = colB[r]; }
      if (ma < 6 || mb < 6) continue;
      const pa = findPeaks(colA, H, 0.12 * ma).idx, pb = findPeaks(colB, H, 0.12 * mb).idx;
      if (pa.length < 2 || pb.length < 1) continue;
      const v = [];
      for (const p of pa) {
        let j = 0; for (let q = 1; q < pb.length; q++) if (Math.abs(pb[q] - p) < Math.abs(pb[j] - p)) j = q;
        if (Math.abs(pb[j] - p) <= 10 * H / 1080) v.push((subpix(colB, pb[j]) - subpix(colA, p)) * fps / kd * 1080 / H); else v.push(NaN);
      }
      for (let q = 0; q + 1 < v.length; q++) if (!Number.isNaN(v[q]) && !Number.isNaN(v[q + 1])) { diffs.push(Math.abs(v[q] - v[q + 1])); speeds.push(Math.abs(v[q]), Math.abs(v[q + 1])); }
    }
  }
  // partings tracked between frames
  const partings = (B) => {
    let fmax = 0; for (let i = 0; i < B.length; i++) if (B[i] > fmax) fmax = B[i];
    const top = new Int32Array(NC).fill(-1), bot = new Int32Array(NC).fill(-1), cmx = new Float64Array(NC);
    for (let x = 0; x < NC; x++) {
      let cm = 0; for (let r = 0; r < H; r++) if (B[x * H + r] > cm) cm = B[x * H + r]; cmx[x] = cm;
      if (cm < Math.max(6, 0.08 * fmax)) continue;
      const thr = Math.max(3, 0.06 * cm); let t = -1, b = -1;
      for (let r = 0; r < H; r++) if (B[x * H + r] > thr) { if (t < 0) t = r; b = r; }
      top[x] = t; bot[x] = b;
    }
    const lab = new Uint8Array(NC * H); const out = [];
    const stX = [], stY = [];
    // pixel count threshold: spec46m uses len(xs) > 40 * (w/1920)^2 * 4 at the frame's own resolution; our raster pixel is (1920/NC x 1080/H) at 1080p
    const cntMin = 160 * (NC / 1920) * (H / 1080); // 160 px^2 at 1080p
    for (let x = 0; x < NC; x++) {
      if (top[x] < 0) continue;
      for (let y = top[x]; y <= bot[x]; y++) {
        if (lab[x * H + y] || !(B[x * H + y] < 0.08 * Math.max(cmx[x], 1e-3))) continue;
        lab[x * H + y] = 1; stX.length = 0; stY.length = 0; stX.push(x); stY.push(y);
        let xmin = x, xmax = x, cnt = 0, sx_ = 0, sy_ = 0;
        while (stX.length) {
          const cx = stX.pop(), cy = stY.pop(); cnt++; sx_ += cx; sy_ += cy; if (cx < xmin) xmin = cx; if (cx > xmax) xmax = cx;
          for (let d = 0; d < 4; d++) {
            const qx = d === 0 ? cx - 1 : d === 1 ? cx + 1 : cx, qy = d === 2 ? cy - 1 : d === 3 ? cy + 1 : cy;
            if (qx < 0 || qx >= NC || qy < 0 || qy >= H || lab[qx * H + qy] || top[qx] < 0 || qy < top[qx] || qy > bot[qx]) continue;
            if (!(B[qx * H + qy] < 0.08 * Math.max(cmx[qx], 1e-3))) continue;
            lab[qx * H + qy] = 1; stX.push(qx); stY.push(qy);
          }
        }
        if ((xmax - xmin + 1) / NC >= 0.03 && cnt > cntMin) out.push([sx_ / cnt, sy_ / cnt]);
      }
    }
    return out;
  };
  const P = frames.map(partings);
  const alive = new Map(); let nextid = 0; const tracks = new Map(); const lifetimes = [], fspeed = [];
  for (let i = 0; i < nF; i++) {
    const cur = P[i]; const assigned = new Map();
    for (const [tid, st] of [...alive.entries()]) {
      if (st.last !== i - 1) continue;
      let best = -1, bd = Infinity;
      for (let j = 0; j < cur.length; j++) { if ([...assigned.values()].includes(j)) continue; const d2 = Math.hypot(cur[j][0] - st.x, (cur[j][1] - st.y) * 3); if (d2 < 0.05 * NC && d2 < bd) { bd = d2; best = j; } }
      if (best >= 0) { assigned.set(tid, best); if (!tracks.has(tid)) tracks.set(tid, []); tracks.get(tid).push([i, cur[best][0]]); alive.set(tid, { last: i, start: st.start, x: cur[best][0], y: cur[best][1] }); }
    }
    for (const [tid, st] of [...alive.entries()]) if (st.last < i - 1) { lifetimes.push((st.last - st.start + 1) / fps); alive.delete(tid); }
    for (let j = 0; j < cur.length; j++) if (![...assigned.values()].includes(j)) { alive.set(nextid++, { last: i, start: i, x: cur[j][0], y: cur[j][1] }); }
  }
  for (const st of alive.values()) lifetimes.push((st.last - st.start + 1) / fps);
  for (const tr of tracks.values()) if (tr.length >= Math.round(0.5 * fps)) fspeed.push((tr[tr.length - 1][1] - tr[0][1]) / ((tr[tr.length - 1][0] - tr[0][0]) / fps) * sx);
  return {
    cspeed: median(dv), cspeedP90: pct(dv, 90), ch40: mx - mn, drift5: median(drift5),
    shift: median(shifts), shiftP10: pct(shifts, 10), shiftP90: pct(shifts, 90), crossing: 1 / Math.max(Math.abs(median(shifts)), 1e-3),
    corr1: mean(c1s), corr5: mean(c5s), adjdiff: median(diffs), pkspeed: median(speeds),
    pspeed: median(fspeed.map(Math.abs)), pright: mean(fspeed.map(v => v > 0 ? 1 : 0)), npart: fspeed.length,
    lifeMed: median(lifetimes), lifeMax: lifetimes.length ? Math.max(...lifetimes) : NaN, nlife: lifetimes.length,
  };
}

// ------------------------------------------------------------------ driving the simulation
function makeShade(mood) { return { bright: mood.waveBright, base: mood.base, baseC: mood.baseC, baseK: mood.baseK, edge: mood.edge, edgeC: mood.edgeC }; }

// A page-derived evaluator. tune: dotted-path overrides for the sim tunables (NET.noise, LAT.sways.2.2, SCENE.wid ...),
// moodOver: overrides of the day mood (camPitch, envCross, ...).
function makeSim(page, seed, tune, moodOver, aspect, fast) {
  const M = fast ? page.XMBW_SIM_FAST() : page.XMBW_SIM();
  if (tune) M.setTunables(tune);
  const mood = Object.assign({}, page.mood, moodOver || {});
  const cam = page.cameraFor(mood.camPitch, aspect || 16 / 9);
  const sim = M.createSim(seed);
  sim.setMood({ envCross: mood.envCross, latScale: [mood.latX, mood.latY, mood.latZ], camFwd: cam.fwd });
  sim.warm(sim.warmSteps);
  return { sim, cam, mood, M };
}

module.exports = { loadPage, Raster, frameStats, motionStats, makeSim, makeShade, findPeaks, median, pct, mean, bsp };
