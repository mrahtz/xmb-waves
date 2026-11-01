const VS_QUAD = `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2((gl_VertexID & 1) * 2, (gl_VertexID >> 1) * 2); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

// Background gradient for this frame, into a small target (spec 17). The month's day and night images are processed in
// hue, saturation and value: the value is scaled by the lighting (a sun-like spot on an arc across the upper part and an
// opposite glow along the bottom, driven by the warped hour; the night image by its own noon-to-noon clock), lit areas
// become slightly paler, dawn and dusk darken the top and deepen its colour, and the middle of the month is a little less
// saturated. Next month's images rise from the bottom of the screen. The day image carries its own daylight factor, and
// even at full night weight the picture is a mix of the night image and the (dark) day image.
const FS_BGGEN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uImg, uPrev; uniform float uTiles, uA, uB, uMc, uMw, uNight, uNightMix, uDaylight, uWday, uWnight;
uniform float uEase, uSpot, uGlow, uLightBase, uNightBase, uPale, uDusk, uDuskDark, uDuskSat, uMidSat;
vec3 img(float idx, vec2 uv){
  vec2 q = vec2(uv.x, (idx + clamp(uv.y, 0.5 / ${BG_H}.0, 1.0 - 0.5 / ${BG_H}.0)) / uTiles);
  return texture(uImg, q).rgb;
}
vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c){ vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
// the two soft lights of a clock w (0..1): a spot on an arc across the upper part (low at the left at 0, high at the top
// centre at 0.5, low at the right at 1) and a glow along the bottom edge moving the other way
float lights(vec2 uv, float w, out float spot){
  vec2 s = vec2(mix(-0.05, 1.05, w), 0.55 + 0.42 * sin(3.14159265 * clamp(w, 0.0, 1.0)));
  vec2 ds = (uv - s) / vec2(0.45, 0.38); spot = exp(-dot(ds, ds));
  float gx = (uv.x - mix(1.05, -0.05, w)) / 0.5;
  return uSpot * spot + uGlow * exp(-gx * gx) * exp(-uv.y / 0.22);
}
vec3 process(vec3 c, vec2 uv, float base, float w, float gain){
  vec3 h = rgb2hsv(c); float spot; float L = lights(uv, w, spot);
  h.z *= (base + L) * gain;
  h.y *= 1.0 - uPale * L;                                   // lit areas slightly paler
  float top = smoothstep(0.45, 1.0, uv.y) * uDusk;          // dawn and dusk: the top darker and deeper in colour
  h.z *= 1.0 - uDuskDark * top; h.y = min(1.0, h.y * (1.0 + uDuskSat * top));
  h.y *= 1.0 - uMidSat;                                     // mid-month: a little less saturated
  return hsv2rgb(h);
}
void main(){
  vec2 uv = vUv; // y = 0 at the bottom
  vec2 iu = vec2(uv.x, 1.0 - uv.y); // image rows are stored top first
  // next month's images rise from the bottom: a soft S-shaped step down the screen, centre uMc, half-width uMw
  float f = smoothstep(-1.0, 1.0, (uMc - uv.y) / uMw);
  vec3 day = mix(img(uA * 2.0, iu), img(uB * 2.0, iu), f);
  vec3 night = mix(img(uA * 2.0 + 1.0, iu), img(uB * 2.0 + 1.0, iu), f);
  day = process(day, uv, uLightBase, uWday, uDaylight);
  night = process(night, uv, uNightBase, uWnight, 1.0);
  vec3 c = mix(day, night, uNight * uNightMix);
  vec3 prev = texture(uPrev, vUv).rgb;
  o = vec4(mix(prev, c, uEase), 1.0);
}`;

// Wave: bicubic B-spline surface over the control net, shaded per vertex in the projected space. Every surface cell is
// drawn as its own small quad (six vertices). A cell thinner than a pixel is not widened (spec 17): it lights only the
// supersamples it covers, and with the size factor its light is faint anyway.
const VS_WAVE = `#version 300 es
precision highp float;
uniform highp sampler2D uNet0, uNet1; uniform float uAlpha;
uniform mat4 uVP; uniform int uSA, uSV;
uniform vec3 uCam, uRight, uUp, uFwd; uniform vec2 uProj; uniform float uSizeNorm;
out float vCos, vSize; out vec2 vST;
vec3 cp(ivec2 ij){ return mix(texelFetch(uNet0, ij, 0).xyz, texelFetch(uNet1, ij, 0).xyz, uAlpha); }
void basis(float t, out vec4 b, out vec4 d){
  float t2 = t * t, t3 = t2 * t, u = 1.0 - t;
  b = vec4(u * u * u, 3.0 * t3 - 6.0 * t2 + 4.0, -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0, t3) / 6.0;
  d = vec4(-u * u, 3.0 * t2 - 4.0 * t, -3.0 * t2 + 2.0 * t + 1.0, t2) * 0.5;
}
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
  // shading per vertex, in the projected space: view axes scaled by the projection (x by f / aspect, y by f), before
  // the perspective divide. The B-spline commutes with this linear map, so the surface, its derivatives and their
  // unnormalised cross product (its length the element's area there) are those of the projected surface.
  vec3 D = P - uCam;
  vec3 Q = vec3(uProj.x * dot(uRight, D), uProj.y * dot(uUp, D), dot(uFwd, D));
  vec3 Qs = vec3(uProj.x * dot(uRight, Ps), uProj.y * dot(uUp, Ps), dot(uFwd, Ps));
  vec3 Qt = vec3(uProj.x * dot(uRight, Pt), uProj.y * dot(uUp, Pt), dot(uFwd, Pt));
  vec3 Nq = cross(Qs, Qt); float dist = max(length(Q), 1e-4), along = abs(dot(Nq, Q)) / dist;
  vCos = along / max(length(Nq), 1e-12);   // cosine between the normal and the line of sight (a distorted view angle)
  vSize = along / dist * uSizeNorm;        // area times cosine, over the first power of the distance, per-mood scale
  vST = vec2(s, t) / ${NN - 3}.0;
  vec4 clip = uVP * vec4(P, 1.0);
  gl_Position = clip;
}`;
// Per fragment, from the per-vertex cosine c and size factor S (interpolated): the light is S times the edge fade times
// the sum of two terms (spec 16 and 17). The sheen is the base level times the (fused, so flat) thread profile, flat until
// well past the size factor of the Fresnel-like peak (uCut0), then falling linearly to nearly nothing (uCut1) and fading
// out slowly after that. The Fresnel-like term is a strength times one narrow peak indexed by the product c x S: exactly
// zero over the lower part of the range below the peak (up to uFresZero of the peak's position), a steep rise to the peak,
// and a long thin tail above it (uFresTail). The edge fade is linear and covers the same fraction at the ends and edges.
const FS_WAVE = `#version 300 es
precision highp float;
in float vCos, vSize; in vec2 vST;
uniform float uBright, uBase, uFres, uCut0, uCut1, uFresPeak, uFresZero, uFresTail, uFade;
out vec4 o;
void main(){
  float S = max(vSize, 0.0), x = vCos * S / uFresPeak;
  float prof = S < uCut0 ? 1.0 : (S < uCut1 ? 1.0 - 0.95 * (S - uCut0) / (uCut1 - uCut0) : 0.05 * exp(-(S - uCut1) / uCut1));
  float r = clamp((x - uFresZero) / (1.0 - uFresZero), 0.0, 1.0);
  float fres = uFres * (x < 1.0 ? r * r * (3.0 - 2.0 * r) : exp(-(x - 1.0) / uFresTail));
  vec2 e = min(vST, 1.0 - vST) / uFade;
  float fade = clamp(e.x, 0.0, 1.0) * clamp(e.y, 0.0, 1.0);
  o = vec4(uBright * S * (uBase * prof + fres) * fade, 0.0, 0.0, 1.0);
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
// Down-filter over the supersampled wave buffer: a box exactly one destination pixel wide (n x n bilinear taps over
// uWTexel, the destination pixel size in uv, times uWSpread = 1).
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

// The composite's exposure and tone curve (spec 17), per mood: a small black offset is subtracted, a gain applied, then the
// extended Reinhard curve with a white point (1 leaves the curve neutral; below 1 it lifts the brightest values slightly).
const GLSL_TONE = `
uniform float uBlack, uGain, uWhite;
vec3 toneMap(vec3 c){ c = max(c - vec3(uBlack), vec3(0.0)) * uGain; return c * (1.0 + c / (uWhite * uWhite)) / (1.0 + c); }`;
// Glare chain. Bright-pass at reduced size from the composite (background and wave) after its tone curve.
const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
${GLSL_BG}
${GLSL_WAVEBOX}
${GLSL_TONE}
uniform int uBgOn, uWaveOn; uniform vec3 uTintL, uTintR; uniform float uThr;
void main(){
  vec3 c = vec3(0.0);
  if (uBgOn == 1) c += bicubicBg(vUv);
  if (uWaveOn == 1) c += waveBox(vUv) * mix(uTintL, uTintR, vUv.x);
  c = toneMap(c);
  // keep the colour: one weight from the brightest channel, a soft knee (zero up to the threshold, rising above it)
  float m = max(c.r, max(c.g, c.b)), e = max(m - uThr, 0.0);
  o = vec4(c * (e * e / (e + 0.1 * (1.0 - uThr))) / max(m, 1e-4), 1.0);
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
${GLSL_TONE}
uniform sampler2D uGlare; uniform int uBgOn, uWaveOn, uGlareOn, uDither;
uniform vec3 uTintL, uTintR; uniform float uGlareK, uDitherAmp, uFrame;
float h12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main(){
  vec3 c = vec3(0.0);
  if (uBgOn == 1) c += bicubicBg(vUv);                               // no tint on the background
  if (uWaveOn == 1) c += waveBox(vUv) * mix(uTintL, uTintR, vUv.x);  // a neutral tint brightening slightly to the right
  c = toneMap(c);
  if (uGlareOn == 1) c += uGlareK * texture(uGlare, vUv).rgb;
  if (uDither == 1) c += uDitherAmp / 255.0 * (h12(gl_FragCoord.xy + uFrame * vec2(37.0, 17.0)) * 2.0 - 1.0);
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// Sparkles: flat round discs in 3D, turned by each sparkle's spin (towards the camera when close to it), with depth of
// field and an iridescent tint, drawn additively straight onto the output after the final pass.
const VS_SPARK = `#version 300 es
precision highp float;
layout(location=0) in vec3 aP0; layout(location=1) in vec3 aP1; layout(location=2) in vec3 aF;
layout(location=3) in float aOp; layout(location=4) in float aRnd;
uniform mat4 uVP; uniform vec3 uCam, uCamFwd; uniform float uAlpha, uSizeW, uBlur, uF;
uniform float uFocusNear, uFocusFar, uNearSoft, uFarSoft, uBright, uDofDim, uTurn;
uniform vec3 uLight, uRight, uUp; uniform float uKd, uKs, uShin, uMapExp, uMapSat, uSatGain, uTiltPow;
uniform float uGlint, uExt; uniform vec2 uRes;
out vec2 vQ; out float vI; out vec3 vC; out float vSoft;
// iridescent colour map indexed by the facing direction's two screen-plane components (a lit-sphere lookup): the hue
// turns with the direction's angle and its distance from the centre, at the same moderate saturation everywhere
vec3 iriMap(vec2 q){
  float h = atan(q.y, q.x) / 6.2831853 + 0.6 * min(length(q), 1.0);
  return mix(vec3(1.0), 0.5 + 0.5 * cos(6.2831853 * (h + vec3(0.0, 0.33, 0.67))), uMapSat);
}
void main(){
  vec3 P = mix(aP0, aP1, uAlpha);
  vec3 d = P - uCam; float z = dot(d, uCamFwd);
  // depth of field (spec 17): out of focus a disc grows modestly and its edge softens; its brightness per pixel drops
  // only a little (more the nearer it is), with no greying and no separate fade near the camera
  float out_ = clamp((uFocusNear - z) / uNearSoft, 0.0, 1.0) + clamp((z - uFocusFar) / uFarSoft, 0.0, 1.0);
  out_ = min(out_, 1.5);
  float Rw = uSizeW * (1.0 + uBlur * out_);  // the disc's radius in scene units: smaller the farther it is
  float I = uBright * aOp / (1.0 + uDofDim * out_);
  vec3 V = normalize(-d);
  vSoft = clamp(out_, 0.0, 1.0);
  // the disc's plane: its own facing from the spin, turned a modest part of the way towards the camera at any distance and
  // fully when close to it, so no disc is ever seen fully edge-on
  vec3 N = aF * sign(dot(aF, V) + 1e-6);
  N = normalize(mix(N, V, max(uTurn, clamp((uFocusNear - z) / uNearSoft, 0.0, 1.0))));
  float c = dot(N, V);
  // lighting (spec 16 and 17): one point light in front of the camera; a two-sided diffuse term plus a sharp specular
  // highlight tinted by the iridescent map, through a soft saturating curve. No random brightness: the spread and the
  // twinkle come from the spin. The disc fades as it turns towards edge-on.
  vec3 L = normalize(uLight - P), Hh = normalize(L + V);
  float diff = abs(dot(N, L)), spec = pow(abs(dot(N, Hh)), uShin);
  vec3 iri = pow(iriMap(vec2(dot(aF, uRight), dot(aF, uUp))), vec3(uMapExp));
  float tilt = 1.0 - pow(1.0 - max(c, 0.0), uTiltPow);
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vec3 Ub, Vb; float R;
  if (uExt > 1.5) {
    // glint pass: a round soft halo facing the camera, its size and strength following the specular highlight, carrying
    // only the highlight's tinted light
    Ub = uRight; Vb = uUp; R = Rw * uExt * sqrt(spec);
    vC = iri; vI = I * tilt * uKs * spec * uGlint;
  } else {
    Ub = normalize(cross(N, abs(N.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))); Vb = cross(N, Ub); R = Rw * uExt;
    vC = 1.0 - exp(-uSatGain * (uKd * diff + uKs * spec * iri));
    vI = I * tilt * uGlint;
  }
  // a disc smaller than a pixel keeps a one-pixel patch, dimmed by its area
  float px = Rw * uF * uRes.y / (2.0 * max(z, 0.05));
  if (px < 0.7) { R *= 0.7 / max(px, 1e-4); vI *= (px * px) / 0.49; }
  vec4 clip = uVP * vec4(P + (Ub * corner.x + Vb * corner.y) * R, 1.0);
  if (z < 0.05) clip = vec4(2.0, 2.0, 2.0, 1.0);
  vQ = corner * uExt;
  gl_Position = clip;
}`;
const FS_SPARK = `#version 300 es
precision highp float;
in vec2 vQ; in float vI; in vec3 vC; in float vSoft; uniform float uExt;
out vec4 o;
void main(){
  float r = length(vQ); // 1 at the disc's edge; the patch reaches uExt, so the disc is zero well inside it
  float k;
  if (uExt > 1.5) { // glint pass: a soft round halo, zero before the patch's edge
    float q = r / uExt;
    k = 0.45 * exp(-q * q * 6.0) * smoothstep(1.0, 0.8, q);
  } else { // a flat disc: a crisp, anti-aliased edge in focus, softening out of focus until it fills its patch
    float e = max(fwidth(r) * 1.2, 0.04 + 0.6 * vSoft);
    k = 1.0 - smoothstep(1.0 - e, 1.0 + 0.2 * vSoft, r);
  }
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

