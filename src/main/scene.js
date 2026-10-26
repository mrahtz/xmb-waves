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
  'waveBright', 'base', 'baseC', 'baseK', 'threadAmp',
  'latX', 'latY', 'latZ', 'envCross', 'camPitch',
  'exposure', 'white', 'glareThr', 'glareSigma', 'glareRatio', 'glareStrength',
  'focusFar', 'sparkSize', 'sparkBright', 'glint',
];
const MOODS = {
  night: { waveBright: 2.12, base: 0.24, baseC: 0.3202, baseK: 2.209, threadAmp: 0.0,
    latX: 1.00, latY: 0.92, latZ: 1.00, envCross: 0.50, camPitch: 1.7,
    exposure: 1.0, white: 2.2, glareThr: 0.90, glareSigma: 1.5, glareRatio: 0.85, glareStrength: 0.0,
    focusFar: 12.4, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
  dawn: { waveBright: 1.68, base: 0.30, baseC: 0.3202, baseK: 2.209, threadAmp: 0.0,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.55, camPitch: 2.7,
    exposure: 1.0, white: 1.0, glareThr: 0.70, glareSigma: 1.5, glareRatio: 0.85, glareStrength: 0.9,
    focusFar: 12.4, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
  day: { waveBright: 1.68, base: 0.30, baseC: 0.3202, baseK: 2.209, threadAmp: 0.0,
    latX: 1.00, latY: 1.00, latZ: 1.00, envCross: 0.58, camPitch: 2.7,
    exposure: 1.0, white: 1.0, glareThr: 0.70, glareSigma: 1.5, glareRatio: 0.85, glareStrength: 0.9,
    focusFar: 12.5, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
  dusk: { waveBright: 2.76, base: 0.32, baseC: 0.3202, baseK: 2.209, threadAmp: 0.0,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.55, camPitch: 2.7,
    exposure: 1.0, white: 1.0, glareThr: 0.70, glareSigma: 1.5, glareRatio: 0.85, glareStrength: 0.9,
    focusFar: 12.4, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
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
const CAMERA = { fovY: 18, yaw: -20, dist: 11, target: [0.8, 0.30, 0.0], near: 0.1, far: 40 }; // far back with a narrow view, so near and far parts look alike
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
  samplesAlong: 64, samplesAcross: 6,   // per patch (16 x 16 patches)
  threads: 400,                         // thread periods across the sheet
  fadeEnds: 0.10, fadeEdges: 0.04,      // fraction of the sheet over which it fades out
  minWidth: 1.0,                        // minimum on-screen size of a cell, in wave-buffer pixels
  filterSpread: 5.5,                    // width of the down-filter over the wave buffer, in output pixels
  tintL: [1.00, 0.985, 0.96], tintR: [0.97, 0.985, 1.00], // near-white tint across the screen
};
const BG_TINT = { top: [1.0, 1.0, 1.0], bottom: [0.985, 0.98, 0.99] };
// (these scalars are let, not const, only so the settings menu can change them live)
let BG_HL = 0.12; // strength of the drifting daytime highlight
let BG_EASE = 0.05; // how far the background gradient moves towards its new value each frame
const SPARKR = { size: 3.2, blur: 6.0, dofPow: 1.2, nearSoft: 2.5, farSoft: 3.0, focusNear: 9.0, camFade: [3.0, 5.0],
  bright: 0.65, dimPow: 3.5, iri: 0.8, iriShare: 0.08, iriExp: 2.0, flare: 1.4, glintSize: 4.5, glintBright: 0.10,
  streak: 0.25, streakShare: 0.35 }; // iriShare: share of strongly coloured sparkles; streak: seconds of motion a streak spans
                                     // (at most 6 px at 1080p)
let DITHER = 0.85; // output levels, peak
let GLARE_DESAT = 0.6; // how far the halo is pulled towards white

