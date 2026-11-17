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
const BG_GRID_W = 3, BG_GRID_H = 6, BG_NGRID_H = 5;
const PALETTES = [
  /*  1 silver      */ { day: [
    0.731, 0.746, 0.710,  0.665, 0.671, 0.682,  0.576, 0.617, 0.626,
    0.707, 0.696, 0.664,  0.651, 0.651, 0.694,  0.686, 0.647, 0.702,
    0.620, 0.666, 0.640,  0.636, 0.650, 0.621,  0.752, 0.679, 0.720,
    0.536, 0.546, 0.608,  0.562, 0.568, 0.649,  0.708, 0.674, 0.730,
    0.621, 0.593, 0.684,  0.574, 0.641, 0.585,  0.565, 0.702, 0.650,
    0.667, 0.655, 0.725,  0.677, 0.720, 0.647,  0.571, 0.732, 0.636
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.008, 0.000,
    0.108, 0.000, 0.000,  0.161, 0.091, 0.091,  0.186, 0.137, 0.155,
    0.502, 0.257, 0.309,  0.562, 0.365, 0.388,  0.612, 0.483, 0.456,
    1.134, 0.715, 0.834,  1.236, 0.790, 0.898,  1.217, 0.839, 0.902,
    1.500, 1.270, 1.333,  1.500, 1.183, 1.360,  1.500, 1.109, 1.405
  ] },
  /*  2 yellow      */ { day: [
    0.765, 0.818, 0.000,  0.905, 0.880, 0.000,  0.919, 0.867, 0.000,
    0.750, 0.744, 0.054,  0.896, 0.772, 0.000,  0.804, 0.832, 0.000,
    0.766, 0.710, 0.000,  0.788, 0.691, 0.000,  0.770, 0.761, 0.032,
    0.801, 0.683, 0.040,  0.815, 0.628, 0.000,  0.843, 0.744, 0.092,
    0.934, 0.816, 0.212,  0.902, 0.695, 0.228,  0.990, 0.783, 0.281,
    0.986, 0.933, 0.341,  0.978, 0.846, 0.387,  1.013, 0.858, 0.368
  ], night: [
    0.000, 0.252, 0.000,  0.000, 0.220, 0.000,  0.000, 0.194, 0.000,
    0.039, 0.331, 0.000,  0.013, 0.173, 0.000,  0.000, 0.000, 0.000,
    0.227, 0.508, 0.083,  0.136, 0.347, 0.045,  0.068, 0.080, 0.043,
    0.445, 0.700, 0.337,  0.506, 0.788, 0.358,  0.489, 0.729, 0.381,
    0.720, 1.009, 0.588,  0.791, 1.154, 0.744,  0.874, 1.395, 0.900
  ] },
  /*  3 light green */ { day: [
    0.511, 0.717, 0.086,  0.629, 0.861, 0.146,  0.576, 0.802, 0.112,
    0.534, 0.748, 0.130,  0.652, 0.890, 0.192,  0.600, 0.833, 0.158,
    0.576, 0.798, 0.220,  0.661, 0.901, 0.265,  0.633, 0.871, 0.245,
    0.608, 0.853, 0.278,  0.654, 0.912, 0.301,  0.653, 0.914, 0.299,
    0.629, 0.881, 0.343,  0.656, 0.914, 0.356,  0.668, 0.935, 0.364,
    0.651, 0.901, 0.390,  0.672, 0.930, 0.402,  0.690, 0.956, 0.412
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.002, 0.005, 0.001,  0.002, 0.005, 0.001,  0.002, 0.005, 0.001,
    0.116, 0.347, 0.010,  0.116, 0.347, 0.010,  0.116, 0.347, 0.010,
    0.274, 0.713, 0.068,  0.274, 0.713, 0.068,  0.274, 0.713, 0.068,
    0.449, 1.076, 0.157,  0.449, 1.076, 0.157,  0.449, 1.076, 0.157
  ] },
  /*  4 pink        */ { day: [
    0.651, 0.231, 0.369,  0.668, 0.277, 0.393,  0.667, 0.365, 0.408,
    0.593, 0.117, 0.303,  0.670, 0.197, 0.414,  0.676, 0.340, 0.466,
    0.585, 0.045, 0.299,  0.681, 0.126, 0.440,  0.710, 0.255, 0.539,
    0.637, 0.000, 0.321,  0.678, 0.000, 0.440,  0.724, 0.133, 0.539,
    0.776, 0.058, 0.469,  0.783, 0.081, 0.540,  0.810, 0.121, 0.607,
    0.995, 0.235, 0.663,  0.993, 0.269, 0.723,  0.998, 0.299, 0.694
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.168, 0.000, 0.088,  0.170, 0.000, 0.000,  0.202, 0.000, 0.000,
    0.474, 0.018, 0.353,  0.483, 0.000, 0.254,  0.570, 0.000, 0.157,
    1.075, 0.055, 0.830,  1.037, 0.000, 0.662,  1.033, 0.128, 0.460,
    1.500, 0.000, 1.112,  1.500, 0.061, 0.930,  1.500, 0.213, 0.709
  ] },
  /*  5 green       */ { day: [
    0.120, 0.437, 0.042,  0.017, 0.541, 0.000,  0.012, 0.603, 0.000,
    0.195, 0.601, 0.145,  0.055, 0.668, 0.000,  0.000, 0.700, 0.000,
    0.226, 0.658, 0.184,  0.118, 0.773, 0.064,  0.000, 0.840, 0.000,
    0.174, 0.678, 0.166,  0.087, 0.819, 0.071,  0.002, 0.923, 0.000,
    0.112, 0.637, 0.089,  0.080, 0.798, 0.071,  0.035, 0.907, 0.066,
    0.000, 0.508, 0.000,  0.019, 0.617, 0.000,  0.000, 0.728, 0.054
  ], night: [
    0.031, 0.149, 0.055,  0.000, 0.000, 0.000,  0.012, 0.000, 0.000,
    0.000, 0.208, 0.000,  0.000, 0.275, 0.050,  0.000, 0.377, 0.000,
    0.000, 0.417, 0.000,  0.014, 0.600, 0.131,  0.111, 0.798, 0.185,
    0.000, 0.851, 0.000,  0.082, 1.049, 0.250,  0.148, 1.155, 0.425,
    0.000, 1.190, 0.224,  0.000, 1.370, 0.411,  0.000, 1.438, 0.615
  ] },
  /*  6 lavender    */ { day: [
    0.526, 0.332, 0.929,  0.643, 0.422, 1.096,  0.590, 0.378, 1.031,
    0.556, 0.374, 0.959,  0.670, 0.463, 1.123,  0.621, 0.423, 1.061,
    0.609, 0.457, 1.011,  0.694, 0.524, 1.130,  0.667, 0.502, 1.101,
    0.643, 0.516, 1.067,  0.690, 0.551, 1.136,  0.690, 0.552, 1.142,
    0.670, 0.569, 1.090,  0.698, 0.594, 1.132,  0.712, 0.606, 1.158,
    0.699, 0.613, 1.109,  0.721, 0.631, 1.142,  0.741, 0.651, 1.174
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.003, 0.003, 0.005,  0.003, 0.003, 0.005,  0.003, 0.003, 0.005,
    0.176, 0.166, 0.303,  0.176, 0.166, 0.303,  0.176, 0.166, 0.303,
    0.378, 0.361, 0.624,  0.378, 0.361, 0.624,  0.378, 0.361, 0.624,
    0.588, 0.567, 0.935,  0.588, 0.567, 0.935,  0.588, 0.567, 0.935
  ] },
  /*  7 teal        */ { day: [
    0.000, 0.446, 0.559,  0.000, 0.551, 0.589,  0.000, 0.622, 0.615,
    0.000, 0.412, 0.531,  0.000, 0.553, 0.629,  0.023, 0.664, 0.681,
    0.046, 0.373, 0.522,  0.000, 0.543, 0.658,  0.005, 0.679, 0.699,
    0.000, 0.349, 0.499,  0.000, 0.553, 0.588,  0.000, 0.711, 0.693,
    0.000, 0.379, 0.492,  0.000, 0.616, 0.546,  0.037, 0.801, 0.714,
    0.005, 0.418, 0.465,  0.003, 0.645, 0.533,  0.000, 0.836, 0.715
  ], night: [
    0.000, 0.000, 0.129,  0.000, 0.000, 0.051,  0.018, 0.000, 0.000,
    0.000, 0.072, 0.237,  0.005, 0.025, 0.152,  0.000, 0.031, 0.142,
    0.030, 0.076, 0.383,  0.000, 0.101, 0.329,  0.012, 0.204, 0.388,
    0.031, 0.218, 0.688,  0.003, 0.320, 0.627,  0.000, 0.421, 0.630,
    0.000, 0.333, 0.970,  0.031, 0.544, 0.931,  0.000, 0.689, 0.862
  ] },
  /*  8 blue        */ { day: [
    0.220, 0.889, 0.986,  0.170, 0.936, 1.093,  0.084, 0.980, 1.221,
    0.114, 0.745, 0.854,  0.096, 0.804, 0.958,  0.012, 0.879, 1.024,
    0.000, 0.552, 0.756,  0.048, 0.653, 0.818,  0.000, 0.748, 0.857,
    0.000, 0.376, 0.579,  0.000, 0.472, 0.736,  0.000, 0.642, 0.845,
    0.000, 0.279, 0.443,  0.034, 0.348, 0.665,  0.000, 0.524, 0.871,
    0.010, 0.217, 0.375,  0.056, 0.294, 0.602,  0.070, 0.427, 0.800
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.018, 0.000,  0.013, 0.000, 0.000,
    0.000, 0.166, 0.144,  0.019, 0.109, 0.074,  0.000, 0.064, 0.000,
    0.016, 0.430, 0.258,  0.039, 0.271, 0.250,  0.020, 0.263, 0.263,
    0.088, 0.686, 0.386,  0.028, 0.603, 0.539,  0.000, 0.603, 0.664,
    0.207, 0.890, 0.497,  0.065, 0.936, 0.719,  0.000, 0.930, 0.900
  ] },
  /*  9 purple      */ { day: [
    0.307, 0.147, 0.596,  0.495, 0.282, 0.863,  0.317, 0.154, 0.622,
    0.336, 0.160, 0.636,  0.468, 0.254, 0.822,  0.350, 0.167, 0.663,
    0.422, 0.210, 0.748,  0.470, 0.245, 0.817,  0.438, 0.219, 0.777,
    0.526, 0.250, 0.911,  0.543, 0.260, 0.937,  0.547, 0.261, 0.946,
    0.620, 0.303, 1.035,  0.632, 0.310, 1.056,  0.645, 0.316, 1.074,
    0.680, 0.347, 1.101,  0.692, 0.354, 1.122,  0.706, 0.360, 1.143
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.002, 0.003, 0.010,  0.002, 0.003, 0.010,  0.002, 0.003, 0.010,
    0.105, 0.127, 0.549,  0.105, 0.127, 0.549,  0.105, 0.127, 0.549,
    0.277, 0.317, 1.124,  0.277, 0.317, 1.124,  0.277, 0.317, 1.124,
    0.490, 0.548, 1.500,  0.490, 0.548, 1.500,  0.490, 0.548, 1.500
  ] },
  /* 10 gold        */ { day: [
    0.681, 0.568, 0.058,  0.666, 0.550, 0.000,  0.606, 0.537, 0.000,
    0.708, 0.555, 0.059,  0.676, 0.526, 0.000,  0.611, 0.522, 0.000,
    0.677, 0.511, 0.094,  0.651, 0.471, 0.046,  0.611, 0.459, 0.016,
    0.671, 0.499, 0.083,  0.648, 0.481, 0.000,  0.610, 0.459, 0.000,
    0.699, 0.594, 0.160,  0.687, 0.587, 0.164,  0.722, 0.584, 0.148,
    0.805, 0.711, 0.252,  0.833, 0.749, 0.244,  0.919, 0.745, 0.206
  ], night: [
    0.028, 0.000, 0.000,  0.059, 0.000, 0.000,  0.066, 0.031, 0.000,
    0.195, 0.088, 0.000,  0.156, 0.052, 0.000,  0.173, 0.000, 0.000,
    0.531, 0.307, 0.000,  0.498, 0.267, 0.000,  0.455, 0.220, 0.046,
    1.027, 0.613, 0.000,  1.050, 0.627, 0.000,  0.986, 0.611, 0.126,
    1.500, 1.038, 0.180,  1.500, 0.968, 0.177,  1.500, 0.916, 0.233
  ] },
  /* 11 brown       */ { day: [
    0.522, 0.483, 0.000,  0.654, 0.446, 0.146,  0.755, 0.444, 0.230,
    0.593, 0.492, 0.009,  0.672, 0.441, 0.156,  0.771, 0.454, 0.193,
    0.613, 0.457, 0.056,  0.681, 0.441, 0.091,  0.743, 0.430, 0.000,
    0.600, 0.409, 0.000,  0.636, 0.394, 0.077,  0.690, 0.402, 0.009,
    0.630, 0.374, 0.004,  0.632, 0.337, 0.000,  0.618, 0.325, 0.000,
    0.564, 0.325, 0.000,  0.525, 0.271, 0.000,  0.497, 0.231, 0.000
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.008, 0.000,  0.000, 0.000, 0.026,
    0.020, 0.000, 0.000,  0.001, 0.000, 0.034,  0.000, 0.025, 0.021,
    0.153, 0.048, 0.000,  0.170, 0.037, 0.000,  0.247, 0.042, 0.000,
    0.399, 0.158, 0.000,  0.487, 0.231, 0.000,  0.534, 0.254, 0.000,
    0.538, 0.323, 0.089,  0.727, 0.459, 0.000,  0.812, 0.488, 0.000
  ] },
  /* 12 red         */ { day: [
    0.745, 0.021, 0.033,  0.885, 0.072, 0.084,  0.829, 0.039, 0.050,
    0.768, 0.041, 0.058,  0.907, 0.091, 0.109,  0.852, 0.059, 0.078,
    0.806, 0.083, 0.111,  0.906, 0.121, 0.149,  0.880, 0.099, 0.130,
    0.845, 0.082, 0.122,  0.904, 0.097, 0.140,  0.906, 0.089, 0.135,
    0.862, 0.104, 0.154,  0.896, 0.112, 0.163,  0.915, 0.112, 0.164,
    0.877, 0.134, 0.188,  0.904, 0.139, 0.195,  0.927, 0.141, 0.200
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.008, 0.001, 0.001,  0.008, 0.001, 0.001,  0.008, 0.001, 0.001,
    0.368, 0.031, 0.011,  0.368, 0.031, 0.011,  0.368, 0.031, 0.011,
    0.759, 0.114, 0.073,  0.759, 0.114, 0.073,  0.759, 0.114, 0.073,
    1.141, 0.224, 0.167,  1.141, 0.224, 0.167,  1.141, 0.224, 0.167
  ] },
];
const BG_W = 32, BG_H = 18; // size of each generated background image

// ---------------------------------------------------------------------------
// Moods: complete parameter sets, blended linearly with one shared factor.
// ---------------------------------------------------------------------------
const MOOD_KEYS = [
  'waveBright', 'base', 'fres', 'sizeK',
  'latX', 'latY', 'latZ', 'envCross', 'camPitch',
  'exposure', 'white', 'glareThr', 'glareSigma', 'glareRatio', 'glareStrength',
  'focusFar', 'sparkSize', 'sparkBright', 'glint',
];
// The composite's black offset (spec 4.5, versions 20 and 24): the same in every mood (the moods set only the gain and the
// white point). It is a shared setting with three observables pulling against each other, so it is fitted together with each
// mood's gain and the palettes: the colour the band's added light takes over the dark parts of a night frame
// (tools/measure/bandcolour.py, which wants it large), how far down a night frame the top stays flat
// (tools/measure/blackfoot.py, best near 0.03) and the background away from the band (bgcompare, which wants it small,
// because the offset cuts the dark end and the palettes can only scale colours). 0.03 is the joint best of the four values
// tried, each with the gains and palettes refitted to convergence; the daytime band stays as near-neutral as the original's.
let TONE_BLACK = 0.03;
// Glare (spec 5, versions 20 and 24): each mood's bright-pass threshold is fixed, in the composite's output units after its
// curve, and the same chain runs in every mood. Placed inside the brackets measured on the original's footage at the bright-pass's
// resolution (tools/measure/brightfoot.py): by day between July's brightest background (which does not glare) and January's and
// December's (which do); at dawn and dusk above every background and below the dimmest month's brightest fold; at night above the
// band's brightest folds, so the night is free of halo on the screen.
const MOODS = {
  night: { waveBright: 0.22, base: 1.6, fres: 1.7, sizeK: 0.54,
    latX: 1.00, latY: 0.92, latZ: 1.00, envCross: 0.20, camPitch: -3,
    exposure: 1.380, white: 1.0, glareThr: 0.9, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.6,
    focusFar: 4.38, sparkSize: 1.1, sparkBright: 1.0, glint: 0.30 },
  dawn: { waveBright: 0.20, base: 1.8, fres: 1.6, sizeK: 0.6,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.25, camPitch: -8,
    exposure: 1.209, white: 1.0, glareThr: 0.7, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 4.23, sparkSize: 1.1, sparkBright: 1.0, glint: 0.35 },
  day: { waveBright: 0.15, base: 1.2, fres: 2.4, sizeK: 0.6,
    latX: 1.00, latY: 1.00, latZ: 1.00, envCross: 0.28, camPitch: -8,
    exposure: 1.120, white: 0.9, glareThr: 0.68, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 4.20, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
  dusk: { waveBright: 0.24, base: 1.8, fres: 1.6, sizeK: 0.54,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.20, camPitch: -8,
    exposure: 1.323, white: 1.0, glareThr: 0.785, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 4.22, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
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
const BGW = { warp: 0.900, noon: 11.901, dayFloor: 0.037, mornAt: 0.058, mornW: 3.100, eveAt: 0.000, eveW: 3.100,
  topMornW: 1.256, topEveW: 1.890, envPow: 1.453 };
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
  // a neutral tint brightening slightly from left to right (spec 20: measured, the band's brightest places left against right
  // over 48 clips of the original, matched by my renders at the same conditions): left 0.82 of right, with the mean over
  // the screen kept at the earlier tint's (0.97) so the band's overall level is unchanged
  tintL: [0.875, 0.875, 0.875], tintR: [1.067, 1.067, 1.067],
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
const BGL = { base: 0.556, spot: 0.243, ovalX: 0.887, ovalY: 0.981, spotW: 0.425, spotH: 0.326,
  glow: 0.199, bandX: 0.365, bandW: 0.437, bandY: 0.000, bandH: 0.312, bandWide: 0.373, bandWidePow: 4.647,
  pale: 0.993, midSat: 0.300, topDark: 1.333, topSat: 4.571, topPow: 0.300,
  nightMix: 0.322, nightBase: 0.556, nightFloor: 0.550 };
let BG_EASE = 0.05; // how far the background gradient moves towards its new value each frame
const SPARKR = {
  // size in scene units (spec 17: set in the scene, so smaller the farther away; no random size); out of focus a disc grows
  // by up to blur times its size and dims a little (dofDim). Spec 25: the focus range sits so that the near side hardly
  // reaches the field (focusNear is nearer than all but a few sparkles) while the far side, which the mood shifts, lies
  // inside the field's far end, blurring the farthest sparkles only part of the way along its transition
  size: 0.0062, blur: 12.0, dofDim: 0.3, nearSoft: 0.72, farSoft: 0.95, focusNear: 2.0,
  // turn towards the camera (spec 21): none for a disc whose in-focus apparent radius is below turn0 px (at 1080 lines), complete
  // from turn1 px, so only the few near, large discs face the viewer and the rest pass through edge-on
  turn0: 2.0, turn1: 2.6,
  // in focus a crisp edge edge px wide (0: hard, spec 21's hard-edged discs); a disc below minPx px radius is drawn at that
  // radius, dimmed by its area (0: never, so a disc smaller than a pixel shows only where it covers a pixel's centre)
  edge: 0, minPx: 0.7,
  // the glint halo (spec 25): a wide patch (glintSize disc radii) with the light gathered near the middle, falling away
  // as a power of the distance (core radius glintCore disc radii, power glintFall), so a bright sparkle keeps a narrow
  // core and carries a faint skirt well out from it
  bright: 1.00, glintSize: 14.0, glintCore: 1.5, glintFall: 1.05, glintBright: 0.15,
  // lighting (spec 16, 17 and 21): one point light in the scene in front of the camera, diffuse kd and specular ks with
  // exponent shin, the highlight tinted at full strength by the iridescent map (below; mapStr scales every lobe's strength,
  // mapR their radii; exponent mapExp = 1 leaves it unchanged), the sum through 1 - exp(-satGain x); opacity falls as a disc
  // turns towards edge-on, with the power tiltPow of one minus the cosine
  light: [1.3, 0.7, -1.5], kd: 0.204, ks: 1.509, shin: 30, mapExp: 1.0, mapStr: 1.20, mapR: 1.0, satGain: 0.629, tiltPow: 6.0,
};
// The iridescent map's lobes (spec 21, original design): position in the map (the facing direction's right and up
// components), radius, strength, and colour at full strength (its brightness included). Between them the map is near-neutral
// white. The hues come in clusters: pinks and magentas, peach and gold, red-orange, a little violet-blue; no green or cyan.
const SPARK_LOBES_DEF = [
  // x,     y,     r,  strength  colour
  [-0.92, -0.50, 0.154, 1.5, [1.00, 0.62, 0.35]], // peach
  [-0.66, -0.50, 0.154, 1.5, [1.00, 0.72, 0.22]], // gold
  [-0.14, -0.50, 0.154, 1.5, [1.00, 0.30, 0.12]], // red-orange
  [0.12, -0.50, 0.154, 1.5, [1.00, 0.62, 0.35]], // peach
  [0.90, -0.50, 0.154, 1.5, [1.00, 0.35, 0.65]], // pink
  [-0.53, -0.20, 0.154, 1.5, [1.00, 0.35, 0.65]], // pink
  [-0.01, -0.20, 0.154, 1.5, [1.00, 0.62, 0.35]], // peach
  [0.25, -0.20, 0.154, 1.5, [0.55, 0.45, 1.00]], // violet-blue
  [0.77, -0.20, 0.154, 1.5, [0.55, 0.45, 1.00]], // violet-blue
  [-0.92, 0.10, 0.154, 1.5, [1.00, 0.72, 0.22]], // gold
  [-0.66, 0.10, 0.154, 1.5, [0.55, 0.45, 1.00]], // violet-blue
  [-0.14, 0.10, 0.154, 1.5, [0.90, 0.25, 0.95]], // magenta
  [0.12, 0.10, 0.154, 1.5, [1.00, 0.62, 0.35]], // peach
  [0.38, 0.10, 0.154, 1.5, [1.00, 0.72, 0.22]], // gold
  [0.90, 0.10, 0.154, 1.5, [0.55, 0.45, 1.00]], // violet-blue
  [-0.53, 0.40, 0.154, 1.5, [1.00, 0.72, 0.22]], // gold
  [-0.01, 0.40, 0.154, 1.5, [1.00, 0.30, 0.12]], // red-orange
  [0.25, 0.40, 0.154, 1.5, [0.90, 0.25, 0.95]], // magenta
  [0.77, 0.40, 0.154, 1.5, [0.90, 0.25, 0.95]], // magenta
  [1.03, 0.40, 0.154, 1.5, [1.00, 0.35, 0.65]], // pink
];
const SPARK_LOBES = SPARK_LOBES_DEF.length;
const SPARK_LOBE_POS = new Float32Array(SPARK_LOBES_DEF.flatMap(l => [l[0], l[1], l[2], l[3]]));
const SPARK_LOBE_COL = new Float32Array(SPARK_LOBES_DEF.flatMap(l => l[4]));
let DITHER = 0.85; // output levels, peak

