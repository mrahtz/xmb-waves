const VS_QUAD = `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2((gl_VertexID & 1) * 2, (gl_VertexID >> 1) * 2); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

// Background gradient for this frame, into a small target.
const FS_BGGEN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uImg, uPrev; uniform float uTiles, uA, uB, uF, uNight, uWday, uEase, uHL;
vec3 img(float idx, vec2 uv){
  vec2 q = vec2(uv.x, (idx + clamp(uv.y, 0.5 / ${BG_H}.0, 1.0 - 0.5 / ${BG_H}.0)) / uTiles);
  return texture(uImg, q).rgb;
}
void main(){
  vec2 uv = vUv; // y = 0 at the bottom
  vec2 iu = vec2(uv.x, 1.0 - uv.y); // image rows are stored top first
  vec3 day = mix(img(uA * 2.0, iu), img(uB * 2.0, iu), uF);
  vec3 night = mix(img(uA * 2.0 + 1.0, iu), img(uB * 2.0 + 1.0, iu), uF);
  // the day light drifts slowly from left to right through the day
  float hx = mix(-0.1, 1.1, uWday);
  float hl = exp(-pow((uv.x - hx) / 0.55, 2.0)) * (0.55 + 0.45 * uv.y);
  day *= 1.0 + uHL * (hl - 0.35);
  vec3 c = mix(day, night, uNight);
  vec3 prev = texture(uPrev, vUv).rgb;
  o = vec4(mix(prev, c, uEase), 1.0);
}`;

// Wave: bicubic B-spline surface over the control net, shaded by view angle.
// Every surface cell is drawn as its own small quad (six vertices), so its corners
// are free to move. Where a cell would be thinner on screen than one pixel in some
// direction (folds seen edge-on, the far end), its corners are pushed apart to one
// pixel in that direction and its light is scaled by the true size: every cell then
// covers whole pixels, overlapping cells add up to the right total, and nothing is
// lost to pixel centres falling between slivers (no dotted or crawling lines).
const VS_WAVE = `#version 300 es
precision highp float;
uniform highp sampler2D uNet0, uNet1; uniform float uAlpha;
uniform mat4 uVP; uniform int uSA, uSV; uniform vec2 uRes; uniform float uMinW;
out vec3 vP; out vec3 vN; out vec2 vST; out float vWidth;
vec3 cp(ivec2 ij){ return mix(texelFetch(uNet0, ij, 0).xyz, texelFetch(uNet1, ij, 0).xyz, uAlpha); }
void basis(float t, out vec4 b, out vec4 d){
  float t2 = t * t, t3 = t2 * t, u = 1.0 - t;
  b = vec4(u * u * u, 3.0 * t3 - 6.0 * t2 + 4.0, -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0, t3) / 6.0;
  d = vec4(-u * u, 3.0 * t2 - 4.0 * t, -3.0 * t2 + 2.0 * t + 1.0, t2) * 0.5;
}
vec2 toPx(vec4 clip){ return clip.xy / max(clip.w, 1e-4) * 0.5 * uRes; }
void main(){
  int cell = gl_VertexID / 6, v = gl_VertexID - cell * 6;
  int i = cell % uSA, row = cell / uSA;
  int cs = (v == 1 || v == 3 || v == 4) ? 1 : 0, ct = (v == 2 || v == 4 || v == 5) ? 1 : 0;
  float s = float(i + cs) / float(uSA) * ${NN - 3}.0, t = float(row + ct) / float(uSV) * ${NN - 3}.0;
  int is_ = min(int(floor(s)), ${NN - 4}), it = min(int(floor(t)), ${NN - 4});
  vec4 bs, ds, bt, dt; basis(s - float(is_), bs, ds); basis(t - float(it), bt, dt);
  vec3 P = vec3(0.0), Ps = vec3(0.0), Pt = vec3(0.0);
  for (int b = 0; b < 4; b++) {
    vec3 rb = vec3(0.0), rd = vec3(0.0);
    for (int a = 0; a < 4; a++) { vec3 c = cp(ivec2(is_ + a, it + b)); rb += bs[a] * c; rd += ds[a] * c; }
    P += bt[b] * rb; Ps += bt[b] * rd; Pt += dt[b] * rb;
  }
  vP = P; vN = cross(Ps, Pt); vST = vec2(s, t) / ${NN - 3}.0;
  vec4 clip = uVP * vec4(P, 1.0);
  // the cell's other corners, linearised from the derivatives
  float dsv = (cs == 0 ? 1.0 : -1.0) * ${NN - 3}.0 / float(uSA), dtv = (ct == 0 ? 1.0 : -1.0) * ${NN - 3}.0 / float(uSV);
  vec2 p = toPx(clip);
  vec2 a = toPx(uVP * vec4(P + Ps * dsv, 1.0)) - p;   // towards the neighbour along the length
  vec2 b = toPx(uVP * vec4(P + Pt * dtv, 1.0)) - p;   // towards the neighbour across
  float la = length(a), lb = length(b);
  vec2 ua = la > 1e-4 ? a / la : vec2(1.0, 0.0);
  vec2 ub = lb > 1e-4 ? b / lb : vec2(-ua.y, ua.x);
  float wt = abs(b.x * ua.y - b.y * ua.x);               // across width, perpendicular to the length
  float ws = abs(a.x * ub.y - a.y * ub.x);               // along length, perpendicular to the width
  vec2 nt = vec2(-ua.y, ua.x); nt *= (dot(nt, b) < 0.0) ? -1.0 : 1.0;
  vec2 ns = vec2(-ub.y, ub.x); ns *= (dot(ns, a) < 0.0) ? -1.0 : 1.0;
  if (wt < uMinW) p -= nt * (uMinW - wt) * 0.5;
  if (ws < uMinW) p -= ns * (uMinW - ws) * 0.5;
  vWidth = min(1.0, wt / uMinW) * min(1.0, ws / uMinW);
  clip.xy = p / (0.5 * uRes) * clip.w;
  gl_Position = clip;
}`;
// Per fragment: c = cosine between the normal and the line of sight. The light of
// each bit of sheet is a response to the view angle, exp(-(c / baseC)^baseK), times
// its projected size: how large it appears on screen, the surface element's area
// (how much cloth it holds; less where the sheet is bunched) times the cosine
// (foreshortening) times the inverse square of its distance (relative to the camera's distance from
// its target). A bit spread over many pixels therefore gives more light per pixel
// than the same bit squeezed into a sliver, and the light falls towards nothing
// exactly where the sheet turns edge-on: a fold's glow sits just inside the turn as a
// soft strip, with no separate hard line at the silhouette. The cell's true size also
// scales the light where it was widened (see the vertex shader), so overlapping
// layers add up to the right total.
const FS_WAVE = `#version 300 es
precision highp float;
in vec3 vP; in vec3 vN; in vec2 vST; in float vWidth;
uniform vec3 uCam; uniform float uBright, uBase, uBaseC, uBaseK, uSizeRef, uAreaRef, uThreads, uThreadAmp, uFadeEnds, uFadeEdges;
out vec4 o;
float band(float x, float amp){ // a periodic profile, pre-filtered by its on-screen density
  float w = fwidth(x);
  return amp * cos(6.2831853 * x) * (1.0 - smoothstep(0.2, 0.6, w));
}
void main(){
  vec3 D = uCam - vP; vec3 V = normalize(D);
  float c = abs(dot(normalize(vN), V));
  // projected size of this bit of sheet: its area (relative to the area at rest) times the cosine, i.e. the
  // unnormalised normal's component along the line of sight, times the inverse square of its distance
  float size = abs(dot(vN, V)) / uAreaRef * uSizeRef * uSizeRef / dot(D, D);
  float sheen = uBase * exp(-pow(c / uBaseC, uBaseK)) * size;
  float t = vST.y;
  float pat = 1.0 + band(t * uThreads, uThreadAmp);
  float fade = smoothstep(0.0, uFadeEnds, vST.x) * smoothstep(1.0, 1.0 - uFadeEnds, vST.x)
             * smoothstep(0.0, uFadeEdges, t) * smoothstep(1.0, 1.0 - uFadeEdges, t);
  o = vec4(uBright * sheen * pat * fade * vWidth, 0.0, 0.0, 1.0);
}`;

// B-spline filtered upscale of the small background image (four bilinear taps).
const GLSL_BG = `
uniform sampler2D uBg; uniform vec2 uBgSize;
vec3 bicubicBg(vec2 uv){
  vec2 st = uv * uBgSize - 0.5, i = floor(st), f = st - i;
  vec2 f2 = f * f, f3 = f2 * f, u = 1.0 - f;
  vec2 w0 = u * u * u / 6.0, w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0, w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0, w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3, h0 = (w1 / g0) - 1.0 + i, h1 = (w3 / g1) + 1.0 + i;
  vec2 p0 = (h0 + 0.5) / uBgSize, p1 = (h1 + 0.5) / uBgSize;
  return g0.y * (g0.x * texture(uBg, vec2(p0.x, p0.y)).rgb + g1.x * texture(uBg, vec2(p1.x, p0.y)).rgb)
       + g1.y * (g0.x * texture(uBg, vec2(p0.x, p1.y)).rgb + g1.x * texture(uBg, vec2(p1.x, p1.y)).rgb);
}`;
// Smoothing filter over the supersampled wave buffer: n x n bilinear taps spread
// over one destination pixel (uWTexel = destination pixel size in uv) times
// uWSpread (1 = a plain box; wider softens the sharpest silhouettes a little).
const GLSL_WAVEBOX = `
uniform sampler2D uWave; uniform vec2 uWTexel; uniform int uWTaps; uniform float uWSpread;
float waveBox(vec2 uv){
  float s = 0.0, n = float(uWTaps);
  for (int j = 0; j < 4; j++) { if (j >= uWTaps) break;
    for (int i = 0; i < 4; i++) { if (i >= uWTaps) break;
      vec2 off = ((vec2(float(i), float(j)) + 0.5) / n - 0.5) * uWSpread;
      s += texture(uWave, uv + off * uWTexel).r; } }
  return s / (n * n);
}`;

// Glare chain. Bright-pass at quarter size from the composited background and wave.
const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
${GLSL_BG}
${GLSL_WAVEBOX}
uniform int uBgOn, uWaveOn; uniform vec3 uTintTop, uTintBot, uTintL, uTintR; uniform float uExposure, uWhite, uThr, uDesat;
void main(){
  vec3 c = vec3(0.0);
  if (uBgOn == 1) c += bicubicBg(vUv) * mix(uTintBot, uTintTop, vUv.y);
  if (uWaveOn == 1) c += waveBox(vUv) * mix(uTintL, uTintR, vUv.x);
  c *= uExposure;
  vec3 tone = c * (1.0 + c / (uWhite * uWhite)) / (1.0 + c); // soft curve with a white point
  vec3 b = max(tone - vec3(uThr), vec3(0.0)) / (1.0 - uThr);     // keep only what exceeds the threshold
  float l = dot(b, vec3(0.299, 0.587, 0.114));
  o = vec4(mix(b, vec3(l), uDesat), 1.0);                          // the halo is mostly white
}`;
const FS_DOWN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o; uniform sampler2D uT; uniform vec2 uTexel;
void main(){ o = vec4(0.25 * (texture(uT, vUv + uTexel * vec2(-1, -1)).rgb + texture(uT, vUv + uTexel * vec2(1, -1)).rgb
                     + texture(uT, vUv + uTexel * vec2(-1, 1)).rgb + texture(uT, vUv + uTexel * vec2(1, 1)).rgb), 1.0); }`;
const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o; uniform sampler2D uT; uniform vec2 uDir; uniform vec3 uSigma;
void main(){
  vec3 s = texture(uT, vUv).rgb, ws = vec3(1.0);
  for (int i = 1; i <= 6; i++) {
    float fi = float(i); vec3 w = exp(-fi * fi / (2.0 * uSigma * uSigma));
    s += w * (texture(uT, vUv + uDir * fi).rgb + texture(uT, vUv - uDir * fi).rgb); ws += 2.0 * w;
  }
  o = vec4(s / ws, 1.0);
}`;
const FS_COMBINE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o; uniform sampler2D uT, uCoarse; uniform float uRatio;
void main(){ o = vec4(texture(uT, vUv).rgb + uRatio * texture(uCoarse, vUv).rgb, 1.0); }`;

// Final: background, filtered wave light, glare and dither, written at the output size.
const FS_FINAL = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
${GLSL_BG}
${GLSL_WAVEBOX}
uniform sampler2D uGlare; uniform int uBgOn, uWaveOn, uGlareOn, uDither;
uniform vec3 uTintTop, uTintBot, uTintL, uTintR; uniform float uGlareK, uDitherAmp, uFrame;
float h12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main(){
  vec3 c = vec3(0.0);
  if (uBgOn == 1) c += bicubicBg(vUv) * mix(uTintBot, uTintTop, vUv.y);
  if (uWaveOn == 1) c += waveBox(vUv) * mix(uTintL, uTintR, vUv.x);
  if (uGlareOn == 1) c += uGlareK * texture(uGlare, vUv).rgb;
  if (uDither == 1) c += uDitherAmp / 255.0 * (h12(gl_FragCoord.xy + uFrame * vec2(37.0, 17.0)) * 2.0 - 1.0);
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// Sparkles: camera-facing quads with depth of field and an iridescent tint, drawn
// additively straight onto the output after the final pass.
const VS_SPARK = `#version 300 es
precision highp float;
layout(location=0) in vec3 aP0; layout(location=1) in vec3 aP1; layout(location=2) in vec3 aF;
layout(location=3) in float aOp; layout(location=4) in float aRnd;
uniform mat4 uVP; uniform vec3 uCam, uCamFwd; uniform float uAlpha, uPxScale, uSize, uBlur;
uniform float uFocusNear, uFocusFar, uNearSoft, uFarSoft, uCamFade0, uCamFade1, uBright, uIri, uIriExp, uFlare, uDimPow, uDofPow;
uniform float uGlint, uExt, uIriShare, uStreak, uStreakShare; uniform vec2 uRes;
out vec2 vQ; out float vI; out vec3 vC; out float vSoft; out float vL; out float vNear;
vec3 ramp(float x){ return 0.5 + 0.5 * cos(6.2831853 * (x + vec3(0.0, 0.33, 0.67))); }
void main(){
  vec3 P = mix(aP0, aP1, uAlpha);
  vec3 d = P - uCam; float z = dot(d, uCamFwd);
  float out_ = clamp((uFocusNear - z) / uNearSoft, 0.0, 1.0) + clamp((z - uFocusFar) / uFarSoft, 0.0, 1.0);
  out_ = min(out_, 1.5);
  float base = uSize * (0.75 + 0.5 * aRnd);
  float sizePx = (base + uBlur * out_) * uPxScale, sharpPx = base * uPxScale;
  // a wide spread of brightness: most sparkles are faint, a few are bright
  float dim = pow(fract(aRnd * 7.31), uDimPow);
  float I = uBright * aOp * dim * pow(sharpPx / sizePx, uDofPow) * smoothstep(uCamFade0, uCamFade1, z);
  vec3 V = normalize(-d);
  float a = pow(abs(dot(aF, V)), uIriExp);
  vec3 L1 = normalize(vec3(0.4, 0.8, -0.45)), L2 = normalize(vec3(-0.7, 0.3, -0.6)), L3 = normalize(vec3(0.1, -0.5, -0.85));
  float fl = pow(max(dot(aF, L1), 0.0), 24.0) + pow(max(dot(aF, L2), 0.0), 24.0) + pow(max(dot(aF, L3), 0.0), 24.0);
  // mostly neutral: only a few sparkles carry strong colour, and out-of-focus ones are grey
  float colourful = step(fract(aRnd * 13.7), uIriShare);
  vC = mix(vec3(1.0), ramp(a + 0.15 * aRnd), mix(0.02, uIri, colourful) * (1.0 - 0.8 * clamp(out_, 0.0, 1.0)));
  vI = I * (0.55 + uFlare * fl) * uGlint;
  vSoft = clamp(out_, 0.0, 1.0); vNear = clamp((uFocusNear - z) / uNearSoft, 0.0, 1.0);
  float r = max(sizePx, 0.7) * uExt;
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vec4 clip = uVP * vec4(P, 1.0);
  // some sparkles are short streaks: drawn stretched along their on-screen motion (one step apart, 60 per second)
  vec4 c0 = uVP * vec4(aP0, 1.0), c1 = uVP * vec4(aP1, 1.0);
  vec2 dv = (c1.xy / max(c1.w, 1e-3) - c0.xy / max(c0.w, 1e-3)) * 0.5 * uRes * 60.0;
  float sp = length(dv); vec2 dir = sp > 1e-3 ? dv / sp : vec2(1.0, 0.0);
  float Lh = min(0.5 * sp * uStreak, 3.0 * uPxScale) * step(fract(aRnd * 3.17), uStreakShare) * (1.0 - clamp(out_, 0.0, 1.0));
  if (z < 0.05) clip = vec4(2.0, 2.0, 2.0, 1.0);
  vec2 off = dir * corner.x * (r + Lh) + vec2(-dir.y, dir.x) * corner.y * r;
  clip.xy += off / uRes * 2.0 * clip.w;
  vQ = vec2(corner.x * (r + Lh), corner.y * r) / max(sizePx, 0.7);
  vL = Lh / max(sizePx, 0.7);
  if (sizePx < 0.7) vI *= (sizePx * sizePx) / 0.49;
  gl_Position = clip;
}`;
const FS_SPARK = `#version 300 es
precision highp float;
in vec2 vQ; in float vI; in vec3 vC; in float vSoft; in float vL; in float vNear; uniform float uExt;
out vec4 o;
void main(){
  vec2 q0 = vec2(max(abs(vQ.x) - vL, 0.0), vQ.y); // distance from the streak's centre segment (a dot when vL = 0)
  float r2 = dot(q0, q0);
  float sharp = exp(-r2 * 2.2);
  // out of focus: a soft spot beyond the focus, a flat disc nearer the camera
  float soft = mix(smoothstep(1.0, 0.55, sqrt(r2)) * 0.6 + exp(-r2 * 1.5) * 0.4, smoothstep(1.0, 0.8, sqrt(r2)) * 0.85 + exp(-r2 * 1.5) * 0.15, vNear);
  float k;
  if (uExt > 1.5) { // glint pass: a soft round halo (no rays)
    vec2 q = q0 / uExt;
    k = 0.45 * exp(-dot(q, q) * 6.0) * (1.0 - vSoft);
  } else k = mix(sharp, soft, vSoft);
  o = vec4(vC * vI * k, 1.0);
}`;

// ---------------------------------------------------------------------------
// Settings-menu passes (normal mode only; none of these runs in score mode)
// ---------------------------------------------------------------------------
// Wireframes: line overlays of the real geometry in a flat colour.
const FS_FLAT = `#version 300 es
precision highp float;
uniform vec4 uColor; out vec4 o;
void main(){ o = uColor; }`;
// The wave surface's mesh: the edges of the surface cells, evaluated on the same
// B-spline over the same interpolated control net as the wave pass (without the
// sliver widening). Lines run along the length (one per sample row) and across
// (one per sample column). uSA x uSV may be a coarser divisor of the real grid so
// the overlay stays readable; every line drawn is then still a line of the mesh.
const VS_WIRE_MESH = `#version 300 es
precision highp float;
uniform highp sampler2D uNet0, uNet1; uniform float uAlpha; uniform mat4 uVP; uniform int uSA, uSV;
vec3 cp(ivec2 ij){ return mix(texelFetch(uNet0, ij, 0).xyz, texelFetch(uNet1, ij, 0).xyz, uAlpha); }
vec4 basisB(float t){ float t2 = t * t, t3 = t2 * t, u = 1.0 - t; return vec4(u * u * u, 3.0 * t3 - 6.0 * t2 + 4.0, -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0, t3) / 6.0; }
void main(){
  int seg = gl_VertexID >> 1, end_ = gl_VertexID & 1, i, row;
  int nAlong = (uSV + 1) * uSA;                                        // segments of the lines along the length
  if (seg < nAlong) { row = seg / uSA; i = seg - row * uSA + end_; }
  else { seg -= nAlong; i = seg / uSV; row = seg - i * uSV + end_; }   // the lines across
  float s = float(i) / float(uSA) * ${NN - 3}.0, t = float(row) / float(uSV) * ${NN - 3}.0;
  int is_ = min(int(floor(s)), ${NN - 4}), it = min(int(floor(t)), ${NN - 4});
  vec4 bs = basisB(s - float(is_)), bt = basisB(t - float(it));
  vec3 P = vec3(0.0);
  for (int b = 0; b < 4; b++) { vec3 rb = vec3(0.0); for (int a = 0; a < 4; a++) rb += bs[a] * cp(ivec2(is_ + a, it + b)); P += bt[b] * rb; }
  gl_Position = uVP * vec4(P, 1.0);
}`;
// The control grid: the interpolated control net's points, joined along both directions.
const VS_WIRE_GRID = `#version 300 es
precision highp float;
uniform highp sampler2D uNet0, uNet1; uniform float uAlpha; uniform mat4 uVP; uniform int uPoints;
vec3 cp(ivec2 ij){ return mix(texelFetch(uNet0, ij, 0).xyz, texelFetch(uNet1, ij, 0).xyz, uAlpha); }
void main(){
  int i, j;
  if (uPoints == 1) { i = gl_VertexID % ${NN}; j = gl_VertexID / ${NN}; }
  else {
    int seg = gl_VertexID >> 1, end_ = gl_VertexID & 1, n1 = ${NN} * ${NN - 1};
    if (seg < n1) { j = seg / ${NN - 1}; i = seg - j * ${NN - 1} + end_; }      // along the length
    else { seg -= n1; i = seg / ${NN - 1}; j = seg - i * ${NN - 1} + end_; }    // across
  }
  gl_Position = uVP * vec4(cp(ivec2(i, j)), 1.0); gl_PointSize = 5.0;
}`;
// The sparkle quads: each sparkle's billboard as a line loop, placed and sized
// exactly as the sparkle pass places it (its vertex shader with the corners
// reordered, so the loop goes round the quad instead of across it).
const VS_SPARK_WIRE = VS_SPARK.replace('vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;',
  'int ci = gl_VertexID == 2 ? 3 : (gl_VertexID == 3 ? 2 : gl_VertexID); vec2 corner = vec2(float(ci & 1), float(ci >> 1)) * 2.0 - 1.0;');
if (VS_SPARK_WIRE === VS_SPARK) throw new Error('sparkle wireframe shader: the corner line was not found');
// Inspect: show any intermediate buffer, scaled by a gain; single-channel buffers as grey.
const FS_INSPECT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o; uniform sampler2D uT; uniform float uGain; uniform int uMono;
void main(){ vec4 c = texture(uT, vUv); vec3 v = uMono == 1 ? c.rrr : c.rgb; o = vec4(clamp(v * uGain, 0.0, 1.0), 1.0); }`;
// Inspect's automatic gain: the brightest value of a buffer, found on the GPU by
// taking the maximum over blocks of its texels into a small probe image (large
// blocks are strided), which is then read back.
const FS_PEAK = `#version 300 es
precision highp float;
out vec4 o; uniform sampler2D uT; uniform ivec2 uProbe;
void main(){
  ivec2 sz = textureSize(uT, 0), cell = ivec2(gl_FragCoord.xy);
  ivec2 a = cell * sz / uProbe, b = max((cell + 1) * sz / uProbe, a + 1);
  ivec2 st = max((b - a) / 48, ivec2(1));
  float m = 0.0;
  for (int y = a.y; y < b.y; y += st.y) for (int x = a.x; x < b.x; x += st.x) { vec4 c = texelFetch(uT, ivec2(x, y), 0); m = max(m, max(c.r, max(c.g, c.b))); }
  o = vec4(m, m, m, 1.0);
}`;

