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
  /* 1 silver      */ { top: [0.482, 0.521, 0.474], mid: [0.545, 0.499, 0.537], bottom: [0.579, 0.581, 0.606], glow: [0.198, 0.170, 0.044], glowPos: [0.978, 0.408], glowSize: 0.565, tilt: 0.013, night: [[0.361, 0.262, 0.247], 0.350] },
  /* 2 yellow      */ { top: [0.706, 0.697, 0.217], mid: [0.577, 0.478, 0.001], bottom: [0.872, 0.783, 0.297], glow: [0.271, 0.214, 0.043], glowPos: [0.157, 0.008], glowSize: 0.448, tilt: -0.059, night: [[0.219, 0.285, 0.195], 0.550] },
  /* 3 light green */ { top: [0.407, 0.573, 0.063], bottom: [0.594, 0.820, 0.348], glow: [0.157, 0.186, 0.090], glowPos: [0.550, 0.100], glowSize: 0.550, tilt: 0.060, night: [[0.098, 0.239, 0.032], 0.350] },
  /* 4 pink        */ { top: [0.528, 0.241, 0.324], mid: [0.466, 0.047, 0.258], bottom: [0.843, 0.252, 0.559], glow: [0.108, 0.000, 0.000], glowPos: [0.000, 0.374], glowSize: 0.643, tilt: 0.021, night: [[0.373, 0.000, 0.182], 0.350] },
  /* 5 green       */ { top: [0.070, 0.291, 0.048], mid: [0.151, 0.600, 0.184], bottom: [0.006, 0.538, 0.055], glow: [0.001, 0.248, 0.009], glowPos: [0.772, 0.137], glowSize: 0.751, tilt: 0.400, night: [[0.006, 0.328, 0.109], 0.350] },
  /* 6 lavender    */ { top: [0.427, 0.272, 0.725], bottom: [0.638, 0.559, 0.988], glow: [0.157, 0.124, 0.205], glowPos: [0.550, 0.100], glowSize: 0.550, tilt: 0.060, night: [[0.130, 0.125, 0.209], 0.350] },
  /* 7 teal        */ { top: [0.002, 0.477, 0.515], mid: [0.000, 0.373, 0.426], bottom: [0.024, 0.349, 0.422], glow: [0.002, 0.312, 0.283], glowPos: [0.872, 0.600], glowSize: 0.558, tilt: 0.392, night: [[0.012, 0.154, 0.212], 0.350] },
  /* 8 blue        */ { top: [0.079, 0.594, 0.639], mid: [0.000, 0.322, 0.461], bottom: [0.021, 0.357, 0.551], glow: [0.072, 0.316, 0.525], glowPos: [0.009, 0.089], glowSize: 0.544, tilt: 0.400, night: [[0.000, 0.177, 0.182], 0.150] },
  /* 9 purple      */ { top: [0.213, 0.095, 0.421], bottom: [0.614, 0.316, 0.971], glow: [0.225, 0.165, 0.295], glowPos: [0.500, 0], glowSize: 0.420, tilt: 0.040, night: [[0.105, 0.118, 0.378], 0.150] },
  /*10 gold        */ { top: [0.551, 0.498, 0.013], mid: [0.587, 0.438, 0.000], bottom: [0.769, 0.492, 0.054], glow: [0.095, 0.052, 0.071], glowPos: [0.868, 0.160], glowSize: 0.530, tilt: -0.139, night: [[0.379, 0.242, 0.003], 0.350] },
  /*11 brown       */ { top: [0.504, 0.273, 0.008], mid: [0.502, 0.307, 0.045], bottom: [0.465, 0.357, 0.096], glow: [0.080, 0.086, 0.041], glowPos: [0.141, 0.164], glowSize: 0.449, tilt: 0.115, night: [[0.164, 0.068, 0.000], 0.350] },
  /*12 red         */ { top: [0.602, 0.013, 0.023], bottom: [0.798, 0.124, 0.170], glow: [0.180, 0.082, 0.079], glowPos: [0.550, 0.100], glowSize: 0.550, tilt: 0.060, night: [[0.254, 0.047, 0.034], 0.350] },
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
// Background clock (spec 19). The warped hour advances slowly around midday and quickly around midnight; one angle of it
// (0 at the warp's midday, +-pi at its midnight) drives the day image's two lights, its daylight factor and its shaping down
// the frame. BGW: warp strength, the hour the warp centres on, the daylight factor's floor and exponent, and the warped
// angles between which the shaping down the frame switches on (nothing below a0, full from a1).
const BGW = { warp: 0.808, noon: 11.954, dayFloor: 0.034, dayPow: 0.896, a0: 1.590, a1: 2.231, envPow: 3.287 };
function wrapPi(a) { return a - TAU * Math.floor((a + Math.PI) / TAU); }
function dayAngle(hour) {
  const p = wrapPi(((hour - BGW.noon) / 24) * TAU);
  return p - BGW.warp * Math.sin(p);
}
// The day image's daylight factor: from the warped angle alone, lowest (close to nothing) at midnight, rising without
// turning back to its top at midday. The picture's minimum after midnight comes from the mix with the night image.
function daylightOf(a) { return BGW.dayFloor + (1 - BGW.dayFloor) * Math.pow(0.5 + 0.5 * Math.cos(a), BGW.dayPow); }
// Strength of the clock's shaping of the day image down the frame: nothing from early morning until late evening, full
// through the late evening and the small hours.
function topShape(a) { return ease((Math.abs(a) - BGW.a0) / (BGW.a1 - BGW.a0)); }
// The night images' clock: not warped, one steady turn a day counted from midday (0 at midnight, -pi/2 at 18:00 with the
// light at the left edge, +pi/2 at 06:00 at the right edge, +-pi at midday below the picture).
function nightAngle(hour) { return wrapPi(((hour - 12) / 24) * TAU - Math.PI); }
// The night images' time envelope: highest in the middle of the night, lowest at dusk and dawn (and by day).
function nightEnvelope(a) { return Math.pow(0.5 + 0.5 * Math.cos(a), BGW.envPow); }
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
  if (theme >= 1 && theme <= 12) { // month n's palette at midday at the start of month n, day mood
    const a = dayAngle(BGW.noon);
    return { monA: theme - 1, monB: theme % 12, monC: -5, monW: 0.15, mid: 0, night: 0, aday: a, daylight: daylightOf(a),
      top: topShape(a), anight: nightAngle(12), nightEnv: 0, mood: { ...MOODS.day } };
  }
  const p = (day - 1) / daysInMonth(y, mon), [monC, monW] = monthStep(p), a = dayAngle(hour), an = nightAngle(hour);
  return { monA: mon - 1, monB: mon % 12, monC, monW, mid: Math.exp(-Math.pow((p - 0.5) / 0.15, 2)), night: nightWeight(hour),
    aday: a, daylight: daylightOf(a), top: topShape(a), anight: an, nightEnv: nightEnvelope(an), mood: moodAt(hour) };
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
// background (spec 19, original design). Day images: base: value away from both lights (a light lifts its area towards
// the image's own value, never past it); spot: its strength, oval (centre x amplitude, centre y amplitude: the centre is on
// the top edge at midday and 1 - 2 ovalY below the bottom at midnight) and radii; band: the bottom glow's strength, centre x
// amplitude (mirrored from the spot), half-width, centre height and half-height; pale: how much paler lit areas get;
// midSat: the mid-month saturation drop; topDark, topSat, topPow: the clock's shaping down the frame (value reduced, and
// saturation raised, by strength x height^topPow). Night images: nightMix: their share at full night weight; nightBase:
// their level away from the lights; nightFloor: the floor under the lit, enveloped level.
// the night images: dark above top (in image heights from the top), rising with exponent pow to the bottom, brighter by side
// towards the palette's side, glow times the palette's night colour
const NIGHT_IMG = { top: 0.265, pow: 0.905, side: 0.000, glow: 3.000 };
const BGL = { base: 0.668, spot: 0.868, ovalX: 0.770, ovalY: 0.717, spotW: 0.417, spotH: 0.329,
  glow: 0.713, bandX: 0.386, bandW: 0.575, bandY: -0.033, bandH: 0.348, pale: 0.278, midSat: 0.300,
  topDark: 1.862, topSat: 6.763, topPow: 0.729, nightMix: 0.358, nightBase: 0.483, nightFloor: 0.309 };
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

