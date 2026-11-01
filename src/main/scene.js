const SIMM = XMBW_SIM();
const NN = SIMM.N, DT = SIMM.DT, SPARK_STRIDE = SIMM.SPARK_STRIDE;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Palettes (original design). Each month has a day image and a night image,
// generated in code as small soft images (see makeBackgroundImages).
//   top, bottom: colours at the top and bottom edge
//   glow: colour added by a broad soft highlight, glowPos [x, y], glowSize
//   tilt: brightness change from left to right
//   night: [colour of the night glow over the lower part, where it is strongest (0 = left, 1 = right)]
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
  'waveBright', 'base', 'fres', 'sizeK',
  'latX', 'latY', 'latZ', 'envCross', 'camPitch',
  'black', 'exposure', 'white', 'glareThr', 'glareSigma', 'glareRatio', 'glareStrength',
  'focusFar', 'sparkSize', 'sparkBright', 'glint',
];
const MOODS = {
  night: { waveBright: 0.29, base: 1.6, fres: 1.7, sizeK: 0.54,
    latX: 1.00, latY: 0.92, latZ: 1.00, envCross: 0.20, camPitch: -3,
    black: 0.02, exposure: 1.5, white: 1.0, glareThr: 0.90, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.6,
    focusFar: 30.0, sparkSize: 1.1, sparkBright: 1.0, glint: 0.30 },
  dawn: { waveBright: 0.5, base: 1.8, fres: 1.6, sizeK: 0.6,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.25, camPitch: -8,
    black: 0.02, exposure: 1.1, white: 1.0, glareThr: 0.70, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 1.3,
    focusFar: 30.0, sparkSize: 1.1, sparkBright: 1.0, glint: 0.35 },
  day: { waveBright: 0.15, base: 1.2, fres: 2.4, sizeK: 0.6,
    latX: 1.00, latY: 1.00, latZ: 1.00, envCross: 0.28, camPitch: -8,
    black: 0.02, exposure: 1.0, white: 0.9, glareThr: 0.70, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 30.0, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
  dusk: { waveBright: 0.5, base: 1.8, fres: 1.6, sizeK: 0.54,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.20, camPitch: -8,
    black: 0.02, exposure: 1.25, white: 1.0, glareThr: 0.70, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 30.0, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
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
// Background night weight (N6): fades out 00:00-05:00, zero by day, fades in 18:30-20:30.
function nightWeight(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5) return 1 - ease(h / 5);
  if (h < 18.5) return 0;
  if (h < 20.5) return ease((h - 18.5) / 2);
  return 1;
}
// The day image's daylight factor (N8): darkest about 02:00, steep rise 03:00-06:00, gentle to mid-afternoon, fading
// 19:00-22:00. Eased between these keys (hour, level).
const DAYLIGHT = [[0, 0.10], [2, 0.03], [3, 0.06], [6, 0.82], [15, 1.0], [19, 1.0], [22, 0.14], [24, 0.10]];
function daylight(hour) {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 1; i < DAYLIGHT.length; i++) if (h <= DAYLIGHT[i][0]) {
    const [h0, a] = DAYLIGHT[i - 1], [h1, b] = DAYLIGHT[i]; return a + (b - a) * ease((h - h0) / (h1 - h0));
  }
  return DAYLIGHT[0][1];
}
// Warped hour: advances slowly around midday and quickly around midnight; returns 0..1 over the day.
function warpedDay(hour) {
  const p = ((hour - 12) / 24) * TAU; // -pi..pi, 0 at noon
  return 0.5 + (p - 0.6 * Math.sin(p)) / TAU;
}
// The night image's clock, noon to noon: its light rises at the left in the evening, is high in the middle at midnight
// and sets at the right towards morning.
function warpedNight(hour) { return warpedDay(hour + 12); }
// Dawn and dusk: 1 around 06:30 and 18:00, 0 around midday and midnight.
function duskTerm(hour) {
  const h = ((hour % 24) + 24) % 24, b = (c) => Math.exp(-Math.pow(Math.min(Math.abs(h - c), 24 - Math.abs(h - c)) / 1.6, 2));
  return Math.max(b(6.5), b(18));
}
// Next month's images rising from the bottom (N7): the centre of the S-shaped step (in screen heights, 0 = bottom) and its
// half-width for the month's progress p (whole days): nothing before about the 6th, about half and half over the whole
// screen in the middle (a very broad step), next month's complete at the bottom by about the 22nd and the top by the 26th.
function monthStep(p) {
  const c = -0.2 + 1.4 * Math.min(Math.max((p - 0.2) / 0.65, 0), 1);
  return [c, 0.15 + 3.0 * Math.exp(-Math.pow((p - 0.5) / 0.1, 2))];
}
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

function sceneParams(tp, theme) {
  const [y, mon, day, hh, mm, ss] = tp;
  const hour = hh + mm / 60 + ss / 3600;
  if (theme >= 1 && theme <= 12) {
    return { monA: theme - 1, monB: theme % 12, monC: -5, monW: 0.15, mid: 0, night: 0, daylight: 1, wday: warpedDay(12),
      wnight: warpedNight(12), dusk: 0, mood: { ...MOODS.day } };
  }
  const p = (day - 1) / daysInMonth(y, mon), [monC, monW] = monthStep(p);
  return { monA: mon - 1, monB: mon % 12, monC, monW, mid: Math.exp(-Math.pow((p - 0.5) / 0.15, 2)), night: nightWeight(hour),
    daylight: daylight(hour), wday: warpedDay(hour), wnight: warpedNight(hour), dusk: duskTerm(hour), mood: moodAt(hour) };
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
// Camera (original design): looks across the sheet from in front, very nearly at right angles to its length (a slight
// yaw puts the shaken left side nearer), from slightly below it, looking up (negative pitch); the pitch follows the mood
// (flatter at night).
// ---------------------------------------------------------------------------
const CAMERA = { fovY: 64.4, yaw: 6, dist: 3.161, target: [0.8, -0.1, 0.0], near: 0.1, far: 40 }; // a moderate field of view, close; the sheet seen from slightly below (spec 17)
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
  sheenCut0: 0.22, sheenCut1: 0.42, // the sheen falls linearly between these size factors (the fused thread profile)
  // the Fresnel-like peak: where it sits in cosine x size factor; zero below fresZero of that; the tail's length above it
  fresPeak: 0.0936, fresZero: 0.55, fresTail: 0.35,
  fade: 0.06,                           // fraction of the sheet over which it fades out, linearly, at the ends and edges
  filterSpread: 1.0,                    // width of the down-filter over the wave buffer: one output pixel (spec 16)
  tintL: [0.94, 0.94, 0.94], tintR: [1.0, 1.0, 1.0], // a neutral tint brightening slightly from left to right
};
// (these scalars are let, not const, only so the settings menu can change them live)
// background lighting (spec 17, original design): base level away from the lights, the spot's and the bottom glow's
// added light, the night image's base, how much paler lit areas get, how far dawn and dusk darken and saturate the top,
// the mid-month saturation drop, and the night image's share of the mix at full night weight
const NIGHT_GLOW = 3.0; // the night images' glow, relative to the palette's night colour
const BGL = { base: 0.8, spot: 0.35, glow: 0.25, nightBase: 0.6, pale: 0.25, duskDark: 0.35, duskSat: 0.35, midSat: 0.10, nightMix: 0.6 };
let BG_EASE = 0.05; // how far the background gradient moves towards its new value each frame
const SPARKR = {
  // size in scene units (spec 17: set in the scene, so smaller the farther away; no random size); out of focus a disc grows
  // by up to blur times its size and dims a little (dofDim); only the near side of the focus range is reached
  size: 0.010, blur: 0.8, dofDim: 0.3, nearSoft: 0.72, farSoft: 1.5, focusNear: 2.59,
  turn: 0.3,                       // part of the way every disc is turned towards the camera (fully when close)
  bright: 1.5, glintSize: 4.5, glintBright: 0.10,
  // lighting (spec 16 and 17): one point light in the scene in front of the camera, diffuse kd and specular ks with exponent
  // shin, the highlight tinted by the iridescent map (saturation mapSat everywhere, exponent mapExp = 1 leaves it unchanged),
  // the sum through 1 - exp(-satGain x); opacity falls as a disc turns towards edge-on, with the power tiltPow of one minus
  // the cosine
  light: [1.3, 0.7, -1.5], kd: 0.25, ks: 1.5, shin: 40, mapExp: 1.0, mapSat: 0.45, satGain: 1.5, tiltPow: 1.0,
};
let DITHER = 0.85; // output levels, peak

