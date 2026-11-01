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
  /* 1 silver      */ { top: [0.485, 0.490, 0.479], bottom: [0.654, 0.632, 0.640], glow: [0.130, 0.125, 0.112], glowPos: [0.55, 0.10], glowSize: 0.55, tilt: 0.06, night: [[0.193, 0.168, 0.249], 0.35] },
  /* 2 yellow      */ { top: [0.629, 0.599, 0.250], mid: [0.478, 0.421, 0.143], bottom: [0.716, 0.688, 0.387], glow: [0.113, 0.103, 0.056], glowPos: [0.30, 0.0], glowSize: 0.55, tilt: -0.10, night: [[0.115, 0.157, 0.028], 0.55] },
  /* 3 light green */ { top: [0.427, 0.557, 0.159], bottom: [0.646, 0.830, 0.447], glow: [0.157, 0.186, 0.090], glowPos: [0.55, 0.10], glowSize: 0.55, tilt: 0.06, night: [[0.059, 0.157, 0.014], 0.35] },
  /* 4 pink        */ { top: [0.511, 0.260, 0.338], mid: [0.601, 0.307, 0.406], bottom: [0.865, 0.453, 0.607], glow: [0.157, 0.077, 0.113], glowPos: [0.12, 0.25], glowSize: 0.55, tilt: -0.22, night: [[0.200, 0.042, 0.143], 0.35] },
  /* 5 green       */ { top: [0.067, 0.434, 0.136], mid: [0.057, 0.488, 0.143], bottom: [0.093, 0.593, 0.209], glow: [0.067, 0.145, 0.068], glowPos: [0.35, 0.0], glowSize: 0.55, tilt: 0.04, night: [[0.017, 0.196, 0.021], 0.35] },
  /* 6 lavender    */ { top: [0.472, 0.351, 0.704], bottom: [0.716, 0.652, 1.000], glow: [0.157, 0.124, 0.205], glowPos: [0.55, 0.10], glowSize: 0.55, tilt: 0.06, night: [[0.082, 0.079, 0.137], 0.35] },
  /* 7 teal        */ { top: [0.097, 0.433, 0.446], bottom: [0.181, 0.591, 0.473], glow: [0.129, 0.173, 0.171], glowPos: [0.55, 0.10], glowSize: 0.55, tilt: 0.06, night: [[0.000, 0.132, 0.045], 0.35] },
  /* 8 blue        */ { top: [0.270, 0.516, 0.635], bottom: [0.115, 0.237, 0.626], glow: [0.090, 0.103, 0.113], glowPos: [0.30, 0.0], glowSize: 0.55, tilt: 0.28, night: [[0.033, 0.059, 0.233], 0.15] },
  /* 9 purple      */ { top: [0.247, 0.155, 0.409], bottom: [0.693, 0.451, 0.983], glow: [0.225, 0.165, 0.295], glowPos: [0.50, 0.0], glowSize: 0.42, tilt: 0.04, night: [[0.059, 0.068, 0.247], 0.15] },
  /*10 gold        */ { top: [0.430, 0.376, 0.130], bottom: [0.535, 0.425, 0.088], glow: [0.179, 0.187, 0.172], glowPos: [0.45, 0.0], glowSize: 0.45, tilt: -0.04, night: [[0.219, 0.104, 0.000], 0.35] },
  /*11 brown       */ { top: [0.494, 0.330, 0.136], bottom: [0.462, 0.284, 0.118], glow: [0.292, 0.258, 0.227], glowPos: [0.30, 0.0], glowSize: 0.40, tilt: -0.10, night: [[0.099, 0.068, 0.017], 0.35] },
  /*12 red         */ { top: [0.585, 0.082, 0.090], bottom: [0.807, 0.261, 0.298], glow: [0.180, 0.082, 0.079], glowPos: [0.55, 0.10], glowSize: 0.55, tilt: 0.06, night: [[0.166, 0.023, 0.014], 0.35] },
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
  night: { waveBright: 0.22, base: 1.6, fres: 1.7, sizeK: 0.54,
    latX: 1.00, latY: 0.92, latZ: 1.00, envCross: 0.20, camPitch: -3,
    black: 0.02, exposure: 1.5, white: 1.0, glareThr: 0.90, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.6,
    focusFar: 30.0, sparkSize: 1.1, sparkBright: 1.0, glint: 0.30 },
  dawn: { waveBright: 0.20, base: 1.8, fres: 1.6, sizeK: 0.6,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.25, camPitch: -8,
    black: 0.02, exposure: 1.1, white: 1.0, glareThr: 0.70, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 1.3,
    focusFar: 30.0, sparkSize: 1.1, sparkBright: 1.0, glint: 0.35 },
  day: { waveBright: 0.15, base: 1.2, fres: 2.4, sizeK: 0.6,
    latX: 1.00, latY: 1.00, latZ: 1.00, envCross: 0.28, camPitch: -8,
    black: 0.02, exposure: 1.0, white: 0.9, glareThr: 0.70, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 30.0, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
  dusk: { waveBright: 0.24, base: 1.8, fres: 1.6, sizeK: 0.54,
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
  sheenCut0: 0.2179, sheenCut1: 0.599, // the sheen falls linearly between these size factors (the fused thread profile)
  // the Fresnel-like peak: where it sits in cosine x size factor; zero below fresZero of that; the tail's length above it
  fresPeak: 0.12, fresZero: 0.5961, fresTail: 0.1403,
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
  size: 0.010, blur: 0.5, dofDim: 0.3, nearSoft: 0.72, farSoft: 1.5, focusNear: 2.59,
  turn: 0.3,                       // part of the way every disc is turned towards the camera (fully when close)
  bright: 0.55, glintSize: 4.5, glintBright: 0.10,
  // lighting (spec 16 and 17): one point light in the scene in front of the camera, diffuse kd and specular ks with exponent
  // shin, the highlight tinted by the iridescent map (saturation mapSat everywhere, exponent mapExp = 1 leaves it unchanged),
  // the sum through 1 - exp(-satGain x); opacity falls as a disc turns towards edge-on, with the power tiltPow of one minus
  // the cosine
  light: [1.3, 0.7, -1.5], kd: 0.25, ks: 1.5, shin: 40, mapExp: 1.0, mapSat: 0.15, satGain: 1.5, tiltPow: 1.0,
};
let DITHER = 0.85; // output levels, peak

