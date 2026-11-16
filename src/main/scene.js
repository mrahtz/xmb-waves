const SIMM = XMBW_SIM();
const NN = SIMM.N, DT = SIMM.DT, SPARK_STRIDE = SIMM.SPARK_STRIDE;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Palettes (original design). Each month has a day image and a night image:
// small painted pictures, each described by a coarse grid of colours read with
// smooth interpolation (spec 23). A grid can hold any smooth picture - the
// colour varies down the image, across it and diagonally, the hue drifts where
// the brightness does not, and the left-to-right difference may reverse down
// the frame - while staying too coarse to show an edge or to take in noise.
//   day:   BG_GRID_W x BG_GRID_H colours, row by row from the top of the image
//   night: BG_GRID_W x BG_NGRID_H colours, the same way (the month's dark look,
//          with structure of its own: the glow's lean and the lower corners)
// Colours are display values (sRGB-encoded) in 0..1, three numbers each.
// ---------------------------------------------------------------------------
const BG_GRID_W = 3, BG_GRID_H = 4, BG_NGRID_H = 4;
const PALETTES = [
  /*  1 silver      */ { day: [
    0.475, 0.521, 0.467,  0.526, 0.565, 0.481,  0.586, 0.618, 0.496,
    0.526, 0.499, 0.516,  0.627, 0.586, 0.541,  0.748, 0.690, 0.570,
    0.553, 0.515, 0.553,  0.628, 0.580, 0.572,  0.717, 0.657, 0.595,
    0.577, 0.584, 0.607,  0.597, 0.602, 0.614,  0.620, 0.622, 0.622
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.104, 0.076, 0.071,  0.104, 0.076, 0.071,  0.104, 0.076, 0.071,
    0.640, 0.464, 0.438,  0.640, 0.464, 0.438,  0.640, 0.464, 0.438,
    1.054, 0.765, 0.721,  1.054, 0.765, 0.721,  1.054, 0.765, 0.721
  ] },
  /*  2 yellow      */ { day: [
    1.062, 0.992, 0.296,  0.887, 0.851, 0.265,  0.685, 0.687, 0.229,
    0.744, 0.637, 0.064,  0.665, 0.573, 0.052,  0.574, 0.500, 0.040,
    0.662, 0.559, 0.066,  0.644, 0.544, 0.064,  0.626, 0.528, 0.063,
    0.923, 0.834, 0.333,  0.898, 0.811, 0.324,  0.872, 0.788, 0.315
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.063, 0.082, 0.056,  0.063, 0.082, 0.056,  0.063, 0.082, 0.056,
    0.388, 0.505, 0.346,  0.388, 0.505, 0.346,  0.388, 0.505, 0.346,
    0.639, 0.832, 0.569,  0.639, 0.832, 0.569,  0.639, 0.832, 0.569
  ] },
  /*  3 light green */ { day: [
    0.462, 0.635, 0.096,  0.572, 0.768, 0.154,  0.521, 0.711, 0.120,
    0.495, 0.681, 0.164,  0.581, 0.785, 0.210,  0.548, 0.749, 0.187,
    0.540, 0.746, 0.271,  0.571, 0.786, 0.288,  0.577, 0.796, 0.290,
    0.581, 0.801, 0.343,  0.597, 0.825, 0.353,  0.614, 0.848, 0.363
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.028, 0.069, 0.009,  0.028, 0.069, 0.009,  0.028, 0.069, 0.009,
    0.174, 0.424, 0.057,  0.174, 0.424, 0.057,  0.174, 0.424, 0.057,
    0.286, 0.698, 0.093,  0.286, 0.698, 0.093,  0.286, 0.698, 0.093
  ] },
  /*  4 pink        */ { day: [
    0.606, 0.257, 0.330,  0.577, 0.259, 0.333,  0.548, 0.262, 0.337,
    0.578, 0.085, 0.259,  0.527, 0.086, 0.262,  0.477, 0.087, 0.265,
    0.633, 0.088, 0.325,  0.599, 0.089, 0.329,  0.566, 0.090, 0.332,
    0.891, 0.268, 0.578,  0.887, 0.271, 0.584,  0.884, 0.274, 0.590
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.108, 0.000, 0.053,  0.108, 0.000, 0.053,  0.108, 0.000, 0.053,
    0.661, 0.000, 0.323,  0.661, 0.000, 0.323,  0.661, 0.000, 0.323,
    1.089, 0.000, 0.531,  1.089, 0.000, 0.531,  1.089, 0.000, 0.531
  ] },
  /*  5 green       */ { day: [
    0.050, 0.286, 0.031,  0.062, 0.488, 0.043,  0.074, 0.610, 0.053,
    0.112, 0.493, 0.129,  0.138, 0.731, 0.163,  0.164, 0.896, 0.195,
    0.097, 0.517, 0.129,  0.119, 0.697, 0.162,  0.142, 0.842, 0.193,
    0.000, 0.438, 0.035,  0.000, 0.555, 0.044,  0.000, 0.664, 0.052
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.002, 0.095, 0.031,  0.002, 0.095, 0.031,  0.002, 0.095, 0.031,
    0.011, 0.581, 0.193,  0.011, 0.581, 0.193,  0.011, 0.581, 0.193,
    0.018, 0.957, 0.318,  0.018, 0.957, 0.318,  0.018, 0.957, 0.318
  ] },
  /*  6 lavender    */ { day: [
    0.481, 0.314, 0.790,  0.591, 0.400, 0.940,  0.542, 0.358, 0.880,
    0.520, 0.379, 0.839,  0.607, 0.446, 0.957,  0.575, 0.420, 0.920,
    0.577, 0.478, 0.907,  0.609, 0.504, 0.953,  0.615, 0.510, 0.966,
    0.624, 0.548, 0.965,  0.642, 0.564, 0.993,  0.660, 0.580, 1.021
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.038, 0.036, 0.060,  0.038, 0.036, 0.060,  0.038, 0.036, 0.060,
    0.230, 0.222, 0.370,  0.230, 0.222, 0.370,  0.230, 0.222, 0.370,
    0.379, 0.365, 0.610,  0.379, 0.365, 0.610,  0.379, 0.365, 0.610
  ] },
  /*  7 teal        */ { day: [
    0.002, 0.396, 0.426,  0.003, 0.515, 0.550,  0.003, 0.633, 0.671,
    0.000, 0.329, 0.368,  0.000, 0.545, 0.580,  0.001, 0.754, 0.786,
    0.005, 0.301, 0.348,  0.007, 0.570, 0.609,  0.009, 0.829, 0.861,
    0.021, 0.287, 0.347,  0.027, 0.450, 0.515,  0.032, 0.609, 0.679
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.003, 0.044, 0.061,  0.003, 0.044, 0.061,  0.003, 0.044, 0.061,
    0.021, 0.273, 0.376,  0.021, 0.273, 0.376,  0.021, 0.273, 0.376,
    0.035, 0.449, 0.619,  0.035, 0.449, 0.619,  0.035, 0.449, 0.619
  ] },
  /*  8 blue        */ { day: [
    0.137, 0.797, 1.024,  0.120, 0.766, 0.904,  0.102, 0.733, 0.779,
    0.063, 0.524, 0.755,  0.043, 0.493, 0.677,  0.022, 0.460, 0.596,
    0.011, 0.300, 0.454,  0.007, 0.340, 0.510,  0.002, 0.380, 0.565,
    0.019, 0.295, 0.454,  0.024, 0.363, 0.560,  0.028, 0.432, 0.666
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.000, 0.051, 0.053,  0.000, 0.051, 0.053,  0.000, 0.051, 0.053,
    0.000, 0.314, 0.323,  0.000, 0.314, 0.323,  0.000, 0.314, 0.323,
    0.000, 0.517, 0.531,  0.000, 0.517, 0.531,  0.000, 0.517, 0.531
  ] },
  /*  9 purple      */ { day: [
    0.278, 0.145, 0.503,  0.452, 0.272, 0.734,  0.289, 0.151, 0.523,
    0.339, 0.170, 0.590,  0.405, 0.216, 0.679,  0.353, 0.177, 0.614,
    0.497, 0.252, 0.809,  0.505, 0.255, 0.822,  0.516, 0.262, 0.840,
    0.610, 0.314, 0.963,  0.623, 0.321, 0.983,  0.633, 0.326, 1.000
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.030, 0.034, 0.109,  0.030, 0.034, 0.109,  0.030, 0.034, 0.109,
    0.186, 0.209, 0.670,  0.186, 0.209, 0.670,  0.186, 0.209, 0.670,
    0.306, 0.344, 1.103,  0.306, 0.344, 1.103,  0.306, 0.344, 1.103
  ] },
  /* 10 gold        */ { day: [
    0.589, 0.538, 0.018,  0.610, 0.536, 0.059,  0.610, 0.522, 0.085,
    0.611, 0.481, 0.003,  0.623, 0.479, 0.040,  0.617, 0.467, 0.064,
    0.675, 0.478, 0.014,  0.646, 0.456, 0.022,  0.612, 0.431, 0.027,
    0.834, 0.530, 0.062,  0.783, 0.497, 0.058,  0.732, 0.465, 0.055
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.109, 0.070, 0.001,  0.109, 0.070, 0.001,  0.109, 0.070, 0.001,
    0.672, 0.429, 0.005,  0.672, 0.429, 0.005,  0.672, 0.429, 0.005,
    1.106, 0.706, 0.009,  1.106, 0.706, 0.009,  1.106, 0.706, 0.009
  ] },
  /* 11 brown       */ { day: [
    0.557, 0.343, 0.047,  0.546, 0.317, 0.028,  0.527, 0.282, 0.004,
    0.545, 0.354, 0.067,  0.540, 0.335, 0.052,  0.528, 0.309, 0.034,
    0.475, 0.313, 0.060,  0.498, 0.326, 0.061,  0.519, 0.337, 0.062,
    0.436, 0.340, 0.094,  0.462, 0.360, 0.099,  0.487, 0.380, 0.105
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.047, 0.020, 0.000,  0.047, 0.020, 0.000,  0.047, 0.020, 0.000,
    0.291, 0.121, 0.000,  0.291, 0.121, 0.000,  0.291, 0.121, 0.000,
    0.479, 0.198, 0.000,  0.479, 0.198, 0.000,  0.479, 0.198, 0.000
  ] },
  /* 12 red         */ { day: [
    0.661, 0.047, 0.055,  0.791, 0.099, 0.105,  0.737, 0.067, 0.074,
    0.694, 0.068, 0.086,  0.796, 0.107, 0.124,  0.762, 0.085, 0.103,
    0.738, 0.098, 0.133,  0.776, 0.108, 0.144,  0.786, 0.106, 0.143,
    0.779, 0.122, 0.168,  0.802, 0.126, 0.173,  0.824, 0.130, 0.178
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.073, 0.014, 0.010,  0.073, 0.014, 0.010,  0.073, 0.014, 0.010,
    0.450, 0.083, 0.060,  0.450, 0.083, 0.060,  0.450, 0.083, 0.060,
    0.741, 0.137, 0.099,  0.741, 0.137, 0.099,  0.741, 0.137, 0.099
  ] },
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
// Background clock (spec 19, 23). The warped hour advances slowly around midday and quickly around midnight; one angle of
// it (0 at the warp's midday, +-pi at its midnight) drives the day image's two lights, its daylight factor and its shaping
// down the frame. BGW: warp strength, the hour the warp centres on, the daylight factor's floor, its morning step (mornAt:
// how far after the warped midnight the rise begins, mornW: its width) and its evening step (eveAt: how far before the
// warped midnight the fall has finished, eveW: its width), the widths of the two turns of the shaping down the frame
// (topMornW, topEveW: the same two places, steepnesses of their own), and the night envelope's exponent.
const BGW = { warp: 0.808, noon: 11.954, dayFloor: 0.034, mornAt: 0.600, mornW: 3.000, eveAt: 0.300, eveW: 1.600,
  topMornW: 0.600, topEveW: 1.000, envPow: 3.287 };
function wrapPi(a) { return a - TAU * Math.floor((a + Math.PI) / TAU); }
function dayAngle(hour) {
  const p = wrapPi(((hour - BGW.noon) / 24) * TAU);
  return p - BGW.warp * Math.sin(p);
}
// A smooth step of the warped angle, rising from 0 to 1 over the width w about the angle c.
function angStep(a, c, w) { return ease((a - c) / w + 0.5); }
// Where the two steps turn: the morning one a mornW/2 past the start of its rise, the evening one an eveW/2 before the end
// of its fall. Both steps are flat at the warped midnight, so the day's curves meet there with no jump.
function mornTurn() { return -Math.PI + BGW.mornAt + BGW.mornW / 2; }
function eveTurn() { return Math.PI - BGW.eveAt - BGW.eveW / 2; }
// The day image's daylight factor (spec 23): the product of a morning step and an evening step of the warped angle, each
// with its own steepness. The evening fall is the steeper side, so the factor peaks in the later afternoon rather than at
// midday. It is lowest (close to nothing) at midnight and rises from there without turning back; the picture's minimum
// after midnight comes from the mix with the night image.
function daylightOf(a) {
  const d = angStep(a, mornTurn(), BGW.mornW) * (1 - angStep(a, eveTurn(), BGW.eveW));
  return BGW.dayFloor + (1 - BGW.dayFloor) * d;
}
// Strength of the clock's shaping of the day image down the frame: nothing from early morning until late evening, full
// through the late evening and the small hours. It turns at the same two places as the daylight factor, with widths of its
// own (held to the room each turn has, so the shaping too is flat at the warped midnight).
function topShape(a) {
  const cm = mornTurn(), ce = eveTurn();
  const m = angStep(a, cm, Math.min(BGW.topMornW, 2 * (cm + Math.PI)));
  const e = 1 - angStep(a, ce, Math.min(BGW.topEveW, 2 * (Math.PI - ce)));
  return 1 - m * e;
}
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
// background (spec 19, 23; original design). The picture starts from a fixed share of the image's own value and each light
// adds its own lift on top of that; the two lifts add, and base + spot + glow <= 1 keeps the total from carrying the
// picture past the image's own colour. Day images: base: the fixed share; spot: the sun-like spot's lift, oval (centre x
// amplitude, centre y amplitude: the centre is on the top edge at midday, crosses the bottom edge towards either end of the
// warped daylight hours and is 1 - 2 ovalY below the bottom at midnight) and radii; band: the bottom glow's lift, centre x
// amplitude (mirrored from the spot), half-width, centre height and half-height; bandWide, bandWidePow: how much the glow
// broadens around the middle of the day (its half-width x (1 + bandWide x cos(angle)^bandWidePow)); pale: how much paler lit
// areas get; midSat: the mid-month saturation drop; topDark, topSat, topPow: the clock's shaping down the frame (value
// reduced, and saturation raised, by strength x height^topPow). Night images: nightMix: their share at full night weight;
// nightBase: their fixed share; nightFloor: the floor under the lit, enveloped level.
const BGL = { base: 0.600, spot: 0.220, ovalX: 0.770, ovalY: 0.780, spotW: 0.417, spotH: 0.329,
  glow: 0.180, bandX: 0.386, bandW: 0.575, bandY: -0.033, bandH: 0.348, bandWide: 0.500, bandWidePow: 2.000,
  pale: 0.700, midSat: 0.300, topDark: 1.862, topSat: 6.763, topPow: 0.729,
  nightMix: 0.358, nightBase: 0.483, nightFloor: 0.309 };
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

