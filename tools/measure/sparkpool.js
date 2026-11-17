// usage: node sparkpool.js PAGE TIME SEED FRAMES EVERY [OUT.json]
// Where the pool is (spec 25): how many sparkles the simulation holds alive, how many of those are inside the picture, and
// where the rest are. Steps the page's own simulation and camera (as the sparkle shader sees them) and reports, averaged
// over the sampled steps:
//   alive, on_screen, on_screen_share            the pool's occupancy and the part of it that can be seen
//   off_left/right/above/below/behind            where the live sparkles that cannot be seen are (in picture widths out)
//   z_p1..z_p99                                  the distance along the camera's axis of the sparkles inside the picture
//   px_p50/p90/p99                               their apparent radius (px at 1080 lines)
//   blur_near/blur_far                           the share of them blurred by each side of the focus range, and the mean
//   born_on_screen                               the share of births that are inside the picture at birth
// Printed as JSON (and written to OUT.json when given).
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
(async () => {
  const [page, time, seed, frames, every, out] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] }); const p = await b.newPage();
  await p.goto('file://' + path.resolve(page) + '?mode=score'); await p.evaluate(() => window.XMBW.ready);
  const r = await p.evaluate(({ time, seed, frames, every }) => {
    const I = window.XMBW._internals, sc = I.sceneParams(time.split(/[-T:]/).map(Number), 0), SP = I.SPARKR, m = sc.mood;
    const S = I.SIMM, sim = S.createSim(+seed);
    const d2r = Math.PI / 180, pitch = m.camPitch * d2r, yw = I.CAMERA.yaw * d2r;
    const fwd = [Math.sin(yw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yw) * Math.cos(pitch)];
    sim.setMood({ envCross: m.envCross, latScale: [m.latX, m.latY, m.latZ], camFwd: fwd });
    sim.warm(sim.warmSteps);
    const right = [Math.cos(yw), 0, -Math.sin(yw)];
    const up = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]];
    const pos = I.CAMERA.target.map((t, i) => t - I.CAMERA.dist * fwd[i]);
    const f = 1 / Math.tan(I.CAMERA.fovY * d2r / 2), asp = 16 / 9;
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const buf = new Float32Array(8192 * S.SPARK_STRIDE);
    let samples = 0, alive = 0, onS = 0, offL = 0, offR = 0, offA = 0, offB = 0, offZ = 0, bn = 0, bon = 0;
    const Z = [], PX = [], near = [], far = [], WX = [], WY = [], WZ = [];
    // the bounding box and its fade, as packSparks applies them: how much of the fade is seen on screen
    const TB = S.tunables.SPARK, box = TB.box, bfade = TB.boxFade;
    let onFade = 0, onFadeMin = 1;
    // births: a sparkle that is new in the pack (its age is at the first ramp step) counts as a birth
    for (let fr = 0; fr < frames; fr++) {
      sim.step();
      if (every > 0 ? fr % every : fr !== frames - 1) continue;
      const n = sim.packSparks(buf); samples++; alive += n;
      for (let k = 0; k < n; k++) {
        const o = k * S.SPARK_STRIDE, P = [buf[o + 3], buf[o + 4], buf[o + 5]], d = P.map((v, i) => v - pos[i]);
        const z = dot(d, fwd);
        WX.push(+P[0].toFixed(3)); WY.push(+P[1].toFixed(3)); WZ.push(+P[2].toFixed(3));
        if (z < 0.05) { offZ++; continue; }
        const x = dot(d, right) * f / asp / z, y = dot(d, up) * f / z;
        if (Math.abs(x) > 1 || Math.abs(y) > 1) {
          if (x < -1) offL++; else if (x > 1) offR++; else if (y > 1) offA++; else offB++;
          continue;
        }
        onS++;
        let edge = Infinity;
        for (let ax = 0; ax < 3; ax++) edge = Math.min(edge, P[ax] - box[ax][0], box[ax][1] - P[ax]);
        const bf = Math.min(1, Math.max(0, edge / bfade));
        if (bf < 0.999) { onFade++; onFadeMin = Math.min(onFadeMin, bf); }
        const nearO = Math.min(Math.max((SP.focusNear - z) / SP.nearSoft, 0), 1), farO = Math.min(Math.max((z - m.focusFar) / SP.farSoft, 0), 1);
        const out_ = Math.min(nearO + farO, 1.5);
        const Rw = SP.size * m.sparkSize * (1 + SP.blur * out_);
        Z.push(+z.toFixed(4)); PX.push(+(Rw * f * 540 / Math.max(z, 0.05)).toFixed(3));
        near.push(nearO); far.push(farO);
      }
    }
    // the share of births inside the picture: step once more, watching the pool for slots that become alive
    const dbg = sim.debug;
    for (let fr = 0; fr < 600; fr++) {
      const before = new Set();
      const n0 = sim.packSparks(buf);
      for (let k = 0; k < n0; k++) before.add(buf[k * S.SPARK_STRIDE + 3] + ',' + buf[k * S.SPARK_STRIDE + 4] + ',' + buf[k * S.SPARK_STRIDE + 5]);
      sim.step();
      const n1 = sim.packSparks(buf);
      for (let k = 0; k < n1; k++) {
        const o = k * S.SPARK_STRIDE;
        if (buf[o + 9] > 0.02) continue;            // only sparkles at the very start of the fade-in
        const P = [buf[o + 3], buf[o + 4], buf[o + 5]], d = P.map((v, i) => v - pos[i]);
        const z = dot(d, fwd); bn++;
        if (z < 0.05) continue;
        const x = dot(d, right) * f / asp / z, y = dot(d, up) * f / z;
        if (Math.abs(x) <= 1 && Math.abs(y) <= 1) bon++;
      }
    }
    const q = (a, t) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(t * s.length))] : NaN; };
    const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(a.length, 1);
    return {
      pool: sim.pool, samples, alive: alive / samples, on_screen: onS / samples, on_screen_share: onS / alive,
      off_left: offL / alive, off_right: offR / alive, off_above: offA / alive, off_below: offB / alive, off_behind: offZ / alive,
      z_tail: [0.9,0.95,0.97,0.98,0.985,0.99,0.995,0.999,1].map(t => +q(Z, Math.min(t,0.9999)).toFixed(3)),
      z_p1: q(Z, 0.01), z_p10: q(Z, 0.1), z_p50: q(Z, 0.5), z_p90: q(Z, 0.9), z_p99: q(Z, 0.99), z_max: q(Z, 0.999),
      px_p50: q(PX, 0.5), px_p90: q(PX, 0.9), px_p99: q(PX, 0.99),
      blur_near_share: mean(near.map(v => v > 0.05 ? 1 : 0)), blur_far_share: mean(far.map(v => v > 0.05 ? 1 : 0)),
      blur_far_share_25: mean(far.map(v => v > 0.25 ? 1 : 0)), blur_near_mean: mean(near), blur_far_mean: mean(far), blur_far_max: q(far, 0.999),
      focus_near: SP.focusNear, focus_far: m.focusFar, size: SP.size * m.sparkSize,
      born_on_screen: bon / Math.max(bn, 1), births_sampled: bn,
      wx_p0: q(WX, 0.001), wx_p1: q(WX, 0.01), wx_p99: q(WX, 0.99), wx_p100: q(WX, 0.999),
      wy_p0: q(WY, 0.001), wy_p1: q(WY, 0.01), wy_p99: q(WY, 0.99), wy_p100: q(WY, 0.999),
      wz_p0: q(WZ, 0.001), wz_p1: q(WZ, 0.01), wz_p99: q(WZ, 0.99), wz_p100: q(WZ, 0.999),
      box: box, box_fade: bfade, on_screen_in_fade: onFade / Math.max(onS, 1), on_screen_fade_min: onFadeMin,
    };
  }, { time, seed, frames: +frames, every: +every });
  console.log(JSON.stringify(r, null, 1));
  if (out) fs.writeFileSync(out, JSON.stringify(r, null, 1));
  await b.close();
})();
