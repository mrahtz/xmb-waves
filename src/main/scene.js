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
    0.773, 0.765, 0.682,  0.718, 0.733, 0.682,  0.643, 0.689, 0.652,
    0.713, 0.692, 0.674,  0.666, 0.720, 0.676,  0.666, 0.708, 0.668,
    0.613, 0.697, 0.660,  0.664, 0.689, 0.678,  0.682, 0.744, 0.687,
    0.543, 0.540, 0.600,  0.571, 0.608, 0.606,  0.609, 0.634, 0.674,
    0.594, 0.583, 0.665,  0.652, 0.607, 0.599,  0.703, 0.675, 0.689,
    0.650, 0.677, 0.757,  0.778, 0.701, 0.683,  0.850, 0.823, 0.782
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.035, 0.029,  0.056, 0.000, 0.000,
    0.060, 0.063, 0.000,  0.159, 0.139, 0.150,  0.262, 0.143, 0.205,
    0.494, 0.332, 0.331,  0.576, 0.367, 0.454,  0.688, 0.476, 0.559,
    0.980, 0.725, 0.712,  1.080, 0.778, 0.880,  1.137, 0.842, 1.037,
    1.500, 1.158, 1.178,  1.500, 1.185, 1.330,  1.477, 1.291, 1.440
  ] },
  /*  2 yellow      */ { day: [
    0.716, 0.801, 0.096,  0.829, 0.787, 0.000,  0.742, 0.715, 0.021,
    0.786, 0.720, 0.000,  0.861, 0.695, 0.000,  0.845, 0.687, 0.000,
    0.948, 0.582, 0.000,  0.821, 0.583, 0.049,  0.854, 0.708, 0.000,
    0.854, 0.632, 0.000,  0.802, 0.605, 0.034,  0.834, 0.776, 0.123,
    0.918, 0.826, 0.200,  0.871, 0.754, 0.255,  0.904, 0.813, 0.251,
    0.983, 0.890, 0.339,  0.902, 0.865, 0.363,  0.820, 0.761, 0.289
  ], night: [
    0.000, 0.240, 0.000,  0.044, 0.116, 0.000,  0.081, 0.257, 0.058,
    0.000, 0.168, 0.007,  0.000, 0.192, 0.000,  0.000, 0.183, 0.000,
    0.114, 0.283, 0.075,  0.062, 0.344, 0.026,  0.103, 0.354, 0.000,
    0.459, 0.612, 0.376,  0.496, 0.733, 0.321,  0.475, 0.705, 0.245,
    0.869, 1.092, 0.701,  1.033, 1.177, 0.757,  1.080, 1.226, 0.827
  ] },
  /*  3 light green */ { day: [
    0.521, 0.742, 0.065,  0.642, 0.890, 0.124,  0.587, 0.829, 0.090,
    0.540, 0.766, 0.112,  0.660, 0.911, 0.173,  0.607, 0.853, 0.139,
    0.583, 0.822, 0.201,  0.670, 0.928, 0.245,  0.641, 0.897, 0.225,
    0.602, 0.848, 0.271,  0.648, 0.907, 0.293,  0.647, 0.909, 0.291,
    0.620, 0.869, 0.337,  0.646, 0.901, 0.350,  0.658, 0.922, 0.358,
    0.647, 0.889, 0.395,  0.668, 0.918, 0.407,  0.686, 0.943, 0.417
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.002, 0.006, 0.001,  0.002, 0.006, 0.001,  0.002, 0.006, 0.001,
    0.117, 0.361, 0.005,  0.117, 0.361, 0.005,  0.117, 0.361, 0.005,
    0.253, 0.665, 0.060,  0.253, 0.665, 0.060,  0.253, 0.665, 0.060,
    0.463, 1.069, 0.180,  0.463, 1.069, 0.180,  0.463, 1.069, 0.180
  ] },
  /*  4 pink        */ { day: [
    0.655, 0.106, 0.278,  0.666, 0.211, 0.339,  0.651, 0.352, 0.387,
    0.564, 0.096, 0.373,  0.629, 0.127, 0.398,  0.653, 0.226, 0.374,
    0.564, 0.000, 0.455,  0.645, 0.066, 0.430,  0.649, 0.130, 0.392,
    0.645, 0.033, 0.489,  0.728, 0.000, 0.482,  0.694, 0.000, 0.438,
    0.822, 0.116, 0.549,  0.857, 0.104, 0.543,  0.770, 0.073, 0.449,
    0.970, 0.231, 0.638,  0.970, 0.289, 0.643,  0.916, 0.231, 0.432
  ], night: [
    0.040, 0.000, 0.000,  0.054, 0.000, 0.000,  0.104, 0.000, 0.011,
    0.162, 0.000, 0.084,  0.225, 0.027, 0.102,  0.306, 0.000, 0.099,
    0.396, 0.000, 0.226,  0.540, 0.049, 0.263,  0.622, 0.161, 0.355,
    0.905, 0.036, 0.469,  0.988, 0.100, 0.558,  1.078, 0.209, 0.632,
    1.470, 0.097, 0.740,  1.480, 0.179, 0.805,  1.491, 0.171, 0.879
  ] },
  /*  5 green       */ { day: [
    0.000, 0.600, 0.068,  0.000, 0.625, 0.056,  0.000, 0.637, 0.000,
    0.297, 0.647, 0.042,  0.096, 0.756, 0.000,  0.000, 0.824, 0.081,
    0.305, 0.677, 0.001,  0.100, 0.811, 0.000,  0.004, 0.986, 0.098,
    0.172, 0.648, 0.000,  0.000, 0.809, 0.000,  0.013, 1.000, 0.095,
    0.072, 0.598, 0.000,  0.000, 0.744, 0.054,  0.044, 0.938, 0.163,
    0.035, 0.502, 0.000,  0.017, 0.626, 0.077,  0.037, 0.787, 0.245
  ], night: [
    0.015, 0.099, 0.019,  0.000, 0.042, 0.000,  0.000, 0.000, 0.000,
    0.018, 0.354, 0.048,  0.000, 0.303, 0.034,  0.016, 0.370, 0.070,
    0.000, 0.569, 0.086,  0.000, 0.554, 0.142,  0.000, 0.707, 0.198,
    0.048, 0.834, 0.243,  0.082, 0.958, 0.321,  0.129, 1.047, 0.436,
    0.147, 1.138, 0.462,  0.243, 1.351, 0.540,  0.215, 1.466, 0.724
  ] },
  /*  6 lavender    */ { day: [
    0.529, 0.321, 0.961,  0.648, 0.411, 1.134,  0.593, 0.366, 1.066,
    0.556, 0.363, 0.982,  0.671, 0.452, 1.150,  0.621, 0.412, 1.086,
    0.609, 0.446, 1.041,  0.695, 0.513, 1.163,  0.668, 0.491, 1.134,
    0.635, 0.507, 1.061,  0.681, 0.542, 1.129,  0.681, 0.543, 1.135,
    0.660, 0.560, 1.075,  0.687, 0.585, 1.116,  0.701, 0.596, 1.142,
    0.698, 0.614, 1.094,  0.720, 0.633, 1.127,  0.740, 0.652, 1.158
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.003, 0.003, 0.006,  0.003, 0.003, 0.006,  0.003, 0.003, 0.006,
    0.181, 0.171, 0.316,  0.181, 0.171, 0.316,  0.181, 0.171, 0.316,
    0.351, 0.335, 0.582,  0.351, 0.335, 0.582,  0.351, 0.335, 0.582,
    0.594, 0.573, 0.929,  0.594, 0.573, 0.929,  0.594, 0.573, 0.929
  ] },
  /*  7 teal        */ { day: [
    0.000, 0.439, 0.512,  0.040, 0.494, 0.521,  0.034, 0.491, 0.476,
    0.000, 0.414, 0.456,  0.060, 0.516, 0.549,  0.000, 0.582, 0.589,
    0.005, 0.394, 0.397,  0.000, 0.495, 0.515,  0.012, 0.614, 0.613,
    0.000, 0.379, 0.404,  0.012, 0.522, 0.522,  0.002, 0.640, 0.626,
    0.000, 0.457, 0.334,  0.041, 0.526, 0.581,  0.001, 0.696, 0.735,
    0.002, 0.554, 0.344,  0.115, 0.547, 0.684,  0.170, 0.768, 0.780
  ], night: [
    0.000, 0.029, 0.062,  0.000, 0.000, 0.052,  0.000, 0.000, 0.114,
    0.002, 0.000, 0.209,  0.009, 0.000, 0.209,  0.000, 0.000, 0.226,
    0.000, 0.000, 0.316,  0.034, 0.066, 0.338,  0.000, 0.102, 0.464,
    0.037, 0.062, 0.561,  0.034, 0.250, 0.607,  0.000, 0.350, 0.710,
    0.074, 0.214, 0.834,  0.068, 0.509, 0.917,  0.156, 0.634, 0.950
  ] },
  /*  8 blue        */ { day: [
    0.249, 0.975, 1.108,  0.090, 1.094, 1.267,  0.037, 1.262, 1.500,
    0.102, 0.767, 1.010,  0.000, 0.877, 1.085,  0.048, 1.000, 1.157,
    0.042, 0.583, 0.892,  0.000, 0.690, 0.964,  0.000, 0.807, 1.014,
    0.000, 0.353, 0.696,  0.000, 0.514, 0.781,  0.017, 0.713, 0.874,
    0.000, 0.194, 0.525,  0.026, 0.433, 0.639,  0.066, 0.612, 0.829,
    0.001, 0.129, 0.365,  0.028, 0.357, 0.543,  0.000, 0.456, 0.753
  ], night: [
    0.000, 0.177, 0.140,  0.009, 0.057, 0.000,  0.000, 0.000, 0.012,
    0.010, 0.297, 0.206,  0.000, 0.134, 0.091,  0.004, 0.000, 0.000,
    0.000, 0.487, 0.327,  0.002, 0.313, 0.224,  0.010, 0.188, 0.191,
    0.006, 0.733, 0.457,  0.000, 0.655, 0.513,  0.002, 0.554, 0.512,
    0.041, 0.992, 0.655,  0.044, 1.029, 0.856,  0.000, 0.991, 0.895
  ] },
  /*  9 purple      */ { day: [
    0.307, 0.135, 0.616,  0.498, 0.270, 0.893,  0.316, 0.142, 0.643,
    0.334, 0.148, 0.651,  0.467, 0.241, 0.842,  0.348, 0.154, 0.679,
    0.420, 0.193, 0.770,  0.469, 0.227, 0.841,  0.436, 0.201, 0.800,
    0.519, 0.242, 0.906,  0.536, 0.252, 0.931,  0.540, 0.253, 0.940,
    0.611, 0.297, 1.021,  0.622, 0.304, 1.042,  0.635, 0.310, 1.059,
    0.679, 0.357, 1.086,  0.691, 0.364, 1.107,  0.705, 0.370, 1.128
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.002, 0.004, 0.012,  0.002, 0.004, 0.012,  0.002, 0.004, 0.012,
    0.103, 0.126, 0.572,  0.103, 0.126, 0.572,  0.103, 0.126, 0.572,
    0.254, 0.291, 1.049,  0.254, 0.291, 1.049,  0.254, 0.291, 1.049,
    0.514, 0.570, 1.491,  0.514, 0.570, 1.491,  0.514, 0.570, 1.491
  ] },
  /* 10 gold        */ { day: [
    0.602, 0.612, 0.038,  0.584, 0.556, 0.053,  0.546, 0.487, 0.048,
    0.580, 0.563, 0.036,  0.588, 0.487, 0.014,  0.591, 0.425, 0.086,
    0.524, 0.489, 0.015,  0.605, 0.437, 0.000,  0.666, 0.427, 0.068,
    0.515, 0.546, 0.000,  0.594, 0.505, 0.000,  0.677, 0.430, 0.027,
    0.675, 0.657, 0.000,  0.668, 0.619, 0.100,  0.653, 0.527, 0.120,
    0.952, 0.831, 0.123,  0.831, 0.785, 0.271,  0.660, 0.650, 0.202
  ], night: [
    0.126, 0.016, 0.000,  0.000, 0.000, 0.000,  0.013, 0.000, 0.059,
    0.221, 0.037, 0.000,  0.154, 0.000, 0.000,  0.171, 0.000, 0.000,
    0.476, 0.129, 0.000,  0.472, 0.163, 0.000,  0.476, 0.170, 0.000,
    0.863, 0.429, 0.022,  0.949, 0.517, 0.001,  0.951, 0.533, 0.000,
    1.409, 0.858, 0.034,  1.500, 0.987, 0.092,  1.500, 0.926, 0.029
  ] },
  /* 11 brown       */ { day: [
    0.748, 0.357, 0.000,  0.873, 0.455, 0.037,  0.917, 0.562, 0.093,
    0.852, 0.494, 0.044,  0.829, 0.517, 0.147,  0.815, 0.631, 0.045,
    0.860, 0.486, 0.000,  0.788, 0.502, 0.098,  0.716, 0.542, 0.000,
    0.767, 0.377, 0.074,  0.709, 0.385, 0.083,  0.643, 0.433, 0.031,
    0.638, 0.306, 0.135,  0.650, 0.325, 0.079,  0.663, 0.363, 0.000,
    0.459, 0.227, 0.089,  0.549, 0.252, 0.000,  0.660, 0.276, 0.000
  ], night: [
    0.045, 0.010, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.001, 0.054, 0.022,  0.083, 0.088, 0.000,  0.147, 0.120, 0.034,
    0.125, 0.107, 0.026,  0.229, 0.158, 0.000,  0.344, 0.180, 0.000,
    0.341, 0.212, 0.000,  0.432, 0.254, 0.000,  0.488, 0.256, 0.000,
    0.534, 0.342, 0.025,  0.684, 0.441, 0.020,  0.761, 0.437, 0.000
  ] },
  /* 12 red         */ { day: [
    0.771, 0.000, 0.013,  0.915, 0.044, 0.056,  0.857, 0.010, 0.022,
    0.786, 0.017, 0.035,  0.929, 0.066, 0.085,  0.872, 0.034, 0.054,
    0.830, 0.054, 0.084,  0.933, 0.090, 0.120,  0.906, 0.068, 0.101,
    0.840, 0.074, 0.114,  0.899, 0.088, 0.131,  0.901, 0.080, 0.126,
    0.850, 0.101, 0.150,  0.884, 0.109, 0.159,  0.902, 0.109, 0.160,
    0.865, 0.147, 0.199,  0.892, 0.152, 0.206,  0.915, 0.154, 0.211
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.009, 0.001, 0.001,  0.009, 0.001, 0.001,  0.009, 0.001, 0.001,
    0.383, 0.027, 0.006,  0.383, 0.027, 0.006,  0.383, 0.027, 0.006,
    0.708, 0.103, 0.064,  0.708, 0.103, 0.064,  0.708, 0.103, 0.064,
    1.134, 0.247, 0.192,  1.134, 0.247, 0.192,  1.134, 0.247, 0.192
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
// Background clock (spec 19, 23, 28). The warped hour advances slowly around midday and quickly around midnight; one angle
// of it (0 at the warp's midday, +-pi at its midnight) drives the day image's two lights and all of its curves of the
// clock. BGW: warp strength, the hour the warp centres on, and the one pair of steps every curve is made of (stepW: the
// gentler step's width in warped radians; stepRatio: the sharper step's width as a fraction of it, the one fixed
// proportion of spec 28, so there are two rates in the whole build and no width of its own for any curve).
const BGW = { warp: 0.900, noon: 12.010, stepW: 0.279, stepRatio: 0.808 };
function wrapPi(a) { return a - TAU * Math.floor((a + Math.PI) / TAU); }
function dayAngle(hour) {
  const p = wrapPi(((hour - BGW.noon) / 24) * TAU);
  return p - BGW.warp * Math.sin(p);
}
// Where the pair of steps sits (spec 28): not fitted on its own, but the two angles at which the travelling spot's centre
// crosses the bottom edge of the picture (centre height 1 - ovalY (1 - cos a), 0 at the bottom edge), so the oval and the
// clock's curves turn at the same two moments.
function stepTurn() { return Math.acos(Math.min(1, Math.max(-1, 1 - 1 / Math.max(BGL.ovalY, 1e-3)))); }
// One smooth step (spec 28): it leaves one value and approaches the other closely but never exactly, and goes on
// approaching for as long as the clock runs, so there is no stretch of the clock over which it is flat and no floor is
// added back to stand in for a missing tail.
function step(x) { return 1 / (1 + Math.exp(-x)); }
// A curve of the clock: the morning step of width wm rising at -c times the evening step of width we falling at +c. The
// neighbouring days' copies are added in, so the two tails meet at the clock's midnight and the curve is smooth and
// periodic there (each copy's far tail is negligible by then).
function stepPair(a, c, wm, we) {
  let s = 0;
  for (let n = -1; n <= 1; n++) { const x = a + n * TAU; s += step((x + c) / wm) * step((c - x) / we); }
  return Math.min(1, s);
}
// The three curves the day image needs (spec 28), from that one pair at its two rates:
//   daylight: the gentler morning step times the sharper evening step, so it rises the gradual way, holds near its full
//     height from the middle of the morning well into the evening and then falls the fast way (its peak in the later
//     afternoon). It is lowest at midnight, where it is close to nothing but never nothing.
//   the value shaping's clock: the gentler step at both ends, so it is symmetric about midday and acts over the widest
//     stretch of the clock (the top loses the day image earliest in the evening).
//   the saturation shaping's clock: the sharper step at both ends, the narrowest stretch (the colour low in the frame
//     deepens last in the evening). The two therefore do not turn together.
function daylightOf(a) { return stepPair(a, stepTurn(), BGW.stepW, BGW.stepW * BGW.stepRatio); }
function shapeVal(a) { return 1 - stepPair(a, stepTurn(), BGW.stepW, BGW.stepW); }
function shapeSat(a) { const w = BGW.stepW * BGW.stepRatio; return 1 - stepPair(a, stepTurn(), w, w); }
// The night images' clock: not warped, one steady turn a day counted from midday (0 at midnight, -pi/2 at 18:00 with the
// light at the left edge, +pi/2 at 06:00 at the right edge, +-pi at midday below the picture).
function nightAngle(hour) { return wrapPi(((hour - 12) / 24) * TAU - Math.PI); }
// The night image's two curves are two of the same products read on that unwarped clock (spec 28): its envelope across the
// night is the gentler step as the evening comes on times the sharper one at dawn (so it comes up gradually and gives way
// quickly), and its shaping down the frame is driven by the gentler step at both ends (nothing at the dead of night, a
// great deal at either end of the night).
function nightEnvelope(a) { return stepPair(a, stepTurn(), BGW.stepW, BGW.stepW * BGW.stepRatio); }
function nightShape(a) { return 1 - stepPair(a, stepTurn(), BGW.stepW, BGW.stepW); }
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
      topV: shapeVal(a), topS: shapeSat(a), anight: nightAngle(12), nightEnv: 0, nightTop: 0, mood: { ...MOODS.day } };
  }
  const p = (day - 1) / daysInMonth(y, mon), [monC, monW] = monthStep(p), a = dayAngle(hour), an = nightAngle(hour);
  return { monA: mon - 1, monB: mon % 12, monC, monW, mid: Math.exp(-Math.pow((p - 0.5) / 0.15, 2)), night: nightWeight(hour),
    aday: a, daylight: daylightOf(a), topV: shapeVal(a), topS: shapeSat(a), anight: an, nightEnv: nightEnvelope(an),
    nightTop: nightShape(an), mood: moodAt(hour) };
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
// background (spec 19, 23, 28; original design). The picture starts from a fixed share of the image's own value and each
// light adds its own lift on top of that; the two lifts add, and base + spot + glow <= 1 keeps the total from carrying the
// picture past the image's own colour. Day images: base: the fixed share; spot: the sun-like spot's lift, oval (centre x
// amplitude, centre y amplitude: the centre is on the top edge at midday, crosses the bottom edge towards either end of the
// warped daylight hours and is 1 - 2 ovalY below the bottom at midnight) and radii; band: the bottom glow's lift, centre x
// amplitude (mirrored from the spot), half-width, centre height (a little above the bottom edge, spec 28) and half-height;
// bandWide, bandWideW: how much the glow broadens about the middle of the day and how narrow that window of the clock is
// (its half-width x (1 + bandWide x exp(-(angle / bandWideW)^2)), the same once more at the dead of night on the night
// clock); pale: how much paler lit areas get; midSat: the mid-month saturation drop; topDark, topSat: the clock's shaping
// down the frame, proportional in the height (value x exp(-topDark x clock x height), saturation x exp(+topSat x clock x
// height), each clock its own, spec 28). Night images: nightMix: their share at full night weight; nightBase: their fixed
// share; nightFloor: the floor under the lit, enveloped level; nightTop: their level's own proportional shaping up the
// frame, strong at either end of the night.
const BGL = { base: 0.554, spot: 0.226, ovalX: 0.856, ovalY: 0.830, spotW: 0.421, spotH: 0.322,
  glow: 0.152, bandX: 0.365, bandW: 0.365, bandY: 0.040, bandH: 0.259, bandWide: 1.024, bandWideW: 0.111,
  pale: 0.978, midSat: 0.333, topDark: 6.488, topSat: 2.204,
  nightMix: 0.525, nightBase: 0.231, nightFloor: 0.400, nightTop: 0.361 };
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

