(function () {
'use strict';
const SIMM = XMBW_SIM();
const NN = SIMM.N, DT = SIMM.DT, SPARK_STRIDE = SIMM.SPARK_STRIDE;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Palettes (original design). Each month has a day image and a night image,
// generated in code as small soft images (see makeBackgroundImages).
//   top, bottom: colours at the top and bottom edge
//   glow: colour added by a broad soft highlight, glowPos [x, y], glowSize
//   tilt: brightness change from left to right
//   night: [colour of the faint hint, where it sits (0 = left, 1 = right)]
// Colours are display values (sRGB-encoded) in 0..1.
// ---------------------------------------------------------------------------
const PALETTES = [
  /* 1 silver      */ { top: [0.45, 0.47, 0.51], bottom: [0.63, 0.64, 0.67], glow: [0.12, 0.12, 0.12], glowPos: [0.55, 0.10], glowSize: 0.55, tilt: 0.06, night: [[0.06, 0.065, 0.075], 0.35] },
  /* 2 yellow      */ { top: [0.56, 0.58, 0.22], mid: [0.42, 0.38, 0.11], bottom: [0.62, 0.58, 0.26], glow: [0.10, 0.10, 0.05], glowPos: [0.30, 0.0], glowSize: 0.55, tilt: -0.10, night: [[0.07, 0.08, 0.02], 0.55] },
  /* 3 light green */ { top: [0.38, 0.54, 0.14], bottom: [0.56, 0.70, 0.30], glow: [0.14, 0.18, 0.08], glowPos: [0.55, 0.10], glowSize: 0.55, tilt: 0.06, night: [[0.035, 0.08, 0.01], 0.35] },
  /* 4 pink        */ { top: [0.52, 0.27, 0.30], mid: [0.56, 0.36, 0.38], bottom: [0.74, 0.60, 0.60], glow: [0.16, 0.08, 0.10], glowPos: [0.12, 0.25], glowSize: 0.55, tilt: -0.22, night: [[0.09, 0.03, 0.06], 0.35] },
  /* 5 green       */ { top: [0.06, 0.42, 0.12], mid: [0.05, 0.44, 0.11], bottom: [0.08, 0.50, 0.14], glow: [0.06, 0.14, 0.06], glowPos: [0.35, 0.0], glowSize: 0.55, tilt: 0.04, night: [[0.01, 0.10, 0.015], 0.35] },
  /* 6 lavender    */ { top: [0.42, 0.34, 0.62], bottom: [0.62, 0.55, 0.78], glow: [0.14, 0.12, 0.18], glowPos: [0.55, 0.10], glowSize: 0.55, tilt: 0.06, night: [[0.05, 0.04, 0.10], 0.35] },
  /* 7 teal        */ { top: [0.06, 0.40, 0.42], bottom: [0.20, 0.56, 0.56], glow: [0.08, 0.16, 0.16], glowPos: [0.55, 0.10], glowSize: 0.55, tilt: 0.06, night: [[0.0, 0.07, 0.08], 0.35] },
  /* 8 blue        */ { top: [0.24, 0.50, 0.56], bottom: [0.10, 0.20, 0.42], glow: [0.08, 0.10, 0.10], glowPos: [0.30, 0.0], glowSize: 0.55, tilt: 0.28, night: [[0.02, 0.03, 0.17], 0.15] },
  /* 9 purple      */ { top: [0.22, 0.15, 0.36], bottom: [0.60, 0.38, 0.66], glow: [0.20, 0.16, 0.26], glowPos: [0.50, 0.0], glowSize: 0.42, tilt: 0.04, night: [[0.035, 0.035, 0.18], 0.15] },
  /*10 gold        */ { top: [0.48, 0.36, 0.09], bottom: [0.34, 0.19, 0.02], glow: [0.20, 0.18, 0.12], glowPos: [0.45, 0.0], glowSize: 0.45, tilt: -0.04, night: [[0.08, 0.05, 0.0], 0.35] },
  /*11 brown       */ { top: [0.44, 0.32, 0.12], bottom: [0.40, 0.24, 0.08], glow: [0.26, 0.25, 0.20], glowPos: [0.30, 0.0], glowSize: 0.40, tilt: -0.10, night: [[0.06, 0.035, 0.012], 0.35] },
  /*12 red         */ { top: [0.52, 0.08, 0.08], bottom: [0.70, 0.22, 0.20], glow: [0.16, 0.08, 0.07], glowPos: [0.55, 0.10], glowSize: 0.55, tilt: 0.06, night: [[0.10, 0.012, 0.01], 0.35] },
];
const BG_W = 32, BG_H = 18; // size of each generated background image

// ---------------------------------------------------------------------------
// Moods: complete parameter sets, blended linearly with one shared factor.
// ---------------------------------------------------------------------------
const MOOD_KEYS = [
  'waveBright', 'base', 'basePow', 'fresnel', 'fresnelPow', 'proj', 'threadAmp', 'streakAmp',
  'latX', 'latY', 'latZ', 'envCross', 'camPitch',
  'exposure', 'white', 'glareThr', 'glareSigma', 'glareRatio', 'glareStrength',
  'focusFar', 'sparkSize', 'sparkBright', 'glint',
];
const MOODS = {
  night: { waveBright: 0.80, base: 0.14, basePow: 0.5, fresnel: 0.60, fresnelPow: 2.5, proj: 0.15, threadAmp: 0.08, streakAmp: 0.22,
    latX: 1.00, latY: 0.92, latZ: 1.00, envCross: 0.50, camPitch: 8.5,
    exposure: 1.0, white: 2.2, glareThr: 0.90, glareSigma: 1.5, glareRatio: 0.85, glareStrength: 0.0,
    focusFar: 3.6, sparkSize: 1.0, sparkBright: 0.35, glint: 0.10 },
  dawn: { waveBright: 0.68, base: 0.17, basePow: 0.5, fresnel: 1.05, fresnelPow: 2.5, proj: 0.15, threadAmp: 0.08, streakAmp: 0.22,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.55, camPitch: 10,
    exposure: 1.0, white: 1.0, glareThr: 0.70, glareSigma: 1.5, glareRatio: 0.85, glareStrength: 0.9,
    focusFar: 3.8, sparkSize: 1.0, sparkBright: 0.8, glint: 0.25 },
  day: { waveBright: 0.70, base: 0.16, basePow: 0.5, fresnel: 0.90, fresnelPow: 2.5, proj: 0.15, threadAmp: 0.08, streakAmp: 0.22,
    latX: 1.00, latY: 1.00, latZ: 1.00, envCross: 0.58, camPitch: 10,
    exposure: 1.0, white: 1.0, glareThr: 0.70, glareSigma: 1.5, glareRatio: 0.85, glareStrength: 0.9,
    focusFar: 4.0, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
  dusk: { waveBright: 0.75, base: 0.18, basePow: 0.5, fresnel: 1.15, fresnelPow: 2.5, proj: 0.15, threadAmp: 0.08, streakAmp: 0.22,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.55, camPitch: 9.5,
    exposure: 1.0, white: 1.0, glareThr: 0.70, glareSigma: 1.5, glareRatio: 0.85, glareStrength: 0.9,
    focusFar: 3.8, sparkSize: 1.0, sparkBright: 0.85, glint: 0.28 },
};
// Mood schedule (local hours): hold windows and blends between them.
const MOOD_SCHEDULE = [ // [start, end, from, to]  (from === to: hold)
  [23, 25, 'night', 'night'], [1, 5, 'night', 'dawn'], [5, 7, 'dawn', 'dawn'], [7, 11, 'dawn', 'day'],
  [11, 13, 'day', 'day'], [13, 17, 'day', 'dusk'], [17, 19, 'dusk', 'dusk'], [19, 23, 'dusk', 'night'],
];
function ease(t) { t = Math.min(Math.max(t, 0), 1); return t * t * (3 - 2 * t); }
function moodAt(hour) {
  let h = ((hour % 24) + 24) % 24;
  for (const [s, e, a, b] of MOOD_SCHEDULE) {
    const hh = h < s && e > 24 ? h + 24 : h;
    if (hh >= s && hh < e) return blendMood(MOODS[a], MOODS[b], a === b ? 0 : ease((hh - s) / (e - s)));
  }
  return blendMood(MOODS.night, MOODS.night, 0);
}
function blendMood(A, B, f) { const o = {}; for (const k of MOOD_KEYS) o[k] = A[k] + (B[k] - A[k]) * f; return o; }
// Background night weight: fades out 00:00-05:00, zero by day, fades in 18:30-20:30.
function nightWeight(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5) return 1 - ease(h / 5);
  if (h < 18.5) return 0;
  if (h < 20.5) return ease((h - 18.5) / 2);
  return 1;
}
// Warped hour: advances slowly around midday and quickly around midnight; returns 0..1 over the day.
function warpedDay(hour) {
  const p = ((hour - 12) / 24) * TAU; // -pi..pi, 0 at noon
  return 0.5 + (p - 0.6 * Math.sin(p)) / TAU;
}
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

function sceneParams(tp, theme) {
  const [y, mon, day, hh, mm, ss] = tp;
  const hour = hh + mm / 60 + ss / 3600;
  if (theme >= 1 && theme <= 12) {
    return { monA: theme - 1, monB: theme % 12, monF: 0, night: 0, wday: warpedDay(12), mood: { ...MOODS.day } };
  }
  const dim = daysInMonth(y, mon);
  return { monA: mon - 1, monB: mon % 12, monF: (day - 1) / dim, night: nightWeight(hour), wday: warpedDay(hour), mood: moodAt(hour) };
}
function parseTime(s) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?)?)?/.exec(s || '');
  if (!m) return null;
  return [+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
}
function partsOf(d) {
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds() + d.getMilliseconds() / 1000];
}

// ---------------------------------------------------------------------------
// Camera (original design): looks across the sheet from in front, yawed so the
// sheet is seen obliquely and pitched down a little; the pitch follows the mood.
// ---------------------------------------------------------------------------
const CAMERA = { fovY: 38, yaw: -26, dist: 2.6, target: [0.8, 0.10, 0.0], near: 0.1, far: 40 };
function cameraFor(pitchDeg, aspect) {
  const d2r = Math.PI / 180, p = pitchDeg * d2r, yw = CAMERA.yaw * d2r;
  const fwd = [Math.sin(yw) * Math.cos(p), -Math.sin(p), Math.cos(yw) * Math.cos(p)];
  const right = [Math.cos(yw), 0, -Math.sin(yw)];
  const up = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]];
  const pos = CAMERA.target.map((t, i) => t - CAMERA.dist * fwd[i]);
  const f = 1 / Math.tan(CAMERA.fovY * d2r / 2), n = CAMERA.near, fa = CAMERA.far;
  // view: rows right, up, -fwd (right-handed clip convention); column-major for GL
  const tx = -(right[0] * pos[0] + right[1] * pos[1] + right[2] * pos[2]);
  const ty = -(up[0] * pos[0] + up[1] * pos[1] + up[2] * pos[2]);
  const tz = (fwd[0] * pos[0] + fwd[1] * pos[1] + fwd[2] * pos[2]);
  const view = [right[0], up[0], -fwd[0], 0, right[1], up[1], -fwd[1], 0, right[2], up[2], -fwd[2], 0, tx, ty, tz, 1];
  const proj = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0];
  const vp = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) vp[c * 4 + r] += proj[k * 4 + r] * view[c * 4 + k];
  return { pos, fwd, right, up, vp, f };
}

// ---------------------------------------------------------------------------
// Wave, glare, sparkle and output settings (original design)
// ---------------------------------------------------------------------------
const WAVE = {
  samplesAlong: 24, samplesAcross: 6,   // per patch (16 x 16 patches)
  threads: 400,                         // thread periods across the sheet
  fadeEnds: 0.10, fadeEdges: 0.12,      // fraction of the sheet over which it fades out
  minWidth: 1.0,                        // minimum on-screen size of a cell, in wave-buffer pixels
  filterSpread: 2.0,                    // width of the down-filter over the wave buffer, in output pixels
  tintL: [1.00, 0.985, 0.96], tintR: [0.97, 0.985, 1.00], // near-white tint across the screen
};
const BG_TINT = { top: [1.0, 1.0, 1.0], bottom: [0.985, 0.98, 0.99] };
const BG_HL = 0.12; // strength of the drifting daytime highlight
const SPARKR = { size: 3.2, blur: 6.0, dofPow: 1.2, nearSoft: 1.2, farSoft: 1.5, focusNear: 2.6, camFade: [0.6, 1.4],
  bright: 0.65, dimPow: 3.5, iri: 0.35, iriExp: 2.0, flare: 1.4, glintSize: 4.5, glintBright: 0.10 };
const DITHER = 0.85; // output levels, peak
const GLARE_DESAT = 0.6; // how far the halo is pulled towards white

// ---------------------------------------------------------------------------
// WebGL setup
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const SCORE = params.get('mode') === 'score';
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false,
  premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
if (!gl) { document.body.textContent = 'WebGL2 is not available.'; window.XMBW = { ready: Promise.reject(new Error('no WebGL2')) }; return; }
const floatRT = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
gl.getExtension('EXT_float_blend');

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
// Per fragment: c = cosine between the normal and the line of sight. The light of a
// bit of sheet is a sheen term plus a grazing (Fresnel-like) term, times a soft
// projected-size factor (dark exactly edge-on, so the glow sits beside the fold),
// times the cell's true size where it was widened (see the vertex shader).
const FS_WAVE = `#version 300 es
precision highp float;
in vec3 vP; in vec3 vN; in vec2 vST; in float vWidth;
uniform vec3 uCam; uniform float uBright, uBase, uBasePow, uFres, uFresPow, uProj, uThreads, uThreadAmp, uStreakAmp, uFadeEnds, uFadeEdges;
out vec4 o;
float band(float x, float amp){ // a periodic profile, pre-filtered by its on-screen density
  float w = fwidth(x);
  return amp * cos(6.2831853 * x) * (1.0 - smoothstep(0.2, 0.6, w));
}
void main(){
  vec3 V = normalize(uCam - vP);
  float c = abs(dot(normalize(vN), V));
  float sheen = uBase * (1.0 - (1.0 - uBasePow) * c);      // slightly stronger away from face-on
  float fres = uFres * pow(1.0 - c, uFresPow);
  float proj = (c + uProj) / (1.0 + uProj);
  float t = vST.y;
  float pat = 1.0 + band(t * uThreads, uThreadAmp)
            + band(t * 37.0 + 0.3, uStreakAmp * 0.5) + band(t * 61.0 + 0.7, uStreakAmp * 0.3) + band(t * 97.0 + 0.1, uStreakAmp * 0.2);
  float fade = smoothstep(0.0, uFadeEnds, vST.x) * smoothstep(1.0, 1.0 - uFadeEnds, vST.x)
             * smoothstep(0.0, uFadeEdges, t) * smoothstep(1.0, 1.0 - uFadeEdges, t);
  o = vec4(uBright * (sheen + fres) * proj * pat * fade * vWidth, 0.0, 0.0, 1.0);
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
uniform float uGlint, uExt; uniform vec2 uRes;
out vec2 vQ; out float vI; out vec3 vC; out float vSoft;
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
  vC = mix(vec3(1.0), ramp(a + 0.15 * aRnd), uIri);
  vI = I * (0.55 + uFlare * fl) * uGlint;
  vSoft = clamp(out_, 0.0, 1.0);
  float r = max(sizePx, 0.7) * uExt;
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vec4 clip = uVP * vec4(P, 1.0);
  if (z < 0.05) clip = vec4(2.0, 2.0, 2.0, 1.0);
  clip.xy += corner * r / uRes * 2.0 * clip.w;
  vQ = corner * r / max(sizePx, 0.7);
  if (sizePx < 0.7) vI *= (sizePx * sizePx) / 0.49;
  gl_Position = clip;
}`;
const FS_SPARK = `#version 300 es
precision highp float;
in vec2 vQ; in float vI; in vec3 vC; in float vSoft; uniform float uExt;
out vec4 o;
void main(){
  float r2 = dot(vQ, vQ);
  float sharp = exp(-r2 * 2.2);
  float soft = smoothstep(1.0, 0.55, sqrt(r2)) * 0.6 + exp(-r2 * 1.5) * 0.4;
  float k;
  if (uExt > 1.5) { // glint pass: a soft four-ray star
    vec2 q = abs(vQ) / uExt;
    float star = exp(-q.x * 3.0) * exp(-q.y * q.y * 40.0) + exp(-q.y * 3.0) * exp(-q.x * q.x * 40.0);
    k = 0.3 * star * (1.0 - vSoft) + 0.45 * exp(-dot(q, q) * 6.0);
  } else k = mix(sharp, soft, vSoft);
  o = vec4(vC * vI * k, 1.0);
}`;

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
      // night: near-dark, a faint hint of the month's colour low on one side
      const nx = (u - P.night[1]) / 0.7, ny = (1 - v) / 0.45;
      const hint = Math.exp(-(nx * nx + ny * ny)) * 0.8 + 0.2 * v * v;
      put(m * 2 + 1, x, y, [0, 1, 2].map(i => P.night[0][i] * hint));
    }
  });
  return makeTex(BG_W, BG_H * tiles, gl.RGBA16F, gl.RGBA, gl.FLOAT, gl.LINEAR, data);
}
const bgImages = makeBackgroundImages();
// Peak luminance of the background for this frame's blend (the glare keeps only
// what exceeds the background itself, so a bright palette never blooms into a haze).
function bgPeak(sc) {
  let peak = 0; const n = BG_W * BG_H;
  const a = sc.monA * 2 * n * 4, b = sc.monB * 2 * n * 4, na = a + n * 4, nb = b + n * 4, f = sc.monF, k = sc.night;
  for (let i = 0; i < n * 4; i += 4) {
    let l = 0;
    for (let c = 0; c < 3; c++) {
      const w = [0.299, 0.587, 0.114][c];
      const day = bgImageData[a + i + c] + (bgImageData[b + i + c] - bgImageData[a + i + c]) * f;
      const night = bgImageData[na + i + c] + (bgImageData[nb + i + c] - bgImageData[na + i + c]) * f;
      l += w * (day * (1 + BG_HL * 0.65) * (1 - k) + night * k);
    }
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
  let lw = Math.max(1, Math.ceil(ow / 4)), lh = Math.max(1, Math.ceil(oh / 4));
  while (RT.levels.length < 7) {
    RT.levels.push({ a: makeTarget(lw, lh, 'rgba16f'), b: makeTarget(lw, lh, 'rgba16f'), c: makeTarget(lw, lh, 'rgba16f'), w: lw, h: lh });
    if (lh <= 6) break;
    lw = Math.max(1, Math.ceil(lw / 2)); lh = Math.max(1, Math.ceil(lh / 2));
  }
  RT.out = SCORE ? makeTarget(ow, oh, 'rgba8') : null;
}

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
  gl.uniform3fv(pr.u.uTintTop, BG_TINT.top); gl.uniform3fv(pr.u.uTintBot, BG_TINT.bottom);
  gl.uniform3fv(pr.u.uTintL, WAVE.tintL); gl.uniform3fv(pr.u.uTintR, WAVE.tintR);
}

// st: { scene, cam, net0, net1, alpha, sparks, nSparks, layers, frameNo, ease }
function renderFrame(st, outTarget) {
  const L = st.layers, sc = st.scene, m = sc.mood, cam = st.cam;
  const { ww, wh, ow, oh } = RT;

  // 1. background gradient (small), eased over the previous frame
  {
    const pr = PR.bgGen; gl.useProgram(pr.p);
    const src = RT.bgA, dst = RT.bgB;
    bindTarget(dst); gl.viewport(0, 0, dst.w, dst.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bgImages); gl.uniform1i(pr.u.uImg, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(pr.u.uPrev, 1);
    gl.uniform1f(pr.u.uTiles, 24); gl.uniform1f(pr.u.uA, sc.monA); gl.uniform1f(pr.u.uB, sc.monB);
    gl.uniform1f(pr.u.uF, sc.monF); gl.uniform1f(pr.u.uNight, sc.night); gl.uniform1f(pr.u.uWday, sc.wday);
    gl.uniform1f(pr.u.uHL, BG_HL); gl.uniform1f(pr.u.uEase, RT.bgFresh ? 1 : st.ease);
    quad(); RT.bgFresh = false;
    RT.bgA = dst; RT.bgB = src;
  }
  const bgT = RT.bgA;

  // 2. wave intensity, supersampled, additive
  if (L.wave) {
    uploadNet(netTex[0], st.net0); uploadNet(netTex[1], st.net1);
    const pr = PR.wave; gl.useProgram(pr.p);
    bindTarget(RT.wave); gl.viewport(0, 0, ww, wh);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, netTex[0]); gl.uniform1i(pr.u.uNet0, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, netTex[1]); gl.uniform1i(pr.u.uNet1, 1);
    gl.uniform1f(pr.u.uAlpha, st.alpha); gl.uniformMatrix4fv(pr.u.uVP, false, cam.vp);
    const SA = 16 * WAVE.samplesAlong, SV = 16 * WAVE.samplesAcross;
    gl.uniform1i(pr.u.uSA, SA); gl.uniform1i(pr.u.uSV, SV); gl.uniform2f(pr.u.uRes, ww, wh); gl.uniform1f(pr.u.uMinW, WAVE.minWidth);
    gl.uniform3fv(pr.u.uCam, cam.pos);
    gl.uniform1f(pr.u.uBright, m.waveBright); gl.uniform1f(pr.u.uBase, m.base); gl.uniform1f(pr.u.uBasePow, m.basePow);
    gl.uniform1f(pr.u.uFres, m.fresnel); gl.uniform1f(pr.u.uFresPow, m.fresnelPow); gl.uniform1f(pr.u.uProj, m.proj);
    gl.uniform1f(pr.u.uThreads, WAVE.threads); gl.uniform1f(pr.u.uThreadAmp, m.threadAmp); gl.uniform1f(pr.u.uStreakAmp, m.streakAmp);
    gl.uniform1f(pr.u.uFadeEnds, WAVE.fadeEnds); gl.uniform1f(pr.u.uFadeEdges, WAVE.fadeEdges);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6 * SA * SV);
    gl.disable(gl.BLEND);
  }

  // 3. glare from the background and wave
  let glareT = null, glareK = 0;
  if (L.glare && (L.bg || L.wave)) { glareT = buildGlare(m, bgT, L.bg, L.wave, L.bg ? bgPeak(sc) : 0); glareK = RT.glareScale; }

  // 4. final pass at the output size
  {
    const pr = PR.final; gl.useProgram(pr.p);
    bindTarget(outTarget); gl.viewport(0, 0, ow, oh);
    setBgAndWave(pr, bgT, L.bg, L.wave, ow, oh);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, glareT ? glareT.tex : bgT.tex); gl.uniform1i(pr.u.uGlare, 2);
    gl.uniform1i(pr.u.uGlareOn, glareT ? 1 : 0); gl.uniform1f(pr.u.uGlareK, glareK);
    gl.uniform1i(pr.u.uDither, L.dither ? 1 : 0); gl.uniform1f(pr.u.uDitherAmp, DITHER);
    gl.uniform1f(pr.u.uFrame, st.frameNo % 1024);
    gl.activeTexture(gl.TEXTURE0);
    quad();
  }

  // 5. sparkles, then their glint pass, additively on top
  if (L.sparkles && st.nSparks > 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, st.sparks, 0, st.nSparks * SPARK_STRIDE);
    const pr = PR.spark; gl.useProgram(pr.p); gl.bindVertexArray(sparkVao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniformMatrix4fv(pr.u.uVP, false, cam.vp); gl.uniform3fv(pr.u.uCam, cam.pos); gl.uniform3fv(pr.u.uCamFwd, cam.fwd);
    gl.uniform1f(pr.u.uAlpha, st.alpha); gl.uniform1f(pr.u.uPxScale, oh / 1080);
    gl.uniform1f(pr.u.uSize, SPARKR.size * m.sparkSize); gl.uniform1f(pr.u.uBlur, SPARKR.blur);
    gl.uniform1f(pr.u.uFocusNear, SPARKR.focusNear); gl.uniform1f(pr.u.uFocusFar, m.focusFar);
    gl.uniform1f(pr.u.uNearSoft, SPARKR.nearSoft); gl.uniform1f(pr.u.uFarSoft, SPARKR.farSoft);
    gl.uniform1f(pr.u.uCamFade0, SPARKR.camFade[0]); gl.uniform1f(pr.u.uCamFade1, SPARKR.camFade[1]);
    gl.uniform1f(pr.u.uBright, SPARKR.bright * m.sparkBright); gl.uniform1f(pr.u.uIri, SPARKR.iri);
    gl.uniform1f(pr.u.uIriExp, SPARKR.iriExp); gl.uniform1f(pr.u.uFlare, SPARKR.flare); gl.uniform1f(pr.u.uDimPow, SPARKR.dimPow);
    gl.uniform1f(pr.u.uDofPow, SPARKR.dofPow);
    gl.uniform2f(pr.u.uRes, ow, oh);
    gl.uniform1f(pr.u.uGlint, 1.0); gl.uniform1f(pr.u.uExt, 1.6);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, st.nSparks);
    gl.uniform1f(pr.u.uGlint, SPARKR.glintBright * m.glint / 0.35); gl.uniform1f(pr.u.uExt, SPARKR.glintSize);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, st.nSparks);
    gl.disable(gl.BLEND); gl.bindVertexArray(null);
  }
}

function buildGlare(m, bgT, bgOn, waveOn, peak) {
  const lv = RT.levels;
  // bright-pass at quarter size
  let pr = PR.bright; gl.useProgram(pr.p);
  bindTarget(lv[0].a); gl.viewport(0, 0, lv[0].w, lv[0].h);
  setBgAndWave(pr, bgT, bgOn, waveOn, lv[0].w, lv[0].h);
  gl.uniform1f(pr.u.uExposure, m.exposure); gl.uniform1f(pr.u.uWhite, m.white);
  gl.uniform1f(pr.u.uThr, Math.max(m.glareThr, Math.min(0.97, peak * m.exposure + 0.06)));
  gl.uniform1f(pr.u.uDesat, GLARE_DESAT);
  gl.activeTexture(gl.TEXTURE0);
  quad();
  // mip pyramid
  pr = PR.down; gl.useProgram(pr.p); gl.uniform1i(pr.u.uT, 0);
  for (let i = 1; i < lv.length; i++) {
    bindTarget(lv[i].a); gl.viewport(0, 0, lv[i].w, lv[i].h);
    gl.bindTexture(gl.TEXTURE_2D, lv[i - 1].a.tex); gl.uniform2f(pr.u.uTexel, 0.5 / lv[i - 1].w, 0.5 / lv[i - 1].h);
    quad();
  }
  // separable blur per level, slightly different radius per channel
  pr = PR.blur; gl.useProgram(pr.p); gl.uniform1i(pr.u.uT, 0);
  const s = m.glareSigma; gl.uniform3f(pr.u.uSigma, s * 1.08, s, s * 0.93);
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

// ---------------------------------------------------------------------------
// Deterministic score mode
// ---------------------------------------------------------------------------
function parseLayers(s) {
  const all = { bg: true, wave: true, glare: true, sparkles: true, dither: true };
  if (s == null || s === '') return all;
  const L = { bg: false, wave: false, glare: false, sparkles: false, dither: false };
  for (const k of String(s).split(',')) { const t = k.trim(); if (t in L) L[t] = true; }
  return L;
}
const urlOpts = { time: params.get('time'), theme: params.get('theme'), seed: params.get('seed'), frames: params.get('frames'),
  w: params.get('w'), h: params.get('h'), layers: params.get('layers') };
function resolveOpts(opts) {
  const g = k => (opts && opts[k] != null ? opts[k] : urlOpts[k]);
  return {
    timeParts: parseTime(g('time')) || partsOf(new Date()),
    theme: Math.max(0, Math.min(12, parseInt(g('theme') ?? 0, 10) || 0)),
    seed: parseInt(g('seed') ?? 1, 10) || 0,
    frames: Math.max(0, parseInt(g('frames') ?? 0, 10) || 0),
    w: Math.max(1, parseInt(g('w') ?? 1920, 10) || 1920),
    h: Math.max(1, parseInt(g('h') ?? 1080, 10) || 1080),
    layers: parseLayers(g('layers')),
  };
}
function simMoodParams(mood, cam) { return { envCross: mood.envCross, latScale: [mood.latX, mood.latY, mood.latZ], camFwd: cam.fwd }; }
const sparkPack = new Float32Array(4096 * SPARK_STRIDE);
let scoreSim = null; // { key, sim, frames }
function render(opts) {
  const o = resolveOpts(opts);
  const scene = sceneParams(o.timeParts, o.theme);
  const cam = cameraFor(scene.mood.camPitch, o.w / o.h);
  const key = [o.seed, o.theme, o.timeParts.join(','), o.w / o.h].join('|');
  if (!scoreSim || scoreSim.key !== key || scoreSim.frames > o.frames) {
    const sim = SIMM.createSim(o.seed);
    sim.setMood(simMoodParams(scene.mood, cam));
    sim.warm(sim.warmSteps);
    scoreSim = { key, sim, frames: 0 };
  }
  while (scoreSim.frames < o.frames) { scoreSim.sim.step(); scoreSim.frames++; }
  const sim = scoreSim.sim;
  const n = sim.packSparks(sparkPack);
  ensureTargets(o.w, o.h, o.w, o.h, 2);
  RT.bgFresh = true;
  renderFrame({ scene, cam, net0: sim.netCur, net1: sim.netCur, alpha: 1, sparks: sparkPack, nSparks: n,
    layers: o.layers, frameNo: o.frames, ease: 1 }, RT.out);
  const px = new Uint8Array(o.w * o.h * 4);
  bindTarget(RT.out); gl.readPixels(0, 0, o.w, o.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const data = new Uint8ClampedArray(o.w * o.h * 4), row = o.w * 4;
  for (let y = 0; y < o.h; y++) data.set(px.subarray((o.h - 1 - y) * row, (o.h - y) * row), y * row);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  bindTarget(null);
  return { width: o.w, height: o.h, data };
}

window.XMBW = { ready: Promise.resolve(), render, _internals: { PALETTES, MOODS, WAVE, SPARKR, CAMERA, SIMM, moodAt, nightWeight, sceneParams } };
if (SCORE) { canvas.style.display = 'none'; return; }

// ---------------------------------------------------------------------------
// Normal mode: settings, panel, worker, draw loop
// ---------------------------------------------------------------------------
const STORE_KEY = 'xmb-waves-settings-v1';
const DEFAULTS = { theme: 0, useFixed: false, fixedTime: '', speed: 1, scale: 0, fps: false,
  layers: { bg: true, wave: true, glare: true, sparkles: true, dither: true } };
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { s = {}; }
  const o = { ...DEFAULTS, ...s, layers: { ...DEFAULTS.layers, ...(s.layers || {}) } };
  // URL parameters override stored settings
  if (params.has('theme')) o.theme = Math.max(0, Math.min(12, parseInt(params.get('theme'), 10) || 0));
  if (params.has('time')) { o.useFixed = true; o.fixedTime = params.get('time'); }
  if (params.has('speed')) o.speed = parseFloat(params.get('speed')) || 1;
  if (params.has('scale')) o.scale = parseFloat(params.get('scale')) || 0;
  if (params.has('fps')) o.fps = params.get('fps') === '1';
  if (params.has('layers')) o.layers = parseLayers(params.get('layers'));
  return o;
}
function saveSettings() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ } }
const S = loadSettings();
let paused = params.get('pause') === '1';

// day clock: virtual time = anchor + (now - anchorReal) * speed
let clockAnchor = null, clockReal = 0;
function resetClock() {
  const fixed = S.useFixed ? parseTime(S.fixedTime) : null;
  clockAnchor = fixed ? new Date(fixed[0], fixed[1] - 1, fixed[2], fixed[3], fixed[4], Math.floor(fixed[5])).getTime() : Date.now();
  clockReal = performance.now();
}
let clockFrozenAt = null;
function clockNow(now) {
  if (paused) { if (clockFrozenAt == null) clockFrozenAt = clockAnchor + (now - clockReal) * S.speed; return clockFrozenAt; }
  if (clockFrozenAt != null) { clockAnchor = clockFrozenAt; clockReal = now; clockFrozenAt = null; }
  return clockAnchor + (now - clockReal) * S.speed;
}
resetClock();

// panel
const $ = id => document.getElementById(id);
const panel = $('panel'), fpsEl = $('fps');
['auto (clock)', 'silver', 'yellow', 'light green', 'pink', 'green', 'lavender', 'teal', 'blue', 'purple', 'gold', 'brown', 'red']
  .forEach((n, i) => { const op = document.createElement('option'); op.value = i; op.textContent = i + ' ' + n; $('pTheme').appendChild(op); });
function syncPanel() {
  $('pTheme').value = S.theme; $('pFixed').checked = S.useFixed; $('pTime').value = S.fixedTime || '';
  $('pSpeed').value = String(S.speed);
  $('pScale').value = S.scale; $('pScaleV').textContent = S.scale ? S.scale + 'x' : 'auto';
  $('pFps').checked = S.fps; $('pPause').textContent = paused ? 'play' : 'pause'; $('pStep').disabled = !paused;
  for (const k of Object.keys(S.layers)) $('pL_' + k).checked = S.layers[k];
  fpsEl.style.display = S.fps ? 'block' : 'none';
}
$('pTheme').onchange = e => { S.theme = +e.target.value; saveSettings(); };
$('pFixed').onchange = e => { S.useFixed = e.target.checked; if (S.useFixed && !S.fixedTime) S.fixedTime = toLocalInput(new Date()); syncPanel(); resetClock(); saveSettings(); };
$('pTime').onchange = e => { S.fixedTime = e.target.value; resetClock(); saveSettings(); };
$('pSpeed').onchange = e => { const now = performance.now(); clockAnchor = clockNow(now); clockReal = now; S.speed = +e.target.value; syncPanel(); saveSettings(); };
$('pScale').oninput = e => { S.scale = +e.target.value; syncPanel(); saveSettings(); };
$('pFps').onchange = e => { S.fps = e.target.checked; syncPanel(); saveSettings(); };
$('pPause').onclick = () => { paused = !paused; worker.postMessage({ type: 'run', on: !paused && !document.hidden }); syncPanel(); };
$('pStep').onclick = () => { if (paused) worker.postMessage({ type: 'step' }); };
for (const k of Object.keys(DEFAULTS.layers)) $('pL_' + k).onchange = e => { S.layers[k] = e.target.checked; saveSettings(); };
$('gear').onclick = () => { panel.classList.toggle('open'); };
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'p' || e.key === 'h') panel.classList.toggle('open');
  if (e.key === ' ') $('pPause').onclick();
  if (e.key === '.' ) $('pStep').onclick();
});
function toLocalInput(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
let gearTimer = 0;
function pokeGear() { document.body.classList.add('active'); clearTimeout(gearTimer); gearTimer = setTimeout(() => document.body.classList.remove('active'), 2500); }
window.addEventListener('pointermove', pokeGear); window.addEventListener('pointerdown', pokeGear);
syncPanel();

// worker
function workerMain(SIMF) {
  const M = SIMF(); let sim = null, running = false, last = 0, acc = 0; const spare = [];
  const absNow = () => performance.timeOrigin + performance.now();
  function send(alpha) {
    const need = M.N * M.N * 6 + 4096 * M.SPARK_STRIDE;
    let buf = spare.pop(); if (!buf || buf.byteLength < need * 4) buf = new ArrayBuffer(need * 4);
    const f = new Float32Array(buf);
    f.set(sim.netPrev, 0); f.set(sim.netCur, M.N * M.N * 3);
    const n = sim.packSparks(f.subarray(M.N * M.N * 6));
    postMessage({ buf, n, alpha, at: absNow() }, [buf]);
  }
  function loop() {
    if (!running) return;
    const now = performance.now();
    acc += Math.min(0.25, (now - last) / 1000); last = now; // capped: no catch-up after a stall
    let n = 0;
    while (acc >= M.DT && n < 8) { sim.step(); acc -= M.DT; n++; }
    if (n) send(acc / M.DT);
    setTimeout(loop, Math.max(1, Math.floor((M.DT - acc) * 1000))); // sleep until the next step is due
  }
  onmessage = e => {
    const d = e.data;
    if (d.type === 'init') { sim = M.createSim(d.seed); sim.setMood(d.mood); sim.warm(sim.warmSteps); send(1); }
    else if (d.type === 'mood') { if (sim) sim.setMood(d.mood); }
    else if (d.type === 'run') { const was = running; running = d.on; if (running && !was) { last = performance.now(); acc = 0; loop(); } }
    else if (d.type === 'step') { if (sim) { sim.step(); send(1); } }
    else if (d.type === 'return') spare.push(d.buf);
  };
}
const workerSrc = `${XMBW_SIM.toString()}\n(${workerMain.toString()})(XMBW_SIM);`;
const worker = new Worker(URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' })));
let latest = null;
const NET3 = NN * NN * 3;
worker.onmessage = e => {
  if (latest) worker.postMessage({ type: 'return', buf: latest.buf }, [latest.buf]);
  const d = e.data, f = new Float32Array(d.buf);
  latest = { buf: d.buf, net0: f.subarray(0, NET3), net1: f.subarray(NET3, NET3 * 2), sparks: f.subarray(NET3 * 2), n: d.n, alpha: d.alpha, at: d.at };
};
const seed = params.has('seed') ? (parseInt(params.get('seed'), 10) || 0) : (Date.now() & 0x7fffffff);
let lastMoodSent = '';
function currentScene(now) {
  const tp = partsOf(new Date(clockNow(now)));
  const scene = sceneParams(tp, S.theme);
  return scene;
}
{
  const sc0 = currentScene(performance.now());
  worker.postMessage({ type: 'init', seed, mood: simMoodParams(sc0.mood, cameraFor(sc0.mood.camPitch, 16 / 9)) });
  worker.postMessage({ type: 'run', on: !paused });
}

// screen wake lock
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !document.hidden && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) { wakeLock = null; }
}
keepAwake();
window.addEventListener('pointerdown', keepAwake);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { worker.postMessage({ type: 'run', on: false }); }
  else { worker.postMessage({ type: 'run', on: !paused }); keepAwake(); lastDraw = 0; schedule(); }
});

// a lost WebGL context (memory pressure on a tablet): stop drawing, reload when it comes back
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); worker.postMessage({ type: 'run', on: false }); }, false);
canvas.addEventListener('webglcontextrestored', () => { location.reload(); }, false);

// draw loop (capped at 60 fps)
let lastDraw = 0, frameNo = 0, fpsCount = 0, fpsT = performance.now(), rafPending = false, firstState = 0;
function schedule() { if (!rafPending) { rafPending = true; requestAnimationFrame(tick); } }
function tick(now) {
  rafPending = false;
  if (document.hidden) return;
  schedule();
  if (now - lastDraw < 1000 / 60 - 1.5) return;
  lastDraw = now;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  const ow = Math.max(1, Math.round(cssW * dpr)), oh = Math.max(1, Math.round(cssH * dpr));
  const scale = S.scale > 0 ? S.scale : dpr;              // render pixels per CSS pixel
  const cw = Math.max(1, Math.round(cssW * scale)), ch = Math.max(1, Math.round(cssH * scale));
  if (canvas.width !== ow || canvas.height !== oh) { canvas.width = ow; canvas.height = oh; }
  // the wave buffer is at least twice the screen size: supersample unless the render already is
  const ss = cw >= ow * 1.5 ? 1 : 2;
  ensureTargets(cw, ch, ow, oh, ss);
  const scene = currentScene(now);
  const cam = cameraFor(scene.mood.camPitch, cw / ch);
  const ms = JSON.stringify(simMoodParams(scene.mood, cam), (k, v) => typeof v === 'number' ? +v.toFixed(3) : v);
  if (ms !== lastMoodSent) { worker.postMessage({ type: 'mood', mood: JSON.parse(ms) }); lastMoodSent = ms; }
  if (!latest) { // the worker is still warming up: show the background alone
    renderFrame({ scene, cam, net0: null, net1: null, alpha: 1, sparks: null, nSparks: 0,
      layers: { ...S.layers, wave: false, glare: false, sparkles: false }, frameNo: frameNo++, ease: 0.05 }, null);
    return;
  }
  const alpha = paused ? 1 : Math.min(1, latest.alpha + (performance.timeOrigin + now - latest.at) / 1000 / DT);
  if (!firstState) firstState = now;
  const fadeIn = Math.min(1, (now - firstState) / 1200); // the wave and sparkles fade in over the first second
  if (fadeIn < 1) { scene.mood = { ...scene.mood, waveBright: scene.mood.waveBright * fadeIn, sparkBright: scene.mood.sparkBright * fadeIn, glareStrength: scene.mood.glareStrength * fadeIn }; }
  renderFrame({ scene, cam, net0: latest.net0, net1: latest.net1, alpha, sparks: latest.sparks, nSparks: latest.n,
    layers: S.layers, frameNo: frameNo++, ease: 0.05 }, null);
  fpsCount++;
  if (now - fpsT > 500) { fpsEl.textContent = (fpsCount * 1000 / (now - fpsT)).toFixed(0) + ' fps · ' + cw + 'x' + ch; fpsCount = 0; fpsT = now; }
}
schedule();
})();
