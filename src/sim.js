// Simulation module: the wave's spring net, its free-form deformation, and the
// sparkle pool. Pure JavaScript with no DOM access, so the same source runs in a
// Web Worker (normal mode) and on the main thread (deterministic score mode).
function XMBW_SIM() {
  'use strict';
  const N = 19;            // control grid, N x N points
  const DT = 1 / 60;       // fixed step
  const H = 1 / (N - 1);   // grid spacing in net units (the net is a unit square)

  // ---- tunables (all original design values) ----
  const NET = {
    kStruct: 0.2104, kBend: 0.9809,    // spring constants along the length (unit masses); the bending springs are about
                                    // four and a half times stiffer than the direct ones
    alongRest: 1.0,                 // rest length of the along-springs relative to the grid spacing: 1.0 keeps the
                                    // sheet smooth; above 1 the slack buckles into standing wrinkles (wirier than the reference)
    acrossK: 1.064,                 // the across-the-width springs are comparable to the along ones (a little stiffer); with the
                                    // stiffer bending springs this makes the picture hold together longer from second to second
    damping: 0.004709,                 // fraction of velocity removed per step (low, so the folds persist along the length)
    noise: 0.0003545,                  // velocity kick per step (std dev). Besides keeping the motion alive, the kicks set how
                                    // many strands the band shows: the across-the-width springs have no linear stiffness at
                                    // rest length, so the kicks drive neighbouring rows apart into separate strands; 3.5e-4 gives
                                    // the reference's 3-4 brightness peaks and about 0.8 dark partings per column, 2e-5 a broad
                                    // ribbon of two or three layers whose lines stand too high above the band; much larger values
                                    // make the net jitter and the fold lines stipple
    push: 0.005034,                    // steady gentle pull on the free end, along the length, so the sheet stays extended
    driveA: 0.05763, driveW1: 0.364,   // driven end: height amplitude, angular frequency (one plain oscillation)
    driveB: 0.07898, driveW2: 0.1408,   // driven end: depth amplitude, angular frequency
    drivePhase1: 1.225, drivePhase2: 2.032,  // phase change per row for height and depth: the driven points are strung out along the
                                          // shared path (about 1.1 cycles across the edge in height, 2.4 in depth); the depth offset builds up more
                                          // than the height offset, and that difference between the axes is what makes the folds cross
    driveEase: 0.02,                // easing of the driving clock towards sim time
    envLow: 0.85, envWidth: 0.30,   // envelope along the length: subdued level, transition half-width
    warm: 6000,                     // warm-up steps before frame 0, at least; the lightly damped net needs several decay times
                                    // to settle into its running state, so the warm-up runs at least four of them
    warmSettle: 1500,               // the first warm-up steps run with heavy damping, to clear the flat start quickly
  };
  // Free-form deformation lattice: more cells along the length than across or in depth.
  const LAT = { nu: 10, nv: 4, nw: 4,
    spread: 3.513,                    // uneven layout along the length: the cells at the free end are this many times longer than
                                    // at the shaken end (fixed), so the free end of the net covers far more of the scene
    // The vertical displacement is the sum of four slow parts, computed directly from the clock (rates in rad/s):
    // a wave rolling from the shaken end to the free end, growing along the length, whose strength swells and fades.
    // It is the swell: its crest crossing the screen is the band's slow left-to-right rise and fall
    rollAmp: 0.01262, rollGrow: 3.866, rollWaves: 1.3, rollW: 0.50, rollMod: 0.35, rollModW: 0.041,
    // one soft hump sliding back and forth along the length (centre and travel as fractions of the length; part of
    // its travel lies beyond the shaken end)
    bumpAmp: 0.01146, bumpWidth: 0.25, bumpCentre: 0.25, bumpTravel: 0.5, bumpW: 0.037,
    bobAmp: 0.012, bobW: 0.071,     // the whole sheet rising and falling together, much more slowly than the swell
    twistAmp: 0.03137, twistW: 0.21,  // a gentle ripple, one cycle across the width, travelling across it
  };
  // Scene mapping of the deformed net (scene units; x along the length, y up, z away).
  const SCENE = { len: 9.879, x0: 0.3146, wid: 5.352, height: 7.0, y0: 0.05, z0: 0.0, tilt: 0.0 }; // tilt: rise per unit length towards the near end

  const SPARK = {
    pool: 2000,
    burstP: 0.30, burstMin: 1, burstMax: 9,        // per step
    walkers: 6, walkerP: 0.05, walkMin: 40, walkMax: 220, walkStep: 0.045, // patches per step
    cone: 1.1, reverseP: 0.12,
    speedK: 0.24, speedPow: 0.5, speedMin: 0.027, // scene units / s: on screen about as fast as the band's lines rise and fall
    rateMean: 1 / 6.5, rateSpread: 0.30, rateMin: 1 / 14, // life per second
    rampIn: 0.06, rampOut: 0.16,
    jitter: 0.003, gravity: 0.0002, friction: 0.0,  // per second units: a sparkle keeps the velocity it is flung with
    upLean: 0.12,                                   // share of downward-flung sparkles turned round, so slightly more rise than fall
    spinA: 2.2, spinF: [0.21, 0.37],                // rad/s amplitude, oscillation freq range (rad/s)
    box: [[-7, 7], [-3.0, 3.2], [-3.5, 5.0]],
  };
  const SPARK_STRIDE = 11; // prev xyz, cur xyz, facing xyz, opacity, random

  function mulberry(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0; let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash32(a) {
    a |= 0; a = (a ^ 61) ^ (a >>> 16); a = Math.imul(a, 9); a ^= a >>> 4;
    a = Math.imul(a, 0x27d4eb2d); a ^= a >>> 15; return a >>> 0;
  }

  // Uniform cubic B-spline basis and derivative.
  function bsp(t, out) {
    const t2 = t * t, t3 = t2 * t, u = 1 - t;
    out[0] = u * u * u / 6; out[1] = (3 * t3 - 6 * t2 + 4) / 6;
    out[2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6; out[3] = t3 / 6;
    return out;
  }

  // Live tuning from the settings menu: values maps dotted paths into the tunables
  // above ('NET.kStruct', 'LAT.rollW', ...) to numbers. Only a number that
  // already exists is set, so a stale or mistyped key does nothing. Sizes fixed at
  // creation (the pool, the lattice cells, the walker count) are not tunable.
  const TUNABLES = { NET, LAT, SCENE, SPARK };
  function setTunables(values) {
    for (const path in values) {
      const p = path.split('.'); let o = TUNABLES[p[0]];
      for (let i = 1; o != null && i < p.length - 1; i++) o = o[p[i]];
      const k = p[p.length - 1], v = values[path];
      if (o != null && typeof o[k] === 'number' && typeof v === 'number' && isFinite(v)) o[k] = v;
    }
  }

  function createSim(seed) {
    const rng = mulberry(hash32(seed ^ 0x5eed1234) ^ 0x9e3779b9);
    const gauss = () => { let u = rng(); if (u < 1e-12) u = 1e-12; return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307179586 * rng()); };
    const NP = N * N;
    const pos = new Float64Array(NP * 3), vel = new Float64Array(NP * 3), acc = new Float64Array(NP * 3);
    const rest = new Float64Array(NP * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 3; rest[k] = i * H; rest[k + 1] = 0; rest[k + 2] = j * H;
      pos[k] = rest[k]; pos[k + 2] = rest[k + 2];
    }
    // springs: [a, b, rest, k]
    const springs = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * N + i;
      if (i + 1 < N) springs.push([a, a + 1, H * NET.alongRest, NET.kStruct]);
      if (j + 1 < N) springs.push([a, a + N, H, NET.kStruct * NET.acrossK]);
      if (i + 2 < N) springs.push([a, a + 2, 2 * H * NET.alongRest, NET.kBend]);
      if (j + 2 < N) springs.push([a, a + 2 * N, 2 * H, NET.kBend * NET.acrossK]);
    }
    const SA = Int32Array.from(springs.map(s => s[0])), SB = Int32Array.from(springs.map(s => s[1]));
    const SR = Float64Array.from(springs.map(s => s[2])), SK = Float64Array.from(springs.map(s => s[3]));
    // Re-derive the rest lengths and spring constants from NET after a live change
    // of the tunables (the same order and expressions as above).
    function rebuildSprings() {
      let s = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (i + 1 < N) { SR[s] = H * NET.alongRest; SK[s] = NET.kStruct; s++; }
        if (j + 1 < N) { SR[s] = H; SK[s] = NET.kStruct * NET.acrossK; s++; }
        if (i + 2 < N) { SR[s] = 2 * H * NET.alongRest; SK[s] = NET.kBend; s++; }
        if (j + 2 < N) { SR[s] = 2 * H; SK[s] = NET.kBend * NET.acrossK; s++; }
      }
    }

    // lattice displacement values (vertical)
    const NL = LAT.nu * LAT.nv * LAT.nw;
    const lat = new Float64Array(NL);
    const latPh = [rng() * 6.2832, rng() * 6.2832, rng() * 6.2832, rng() * 6.2832, rng() * 6.2832];

    let simTime = rng() * 1000, driveT = simTime, steps = 0;
    const mood = { envCross: 0.55, latScale: [1, 1, 1], camFwd: [-0.34, -0.12, 0.93] };

    // deformed scene-space nets (previous and current step)
    let netPrev = new Float32Array(NP * 3), netCur = new Float32Array(NP * 3);

    // sparkle pool
    const S = SPARK.pool;
    const sp = new Float64Array(S * 3), sv = new Float64Array(S * 3), spPrev = new Float64Array(S * 3);
    const sq = new Float64Array(S * 4), sAge = new Float64Array(S), sRate = new Float64Array(S);
    const sSpin = new Float64Array(S * 6), sRnd = new Float64Array(S);
    const alive = new Uint8Array(S);
    const free = new Int32Array(S); let nFree = S;
    for (let i = 0; i < S; i++) free[i] = S - 1 - i;
    const walkers = [];
    for (let w = 0; w < SPARK.walkers; w++) walkers.push({ on: false, s: 0, t: 0, dir: 1, left: 0 });

    function lattice() {
      const T = simTime, L = LAT;
      const roll = L.rollAmp * (1 + L.rollMod * Math.sin(L.rollModW * T + latPh[0]));
      const ub = L.bumpCentre + L.bumpTravel * Math.sin(L.bumpW * T + latPh[1]);
      const bob = L.bobAmp * Math.sin(L.bobW * T + latPh[2]);
      for (let iw = 0; iw < L.nw; iw++) for (let iv = 0; iv < L.nv; iv++) for (let iu = 0; iu < L.nu; iu++) {
        // the cell's position as a fraction of the net's length (0 at the shaken end) and of its width
        const fx = (iu - 1) / (L.nu - 3) * 1.2 - 0.1, fz = (iw - 1) / (L.nw - 3) * 1.2 - 0.1;
        const du = (fx - ub) / (0.5 * L.bumpWidth);
        const k = (iw * L.nv + iv) * L.nu + iu;
        lat[k] = roll * (1 + L.rollGrow * fx) * Math.sin(6.2832 * L.rollWaves * fx - L.rollW * T + latPh[3])
          + L.bumpAmp * Math.exp(-du * du) + bob
          + L.twistAmp * Math.sin(6.2832 * fz - L.twistW * T + latPh[4]);
      }
    }
    // fixed uneven layout along the length: net fraction -> scene fraction, cell length growing by 'spread' end to end
    function layout(x) { const a = Math.log(Math.max(LAT.spread, 1.0001)); return Math.expm1(a * x) / Math.expm1(a); }

    const bu = [0, 0, 0, 0], bv = [0, 0, 0, 0], bw = [0, 0, 0, 0];
    function ffd(u, v, w) { // tricubic B-spline blend of lattice values at normalised coords
      const fu = Math.min(Math.max(u, 0), 1) * (LAT.nu - 3), fv = Math.min(Math.max(v, 0), 1) * (LAT.nv - 3), fw = Math.min(Math.max(w, 0), 1) * (LAT.nw - 3);
      const iu = Math.min(Math.floor(fu), LAT.nu - 4), iv = Math.min(Math.floor(fv), LAT.nv - 4), iw = Math.min(Math.floor(fw), LAT.nw - 4);
      bsp(fu - iu, bu); bsp(fv - iv, bv); bsp(fw - iw, bw);
      let d = 0;
      for (let c = 0; c < 4; c++) for (let b = 0; b < 4; b++) {
        const wbc = bv[b] * bw[c]; const base = ((iw + c) * LAT.nv + (iv + b)) * LAT.nu + iu;
        d += wbc * (bu[0] * lat[base] + bu[1] * lat[base + 1] + bu[2] * lat[base + 2] + bu[3] * lat[base + 3]);
      }
      return d;
    }
    function smooth(e0, e1, x) { const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t); }

    // net -> envelope -> FFD -> scene
    function deform(out) {
      const ls = mood.latScale;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = (j * N + i) * 3;
        const fx = i / (N - 1);
        const env = NET.envLow + (1 - NET.envLow) * smooth(mood.envCross - NET.envWidth, mood.envCross + NET.envWidth, fx);
        const x = pos[k];
        const y = (pos[k + 1] - rest[k + 1]) * env;
        const z = rest[k + 2] + (pos[k + 2] - rest[k + 2]) * env;
        // lattice normalised coords: the lattice spans the net's region with a margin
        const u = (x + 0.1) / 1.2, v = (y + 0.5), w = (z + 0.1) / 1.2;
        const dy = ffd(u, v, w);
        out[k] = ((layout(x) - 0.5) * SCENE.len + SCENE.x0) * ls[0];
        out[k + 1] = (y + dy) * SCENE.height * ls[1] + SCENE.y0 + SCENE.tilt * out[k];
        out[k + 2] = (z - 0.5) * SCENE.wid * ls[2] + SCENE.z0;
      }
    }

    function stepNet() {
      acc.fill(0);
      for (let s = 0; s < SA.length; s++) {
        const a = SA[s] * 3, b = SB[s] * 3;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const f = SK[s] * (L - SR[s]) / L;
        acc[a] += f * dx; acc[a + 1] += f * dy; acc[a + 2] += f * dz;
        acc[b] -= f * dx; acc[b + 1] -= f * dy; acc[b + 2] -= f * dz;
      }
      for (let j = 0; j < N; j++) acc[(j * N + N - 1) * 3] += NET.push; // free end i = N-1, pulled outwards
      for (let p = 0; p < N * N; p++) {
        const k = p * 3;
        vel[k] += acc[k] * DT + NET.noise * gauss();
        vel[k + 1] += acc[k + 1] * DT + NET.noise * gauss();
        vel[k + 2] += acc[k + 2] * DT + NET.noise * gauss();
        pos[k] += vel[k] * DT; pos[k + 1] += vel[k + 1] * DT; pos[k + 2] += vel[k + 2] * DT;
        vel[k] *= 1 - NET.damping; vel[k + 1] *= 1 - NET.damping; vel[k + 2] *= 1 - NET.damping;
      }
      // driven end i = 0 (the far end), placed kinematically. Every row's driven point lies on the one shared path
      // (height and depth oscillations about the middle of the edge), only earlier or later along it, so the driven
      // end acts like a single point moving along a path and gathers that end of the sheet across its width
      driveT += (simTime - driveT) * NET.driveEase;
      for (let j = 0; j < N; j++) {
        const k = (j * N) * 3;
        pos[k] = rest[k];
        pos[k + 1] = NET.driveA * Math.sin(NET.driveW1 * driveT + j * NET.drivePhase1);
        pos[k + 2] = 0.5 + NET.driveB * Math.sin(NET.driveW2 * driveT + j * NET.drivePhase2 + 1.3);
        vel[k] = vel[k + 1] = vel[k + 2] = 0;
      }
    }

    // B-spline surface evaluation on a deformed net: s in [0, N-3] along, t in [0, N-3] across.
    const es = [0, 0, 0, 0], et = [0, 0, 0, 0];
    function surf(net, s, t, out) {
      const is = Math.min(Math.max(Math.floor(s), 0), N - 4), it = Math.min(Math.max(Math.floor(t), 0), N - 4);
      bsp(s - is, es); bsp(t - it, et);
      let x = 0, y = 0, z = 0;
      for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) {
        const w = es[a] * et[b], k = ((it + b) * N + is + a) * 3;
        x += w * net[k]; y += w * net[k + 1]; z += w * net[k + 2];
      }
      out[0] = x; out[1] = y; out[2] = z; return out;
    }

    const P0 = [0, 0, 0], P1 = [0, 0, 0];
    function birth(s, t) {
      if (nFree === 0) return;
      surf(netPrev, s, t, P0); surf(netCur, s, t, P1);
      let dx = P1[0] - P0[0], dy = P1[1] - P0[1], dz = P1[2] - P0[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-7) return;
      dx /= d; dy /= d; dz /= d;
      // spread within a cone: add a random perpendicular-ish offset
      const c = SPARK.cone;
      dx += c * gauss() * 0.5; dy += c * gauss() * 0.5; dz += c * gauss() * 0.5;
      if (rng() < SPARK.reverseP) { dx = -dx; dy = -dy; dz = -dz; }
      if (dy < 0 && rng() < SPARK.upLean) { dx = -dx; dy = -dy; dz = -dz; }
      const f = mood.camFwd, along = dx * f[0] + dy * f[1] + dz * f[2];
      dx -= along * f[0]; dy -= along * f[1]; dz -= along * f[2];
      const n = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (n < 1e-6) return;
      const speed = Math.max(SPARK.speedMin, SPARK.speedK * Math.pow(d / DT, SPARK.speedPow)) * (0.6 + 0.8 * rng());
      const i = free[--nFree];
      alive[i] = 1;
      const k = i * 3;
      sp[k] = spPrev[k] = P1[0]; sp[k + 1] = spPrev[k + 1] = P1[1]; sp[k + 2] = spPrev[k + 2] = P1[2];
      sv[k] = dx / n * speed; sv[k + 1] = dy / n * speed; sv[k + 2] = dz / n * speed;
      sAge[i] = 0;
      sRate[i] = Math.max(SPARK.rateMin, SPARK.rateMean * (1 + SPARK.rateSpread * gauss()));
      // random initial orientation
      let qx = gauss(), qy = gauss(), qz = gauss(), qw = gauss();
      const qn = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) || 1;
      sq[i * 4] = qx / qn; sq[i * 4 + 1] = qy / qn; sq[i * 4 + 2] = qz / qn; sq[i * 4 + 3] = qw / qn;
      for (let a = 0; a < 3; a++) {
        sSpin[i * 6 + a] = SPARK.spinF[0] + (SPARK.spinF[1] - SPARK.spinF[0]) * rng();
        sSpin[i * 6 + 3 + a] = rng() * 6.2832;
      }
      sRnd[i] = rng();
    }
    function randPoint() { return [rng() * (N - 3), rng() * (N - 3)]; }

    function emit() {
      if (rng() < SPARK.burstP) {
        const n = SPARK.burstMin + Math.floor(rng() * (SPARK.burstMax - SPARK.burstMin + 1));
        for (let b = 0; b < n; b++) { const p = randPoint(); birth(p[0], p[1]); }
      }
      for (const w of walkers) {
        if (!w.on) {
          if (rng() < SPARK.walkerP) {
            const p = randPoint(); w.on = true; w.s = p[0]; w.t = p[1];
            w.dir = rng() < 0.5 ? -1 : 1; w.left = SPARK.walkMin + Math.floor(rng() * (SPARK.walkMax - SPARK.walkMin));
          }
          continue;
        }
        birth(w.s, w.t);
        w.s += w.dir * SPARK.walkStep;
        if (--w.left <= 0 || w.s < 0 || w.s > N - 3) w.on = false;
      }
    }

    function stepSparks() {
      const fr = SPARK.friction, g = SPARK.gravity, jit = SPARK.jitter, box = SPARK.box;
      for (let i = 0; i < S; i++) {
        if (!alive[i]) continue;
        const k = i * 3;
        spPrev[k] = sp[k]; spPrev[k + 1] = sp[k + 1]; spPrev[k + 2] = sp[k + 2];
        const ax = jit * gauss() - fr * sv[k], ay = jit * gauss() - g - fr * sv[k + 1], az = jit * gauss() - fr * sv[k + 2];
        sv[k] += ax * DT; sv[k + 1] += ay * DT; sv[k + 2] += az * DT;
        sp[k] += sv[k] * DT; sp[k + 1] += sv[k + 1] * DT; sp[k + 2] += sv[k + 2] * DT;
        sAge[i] += sRate[i] * DT;
        // spin: angular velocity oscillating slowly with age
        const age = sAge[i] / sRate[i];
        const wx = SPARK.spinA * Math.sin(sSpin[i * 6] * age + sSpin[i * 6 + 3]);
        const wy = SPARK.spinA * Math.sin(sSpin[i * 6 + 1] * age + sSpin[i * 6 + 4]);
        const wz = SPARK.spinA * Math.sin(sSpin[i * 6 + 2] * age + sSpin[i * 6 + 5]);
        const q = i * 4, x = sq[q], y = sq[q + 1], z = sq[q + 2], w = sq[q + 3], h = 0.5 * DT;
        let nx = x + h * (wx * w + wy * z - wz * y), ny = y + h * (wy * w + wz * x - wx * z);
        let nz = z + h * (wz * w + wx * y - wy * x), nw = w - h * (wx * x + wy * y + wz * z);
        const n = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
        sq[q] = nx / n; sq[q + 1] = ny / n; sq[q + 2] = nz / n; sq[q + 3] = nw / n;
        if (sAge[i] >= 1 || sp[k] < box[0][0] || sp[k] > box[0][1] || sp[k + 1] < box[1][0] ||
            sp[k + 1] > box[1][1] || sp[k + 2] < box[2][0] || sp[k + 2] > box[2][1]) {
          alive[i] = 0; free[nFree++] = i;
        }
      }
    }

    function step() {
      simTime += DT; steps++;
      lattice();
      stepNet();
      const t = netPrev; netPrev = netCur; netCur = t;
      deform(netCur);
      stepSparks();
      emit();
    }

    // Pack the alive sparkles for drawing.
    function packSparks(out) {
      let n = 0;
      for (let i = 0; i < S; i++) {
        if (!alive[i]) continue;
        const k = i * 3, o = n * SPARK_STRIDE, a = sAge[i];
        out[o] = spPrev[k]; out[o + 1] = spPrev[k + 1]; out[o + 2] = spPrev[k + 2];
        out[o + 3] = sp[k]; out[o + 4] = sp[k + 1]; out[o + 5] = sp[k + 2];
        // facing = q * (0, 0, 1)
        const q = i * 4, x = sq[q], y = sq[q + 1], z = sq[q + 2], w = sq[q + 3];
        out[o + 6] = 2 * (x * z + w * y); out[o + 7] = 2 * (y * z - w * x); out[o + 8] = 1 - 2 * (x * x + y * y);
        const op = Math.min(1, a / SPARK.rampIn) * Math.min(1, (1 - a) / SPARK.rampOut);
        out[o + 9] = op * op * (3 - 2 * op);
        out[o + 10] = sRnd[i];
        n++;
      }
      return n;
    }

    function setMood(m) {
      if (m.envCross != null) mood.envCross = m.envCross;
      if (m.latScale) mood.latScale = m.latScale.slice();
      if (m.camFwd) mood.camFwd = m.camFwd.slice();
    }

    lattice();
    deform(netCur); netPrev.set(netCur);
    return {
      N, DT, SPARK_STRIDE, pool: S,
      step, setMood, packSparks, surf,
      get netPrev() { return netPrev; }, get netCur() { return netCur; },
      get steps() { return steps; },
      // Warm-up: the net alone (heavily damped at first, to clear the flat start), then the full step for the last
      // 15 s so the sparkles are populated as in a running state.
      warm(n) {
        const d = NET.damping;
        n = Math.max(n, NET.warmSettle + Math.ceil(4 / Math.max(d, 1e-5)) + 900);
        for (let i = 0; i < n; i++) {
          NET.damping = i < NET.warmSettle ? Math.max(d, 0.02) : d;
          if (i < n - 900) { simTime += DT; lattice(); stepNet(); } else step();
        }
        NET.damping = d; steps = 0;
      },
      warmSteps: NET.warm,
      tune(values) { setTunables(values); rebuildSprings(); }, // live changes from the settings menu
      debug: { pos, vel, alive: () => S - nFree },
    };
  }
  return { createSim, N, DT, SPARK_STRIDE, tunables: TUNABLES, setTunables };
}
