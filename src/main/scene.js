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
    0.777, 0.795, 0.743,  0.707, 0.715, 0.714,  0.612, 0.658, 0.655,
    0.753, 0.743, 0.695,  0.693, 0.694, 0.726,  0.731, 0.690, 0.734,
    0.661, 0.711, 0.670,  0.678, 0.694, 0.650,  0.803, 0.725, 0.755,
    0.573, 0.583, 0.637,  0.601, 0.608, 0.681,  0.756, 0.721, 0.765,
    0.665, 0.634, 0.717,  0.614, 0.686, 0.615,  0.605, 0.751, 0.682,
    0.716, 0.702, 0.761,  0.726, 0.772, 0.678,  0.612, 0.784, 0.667
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.006, 0.000,
    0.086, 0.000, 0.000,  0.128, 0.074, 0.073,  0.147, 0.113, 0.125,
    0.399, 0.211, 0.248,  0.446, 0.299, 0.312,  0.486, 0.395, 0.367,
    0.900, 0.585, 0.671,  0.982, 0.646, 0.722,  0.966, 0.686, 0.725,
    1.500, 1.039, 1.072,  1.447, 0.968, 1.093,  1.500, 0.908, 1.130
  ] },
  /*  2 yellow      */ { day: [
    0.810, 0.862, 0.000,  0.957, 0.928, 0.000,  0.972, 0.915, 0.000,
    0.795, 0.785, 0.055,  0.948, 0.816, 0.000,  0.851, 0.878, 0.000,
    0.811, 0.750, 0.000,  0.835, 0.731, 0.000,  0.816, 0.805, 0.033,
    0.849, 0.723, 0.041,  0.863, 0.664, 0.000,  0.894, 0.787, 0.095,
    0.991, 0.864, 0.219,  0.956, 0.735, 0.235,  1.050, 0.829, 0.290,
    1.046, 0.989, 0.354,  1.037, 0.896, 0.401,  1.075, 0.908, 0.382
  ], night: [
    0.000, 0.205, 0.000,  0.000, 0.179, 0.000,  0.000, 0.158, 0.000,
    0.031, 0.269, 0.000,  0.011, 0.140, 0.000,  0.000, 0.000, 0.000,
    0.185, 0.412, 0.068,  0.111, 0.283, 0.037,  0.055, 0.065, 0.035,
    0.362, 0.569, 0.274,  0.412, 0.640, 0.293,  0.397, 0.593, 0.311,
    0.585, 0.820, 0.479,  0.643, 0.937, 0.607,  0.711, 1.133, 0.734
  ] },
  /*  3 light green */ { day: [
    0.541, 0.757, 0.087,  0.665, 0.909, 0.149,  0.609, 0.846, 0.113,
    0.566, 0.790, 0.133,  0.690, 0.940, 0.196,  0.636, 0.879, 0.161,
    0.611, 0.843, 0.225,  0.700, 0.951, 0.271,  0.671, 0.921, 0.251,
    0.644, 0.902, 0.286,  0.693, 0.964, 0.310,  0.692, 0.966, 0.308,
    0.667, 0.932, 0.355,  0.695, 0.968, 0.369,  0.709, 0.989, 0.377,
    0.691, 0.955, 0.404,  0.713, 0.985, 0.417,  0.732, 1.012, 0.428
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.002, 0.005, 0.001,  0.002, 0.005, 0.001,  0.002, 0.005, 0.001,
    0.095, 0.283, 0.008,  0.095, 0.283, 0.008,  0.095, 0.283, 0.008,
    0.222, 0.580, 0.055,  0.222, 0.580, 0.055,  0.222, 0.580, 0.055,
    0.365, 0.874, 0.128,  0.365, 0.874, 0.128,  0.365, 0.874, 0.128
  ] },
  /*  4 pink        */ { day: [
    0.680, 0.240, 0.378,  0.698, 0.289, 0.403,  0.696, 0.380, 0.419,
    0.621, 0.123, 0.312,  0.702, 0.206, 0.427,  0.708, 0.355, 0.479,
    0.614, 0.047, 0.309,  0.714, 0.132, 0.454,  0.745, 0.267, 0.557,
    0.670, 0.000, 0.333,  0.712, 0.000, 0.457,  0.760, 0.140, 0.559,
    0.816, 0.062, 0.488,  0.823, 0.086, 0.563,  0.852, 0.127, 0.632,
    1.047, 0.250, 0.694,  1.045, 0.286, 0.758,  1.051, 0.318, 0.726
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.133, 0.000, 0.068,  0.134, 0.000, 0.000,  0.159, 0.000, 0.000,
    0.374, 0.015, 0.271,  0.382, 0.000, 0.195,  0.450, 0.000, 0.121,
    0.849, 0.045, 0.637,  0.820, 0.000, 0.508,  0.816, 0.104, 0.353,
    1.338, 0.000, 0.853,  1.362, 0.049, 0.714,  1.382, 0.175, 0.544
  ] },
  /*  5 green       */ { day: [
    0.126, 0.461, 0.043,  0.017, 0.570, 0.000,  0.012, 0.637, 0.000,
    0.207, 0.635, 0.148,  0.059, 0.706, 0.000,  0.000, 0.739, 0.000,
    0.240, 0.696, 0.188,  0.124, 0.817, 0.065,  0.000, 0.888, 0.000,
    0.184, 0.716, 0.171,  0.093, 0.866, 0.073,  0.002, 0.976, 0.000,
    0.118, 0.675, 0.092,  0.085, 0.844, 0.073,  0.037, 0.960, 0.068,
    0.000, 0.538, 0.000,  0.020, 0.654, 0.000,  0.000, 0.772, 0.056
  ], night: [
    0.025, 0.121, 0.045,  0.000, 0.000, 0.000,  0.010, 0.000, 0.000,
    0.000, 0.169, 0.000,  0.000, 0.223, 0.041,  0.000, 0.306, 0.000,
    0.000, 0.338, 0.000,  0.012, 0.487, 0.107,  0.090, 0.648, 0.151,
    0.000, 0.691, 0.000,  0.067, 0.852, 0.204,  0.120, 0.938, 0.347,
    0.000, 0.967, 0.183,  0.000, 1.113, 0.335,  0.000, 1.169, 0.502
  ] },
  /*  6 lavender    */ { day: [
    0.556, 0.350, 0.944,  0.681, 0.445, 1.114,  0.625, 0.399, 1.047,
    0.588, 0.395, 0.978,  0.710, 0.489, 1.145,  0.657, 0.447, 1.082,
    0.645, 0.483, 1.036,  0.735, 0.553, 1.158,  0.707, 0.530, 1.128,
    0.681, 0.545, 1.098,  0.731, 0.583, 1.170,  0.731, 0.584, 1.176,
    0.711, 0.603, 1.127,  0.740, 0.628, 1.170,  0.755, 0.641, 1.196,
    0.742, 0.650, 1.152,  0.764, 0.669, 1.186,  0.786, 0.689, 1.218
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.003, 0.003, 0.005,  0.003, 0.003, 0.005,  0.003, 0.003, 0.005,
    0.143, 0.135, 0.247,  0.143, 0.135, 0.247,  0.143, 0.135, 0.247,
    0.307, 0.294, 0.508,  0.307, 0.294, 0.508,  0.307, 0.294, 0.508,
    0.479, 0.460, 0.763,  0.479, 0.460, 0.763,  0.479, 0.460, 0.763
  ] },
  /*  7 teal        */ { day: [
    0.000, 0.473, 0.599,  0.000, 0.584, 0.632,  0.000, 0.659, 0.659,
    0.000, 0.437, 0.569,  0.000, 0.586, 0.673,  0.022, 0.703, 0.729,
    0.044, 0.395, 0.558,  0.000, 0.574, 0.704,  0.005, 0.718, 0.747,
    0.000, 0.370, 0.533,  0.000, 0.586, 0.627,  0.000, 0.753, 0.740,
    0.000, 0.401, 0.524,  0.000, 0.650, 0.582,  0.035, 0.846, 0.761,
    0.005, 0.442, 0.495,  0.003, 0.682, 0.568,  0.000, 0.883, 0.761
  ], night: [
    0.000, 0.000, 0.107,  0.000, 0.000, 0.042,  0.015, 0.000, 0.000,
    0.000, 0.057, 0.196,  0.005, 0.020, 0.126,  0.000, 0.025, 0.118,
    0.025, 0.061, 0.318,  0.000, 0.081, 0.274,  0.010, 0.163, 0.323,
    0.027, 0.175, 0.572,  0.003, 0.257, 0.521,  0.000, 0.338, 0.524,
    0.000, 0.267, 0.806,  0.026, 0.436, 0.774,  0.000, 0.553, 0.716
  ] },
  /*  8 blue        */ { day: [
    0.232, 0.938, 1.001,  0.180, 0.987, 1.111,  0.088, 1.034, 1.240,
    0.120, 0.787, 0.871,  0.102, 0.848, 0.977,  0.012, 0.928, 1.045,
    0.000, 0.584, 0.774,  0.051, 0.690, 0.838,  0.000, 0.791, 0.879,
    0.000, 0.398, 0.596,  0.000, 0.500, 0.757,  0.000, 0.679, 0.870,
    0.000, 0.295, 0.457,  0.036, 0.369, 0.688,  0.000, 0.554, 0.901,
    0.010, 0.229, 0.389,  0.060, 0.312, 0.625,  0.074, 0.453, 0.831
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.015, 0.000,  0.011, 0.000, 0.000,
    0.000, 0.135, 0.118,  0.016, 0.088, 0.060,  0.000, 0.052, 0.000,
    0.013, 0.349, 0.210,  0.031, 0.220, 0.204,  0.017, 0.213, 0.215,
    0.071, 0.557, 0.315,  0.023, 0.490, 0.439,  0.000, 0.490, 0.541,
    0.168, 0.723, 0.405,  0.053, 0.760, 0.586,  0.000, 0.755, 0.734
  ] },
  /*  9 purple      */ { day: [
    0.324, 0.155, 0.606,  0.524, 0.298, 0.877,  0.336, 0.163, 0.632,
    0.356, 0.169, 0.649,  0.496, 0.269, 0.839,  0.370, 0.177, 0.676,
    0.447, 0.222, 0.766,  0.498, 0.258, 0.837,  0.464, 0.231, 0.796,
    0.558, 0.265, 0.938,  0.575, 0.275, 0.964,  0.579, 0.276, 0.974,
    0.657, 0.321, 1.070,  0.670, 0.328, 1.091,  0.683, 0.334, 1.111,
    0.721, 0.368, 1.143,  0.734, 0.375, 1.165,  0.749, 0.382, 1.187
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.002, 0.003, 0.008,  0.002, 0.003, 0.008,  0.002, 0.003, 0.008,
    0.085, 0.103, 0.447,  0.085, 0.103, 0.447,  0.085, 0.103, 0.447,
    0.225, 0.258, 0.917,  0.225, 0.258, 0.917,  0.225, 0.258, 0.917,
    0.398, 0.445, 1.381,  0.398, 0.445, 1.381,  0.398, 0.445, 1.381
  ] },
  /* 10 gold        */ { day: [
    0.726, 0.600, 0.053,  0.711, 0.579, 0.000,  0.646, 0.566, 0.000,
    0.753, 0.584, 0.055,  0.720, 0.554, 0.000,  0.650, 0.549, 0.000,
    0.720, 0.537, 0.089,  0.692, 0.495, 0.044,  0.650, 0.482, 0.016,
    0.712, 0.523, 0.080,  0.687, 0.505, 0.000,  0.648, 0.482, 0.000,
    0.740, 0.621, 0.156,  0.728, 0.614, 0.161,  0.765, 0.611, 0.145,
    0.851, 0.744, 0.251,  0.880, 0.783, 0.243,  0.972, 0.779, 0.205
  ], night: [
    0.024, 0.000, 0.000,  0.050, 0.000, 0.000,  0.057, 0.026, 0.000,
    0.167, 0.071, 0.000,  0.134, 0.042, 0.000,  0.149, 0.000, 0.000,
    0.455, 0.250, 0.000,  0.427, 0.217, 0.000,  0.390, 0.178, 0.040,
    0.881, 0.497, 0.000,  0.900, 0.509, 0.000,  0.845, 0.495, 0.109,
    1.500, 0.843, 0.156,  1.371, 0.786, 0.153,  1.363, 0.744, 0.201
  ] },
  /* 11 brown       */ { day: [
    0.552, 0.509, 0.000,  0.692, 0.470, 0.149,  0.800, 0.468, 0.234,
    0.628, 0.520, 0.009,  0.712, 0.465, 0.159,  0.817, 0.480, 0.197,
    0.649, 0.483, 0.057,  0.722, 0.466, 0.093,  0.788, 0.454, 0.000,
    0.636, 0.432, 0.000,  0.674, 0.416, 0.079,  0.731, 0.425, 0.009,
    0.668, 0.396, 0.004,  0.670, 0.357, 0.000,  0.655, 0.343, 0.000,
    0.599, 0.344, 0.000,  0.557, 0.287, 0.000,  0.528, 0.244, 0.000
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.006, 0.000,  0.000, 0.000, 0.021,
    0.017, 0.000, 0.000,  0.001, 0.000, 0.027,  0.000, 0.020, 0.017,
    0.124, 0.038, 0.000,  0.138, 0.030, 0.000,  0.201, 0.035, 0.000,
    0.324, 0.129, 0.000,  0.396, 0.187, 0.000,  0.435, 0.207, 0.000,
    0.438, 0.262, 0.072,  0.591, 0.373, 0.000,  0.661, 0.397, 0.000
  ] },
  /* 12 red         */ { day: [
    0.788, 0.022, 0.033,  0.937, 0.076, 0.085,  0.877, 0.041, 0.051,
    0.813, 0.043, 0.059,  0.960, 0.097, 0.112,  0.903, 0.063, 0.079,
    0.854, 0.088, 0.114,  0.960, 0.127, 0.152,  0.932, 0.105, 0.133,
    0.896, 0.086, 0.125,  0.958, 0.103, 0.143,  0.960, 0.095, 0.138,
    0.913, 0.110, 0.160,  0.949, 0.118, 0.169,  0.970, 0.118, 0.170,
    0.930, 0.142, 0.195,  0.959, 0.147, 0.202,  0.984, 0.150, 0.207
  ], night: [
    0.000, 0.000, 0.000,  0.000, 0.000, 0.000,  0.000, 0.000, 0.000,
    0.006, 0.001, 0.001,  0.006, 0.001, 0.001,  0.006, 0.001, 0.001,
    0.300, 0.026, 0.009,  0.300, 0.026, 0.009,  0.300, 0.026, 0.009,
    0.617, 0.092, 0.059,  0.617, 0.092, 0.059,  0.617, 0.092, 0.059,
    0.928, 0.182, 0.136,  0.928, 0.182, 0.136,  0.928, 0.182, 0.136
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
    exposure: 1.598, white: 1.0, glareThr: 0.9, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.6,
    focusFar: 30.0, sparkSize: 1.1, sparkBright: 1.0, glint: 0.30 },
  dawn: { waveBright: 0.20, base: 1.8, fres: 1.6, sizeK: 0.6,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.25, camPitch: -8,
    exposure: 1.101, white: 1.0, glareThr: 0.7, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 30.0, sparkSize: 1.1, sparkBright: 1.0, glint: 0.35 },
  day: { waveBright: 0.15, base: 1.2, fres: 2.4, sizeK: 0.6,
    latX: 1.00, latY: 1.00, latZ: 1.00, envCross: 0.28, camPitch: -8,
    exposure: 1.001, white: 0.9, glareThr: 0.68, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
    focusFar: 30.0, sparkSize: 1.0, sparkBright: 1.0, glint: 0.35 },
  dusk: { waveBright: 0.24, base: 1.8, fres: 1.6, sizeK: 0.54,
    latX: 1.00, latY: 0.97, latZ: 1.00, envCross: 0.20, camPitch: -8,
    exposure: 1.147, white: 1.0, glareThr: 0.785, glareSigma: 1.5, glareRatio: 0.6, glareStrength: 0.9,
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

