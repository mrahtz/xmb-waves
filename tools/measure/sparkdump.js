// usage: node sparkdump.js PAGE TIME SEED FRAMES EVERY OUT.json
// Per-sparkle lighting samples for fitting the colour map offline (sparkmapfit.py): every EVERY steps of the simulation (or
// only after the last of FRAMES steps when EVERY is 0), for each sparkle inside the frame, as the sparkle shader computes
// them: the map coordinates (facing . right, facing . up), the diffuse and half-vector cosines, the cosine to the camera
// after the turn, the intensity before lighting, the apparent radius (px at 1080 lines) and the screen position.
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
    const f = 1 / Math.tan(I.CAMERA.fovY * d2r / 2), asp = 16 / 9, rows = [];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], nrm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
    const buf = new Float32Array(4096 * S.SPARK_STRIDE);
    const sm = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
    for (let fr = 0; fr < frames; fr++) {
      sim.step(); if (every > 0 ? fr % every : fr !== frames - 1) continue;
      const n = sim.packSparks(buf);
      for (let k = 0; k < n; k++) {
        const o = k * S.SPARK_STRIDE, P = [buf[o + 3], buf[o + 4], buf[o + 5]], d = P.map((v, i) => v - pos[i]);
        const z = dot(d, fwd); if (z < 0.05) continue;
        const x = dot(d, right) * f / asp / z, y = dot(d, up) * f / z; if (Math.abs(x) > 1 || Math.abs(y) > 1) continue;
        let out_ = Math.min(Math.max((SP.focusNear - z) / SP.nearSoft, 0), 1) + Math.min(Math.max((z - m.focusFar) / SP.farSoft, 0), 1);
        out_ = Math.min(out_, 1.5);
        const Rw = SP.size * m.sparkSize * (1 + SP.blur * out_), Iv = SP.bright * m.sparkBright * buf[o + 9] / (1 + SP.dofDim * out_);
        const V = nrm(d.map(v => -v)), aF = [buf[o + 6], buf[o + 7], buf[o + 8]];
        let N = dot(aF, V) >= 0 ? aF : aF.map(v => -v);
        const px = SP.size * m.sparkSize * f * 540 / Math.max(z, 0.05), t = sm(SP.turn0, SP.turn1, px);  // in focus (spec 21: nearness)
        N = nrm(N.map((v, i) => v + (V[i] - v) * t));
        const c = dot(N, V), L = nrm(SP.light.map((v, i) => v - P[i])), H = nrm(L.map((v, i) => v + V[i]));
        rows.push([+dot(aF, right).toFixed(4), +dot(aF, up).toFixed(4), +Math.abs(dot(N, L)).toFixed(4), +Math.abs(dot(N, H)).toFixed(5),
          +Math.max(c, 0).toFixed(4), +Iv.toFixed(4), +px.toFixed(3), +x.toFixed(4), +y.toFixed(4)]);
      }
    }
    return rows;
  }, { time, seed, frames: +frames, every: +every });
  fs.writeFileSync(out, JSON.stringify(r)); console.log(out, r.length); await b.close();
})();
