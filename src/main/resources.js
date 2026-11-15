function compile(vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const logs = gl.getAttachedShaders(p).map(s => gl.getShaderInfoLog(s)).join('\n');
    throw new Error('shader link failed: ' + gl.getProgramInfoLog(p) + '\n' + logs);
  }
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
const PR = {
  bgGen: compile(VS_QUAD, FS_BGGEN), wave: compile(VS_WAVE, FS_WAVE),
  bright: compile(VS_QUAD, FS_BRIGHT), down: compile(VS_QUAD, FS_DOWN), blur: compile(VS_QUAD, FS_BLUR),
  combine: compile(VS_QUAD, FS_COMBINE), spark: compile(VS_SPARK, FS_SPARK), final: compile(VS_QUAD, FS_FINAL),
  // settings-menu passes
  wireMesh: compile(VS_WIRE_MESH, FS_FLAT), wireGrid: compile(VS_WIRE_GRID, FS_FLAT), sparkWire: compile(VS_SPARK_WIRE, FS_FLAT),
  inspect: compile(VS_QUAD, FS_INSPECT), peak: compile(VS_QUAD, FS_PEAK),
};
const emptyVao = gl.createVertexArray();
function quad() { gl.bindVertexArray(emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); }

function makeTex(w, h, internal, format, type, filter, data) {
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data || null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
function makeTarget(w, h, kind) { // kind: 'rgba16f' | 'r16f' | 'rgba8'
  let tex;
  if (kind === 'r16f' && floatRT) tex = makeTex(w, h, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
  else if (kind !== 'rgba8' && floatRT) tex = makeTex(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
  else tex = makeTex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fb, w, h };
}
function freeTarget(t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }
function bindTarget(t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null); }

// Background images: day and night for each month, stacked in one texture.
let bgImageData = null;
function makeBackgroundImages() {
  const tiles = 24, data = new Float32Array(BG_W * BG_H * tiles * 4);
  bgImageData = data;
  const put = (tile, x, y, c) => { const o = ((tile * BG_H + y) * BG_W + x) * 4; data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 1; };
  PALETTES.forEach((P, m) => {
    for (let y = 0; y < BG_H; y++) for (let x = 0; x < BG_W; x++) {
      const u = (x + 0.5) / BG_W, v = (y + 0.5) / BG_H; // v = 0 at the top
      const g = v * v * (3 - 2 * v) * 0.75 + v * 0.25;
      // optional middle colour: a smooth three-stop gradient instead of two stops
      const base = P.mid
        ? (v < 0.5 ? P.top.map((c, i) => c + (P.mid[i] - c) * ease(v * 2)) : P.mid.map((c, i) => c + (P.bottom[i] - c) * ease(v * 2 - 1)))
        : P.top.map((c, i) => c + (P.bottom[i] - c) * g);
      const dx = (u - P.glowPos[0]) / P.glowSize, dy = (v - P.glowPos[1]) / (P.glowSize * 0.8);
      const glow = Math.exp(-(dx * dx + dy * dy));
      const tilt = 1 + P.tilt * (u - 0.5);
      put(m * 2, x, y, [0, 1, 2].map(i => (base[i] + P.glow[i] * glow) * tilt));
      // night (spec 17): black at the top, a clear dim glow in the month's colour over the lower part
      const low = Math.pow(Math.min(Math.max((v - NIGHT_IMG.top) / (1 - NIGHT_IMG.top), 0), 1), NIGHT_IMG.pow), side = 1 + NIGHT_IMG.side * Math.cos(TAU * (u - P.night[1]));
      put(m * 2 + 1, x, y, [0, 1, 2].map(i => P.night[0][i] * NIGHT_IMG.glow * low * side));
    }
  });
  return makeTex(BG_W, BG_H * tiles, gl.RGBA16F, gl.RGBA, gl.FLOAT, gl.LINEAR, data);
}
let bgImages = makeBackgroundImages();
// (the settings and tuning tools change PALETTES in place and remake the images)
function remakeBackgroundImages() { gl.deleteTexture(bgImages); bgImages = makeBackgroundImages(); }
// The background's colour at (u, v) (v = 0 at the bottom) for this frame's scene, as the background shader computes it
// (before the upscale and the composite), read from the images with bilinear filtering.
function rgb2hsvJS(r, g, b) {
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); let h = 0;
  if (d > 0) h = mx === r ? ((g - b) / d) / 6 : mx === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
  return [h < 0 ? h + 1 : h, d / (mx + 1e-10), mx];
}
function hsv2rgbJS(h, s, v) {
  return [0, 2 / 3, 1 / 3].map(k => { const p = Math.min(Math.max(Math.abs(((h + 1 + k) % 1) * 6 - 3) - 1, 0), 1); return v * (1 + (p - 1) * s); });
}
function bgImageAt(tile, u, v) {
  const x = Math.min(Math.max(u * BG_W - 0.5, 0), BG_W - 1), y = Math.min(Math.max((1 - v) * BG_H - 0.5, 0), BG_H - 1);
  const x0 = Math.min(Math.floor(x), BG_W - 2), y0 = Math.min(Math.floor(y), BG_H - 2), fx = x - x0, fy = y - y0, o = [0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const i = ((tile * BG_H + y0 + dy) * BG_W + x0 + dx) * 4;
    for (let c = 0; c < 3; c++) o[c] += w * bgImageData[i + c];
  }
  return o;
}
function bgLightsJS(u, v, a) {
  const sx = (u - 0.5 - BGL.ovalX * Math.sin(a)) / BGL.spotW, sy = (v - 1 + BGL.ovalY * (1 - Math.cos(a))) / BGL.spotH;
  const gx = (u - 0.5 + BGL.bandX * Math.sin(a)) / BGL.bandW, gy = (v - BGL.bandY) / BGL.bandH;
  return 1 - (1 - BGL.spot * Math.exp(-sx * sx - sy * sy)) * (1 - BGL.glow * Math.exp(-gx * gx - gy * gy));
}
function bgColorAt(sc, u, v) {
  const f = ease(((sc.monC - v) / sc.monW + 1) / 2), L = bgLightsJS(u, v, sc.aday), g = sc.top * Math.pow(v, BGL.topPow);
  const proc = (c) => {
    const h = rgb2hsvJS(c[0], c[1], c[2]);
    const val = h[2] * sc.daylight * (BGL.base + (1 - BGL.base) * L) * Math.max(0, 1 - BGL.topDark * g);
    const sat = Math.min(1, h[1] * (1 - BGL.pale * L) * (1 - BGL.midSat * sc.mid) * (1 + BGL.topSat * g));
    return hsv2rgbJS(h[0], sat, val);
  };
  const da = proc(bgImageAt(sc.monA * 2, u, v)), db = proc(bgImageAt(sc.monB * 2, u, v));
  const na = bgImageAt(sc.monA * 2 + 1, u, v), nb = bgImageAt(sc.monB * 2 + 1, u, v);
  const nl = Math.max(BGL.nightFloor, sc.nightEnv * (BGL.nightBase + (1 - BGL.nightBase) * bgLightsJS(u, v, sc.anight)));
  const k = sc.night * BGL.nightMix;
  return [0, 1, 2].map(c => (da[c] + (db[c] - da[c]) * f) * (1 - k) + (na[c] + (nb[c] - na[c]) * f) * nl * k);
}
// Peak luminance of the background for this frame (the glare keeps only what exceeds the background itself, so a bright
// palette never blooms into a haze), over a grid of points.
function bgPeak(sc) {
  let peak = 0;
  for (let j = 0; j <= 12; j++) for (let i = 0; i <= 16; i++) {
    const c = bgColorAt(sc, i / 16, j / 12), l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    if (l > peak) peak = l;
  }
  return peak;
}

// Control nets: two float textures (previous and current step).
const netTex = [0, 1].map(() => makeTex(NN, NN, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, null));
const netUpload = new Float32Array(NN * NN * 4);
function uploadNet(tex, net) {
  for (let i = 0; i < NN * NN; i++) { netUpload[i * 4] = net[i * 3]; netUpload[i * 4 + 1] = net[i * 3 + 1]; netUpload[i * 4 + 2] = net[i * 3 + 2]; netUpload[i * 4 + 3] = 1; }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NN, NN, gl.RGBA, gl.FLOAT, netUpload);
}

// Sparkle instance buffer.
const sparkVao = gl.createVertexArray(), sparkBuf = gl.createBuffer();
gl.bindVertexArray(sparkVao); gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuf);
gl.bufferData(gl.ARRAY_BUFFER, 4096 * SPARK_STRIDE * 4, gl.DYNAMIC_DRAW);
{
  const B = SPARK_STRIDE * 4, layout = [[0, 3, 0], [1, 3, 12], [2, 3, 24], [3, 1, 36], [4, 1, 40]];
  for (const [loc, n, off] of layout) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, B, off); gl.vertexAttribDivisor(loc, 1); }
}
gl.bindVertexArray(null);

// Render targets. cw x ch: the scene render size; ow x oh: the output size.
// The wave is drawn into its own buffer at ss times the render size.
let RT = null;
const MAX_TEX = gl.getParameter(gl.MAX_TEXTURE_SIZE);
function ensureTargets(cw, ch, ow, oh, ss) {
  ss = Math.min(ss, MAX_TEX / Math.max(cw, ch)); // the wave buffer must fit the GPU's texture size limit
  const ww = Math.round(cw * ss), wh = Math.round(ch * ss);
  const key = [ww, wh, ow, oh].join('x');
  if (RT && RT.key === key) return;
  if (RT) { [RT.wave, RT.bgA, RT.bgB, RT.out].forEach(freeTarget); RT.levels.forEach(l => { freeTarget(l.a); freeTarget(l.b); freeTarget(l.c); }); }
  RT = { key, ww, wh, ow, oh };
  RT.wave = makeTarget(ww, wh, 'r16f');
  RT.bgA = makeTarget(64, 36, 'rgba16f'); RT.bgB = makeTarget(64, 36, 'rgba16f'); RT.bgFresh = true;
  RT.levels = [];
  let lw = Math.max(1, Math.ceil(ow / 8)), lh = Math.max(1, Math.ceil(oh / 8));
  while (RT.levels.length < 7) {
    RT.levels.push({ a: makeTarget(lw, lh, 'rgba16f'), b: makeTarget(lw, lh, 'rgba16f'), c: makeTarget(lw, lh, 'rgba16f'), w: lw, h: lh });
    if (lh <= 6) break;
    lw = Math.max(1, Math.ceil(lw / 2)); lh = Math.max(1, Math.ceil(lh / 2));
  }
  RT.out = SCORE ? makeTarget(ow, oh, 'rgba8') : null;
}

