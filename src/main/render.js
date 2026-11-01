// ---------------------------------------------------------------------------
// Frame rendering
// ---------------------------------------------------------------------------
function setBgAndWave(pr, bgT, bgOn, waveOn, dstW, dstH) {
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bgT.tex); gl.uniform1i(pr.u.uBg, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, RT.wave.tex); gl.uniform1i(pr.u.uWave, 1);
  gl.uniform2f(pr.u.uBgSize, bgT.w, bgT.h);
  gl.uniform1i(pr.u.uBgOn, bgOn ? 1 : 0); gl.uniform1i(pr.u.uWaveOn, waveOn ? 1 : 0);
  // wave taps: bilinear taps at the centres of 2 x 2 blocks, so the box over
  // one destination pixel is exact when the ratio is a power of two
  const taps = Math.max(1, Math.min(4, Math.ceil(RT.ww / dstW / 2 * WAVE.filterSpread - 1e-3)));
  gl.uniform1i(pr.u.uWTaps, taps); gl.uniform2f(pr.u.uWTexel, 1 / dstW, 1 / dstH); gl.uniform1f(pr.u.uWSpread, WAVE.filterSpread);
  gl.uniform3fv(pr.u.uTintL, WAVE.tintL); gl.uniform3fv(pr.u.uTintR, WAVE.tintR);
}
// the composite's per-mood exposure and tone curve (spec 17)
function setTone(pr, m) { gl.uniform1f(pr.u.uBlack, m.black); gl.uniform1f(pr.u.uGain, m.exposure); gl.uniform1f(pr.u.uWhite, m.white); }
function toneJS(c, m) { c = Math.max(c - m.black, 0) * m.exposure; return c * (1 + c / (m.white * m.white)) / (1 + c); }

// st: { scene, cam, net0, net1, alpha, sparks, nSparks, layers, frameNo, ease }
// The settings menu may add: view {x, y} (where the picture sits in the output
// target), stopAfter (the last pass to run: 1 background, 2 wave, 3 glare,
// 4 composite, 5 sparkles, 6 glints), timer ({begin(name), end()}, the GPU
// timing of the Performance section) and wire (the line overlays). Score mode
// passes none of them, and every call below is then exactly as without them.
function renderFrame(st, outTarget) {
  const L = st.layers, sc = st.scene, m = sc.mood, cam = st.cam;
  const { ww, wh, ow, oh } = RT;
  const T = st.timer || null, stopAfter = st.stopAfter || 99;
  const vx = st.view ? st.view.x : 0, vy = st.view ? st.view.y : 0;

  // 1. background gradient (small), eased over the previous frame
  if (T) T.begin('background');
  {
    const pr = PR.bgGen; gl.useProgram(pr.p);
    const src = RT.bgA, dst = RT.bgB;
    bindTarget(dst); gl.viewport(0, 0, dst.w, dst.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bgImages); gl.uniform1i(pr.u.uImg, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(pr.u.uPrev, 1);
    gl.uniform1f(pr.u.uTiles, 24); gl.uniform1f(pr.u.uA, sc.monA); gl.uniform1f(pr.u.uB, sc.monB);
    gl.uniform1f(pr.u.uMc, sc.monC); gl.uniform1f(pr.u.uMw, sc.monW); gl.uniform1f(pr.u.uNight, sc.night);
    gl.uniform1f(pr.u.uDaylight, sc.daylight); gl.uniform1f(pr.u.uWday, sc.wday); gl.uniform1f(pr.u.uWnight, sc.wnight);
    gl.uniform1f(pr.u.uDusk, sc.dusk); gl.uniform1f(pr.u.uMidSat, BGL.midSat * sc.mid);
    gl.uniform1f(pr.u.uNightMix, BGL.nightMix); gl.uniform1f(pr.u.uSpot, BGL.spot); gl.uniform1f(pr.u.uGlow, BGL.glow);
    gl.uniform1f(pr.u.uLightBase, BGL.base); gl.uniform1f(pr.u.uNightBase, BGL.nightBase); gl.uniform1f(pr.u.uPale, BGL.pale);
    gl.uniform1f(pr.u.uDuskDark, BGL.duskDark); gl.uniform1f(pr.u.uDuskSat, BGL.duskSat);
    gl.uniform1f(pr.u.uEase, RT.bgFresh ? 1 : st.ease);
    quad(); RT.bgFresh = false;
    RT.bgA = dst; RT.bgB = src;
  }
  if (T) T.end();
  const bgT = RT.bgA;
  if (stopAfter < 2) return;

  // 2. wave intensity, supersampled, additive
  if (L.wave) {
    if (T) T.begin('wave');
    uploadNet(netTex[0], st.net0); uploadNet(netTex[1], st.net1);
    const pr = PR.wave; gl.useProgram(pr.p);
    bindTarget(RT.wave); gl.viewport(0, 0, ww, wh);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, netTex[0]); gl.uniform1i(pr.u.uNet0, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, netTex[1]); gl.uniform1i(pr.u.uNet1, 1);
    gl.uniform1f(pr.u.uAlpha, st.alpha); gl.uniformMatrix4fv(pr.u.uVP, false, cam.vp);
    const SA = 16 * WAVE.samplesAlong, SV = 16 * WAVE.samplesAcross;
    gl.uniform1i(pr.u.uSA, SA); gl.uniform1i(pr.u.uSV, SV);
    gl.uniform3fv(pr.u.uCam, cam.pos); gl.uniform3fv(pr.u.uRight, cam.right); gl.uniform3fv(pr.u.uUp, cam.up); gl.uniform3fv(pr.u.uFwd, cam.fwd);
    gl.uniform2f(pr.u.uProj, cam.f * wh / ww, cam.f);
    // size factor scale: a face-on cell at rest, at the camera's distance, has size factor sizeK
    const SC = SIMM.tunables.SCENE, aRest = SC.len * SC.wid / ((NN - 1) * (NN - 1)) * cam.f * cam.f * wh / ww;
    gl.uniform1f(pr.u.uSizeNorm, m.sizeK * CAMERA.dist / aRest);
    gl.uniform1f(pr.u.uBright, m.waveBright); gl.uniform1f(pr.u.uBase, m.base); gl.uniform1f(pr.u.uFres, m.fres);
    gl.uniform1f(pr.u.uCut0, WAVE.sheenCut0); gl.uniform1f(pr.u.uCut1, WAVE.sheenCut1);
    gl.uniform1f(pr.u.uFresPeak, WAVE.fresPeak); gl.uniform1f(pr.u.uFresZero, WAVE.fresZero); gl.uniform1f(pr.u.uFresTail, WAVE.fresTail);
    gl.uniform1f(pr.u.uFade, WAVE.fade);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6 * SA * SV);
    gl.disable(gl.BLEND);
    if (T) T.end();
  }
  if (stopAfter < 3) return;

  // 3. glare from the background and wave
  let glareT = null, glareK = 0;
  if (L.glare && (L.bg || L.wave)) {
    if (T) T.begin('glare');
    glareT = buildGlare(m, bgT, L.bg, L.wave, L.bg ? bgPeak(sc) : 0); glareK = RT.glareScale;
    if (T) T.end();
  }
  if (stopAfter < 4) return;

  // 4. final pass at the output size
  {
    if (T) T.begin('composite');
    const pr = PR.final; gl.useProgram(pr.p);
    bindTarget(outTarget); gl.viewport(vx, vy, ow, oh);
    setBgAndWave(pr, bgT, L.bg, L.wave, ow, oh); setTone(pr, m);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, glareT ? glareT.tex : bgT.tex); gl.uniform1i(pr.u.uGlare, 2);
    gl.uniform1i(pr.u.uGlareOn, glareT ? 1 : 0); gl.uniform1f(pr.u.uGlareK, glareK);
    gl.uniform1i(pr.u.uDither, L.dither ? 1 : 0); gl.uniform1f(pr.u.uDitherAmp, DITHER);
    gl.uniform1f(pr.u.uFrame, st.frameNo % 1024);
    gl.activeTexture(gl.TEXTURE0);
    quad();
    if (T) T.end();
  }
  if (stopAfter < 5) return;

  // 5. sparkles, then their glint pass, additively on top
  if (L.sparkles && st.nSparks > 0) {
    if (T) T.begin('sparkles');
    gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, st.sparks, 0, st.nSparks * SPARK_STRIDE);
    const pr = PR.spark; gl.useProgram(pr.p); gl.bindVertexArray(sparkVao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    sparkUniforms(pr, m, cam, st);
    gl.uniform1f(pr.u.uGlint, 1.0); gl.uniform1f(pr.u.uExt, 1.25);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, st.nSparks);
    if (T) T.end();
    if (L.glints !== false && stopAfter >= 6) { // the glints are a layer of their own in the menu
      if (T) T.begin('glints');
      gl.uniform1f(pr.u.uGlint, SPARKR.glintBright * m.glint / 0.35); gl.uniform1f(pr.u.uExt, SPARKR.glintSize);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, st.nSparks);
      if (T) T.end();
    }
    gl.disable(gl.BLEND); gl.bindVertexArray(null);
  }

  // 6. wireframe overlays (settings menu)
  if (st.wire && stopAfter >= 7) drawWireframes(st);
}
// The sparkle pass's uniforms (shared with its wireframe overlay).
function sparkUniforms(pr, m, cam, st) {
  const { ow, oh } = RT;
  gl.uniformMatrix4fv(pr.u.uVP, false, cam.vp); gl.uniform3fv(pr.u.uCam, cam.pos); gl.uniform3fv(pr.u.uCamFwd, cam.fwd);
  gl.uniform1f(pr.u.uAlpha, st.alpha);
  gl.uniform1f(pr.u.uSizeW, SPARKR.size * m.sparkSize); gl.uniform1f(pr.u.uBlur, SPARKR.blur);
  gl.uniform1f(pr.u.uFocusNear, SPARKR.focusNear); gl.uniform1f(pr.u.uFocusFar, m.focusFar);
  gl.uniform1f(pr.u.uNearSoft, SPARKR.nearSoft); gl.uniform1f(pr.u.uFarSoft, SPARKR.farSoft);
  gl.uniform1f(pr.u.uBright, SPARKR.bright * m.sparkBright); gl.uniform1f(pr.u.uDofDim, SPARKR.dofDim); gl.uniform1f(pr.u.uTurn, SPARKR.turn);
  gl.uniform3fv(pr.u.uLight, SPARKR.light); gl.uniform3fv(pr.u.uRight, cam.right); gl.uniform3fv(pr.u.uUp, cam.up);
  gl.uniform1f(pr.u.uKd, SPARKR.kd); gl.uniform1f(pr.u.uKs, SPARKR.ks); gl.uniform1f(pr.u.uShin, SPARKR.shin);
  gl.uniform1f(pr.u.uMapExp, SPARKR.mapExp); gl.uniform1f(pr.u.uMapSat, SPARKR.mapSat); gl.uniform1f(pr.u.uSatGain, SPARKR.satGain);
  gl.uniform1f(pr.u.uTiltPow, SPARKR.tiltPow); gl.uniform1f(pr.u.uF, cam.f);
  gl.uniform2f(pr.u.uRes, ow, oh);
}

function buildGlare(m, bgT, bgOn, waveOn, peak) {
  const lv = RT.levels;
  // bright-pass at a small size (the pyramid's first level is far below the screen's resolution)
  let pr = PR.bright; gl.useProgram(pr.p);
  bindTarget(lv[0].a); gl.viewport(0, 0, lv[0].w, lv[0].h);
  setBgAndWave(pr, bgT, bgOn, waveOn, lv[0].w, lv[0].h);
  setTone(pr, m);
  gl.uniform1f(pr.u.uThr, Math.max(m.glareThr, Math.min(0.97, toneJS(peak, m) + 0.06)));
  gl.activeTexture(gl.TEXTURE0);
  quad();
  // mip pyramid
  pr = PR.down; gl.useProgram(pr.p); gl.uniform1i(pr.u.uT, 0);
  for (let i = 1; i < lv.length; i++) {
    bindTarget(lv[i].a); gl.viewport(0, 0, lv[i].w, lv[i].h);
    gl.bindTexture(gl.TEXTURE_2D, lv[i - 1].a.tex); gl.uniform2f(pr.u.uTexel, 0.5 / lv[i - 1].w, 0.5 / lv[i - 1].h);
    quad();
  }
  // separable blur per level, the radius growing slightly from red to blue
  pr = PR.blur; gl.useProgram(pr.p); gl.uniform1i(pr.u.uT, 0);
  const s = m.glareSigma; gl.uniform3f(pr.u.uSigma, s * 0.93, s, s * 1.08);
  for (const l of lv) {
    gl.viewport(0, 0, l.w, l.h);
    bindTarget(l.b); gl.bindTexture(gl.TEXTURE_2D, l.a.tex); gl.uniform2f(pr.u.uDir, 1 / l.w, 0); quad();
    bindTarget(l.c); gl.bindTexture(gl.TEXTURE_2D, l.b.tex); gl.uniform2f(pr.u.uDir, 0, 1 / l.h); quad();
  }
  // weighted sum, coarsest to finest (geometric weights)
  pr = PR.combine; gl.useProgram(pr.p); gl.uniform1i(pr.u.uT, 0); gl.uniform1i(pr.u.uCoarse, 1);
  let acc = lv[lv.length - 1].c, wsum = 1, wk = 1;
  for (let i = lv.length - 2; i >= 0; i--) {
    bindTarget(lv[i].b); gl.viewport(0, 0, lv[i].w, lv[i].h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, lv[i].c.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, acc.tex);
    gl.uniform1f(pr.u.uRatio, m.glareRatio); quad();
    acc = lv[i].b; wk *= m.glareRatio; wsum += wk;
  }
  gl.activeTexture(gl.TEXTURE0);
  RT.glareScale = m.glareStrength / wsum;
  return acc;
}

// Wireframe overlays of the real geometry, drawn over the finished picture
// (settings menu). st.wire: { mesh, grid, quads, meshSA, meshSV }.
function drawWireframes(st) {
  const W = st.wire, cam = st.cam, m = st.scene.mood;
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  if ((W.mesh || W.grid) && st.net0) {
    if (!st.layers.wave) { uploadNet(netTex[0], st.net0); uploadNet(netTex[1], st.net1); } // the wave pass did not run
    gl.bindVertexArray(emptyVao);
    for (const [on, pr] of [[W.mesh, PR.wireMesh], [W.grid, PR.wireGrid]]) {
      if (!on) continue;
      gl.useProgram(pr.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, netTex[0]); gl.uniform1i(pr.u.uNet0, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, netTex[1]); gl.uniform1i(pr.u.uNet1, 1);
      gl.uniform1f(pr.u.uAlpha, st.alpha); gl.uniformMatrix4fv(pr.u.uVP, false, cam.vp);
      if (pr === PR.wireMesh) {
        const SA = W.meshSA, SV = W.meshSV;
        gl.uniform1i(pr.u.uSA, SA); gl.uniform1i(pr.u.uSV, SV); gl.uniform4f(pr.u.uColor, 0.3, 0.9, 1.0, 0.45);
        gl.drawArrays(gl.LINES, 0, 2 * ((SV + 1) * SA + (SA + 1) * SV));
      } else {
        gl.uniform1i(pr.u.uPoints, 0); gl.uniform4f(pr.u.uColor, 1.0, 0.7, 0.2, 0.8);
        gl.drawArrays(gl.LINES, 0, 4 * NN * (NN - 1));
        gl.uniform1i(pr.u.uPoints, 1); gl.uniform4f(pr.u.uColor, 1.0, 0.85, 0.4, 1.0);
        gl.drawArrays(gl.POINTS, 0, NN * NN);
      }
    }
    gl.activeTexture(gl.TEXTURE0);
  }
  if (W.quads && st.sparks && st.nSparks > 0) {
    if (!st.layers.sparkles) { gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, st.sparks, 0, st.nSparks * SPARK_STRIDE); }
    const pr = PR.sparkWire; gl.useProgram(pr.p); gl.bindVertexArray(sparkVao);
    sparkUniforms(pr, m, cam, st);
    gl.uniform1f(pr.u.uGlint, 1.0); gl.uniform1f(pr.u.uExt, 1.25); gl.uniform4f(pr.u.uColor, 1.0, 0.35, 0.8, 0.6);
    gl.drawArraysInstanced(gl.LINE_LOOP, 0, 4, st.nSparks);
  }
  gl.disable(gl.BLEND); gl.bindVertexArray(null);
}

// Inspect (settings menu): show one intermediate buffer over the picture area,
// scaled by a gain. The texture is sampled with the given filter for this draw
// only (own is its usual filter, put back afterwards).
function drawInspect(tex, mono, gain, filter, own, view) {
  const { ow, oh } = RT, pr = PR.inspect; gl.useProgram(pr.p);
  bindTarget(null); gl.viewport(view ? view.x : 0, view ? view.y : 0, ow, oh);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(pr.u.uT, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.uniform1f(pr.u.uGain, gain); gl.uniform1i(pr.u.uMono, mono ? 1 : 0);
  quad();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, own); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, own);
}
// The brightest value in a buffer, for Inspect's automatic gain: a GPU maximum
// into a 32 x 32 probe, then a small read-back (inspect mode only, a few times a second).
let probeT = null;
function bufferPeak(tex) {
  const PW = 32, PH = 32;
  if (!probeT) probeT = makeTarget(PW, PH, 'rgba16f');
  const pr = PR.peak; gl.useProgram(pr.p);
  bindTarget(probeT); gl.viewport(0, 0, PW, PH);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(pr.u.uT, 0); gl.uniform2i(pr.u.uProbe, PW, PH);
  quad();
  let peak = 0;
  if (floatRT) { const px = new Float32Array(PW * PH * 4); gl.readPixels(0, 0, PW, PH, gl.RGBA, gl.FLOAT, px); for (let i = 0; i < px.length; i += 4) if (px[i] > peak) peak = px[i]; }
  else { const px = new Uint8Array(PW * PH * 4); gl.readPixels(0, 0, PW, PH, gl.RGBA, gl.UNSIGNED_BYTE, px); for (let i = 0; i < px.length; i += 4) if (px[i] > peak) peak = px[i]; peak /= 255; }
  bindTarget(null);
  return peak;
}

